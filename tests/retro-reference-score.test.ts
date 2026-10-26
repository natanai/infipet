/**
 * Independent reference benchmark. Its targets are never imported by the
 * procedural renderer. A measured similarity is NOT a parity claim.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { RETRO_PRESETS, cloneRetroPreset } from "../src/retro";
import { drawingPixels } from "../src/drawing";
import { createSimulation, type Pixel } from "../src/simulation";
import { listNativeP1HistoryRoutes } from "../src/gameplay/native-p1";

const byId = new Map(RETRO_PRESETS.map(p => [p.referenceId, p]));
function normalizedSilhouette(pixels: readonly Pixel[], resolution = 32): Set<string> {
  if (!pixels.length) return new Set();
  const minX = Math.min(...pixels.map(p => p.x));
  const maxX = Math.max(...pixels.map(p => p.x));
  const minY = Math.min(...pixels.map(p => p.y));
  const maxY = Math.max(...pixels.map(p => p.y));
  const extent = Math.max(1, maxX - minX, maxY - minY);
  const scale = (resolution - 1) / extent;
  const xPad = ((resolution - 1) - (maxX - minX) * scale) / 2;
  const yPad = ((resolution - 1) - (maxY - minY) * scale) / 2;
  return new Set(pixels.map(p =>
    Math.round((p.x - minX) * scale + xPad) + "," +
    Math.round((p.y - minY) * scale + yPad)));
}
function overlap(actual: readonly Pixel[], reference: readonly Pixel[]): number {
  const a = normalizedSilhouette(actual);
  const b = normalizedSilhouette(reference);
  const intersection = [...a].filter(cell => b.has(cell)).length;
  const union = a.size + b.size - intersection;
  return union ? intersection / union : 1;
}

test("independent original P1 ROM path is measurable without directing a single generated frame", () => {
  const routes = listNativeP1HistoryRoutes();
  const route = routes.find(r => r.characters.includes("p1.mametchi") &&
    r.characters.every(id => byId.has(id)));
  assert.ok(route, "reference ROM should expose a fully drawn Mametchi lineage");
  const original = byId.get(route.characters[0])!;
  const starting = cloneRetroPreset(original.id);
  const milestones = [0, 1, 49, 121, 193];
  // Condition vector is a *hypothetical* care input, not a reconstructed
  // hardware command trace. No threshold has been tuned to a target sprite.
  const care = [
    { id:"hatchling", atHour:0, care:1, training:0, battle:0 },
    { id:"infant", atHour:1, care:1, training:0.2, battle:0 },
    { id:"juvenile", atHour:49, care:1, training:0.5, battle:0 },
    { id:"adult", atHour:121, care:1, training:0.5, battle:0 },
  ];
  const context = { hatchAtHours: 0, stageEndHours: [1,49,121,193], stagePoints: care };
  const sim = createSimulation(starting, original.seed, "infant", { liveContext: context });
  const repeated = createSimulation(cloneRetroPreset(original.id), original.seed, "infant", { liveContext: context });
  const results = route.characters.slice(0, 4).map((id, i) => {
    const actual = sim.frameAt(milestones[i] / 24).pixels;
    const again = repeated.frameAt(milestones[i] / 24).pixels;
    assert.deepEqual(actual, again, "identical drawing, seed, care and time must replay identically");
    return { target: id, overlap: Number(overlap(actual, drawingPixels(byId.get(id)!.parts)).toFixed(4)) };
  });
  assert.equal(results[0].overlap, 1, "birth image should retain its exact authored silhouette");
  assert.ok(results.every(v => v.overlap >= 0 && v.overlap <= 1));
  // A diagnostic benchmark, not a successful match assertion. Evolution
  // fidelity must be demonstrated separately after developing the algorithm.
  console.info("P1 candidate seed / hypothetical care route / silhouette IoU:", JSON.stringify(results));
});
