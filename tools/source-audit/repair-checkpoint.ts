/** Reconcile progress metadata from frozen case files; never replay or rewrite evidence. */
import { open, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { frameHash } from "../audit/metrics";
import { digest } from "./protocol";
import type { CaseResult, Manifest } from "./types";

export async function repairCheckpoint(dir: string, expectedSha: string) {
  const path = join(dir, "checkpoint.json"),
    lockPath = join(dir, ".checkpoint-repair.lock"),
    lock = await open(lockPath, "wx"),
    temporary = path + `.repair-${process.pid}.tmp`;
  try {
    const beforeBytes = await readFile(path),
      before = JSON.parse(beforeBytes.toString("utf8"));
    if (digest(beforeBytes) !== expectedSha.toLowerCase())
      throw new Error("Stale checkpoint SHA; no writes performed");
    const manifestBytes = await readFile(join(dir, "manifest.json")),
      manifest = JSON.parse(manifestBytes.toString("utf8")) as Manifest;
    const frozenNames = [
      "manifest.json",
      "capture-source-verification.json",
      "visual-reviews.json",
    ];
    const protectedHashes = Object.fromEntries(
      await Promise.all(
        frozenNames.map(async (name) => [
          name,
          digest(await readFile(join(dir, name))),
        ]),
      ),
    );
    if (manifest.cases.length !== manifest.expected.cases)
      throw new Error("Manifest accounting mismatch");
    if (before.captureHash !== manifest.captureHash)
      throw new Error("Checkpoint capture provenance mismatch");
    const verification = JSON.parse(
      await readFile(join(dir, "capture-source-verification.json"), "utf8"),
    );
    if (
      verification.unchanged !== true ||
      verification.captureHash !== manifest.captureHash ||
      verification.currentHash !== manifest.captureHash
    )
      throw new Error(
        "Repair requires verified unchanged frozen capture provenance",
      );
    const seenCases = new Set<string>(),
      seenViews = new Set<string>(),
      files: { path: string; sha256: string; views: number }[] = [],
      failures: string[] = [];
    let capturedViews = 0;
    for (const plan of manifest.cases) {
      if (seenCases.has(plan.id))
        throw new Error(`Duplicate planned case ${plan.id}`);
      seenCases.add(plan.id);
      const relative = `data/${plan.id}.json.gz`,
        bytes = await readFile(join(dir, relative)),
        result = JSON.parse(gunzipSync(bytes).toString("utf8")) as CaseResult;
      if (digest(result.plan) !== digest(plan))
        throw new Error(`Frozen case provenance mismatch ${plan.id}`);
      const expectedViews =
        plan.group === "primary" && manifest.stage !== "full"
          ? 51
          : plan.ages.length;
      if (!result.error && result.views.length !== expectedViews)
        throw new Error(`Incomplete successful case ${plan.id}`);
      for (const view of result.views) {
        if (seenViews.has(view.id) || !view.id.startsWith(plan.id + "__"))
          throw new Error(`Invalid/duplicate frozen view ${view.id}`);
        seenViews.add(view.id);
        if (
          frameHash({ pixels: view.pixels } as Parameters<
            typeof frameHash
          >[0]) !== view.hash
        )
          throw new Error(`Frozen pixel hash mismatch ${view.id}`);
      }
      capturedViews += result.views.length;
      if (result.error) failures.push(plan.id);
      files.push({
        path: relative,
        sha256: digest(bytes),
        views: result.views.length,
      });
    }
    const after = {
      captureHash: manifest.captureHash,
      completedCases: files.length,
      expectedCases: manifest.expected.cases,
      capturedViews,
      failures,
    };
    // Validate inputs again immediately before changing the one progress-metadata file.
    for (const f of files)
      if (digest(await readFile(join(dir, f.path))) !== f.sha256)
        throw new Error(`Frozen case changed during validation ${f.path}`);
    for (const [name, hash] of Object.entries(protectedHashes))
      if (digest(await readFile(join(dir, name))) !== hash)
        throw new Error(`Protected evidence changed during repair ${name}`);
    if (digest(await readFile(path)) !== digest(beforeBytes))
      throw new Error(
        "Checkpoint changed during validation; no writes performed",
      );
    const afterBytes = Buffer.from(JSON.stringify(after, null, 2));
    const receipt = {
      recordedAt: new Date().toISOString(),
      method:
        "Checkpoint metadata reconciliation only. Every planned frozen case validated by plan equality, unique case/view IDs, successful-case view accounting and raw rendered pixel hashes. All case bytes and protected manifest/capture/review bytes rechecked before commit. No engine evaluation, image/diagnostic persistence, case or manifest writes.",
      before: { sha256: digest(beforeBytes), ...before },
      after: { sha256: digest(afterBytes), ...after },
      protectedHashes,
      validatedCaseFiles: files,
    };
    const receiptPath = join(dir, `checkpoint-repair-${Date.now()}.json`);
    // Receipt records both states before the atomic progress-only replacement.
    await writeFile(receiptPath, JSON.stringify(receipt, null, 2) + "\n", {
      flag: "wx",
    });
    await writeFile(temporary, afterBytes, { flag: "wx" });
    await rename(temporary, path);
    if (digest(await readFile(path)) !== receipt.after.sha256)
      throw new Error("Repaired checkpoint hash verification failed");
    return {
      receipt: receiptPath,
      before: receipt.before,
      after: receipt.after,
      protectedHashes,
    };
  } finally {
    await lock.close();
    await rm(lockPath, { force: true });
    await rm(temporary, { force: true });
  }
}
async function main() {
  const args = process.argv.slice(2),
    run = args[args.indexOf("--run") + 1],
    sha = args[args.indexOf("--expect-sha") + 1];
  if (
    !args.includes("--run") ||
    !/^[a-z\d][a-z\d-]{0,70}$/.test(run ?? "") ||
    !args.includes("--expect-sha") ||
    !/^[a-f\d]{64}$/i.test(sha ?? "")
  )
    throw new Error(
      "Usage: --run <run> --expect-sha <current checkpoint SHA256>",
    );
  console.log(
    JSON.stringify(
      await repairCheckpoint(resolve("docs/audits/life-v7", run), sha),
      null,
      2,
    ),
  );
}
if (
  process.argv[1]
    ?.replaceAll("\\", "/")
    .endsWith("/source-audit/repair-checkpoint.ts")
)
  main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
