import test from "node:test";
import assert from "node:assert/strict";
import { RETRO_PRESETS, cloneRetroPreset } from "../src/retro";
import { drawingPixels } from "../src/drawing";
import { createSimulation } from "../src/simulation";
import { compileGenome } from "../src/simulation/genome";
import { compileSources } from "../src/simulation/material";
import { describeSource } from "../src/simulation/source-atlas";
import { compileLineage } from "../src/lineage";

const stages = [0, 1, 49, 121, 193];
const context = (care: number, training: number, battle: number) => ({
  hatchAtHours: 0,
  stageEndHours: [1, 49, 121, 193],
  stagePoints: stages.map((hour, i) => ({
    id: ["hatchling", "infant", "juvenile", "adult", "advanced"][i],
    atHour: hour,
    care,
    training,
    battle,
  })),
});
const image = (pixels: readonly { x: number; y: number; color: string }[]) =>
  pixels.map(p => p.x + "," + p.y + "," + p.color).sort().join("|");

test("every retro drawing carries a stable, unique, alphanumeric candidate genome", () => {
  const ids = new Set<string>(), seeds = new Set<string>();
  assert.equal(RETRO_PRESETS.length, 36);
  for (const preset of RETRO_PRESETS) {
    assert.match(preset.seed, /^R[0-9A-Z]{7}$/);
    assert.equal(ids.has(preset.referenceId), false);
    assert.equal(seeds.has(preset.seed), false);
    ids.add(preset.referenceId);
    seeds.add(preset.seed);
    assert.equal(compileGenome(preset.seed).seed, preset.seed);
  }
});

test("retro seeds use the identical general-purpose genome/compiler as arbitrary letters and numbers", () => {
  for (const seed of ["0", "2026", "HELLO", "PET7", RETRO_PRESETS[0].seed]) {
    const first = compileGenome(seed);
    const second = compileGenome(seed);
    assert.deepEqual(first, second);
    assert.equal(first.seed, seed);
    assert.equal(first.stages.length, 3);
    assert.ok(first.stages.some(stage => stage.stretch > 0));
  }
});

test("source drawings cannot select a named reference creature's end-state", () => {
  for (const ref of RETRO_PRESETS.filter(p => p.root)) {
    const parts = cloneRetroPreset(ref.id);
    const simulation = createSimulation(parts, ref.seed, "infant");
    const same = createSimulation(cloneRetroPreset(ref.id), ref.seed, "infant");
    assert.equal(image(simulation.frameAt(0).pixels), image(drawingPixels(parts).map(p => ({ ...p, x: p.x + 16, y: p.y + 16 }))));
    for (const age of [0, 30, 75]) {
      assert.equal(image(simulation.frameAt(age).pixels), image(same.frameAt(age).pixels));
    }
  }
});

test("seeded retro source evolution can be care-dependent without reference-target lookup", () => {
  // Genetic potentials do not change when care changes; live care influences
  // lineage commitments, which in turn affect the same physical morph engine.
  const baby = RETRO_PRESETS.find(p => p.referenceId === "dm1.botamon")!;
  const parts = cloneRetroPreset(baby.id);
  const atlas = describeSource(compileSources(parts, 1));
  let witness = false;
  for (let i = 0; i < 72; i++) {
    const seed = i === 0 ? baby.seed : "TEST" + i.toString(36).toUpperCase();
    const genome = compileGenome(seed);
    const low = compileLineage(atlas, genome, context(0, 0, 0).stagePoints);
    const high = compileLineage(atlas, genome, context(1, 1, 1).stagePoints);
    if (low.commitments.some((p, j) => p.nodeId !== high.commitments[j].nodeId)) {
      assert.deepEqual(compileGenome(seed), genome);
      assert.deepEqual(compileLineage(atlas, genome, context(0, 0, 0).stagePoints), low);
      witness = true;
      break;
    }
  }
  assert.ok(witness, "at least one independently seeded retro source should have a real care-conditional taxonomic commitment");
});
