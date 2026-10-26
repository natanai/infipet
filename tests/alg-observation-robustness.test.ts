import test from "node:test";
import assert from "node:assert/strict";
import { compileSources } from "../src/simulation/material";
import { describeSource } from "../src/simulation/source-atlas";
import { inferSourceAffinities } from "../src/lineage/source-classifier";
import { measureInferenceStability } from "../src/inference/robustness";
import type { PetPart } from "../src/simulation/model";

const geometry = [
  "...#...", "..###..", ".#####.", "#######",
  ".#####.", "..###..", "...#...",
];
function draw(rows: readonly string[], x = 8, y = 8, color = "#ffffff"): PetPart[] {
  return [{
    id: "ink", kind: "body", name: "user artwork", parentId: null,
    position: { x, y },
    pixels: rows.flatMap((row, yy) => [...row].flatMap((c, xx) =>
      c === "#" ? [{ x: xx, y: yy, color }] : [])),
  }];
}
// Compare both numerical evidence and VERIFIED scientific reference identities.
const infer = (parts: PetPart[]) =>
  inferSourceAffinities(describeSource(compileSources(parts, 1)), {});

test("[OBS-003/A1] translated, repainted and reorganized layer ink has identical evidence and ranking", () => {
  const baseline = infer(draw(geometry));
  const shifted = infer(draw(geometry, 14, 17));
  const painted = infer(draw(geometry, 8, 8, "#001122").map(p => ({
    ...p, id: "anything", kind: "decoration" as const, name: "unknown",
    pixels: [...p.pixels].reverse(),
  })));
  assert.deepEqual(shifted.morphology, baseline.morphology);
  assert.deepEqual(painted.morphology, baseline.morphology);
  const report = measureInferenceStability(baseline, [
    { label: "translated", inference: shifted },
    { label: "repainted", inference: painted },
  ]);
  assert.equal(report.stability, 1);
  assert.equal(report.worstVariation, 0);
  assert.equal(report.maxEvidenceShift, 0);
  assert.equal(report.confidentJumps, 0);
  assert.deepEqual(report.cases.map(c => c.label), ["translated", "repainted"]);
});

test("[OBS-003/A2] single-cell addition, deletion and stray marks cannot force confident taxonomy changes", () => {
  const parts = draw(geometry);
  const baseline = infer(parts);
  const removed = infer([{ ...parts[0], pixels: parts[0].pixels.slice(1) }]);
  const added = infer([{
    ...parts[0],
    pixels: [...parts[0].pixels, { x: 4, y: 0, color: "#ffffff" }],
  }]);
  const distantMark = infer([{
    ...parts[0],
    pixels: [...parts[0].pixels, { x: 18, y: 18, color: "#ffffff" }],
  }]);
  const report = measureInferenceStability(baseline, [
    { label: "deleted", inference: removed },
    { label: "added", inference: added },
    { label: "distant", inference: distantMark },
  ]);
  assert.ok(report.worstVariation < 0.18, JSON.stringify(report));
  assert.equal(report.confidentJumps, 0);
  assert.equal(removed.confidence, "insufficient");
  assert.equal(added.confidence, "insufficient");
  assert.equal(distantMark.confidence, "insufficient");
  assert.ok(report.stability > 0.82);
  for (const variation of [removed, added, distantMark]) {
    // Ink edits never silently switch to a fabricated or unrelated taxon.
    assert.deepEqual(variation.candidates.map(c => [c.affinity, c.taxon?.nodeId ?? null]),
      baseline.candidates.map(c => [c.affinity, c.taxon?.nodeId ?? null]));
    assert.equal(variation.probabilityKind, "heuristic-not-calibrated");
  }
  for (const c of report.cases) {
    assert.ok(c.totalVariation >= 0 && c.totalVariation <= 1);
    assert.ok(c.maxProbabilityShift >= 0);
    assert.ok(c.uncertaintyShift < 0.1);
  }
});
