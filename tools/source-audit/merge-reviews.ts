/** Append reviewed receipts without removing templates or earlier review evidence. */
import { createHash } from "node:crypto";
import {
  appendFile,
  open,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { validateReviews } from "./reviews";
import type { CaseResult, Review } from "./types";

const sha = (bytes: string | Buffer) =>
  createHash("sha256").update(bytes).digest("hex");

export function planReviewAppend(
  raw: string,
  incoming: Review[],
  expectedSha: string,
) {
  if (sha(raw) !== expectedSha.toLowerCase())
    throw new Error("Stale review SHA; no evidence changed");
  const existing = JSON.parse(raw) as Review[];
  if (!Array.isArray(existing))
    throw new Error("Existing review evidence must be an array");
  if (
    !incoming.length ||
    incoming.some((r) => r.status !== "reviewed" || !r.reviewer?.trim())
  )
    throw new Error("Receipts must contain identified, reviewed records");
  const keys = new Set<string>();
  for (const r of [...existing, ...incoming]) {
    if (r.status !== "reviewed") continue;
    const key = JSON.stringify([r.id, r.reviewer]);
    if (keys.has(key))
      throw new Error(
        `Duplicate reviewer/comparison ${key}; no evidence changed`,
      );
    keys.add(key);
  }
  const close = raw.lastIndexOf("]");
  if (close < 0 || raw.slice(close + 1).trim())
    throw new Error("Invalid review array ending");
  // Preserve every original byte before the closing bracket, including all old records.
  const prefix = raw.slice(0, close);
  const appended =
    prefix +
    (existing.length ? "," : "") +
    "\n" +
    incoming.map((r) => JSON.stringify(r, null, 2)).join(",\n") +
    "\n]" +
    raw.slice(close + 1);
  const combined = JSON.parse(appended) as Review[];
  if (
    JSON.stringify(combined.slice(0, existing.length)) !==
      JSON.stringify(existing) ||
    combined.length !== existing.length + incoming.length
  )
    throw new Error("Append failed existing-record preservation verification");
  return {
    bytes: appended,
    rows: combined,
    priorCount: existing.length,
    appendedCount: incoming.length,
    beforeSha: sha(raw),
    afterSha: sha(appended),
    preservedPrefixSha: sha(prefix),
  };
}

export async function appendReviewReceipts(
  dir: string,
  receiptNames: string[],
  expectedSha: string,
  dryRun = false,
) {
  const reviewPath = join(dir, "visual-reviews.json"),
    lockPath = join(dir, ".review-merge.lock");
  const lock = await open(lockPath, "wx");
  const temporary = join(dir, `visual-reviews.append-${process.pid}.tmp`);
  try {
    const raw = await readFile(reviewPath, "utf8"),
      incoming: Review[] = [],
      receipts = [];
    for (const name of receiptNames) {
      if (basename(name) !== name)
        throw new Error("Receipt must be a filename inside the selected run");
      const bytes = await readFile(join(dir, name), "utf8"),
        value = JSON.parse(bytes);
      const records = Array.isArray(value) ? value : value.records;
      if (!Array.isArray(records))
        throw new Error(`Receipt has no records array: ${name}`);
      incoming.push(...records);
      receipts.push({ name, sha256: sha(bytes), records: records.length });
    }
    const plan = planReviewAppend(raw, incoming, expectedSha);
    const templates = JSON.parse(
      await readFile(join(dir, "review-template.json"), "utf8"),
    ) as Review[];
    const cases: CaseResult[] = [];
    for (const name of (await readdir(join(dir, "data")))
      .filter((n) => n.endsWith(".json.gz"))
      .sort())
      cases.push(
        JSON.parse(
          gunzipSync(await readFile(join(dir, "data", name))).toString("utf8"),
        ),
      );
    validateReviews(plan.rows, templates, cases);
    const receipt = {
      recordedAt: new Date().toISOString(),
      method:
        "append-only; all prior records and raw prefix preserved; exact state SHA and image evidence validated",
      receipts,
      beforeSha: plan.beforeSha,
      afterSha: plan.afterSha,
      preservedPrefixSha: plan.preservedPrefixSha,
      priorCount: plan.priorCount,
      appendedCount: plan.appendedCount,
      totalCount: plan.rows.length,
      dryRun,
    };
    if (!dryRun) {
      await writeFile(temporary, plan.bytes, { flag: "wx" });
      if (sha(await readFile(reviewPath)) !== plan.beforeSha)
        throw new Error(
          "Review file changed during validation; no evidence changed",
        );
      await rename(temporary, reviewPath);
      if (sha(await readFile(reviewPath)) !== plan.afterSha)
        throw new Error("Post-append hash verification failed");
      await appendFile(
        join(dir, "review-merge-log.jsonl"),
        JSON.stringify(receipt) + "\n",
      );
    }
    return receipt;
  } finally {
    await lock.close();
    await rm(lockPath, { force: true });
    await rm(temporary, { force: true });
  }
}

async function main() {
  const args = process.argv.slice(2),
    run = args[args.indexOf("--run") + 1],
    expected = args[args.indexOf("--expect-sha") + 1],
    receipts = args.flatMap((a, i) => (a === "--receipt" ? [args[i + 1]] : []));
  if (
    !args.includes("--run") ||
    !/^[a-z\d][a-z\d-]{0,70}$/.test(run ?? "") ||
    !args.includes("--expect-sha") ||
    !/^[a-f\d]{64}$/i.test(expected ?? "") ||
    !receipts.length
  )
    throw new Error(
      "Usage: --run <run> --expect-sha <current review SHA256> --receipt <file> [--receipt <file>] [--dry-run]",
    );
  console.log(
    JSON.stringify(
      await appendReviewReceipts(
        resolve("docs/audits/life-v7", run),
        receipts,
        expected,
        args.includes("--dry-run"),
      ),
      null,
      2,
    ),
  );
}
if (
  process.argv[1]
    ?.replaceAll("\\", "/")
    .endsWith("/source-audit/merge-reviews.ts")
)
  main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
