import test from "node:test";
import assert from "node:assert/strict";
import { compileGenome, compileLabGenome, genomeCacheKey } from "../src/simulation/genome";
import { DEVELOPMENTAL_CHANNELS } from "../src/genetics";

const unpack = (genes: Record<string, Record<string, number>>) =>
  Object.entries(genes).flatMap(([group, values]) =>
    Object.entries(values).map(([trait, value]) => ({ group, trait, value })));

test("[GEN-002/A1] nearby genetic coordinates move related traits smoothly and leave other groups invariant", () => {
  const initial = compileLabGenome("SHARED-LOCUS", "infant", { growth: 0.41 });
  const neighbor = compileLabGenome("SHARED-LOCUS", "infant", { growth: 0.42 });
  const another = compileLabGenome("SHARED-LOCUS", "infant", { growth: 0.43 });
  assert.notEqual(initial.fingerprint, neighbor.fingerprint);
  assert.notEqual(genomeCacheKey(initial), genomeCacheKey(neighbor));
  assert.notEqual(genomeCacheKey(neighbor), genomeCacheKey(another));
  const a = unpack(initial.genotype.channels);
  const b = unpack(neighbor.genotype.channels);
  const c = unpack(another.genotype.channels);
  assert.equal(a.length, b.length);
  for (let i = 0; i < a.length; i++) {
    const delta = b[i].value - a[i].value;
    const next = c[i].value - b[i].value;
    if (a[i].group === "growth") {
      assert.ok(Math.abs(delta - 0.0067) < 1e-12, a[i].trait + ": " + delta);
      assert.ok(Math.abs(next - delta) < 1e-12);
    } else {
      assert.equal(delta, 0, a[i].group + " moved when only growth changed");
      assert.equal(next, 0);
    }
  }
  assert.throws(() => compileLabGenome("X", "infant", { growth: -0.01 }), /Invalid genetic coordinate/);
  assert.throws(() => compileLabGenome("X", "infant", { growth: Number.NaN }), /Invalid genetic coordinate/);
});

test("[GEN-002/A2] independent seeds span quantitative inherited diversity without sprite lookup", () => {
  const samples = Array.from({ length: 80 }, (_, i) =>
    compileGenome("GENE-" + i.toString(36).toUpperCase().padStart(4, "0")).genotype);
  const groups = Object.keys(DEVELOPMENTAL_CHANNELS);
  const spreads = groups.map(group => {
    const values = samples.map(g => g.coordinates[group as keyof typeof g.coordinates]);
    return Math.max(...values) - Math.min(...values);
  });
  for (const [i, spread] of spreads.entries())
    assert.ok(spread > 0.75, groups[i] + " locus spread too small: " + spread);
  const traits = samples.map(g => unpack(g.channels));
  let different = 0;
  for (let i = 1; i < samples.length; i++) {
    const distance = traits[i].reduce((sum, gene, j) =>
      sum + Math.abs(gene.value - traits[0][j].value), 0) / traits[i].length;
    if (distance > 0.12) different++;
  }
  assert.ok(different >= 55, different + " / 79 seeds sufficiently distinct");
  assert.ok(samples.every(g =>
    unpack(g.channels).every(({ value }) => value >= 0 && value <= 1)));
});

test("[GEN-002/A2] different ordinary seeds retain distinct rendered lifetimes for the same authored ink", async () => {
  const { createSimulation } = await import("../src/simulation");
  const { hash } = await import("../src/simulation/model");
  const rows = ["...###...", ".#######.", "#########", "#########", ".#######.", "...###..."];
  const source = [{
    id: "original-ink", kind: "body" as const, name: "unnamed creature",
    parentId: null, position: { x: 8, y: 8 },
    pixels: rows.flatMap((row, y) => [...row].flatMap((pixel, x) =>
      pixel === "#" ? [{ x, y, color: "#FFFFFF" }] : [])),
  }];
  const lateShapes = new Set<string>();
  for (let i = 0; i < 12; i++) {
    const seed = "GENE-MORPH-" + String(i).padStart(2, "0");
    const born = createSimulation(source, seed, "infant");
    const replay = createSimulation(source, seed, "infant");
    const shapeAt = (simulation: typeof born, age: number) =>
      simulation.frameAt(age, { action: "idle", time: 0 }).pixels
        .map(p => p.x + "," + p.y).sort().join(";");
    const late = shapeAt(born, 120);
    assert.equal(late, shapeAt(replay, 120), seed + " lost deterministic geometry replay");
    assert.ok(late.length > 0, "render should retain drawable material");
    lateShapes.add(hash(late).toString(16) + ":" + late.length);
  }
  assert.ok(lateShapes.size >= 6,
    "Twelve ordinary seeds should yield diverse mature morphologies for identical source ink; got " +
    lateShapes.size);
});
