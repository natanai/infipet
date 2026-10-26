import { resolve, join } from "node:path";
import { prepare, collect, loadJson, exists } from "./collection";
import type { Manifest } from "./types";

async function main() {
  const args = process.argv.slice(2);
  const value = (name: string) => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
  const runId = value("--run") ?? "household-v1";
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(runId)) throw new Error("--run must be a lowercase audit ID, not a path.");
  const runDir = resolve("docs/audits", runId);
  // Presentation and stored-data analysis need no old growth runtime. Collection still requires an exact source/engine match.
  const storedStage = ["--analyze", "--sheets", "--present", "--verify"].some((flag) => args.includes(flag));
  if (!storedStage) throw new Error("Household v1 collection is archived with algorithm 5. Use pnpm audit:evolution for life-v6. Existing audit artifacts are unchanged.");
  const manifest = storedStage && await exists(join(runDir, "manifest.json")) ? await loadJson<Manifest>(join(runDir, "manifest.json")) : await prepare(runDir, runId);
  if (args.includes("--prepare")) { process.stdout.write(`Sources prepared: ${runDir}\n`); return; }
  if (args.includes("--collect")) { await collect(runDir, manifest); return; }
  if (args.includes("--verify")) { const module = await import("./verify"); await module.verifyRun(runDir, manifest); return; }
  const stage = args.includes("--supplemental") ? "supplemental" : args.includes("--analyze") ? "analysis" : args.includes("--sheets") ? "review" : args.includes("--present") ? "present" : "all";
  if (stage === "all") await collect(runDir, manifest);
  if (stage === "supplemental" || stage === "all") {
    const module = await import("./supplemental");
    await module.collectSupplemental(runDir, manifest);
  }
  if (stage === "analysis" || stage === "all") {
    const module = await import("./analysis");
    await module.analyze(runDir, manifest);
    const comparisonId = value("--compare");
    if (comparisonId) { const comparator = await import("./compare"); await comparator.writeComparison(runDir, manifest, comparisonId); }
  }
  if (stage === "review" || stage === "all") {
    const module = await import("./review");
    await module.generateReviewSheets(runDir, manifest);
  }
  if (stage === "all") { const module = await import("./verify"); await module.verifyRun(runDir, manifest); }
  if (stage === "present" || stage === "all") {
    const module = await import("./review");
    await module.present(runDir, manifest);
  }
}
main().catch((error) => { process.stderr.write(`${error.stack ?? error}\n`); process.exitCode = 1; });
