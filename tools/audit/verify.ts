/** Independent saved-artifact and replay checks; no growth-engine mutation. */
import { join } from "node:path";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { createSimulation } from "../../src/simulation";
import { readBatch, loadJson, saveJson, engineHashes } from "./collection";
import { frameHash } from "./metrics";
import { readPng, rasterPixels } from "./presentation";
import { digest, rate } from "./protocol";
import type { Manifest, ReviewSchedule, Summary } from "./types";

export async function verifyRun(runDir: string, manifest: Manifest) {
  const failures: string[] = [];
  let cases = 0, frames = 0, atlasSamples = 0, atlasMatches = 0, replaySamples = 0, replayMatches = 0;
  const caseIds = new Set<string>();
  const resultHasher = createHash("sha256");
  for (const preset of manifest.presets) {
    if (digest(preset.parts) !== preset.sourceHash) failures.push(`Changed frozen source ${preset.id}`);
    for (const history of manifest.histories) {
      const batch = await readBatch(runDir, preset.id, history.id);
      const atlas = await readPng(join(runDir, "atlases", `${preset.id}--${history.id}.png`));
      if (atlas.width !== manifest.ages.length * 64 || atlas.height !== manifest.seedCount * 64) failures.push(`Atlas dimensions ${preset.id}/${history.id}`);
      for (const c of batch) {
        const id = `${c.presetId}/${c.historyId}/${c.seedIndex}`;
        if (caseIds.has(id)) failures.push(`Duplicate case ${id}`);
        caseIds.add(id); cases++; frames += c.frames.length;
        if (c.errors.length || JSON.stringify(c.frames.map((f) => f.age)) !== JSON.stringify(manifest.ages)) failures.push(`Incomplete or errored case ${id}`);
        resultHasher.update(JSON.stringify([id, c.fingerprint, c.birthExact, c.genomeStable, c.frames.map((f) => [f.age, f.hash, f.silhouetteHash, f.descriptor, f.integrity, f.feelings, f.capabilities])]) + "\n");
      }
      // Predeclared sample across every atlas, including late care and elderly remodeling.
      const seedIndex = (manifest.histories.indexOf(history) * 17) % manifest.seedCount;
      const ageIndex = manifest.histories.indexOf(history) % manifest.ages.length;
      const sim = createSimulation(preset.parts, manifest.seeds[seedIndex], "infant", { needTimeline: history.timeline });
      const actual = sim.frameAt(manifest.ages[ageIndex], manifest.render);
      const expected = rasterPixels(actual.pixels);
      let equal = true;
      for (let y = 0; y < 64; y++) {
        const start = ((seedIndex * 64 + y) * atlas.width + ageIndex * 64) * 4;
        for (let x = 0; x < 64 * 4; x++) if (atlas.rgba[start + x] !== expected[y * 64 * 4 + x]) { equal = false; break; }
      }
      atlasSamples++; if (equal) atlasMatches++; else failures.push(`Saved PNG differs from engine ${preset.id}/${history.id}/s${seedIndex}/d${manifest.ages[ageIndex]}`);
      replaySamples++;
      if (frameHash(actual) === batch[seedIndex].frames[ageIndex].hash) replayMatches++; else failures.push(`Regenerated saved hash differs ${preset.id}/${history.id}`);
    }
    process.stdout.write(`Verified stored atlas/replay ${preset.id}\n`);
  }
  const summary = await loadJson<Summary>(join(runDir, "summary.json"));
  const schedule = await loadJson<ReviewSchedule>(join(runDir, "review-schedule.json"));
  if (cases !== manifest.expected.cases || frames !== manifest.expected.frames) failures.push("Full cohort count mismatch");
  if (summary.counts.completedCases !== cases || summary.counts.frames !== frames) failures.push("Summary count mismatch");
  if (schedule.frameCount !== 4600 || schedule.secondaryFrameCount !== 920) failures.push("Scheduled review coverage mismatch");
  const rawEngine = await engineHashes();
  if (digest(rawEngine) !== manifest.engineHash) failures.push("Frozen engine hash changed");
  const auditSourceHashes: Record<string, string> = {};
  for (const name of (await readdir("tools/audit")).sort()) if (name.endsWith(".ts")) auditSourceHashes[`tools/audit/${name}`] = digest(await readFile(join("tools/audit", name), "utf8"));
  for (const name of ["src/presets.ts", "App.tsx", "src/pet-format.ts", "package.json", "pnpm-lock.yaml"]) auditSourceHashes[name] = digest(await readFile(name, "utf8"));
  const record = {
    checkedAt: new Date().toISOString(), cases, frames, uniqueCases: caseIds.size,
    atlasPixels: rate(atlasMatches, atlasSamples), independentSavedReplay: rate(replayMatches, replaySamples),
    deterministicResultHash: resultHasher.digest("hex"), excludedFromDeterministicHash: ["timestamps", "performance timings", "visual reviewer judgments"],
    engineUnchanged: digest(rawEngine) === manifest.engineHash, auditSourceHashes,
    scheduledFrames: schedule.frameCount, independentScheduledFrames: schedule.secondaryFrameCount,
    failures,
  };
  await saveJson(join(runDir, "artifact-verification.json"), record);
  await saveJson(join(runDir, "tool-provenance.json"), { metricVersion: manifest.metricVersion, hashes: auditSourceHashes });
  if (failures.length) throw new Error(`Saved audit verification failed: ${failures.join("; ")}`);
  return record;
}
