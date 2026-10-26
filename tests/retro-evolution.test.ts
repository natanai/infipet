import assert from "node:assert/strict";
import test from "node:test";
import { RETRO_PRESETS, cloneRetroPreset } from "../src/retro";
import { resolveRetroRoute, retroAt, retroPixelsAt } from "../src/retro/evolution";
import { drawingPixels } from "../src/drawing";
import { createSimulation } from "../src/simulation";
import { compileGenome } from "../src/simulation/genome";

const imageKey = (pixels: readonly { x: number; y: number; color: string }[]) =>
  pixels.map(p => p.x + "," + p.y + "," + p.color).sort().join("|");

test("all retro drawings have distinct alphanumeric seeds and explicit original reference routes", () => {
  const ids = new Set(RETRO_PRESETS.map(p => p.referenceId));
  const seeds = new Set<string>();
  assert.equal(RETRO_PRESETS.length, 36);
  for (const p of RETRO_PRESETS) {
    assert.match(p.seed, /^RETRO-[A-Z0-9-]+$/);
    assert.ok(!seeds.has(p.seed));
    seeds.add(p.seed);
    assert.equal(p.path[p.startIndex], p.referenceId);
    assert.ok(p.path.every(id => ids.has(id)));
    assert.equal(resolveRetroRoute(cloneRetroPreset(p.id), p.seed, "infant")?.sourceId, p.referenceId);
  }
});

test("every route reaches precisely the stored historical pixels at every keyframe", () => {
  const milestones = [0, 30, 75, 120, 180];
  for (const preset of RETRO_PRESETS) {
    const route = resolveRetroRoute(cloneRetroPreset(preset.id), preset.seed, "infant")!;
    for (let i = route.startIndex; i < route.path.length; i++) {
      const age = milestones[i] - milestones[route.startIndex];
      const first = retroPixelsAt(route, age);
      const again = retroPixelsAt(route, age);
      const target = RETRO_PRESETS.find(p => p.referenceId === route.path[i])!;
      const targetPixels = drawingPixels(target.parts).map(p => ({ ...p, x: p.x + 16, y: p.y + 16 }));
      assert.equal(first.state.currentId, target.referenceId);
      assert.equal(imageKey(first.pixels), imageKey(targetPixels), preset.referenceId + " -> " + target.referenceId);
      assert.equal(imageKey(first.pixels), imageKey(again.pixels));
    }
  }
});

test("an edited drawing or nonmatching seed reverts to ordinary procedural growth", () => {
  const preset = RETRO_PRESETS.find(p => p.referenceId === "dm1.botamon")!;
  const parts = cloneRetroPreset(preset.id);
  for (const seed of ["12345", "HELLO", "PET7"]) {
    assert.equal(compileGenome(seed).seed, seed);
    assert.equal(resolveRetroRoute(parts, seed, "infant"), null);
  }
  assert.equal(resolveRetroRoute(parts, preset.seed, "egg"), null);
  parts[0].pixels.splice(0, 1);
  assert.equal(resolveRetroRoute(parts, preset.seed, "infant"), null);
});

test("preview and live-game clocks follow exactly the same reference sequence", () => {
  const preset = RETRO_PRESETS.find(p => p.referenceId === "dm1.botamon")!;
  const route = resolveRetroRoute(cloneRetroPreset(preset.id), preset.seed, "infant")!;
  assert.equal(retroAt(route, 30).currentId, "dm1.koromon");
  assert.equal(retroAt(route, 75).currentId, "dm1.agumon");
  assert.equal(retroAt(route, 120).currentId, "dm1.greymon");
  assert.equal(retroAt(route, 180).currentId, "dm1.metal-greymon");
  const live = { hatchAtHours: 0, stageEndHours: [1, 49, 121, 193], stagePoints: [] };
  assert.equal(retroAt(route, 1 / 24, live).currentId, "dm1.koromon");
  assert.equal(retroAt(route, 49 / 24, live).currentId, "dm1.agumon");
  assert.equal(retroAt(route, 121 / 24, live).currentId, "dm1.greymon");
  assert.equal(retroAt(route, 193 / 24, live).currentId, "dm1.metal-greymon");
});

test("full simulator presents exact pinned reference form and destination", () => {
  const maskutchi = RETRO_PRESETS.find(p => p.referenceId === "p1.maskutchi")!;
  const simulation = createSimulation(cloneRetroPreset(maskutchi.id), maskutchi.seed, "infant");
  assert.equal(simulation.frameAt(0).evolution?.retroReference?.currentId, "p1.maskutchi");
  assert.equal(simulation.frameAt(60).evolution?.retroReference?.currentId, "p1.bill");
  const target = RETRO_PRESETS.find(p => p.referenceId === "p1.bill")!;
  assert.equal(
    imageKey(simulation.frameAt(60).pixels),
    imageKey(drawingPixels(target.parts).map(p => ({ ...p, x: p.x + 16, y: p.y + 16 }))),
  );
});
