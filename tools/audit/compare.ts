import { join, resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { digest } from "./protocol";
import { exists, loadJson, saveJson } from "./collection";
import type { Manifest, Summary } from "./types";

export function comparableInputs(baseline: Manifest, candidate: Manifest) {
  return baseline.metricVersion === candidate.metricVersion && baseline.protocolVersion === candidate.protocolVersion && digest([baseline.seeds, baseline.histories, baseline.ages, baseline.render, baseline.presets.map((p) => [p.id, p.sourceHash])]) === digest([candidate.seeds, candidate.histories, candidate.ages, candidate.render, candidate.presets.map((p) => [p.id, p.sourceHash])]);
}
export async function writeComparison(runDir: string, candidate: Manifest, baselineId: string) {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(baselineId)) throw new Error("--compare must be an existing audit ID, not a path.");
  if (baselineId === candidate.runId) throw new Error("A progress comparison requires a different baseline run; self-comparison is not progress.");
  const baselineDir = resolve("docs/audits", baselineId);
  const baseline = await loadJson<Manifest>(join(baselineDir, "manifest.json"));
  const previous = await loadJson<Summary>(join(baselineDir, "summary.json"));
  const current = await loadJson<Summary>(join(runDir, "summary.json"));
  const provenance = await exists(join(baselineDir, "tool-provenance.json")) ? await loadJson<{ hashes: Record<string, string> }>(join(baselineDir, "tool-provenance.json")) : null;
  const metricFiles = ["tools/audit/metrics.ts", "tools/audit/analysis.ts", "tools/audit/protocol.ts"];
  const currentHashes = Object.fromEntries(await Promise.all(metricFiles.map(async (path) => [path, digest(await readFile(path, "utf8"))])));
  const metricImplementationMatches = Boolean(provenance && metricFiles.every((path) => provenance.hashes[path] === currentHashes[path]));
  const comparable = comparableInputs(baseline, candidate) && metricImplementationMatches && current.counts.frames === candidate.expected.frames && previous.counts.frames === baseline.expected.frames;
  const output = {
    baseline: baselineId, candidate: candidate.runId, comparable,
    reason: comparable ? "Complete unchanged source/seed/history/age/render cohort and unchanged metric version/implementation" : "Cohort, completeness, metric version or metric implementation differs (or provenance unavailable); percentage-point deltas withheld. Recompute compatible stored inputs under one definition or mark incomparable.",
    deltasPercentagePoints: comparable ? current.presets.map((p) => ({ preset: p.id, metrics: Object.fromEntries(Object.entries(p.rates).map(([key, value]) => { const old = previous.presets.find((b) => b.id === p.id)?.rates[key]?.percent; return [key, value.percent !== null && old != null ? value.percent - old : null]; })) })) : [],
  };
  await saveJson(join(runDir, "comparison.json"), output);
  return output;
}
