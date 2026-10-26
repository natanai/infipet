import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compileSources } from "../src/simulation/material";
import { describeSource } from "../src/simulation/source-atlas";
import { createSimulation } from "../src/simulation";
import { compileGenome, genomeCacheKey } from "../src/simulation/genome";
import { compileRuntimeBiology } from "../src/integration";
import { classifySource, compileLineage, lineageAt, lineageTraitsAt } from "../src/lineage";
import { createGame, deriveCareTimeline, deriveDevelopmentContext } from "../src/gameplay";
import { encodePet, decodePet, LINEAGE_RECIPE_VERSION, PROTOTYPE_REVISION, type PetDocument } from "../src/pet-format";
import { NEEDS_CATALOG_VERSION, NEEDS_RULES_VERSION } from "../src/needs";
import type { PetPart } from "../src/simulation/model";

const seed = "RUNTIME-BIOLOGY-47";
const draw = (rows: readonly string[]): PetPart[] => [{
  id: "drawn-pet", kind: "body", name: "Not a species",
  parentId: null, position: { x: 0, y: 0 },
  pixels: rows.flatMap((row, y) => [...row].flatMap((symbol, x) =>
    symbol === "#" ? [{ x, y, color: "#ddeeff" }] : [])),
}];
const branching = draw([
  "....#....", "....#....", "....#....",
  ".#######.", "....#....", "...#.#...", "..#...#..",
]);
const atlas = (parts: PetPart[]) => describeSource(compileSources(parts, 42));
const stages = [
  { id: "hatchling", atHour: 0, care: 0.6, training: 0, battle: 0 },
  { id: "infant", atHour: 1, care: 0.7, training: 0, battle: 0 },
  { id: "juvenile", atHour: 49, care: 0.3, training: 0.4, battle: 0 },
  { id: "adult", atHour: 121, care: 0.9, training: 0.6, battle: 0.2 },
] as const;
const context = {
  hatchAtHours: 0, stageEndHours: [1, 49, 121, 193], stagePoints: stages,
};
const pixels = (simulation: ReturnType<typeof createSimulation>, days: number) =>
  simulation.frameAt(days, { action: "idle", time: 0 }).pixels;

test("[integration] blank ink remains unresolved; branching ink retains multi-kingdom evidence and hypotheses", () => {
  const genome = compileGenome(seed);
  const blank = compileRuntimeBiology(atlas([]), genome);
  assert.equal(blank.observation.bestAffinity, "unresolved");
  assert.equal(blank.observation.confidence, "insufficient");
  assert.equal(blank.scientificPetAssignment, null);
  assert.equal(blank.references.length, 0);
  assert.equal(blank.genomeIdentity, genomeCacheKey(genome));
  assert.equal(blank.geneticSignals.biologicalPrior, null);
  assert.equal(blank.geneticSignals.operators["branch-axis"].evidence.status, "unknown");

  const biology = compileRuntimeBiology(atlas(branching), genome);
  assert.equal(biology.scientificPetAssignment, null);
  assert.equal(biology.observation.probabilityKind, "heuristic-not-calibrated");
  assert.ok(biology.observation.uncertainty > 0);
  assert.ok(biology.references.some(reference => reference.affinity === "plant"));
  assert.ok(biology.references.some(reference => reference.affinity === "fungus"));
  for (const reference of biology.references) {
    assert.ok(reference.provenance.kind === "scientific");
    assert.equal(reference.referenceAncestry[0], reference.referenceId);
    assert.equal(reference.signals.biologicalPrior?.lineageNodeId, reference.referenceId);
    assert.deepEqual(reference.signals.channels, genome.genotype.channels);
    assert.ok(reference.anatomicalPossibilities.possibilities.some(candidate =>
      candidate.referenceId !== reference.referenceId),
      "other reference clades remain possible inspirations, not forbidden targets");
  }
  assert.equal(biology.physicalOperatorsConnected, false);
  assert.equal(biology.chronologicalExposureConnected, false);
});

test("[integration] anatomical reference exploration never rewrites scientific ancestry or inherited channels", () => {
  const source = atlas(branching);
  const inherited = compileGenome(seed);
  const before = JSON.stringify(inherited);
  const original = compileRuntimeBiology(source, inherited);
  const changed = compileRuntimeBiology(source, inherited, ["ncbi:3193"]);
  assert.deepEqual(changed.observation, original.observation);
  assert.equal(changed.genomeIdentity, original.genomeIdentity);
  assert.deepEqual(changed.geneticSignals, original.geneticSignals);
  const plant = changed.references.find(reference => reference.affinity === "plant")!;
  const originalPlant = original.references.find(reference => reference.affinity === "plant")!;
  assert.deepEqual(plant.referenceAncestry, originalPlant.referenceAncestry);
  assert.ok(plant.anatomicalPossibilities.possibilities.some(p => p.referenceId === "ncbi:3193"));
  assert.equal(plant.anatomicalPossibilities.fixedBirthReferenceLineage[0], plant.referenceId);
  assert.equal(JSON.stringify(inherited), before);

  const lineage = compileLineage(source, inherited, stages);
  assert.equal(classifySource(source).nodeId, "unresolved");
  assert.equal(lineage.placement.nodeId, "unresolved");
  assert.ok(lineage.commitments.every(point => point.nodeId === "unresolved"));
  assert.equal(lineageAt(lineage, 0).nodeId, lineageAt(lineage, 250).nodeId);
  assert.equal(lineageAt(lineage, 0).commitments.length, 1);
  assert.equal(lineageAt(lineage, 50).commitments.length, 3);
  assert.deepEqual(lineageTraitsAt(lineage, 0), lineageTraitsAt(lineage, 250));
});

test("[integration] gameplay renderer retains ink identity, stable birth genome and causal replay", () => {
  const earlier = [{ needId: "safety" as const, tick: 1, fulfillment: 0.25 }];
  const later = { needId: "safety" as const, tick: 100, fulfillment: 1 };
  const initial = createSimulation(branching, seed, "infant", {
    needTimeline: earlier, liveContext: context,
  });
  const extended = createSimulation(branching, seed, "infant", {
    needTimeline: [...earlier, later],
    liveContext: { ...context, stagePoints: [...stages, {
      id: "advanced", atHour: 200, care: 0.1, training: 0.8, battle: 0.7,
    }] },
  });
  const inherited = compileGenome(seed);
  assert.deepEqual(initial.genome, inherited);
  assert.deepEqual(extended.genome, inherited);
  assert.equal(initial.program.genomeIdentity, genomeCacheKey(inherited));
  assert.equal(initial.program.authoredInkSignature, extended.program.authoredInkSignature);
  const witness = initial.program.biologicalPotential as ReturnType<typeof compileRuntimeBiology>;
  assert.equal(witness.sourceCellCount, branching[0].pixels.length);
  assert.equal(witness.genomeIdentity, genomeCacheKey(inherited));
  assert.equal(witness.scientificPetAssignment, null);

  // Events after hour two cannot change the material already visible then.
  const snapshot = pixels(initial, 2 / 24);
  assert.deepEqual(pixels(extended, 2 / 24), snapshot);
  assert.deepEqual(initial.developmentAt(2 / 24).anatomy,
    extended.developmentAt(2 / 24).anatomy);
  const fresh = createSimulation(branching, seed, "infant", {
    needTimeline: earlier, liveContext: context,
  });
  assert.deepEqual([0, 2 / 24, 3 / 24].map(day => pixels(fresh, day)),
    [0, 2 / 24, 3 / 24].map(day => pixels(initial, day)));
  assert.equal(initial.developmentAt(2 / 24).genomeFingerprint, inherited.fingerprint);
  assert.equal(initial.developmentAt(2 / 24).diagnostics?.biologicalComposition &&
    (initial.developmentAt(2 / 24).diagnostics!.biologicalComposition as {genomeIdentity:string}).genomeIdentity,
    genomeCacheKey(inherited));
});

test("[integration] a normal single-pet save reconstructs the existing retro gameplay path", () => {
  const start = 1_700_000_000_000;
  const game = createGame(seed, "infant", start);
  const pet: PetDocument = {
    version: 8, algorithmVersion: 7, revision: PROTOTYPE_REVISION,
    name: "My drawing", mode: "infant", seed,
    parts: branching, bornAt: start, age: 0,
    needTimeline: [], groomingTimeline: [],
    catalogVersion: NEEDS_CATALOG_VERSION,
    needsRulesVersion: NEEDS_RULES_VERSION,
    life: {
      lineageVersion: LINEAGE_RECIPE_VERSION,
      parts: branching, mode: "infant", seed, name: "My drawing",
      game, groomingTimeline: [],
    },
  };
  const saved = decodePet(encodePet(pet));
  assert.deepEqual(saved.parts, pet.parts);
  assert.deepEqual(saved.life?.game, game);
  assert.equal(saved.life?.lineageVersion, LINEAGE_RECIPE_VERSION);
  const replay = createSimulation(saved.life!.parts, saved.life!.seed, saved.life!.mode, {
    needTimeline: deriveCareTimeline(saved.life!.game),
    liveContext: deriveDevelopmentContext(saved.life!.game),
    groomingTimeline: saved.life!.groomingTimeline,
  });
  assert.deepEqual(replay.genome, compileGenome(seed, "infant"));
  assert.ok(replay.frameAt(0).pixels.length > 0);
  const app = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");
  assert.match(app, /createSimulation\(life\.parts, life\.seed, life\.mode/);
  assert.match(app, /savePet\(/);
  assert.match(app, /<GamePanel/);
});
