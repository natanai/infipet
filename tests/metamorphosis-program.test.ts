import assert from "node:assert/strict";
import test from "node:test";
import { compileGenome } from "../src/simulation/genome";
import { describeSource } from "../src/simulation/source-atlas";
import { compileSources } from "../src/simulation/material";
import {
  buildBodyMetamorphosis,
  getMetamorphosisPhase,
} from "../src/simulation/metamorphosis";
import { clonePreset } from "../src/presets";

test("sheltered life programs enclose, emerge and remain alive after the elder milestone", () => {
  const genome = compileGenome("coordinator");
  genome.lifeProgram.kind = "sheltered";
  assert.equal(getMetamorphosisPhase(genome, 0).enclosure, 0);
  assert.equal(getMetamorphosisPhase(genome, 30).enclosure, 1);
  assert.equal(getMetamorphosisPhase(genome, 36).enclosure, 1);
  assert.ok(getMetamorphosisPhase(genome, 50).enclosure < 1);
  assert.equal(getMetamorphosisPhase(genome, 75).enclosure, 0);
  assert.equal(getMetamorphosisPhase(genome, 1000000).phase, "elder");
  for (const kind of ["direct", "metamorphic"] as const) {
    genome.lifeProgram.kind = kind;
    for (const day of [0, 12, 30, 45, 75, 120])
      assert.equal(getMetamorphosisPhase(genome, day).enclosure, 0);
  }
});

test("coordinated body targets are continuous across the milestone labels", () => {
  const patch = describeSource(
    compileSources(clonePreset("canine-cub"), 1, "authored"),
  ).patches.find((p) => p.kind === "body")!;
  const genome = compileGenome("continuity-program");
  assert.equal(
    buildBodyMetamorphosis(patch, genome, 0, patch.centerline),
    undefined,
  );
  for (const age of [30, 75, 120]) {
    const before = buildBodyMetamorphosis(
        patch,
        genome,
        age - 1e-6,
        patch.centerline,
      )!,
      at = buildBodyMetamorphosis(patch, genome, age, patch.centerline)!;
    assert.equal(before.kernel.target.length, at.kernel.target.length);
    for (let i = 0; i < at.kernel.target.length; i++)
      assert.ok(
        Math.hypot(
          before.kernel.target[i].x - at.kernel.target[i].x,
          before.kernel.target[i].y - at.kernel.target[i].y,
        ) < 1e-5,
      );
  }
});

test("core transport depends on authored anatomy while pigment cannot reroll its geometry", () => {
  const source = clonePreset("canine-cub"),
    paint = structuredClone(source),
    wide = structuredClone(source);
  for (const part of paint)
    for (const cell of part.pixels) cell.color = "#334477";
  for (const part of wide)
    if (part.kind === "body")
      for (const cell of part.pixels)
        cell.x = 8 + Math.round((cell.x - 8) * 1.25);
  const patch = (parts: typeof source) =>
    describeSource(compileSources(parts, 1, "authored")).patches.find(
      (p) => p.kind === "body",
    )!;
  const [a, b, c] = [source, paint, wide].map(patch),
    genome = compileGenome("source-program");
  const get = (p: typeof a) =>
    buildBodyMetamorphosis(p, genome, 75, p.centerline)!.kernel;
  assert.deepEqual(get(a), get(b));
  assert.notDeepEqual(get(a), get(c));
});
