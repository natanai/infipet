import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compileSources } from "../src/simulation/material";
import { describeSource } from "../src/simulation/source-atlas";
import { createSimulation } from "../src/simulation";
import { compileGenome, genomeCacheKey } from "../src/simulation/genome";
import { compileRuntimeBiology, compileRuntimeMaterialProgram } from "../src/integration";
import { materialDevelopmentAt, materialSourceAncestry } from "../src/development";
import { flattenAnatomy } from "../src/simulation/model";
import { classifySource, compileLineage, lineageAt, lineageTraitsAt } from "../src/lineage";
import {
  createGame, advanceGame, commandGame, HOUR,
  deriveCareTimeline, deriveDevelopmentContext,
  type GameState,
} from "../src/gameplay";
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

test("[integration-physical] generated material is rendered by frameAt with source ancestry, not just diagnostic counts", () => {
  const birthGenome = compileGenome(seed);
  const source = atlas(branching);
  const biology = compileRuntimeBiology(source, birthGenome);
  const materialProgram = compileRuntimeMaterialProgram(source, birthGenome, biology);
  const graph0 = materialDevelopmentAt(materialProgram, 0);
  const graphLate = materialDevelopmentAt(materialProgram, 240);
  assert.deepEqual(graph0.cells, graph0.sourceCells);
  assert.ok(graphLate.cells.some(cell => cell.provenance === "generated"),
    "merged DEV-002 operations must create real source-derived material");
  assert.deepEqual(graphLate.sourceCells, graph0.sourceCells);
  for (const cell of graphLate.cells) {
    assert.ok(materialSourceAncestry(graphLate, cell.id).length > 0);
    assert.ok(cell.sourceIds.every(id => graph0.sourceCells.some(sourceCell => sourceCell.id === id)));
  }

  const pet = createSimulation(branching, seed, "infant", { liveContext: context });
  const born = pet.frameAt(0, { action: "idle", time: 0 });
  const expected = flattenAnatomy(branching).map(cell => ({
    ...cell, x: cell.x + 16, y: cell.y + 16,
  }));
  assert.deepEqual(born.pixels.map(({x,y,color,z})=>({x,y,color,...(z===undefined?{}:{z})})), expected,
    "authored pixel/color identity must survive birth exactly; ownership is now explicit at check zero");
  assert.ok(!born.parts.some(part => part.role === "material-growth"));
  const late = pet.frameAt(10, { action: "idle", time: 0 });
  const grownParts = late.parts.filter(part => part.role === "material-growth");
  assert.ok(grownParts.length > 0, "operator-generated anatomy must reach the existing PartFrame renderer");
  assert.ok(grownParts.some(part => part.pixels.length > 0));
  assert.ok(grownParts.every(part => part.provenance === "grown" && part.sourcePartIds?.length));
  const composite = new Set(late.pixels.map(p => p.x + "," + p.y + "," + p.color));
  assert.ok(grownParts.flatMap(part => part.pixels).some(p =>
    composite.has(p.x + "," + p.y + "," + p.color)),
    "structural cells must actually survive final compositing into displayed pixels");
  const legacyCoordinates = new Set(late.parts
    .filter(part => part.role !== "material-growth")
    .flatMap(part => part.pixels.map(p => p.x + "," + p.y)));
  assert.ok(grownParts.flatMap(part => part.pixels).some(p =>
    !legacyCoordinates.has(p.x + "," + p.y)),
    "source-derived physical operators must add visible silhouette geometry, not just recolor overlapping pixels");
  assert.ok(late.evolution?.diagnostics?.biologicalComposition &&
    (late.evolution.diagnostics.biologicalComposition as {physicalOperatorsConnected:boolean})
      .physicalOperatorsConnected);
  assert.deepEqual(pet.genome, birthGenome);
  assert.equal(pet.program.materialProgramFingerprint, materialProgram.fingerprint);
});

test("[integration-physical] material growth replays deterministically across pose, age seeking and sources", () => {
  const options = { liveContext: context };
  const a = createSimulation(branching, seed, "infant", options);
  const b = createSimulation(branching, seed, "infant", options);
  const moments = [0, 2, 5, 10];
  const forward = moments.map(age => a.frameAt(age, { time: 1, action: "move" }));
  const reverse = [...moments].reverse().map(age =>
    b.frameAt(age, { time: 1, action: "move" })).reverse();
  for (let i = 0; i < moments.length; i++) {
    assert.deepEqual(forward[i].pixels, reverse[i].pixels);
    assert.deepEqual(forward[i].parts, reverse[i].parts);
  }
  const stationary = a.frameAt(10, { time: 0, action: "idle" });
  const walking = a.frameAt(10, { time: 3, action: "move" });
  assert.ok(stationary.parts.some(part => part.role === "material-growth"));
  assert.ok(walking.parts.some(part => part.role === "material-growth"));
  assert.deepEqual(
    stationary.parts.filter(p => p.role === "material-growth").map(p => p.sourcePartIds),
    walking.parts.filter(p => p.role === "material-growth").map(p => p.sourcePartIds),
    "locomotion changes visible pose, not ancestry");
  assert.notDeepEqual(stationary.pixels, walking.pixels, "retains interactive pose");
  const mechanics=(walking.interaction.diagnostics as {locomotionSupported:boolean});
  assert.equal(walking.capabilities.canMove,mechanics.locomotionSupported,
    "unattached source marks cannot acquire fictional travel from a convenient label");
});


test("[integration-care] canonical recorded feeding changes physical material in actual playable frames, causally and reproducibly", () => {
  const seed = "CARE-GEOMETRY-527";
  const start = 12 * HOUR;
  const source = draw([
    ".........", "...###...", "..#####..", ".#######.",
    "..#####..", "...###...",
  ]);
  function tend(s: GameState, hour: number, interval: number): GameState {
    s = advanceGame(s, start + hour * HOUR);
    assert.equal(s.dead, false, "Care test pet died during recorded history");
    if (s.attention.discipline)
      s = commandGame(s, { type: "discipline" }, start + hour * HOUR,
        "discipline-" + hour);
    if (hour % 8 === 0)
      s = commandGame(s, { type: "clean" }, start + hour * HOUR,
        "clean-" + hour);
    if (hour % interval === 0 && !s.sleeping && s.meters.hunger < 4)
      s = commandGame(s, { type: "feed", food: "meal" }, start + hour * HOUR,
        "feed-" + hour);
    if (s.health.sickness)
      s = commandGame(s, { type: "medicine" }, start + hour * HOUR,
        "medicine-" + hour);
    return s;
  }
  const build = (interval: number, end = 100) => {
    let s = createGame(seed, "infant", start);
    for (let hour = 1; hour <= end; hour++) s = tend(s, hour, interval);
    return s;
  };
  const fedGame = build(1), deprivedGame = build(8);
  const useGame = (game: GameState) => createSimulation(source, seed, "infant", {
    careGame: game,
    needTimeline: deriveCareTimeline(game),
    liveContext: deriveDevelopmentContext(game),
  });
  const fed = useGame(fedGame);
  const deprived = useGame(deprivedGame);
  const age = 100 / 24;
  const frameA = fed.frameAt(age, { action: "idle", time: 0 });
  const frameB = deprived.frameAt(age, { action: "idle", time: 0 });
  const materialCoords = (frame: typeof frameA) =>
    frame.parts.filter(p => p.role === "material-growth")
      .flatMap(p => p.pixels.map(c => c.x + "," + c.y)).sort();
  assert.ok(materialCoords(frameA).length > 0,
    "Authentic generated material must survive final raster and camera");
  assert.notDeepEqual(materialCoords(frameA), materialCoords(frameB),
    "Feeding counterfactuals must reach final visible, source-derived material");
  const coords = (frame: typeof frameA) =>
    [...new Set(frame.pixels.map(p => p.x + "," + p.y))].sort();
  assert.notDeepEqual(coords(frameA), coords(frameB),
    "Care must affect final on-screen silhouette, not just material diagnostics");
  assert.deepEqual(fed.genome, deprived.genome);
  assert.equal(fed.program.materialProgramFingerprint,
    deprived.program.materialProgramFingerprint);
  for (const frame of [frameA, frameB]) {
    assert.equal((frame.evolution?.diagnostics?.biologicalComposition as
      { chronologicalExposureConnected: boolean }).chronologicalExposureConnected, true);
    assert.ok(frame.parts.filter(p => p.role === "material-growth")
      .every(p => p.provenance === "grown" && p.sourcePartIds?.length));
  }
  // Recorded future events cannot influence pre-event rendered material.
  const fedEarlierGame = build(1, 30);
  const early = useGame(fedEarlierGame);
  assert.deepEqual(materialCoords(early.frameAt(30/24)),
    materialCoords(fed.frameAt(30/24)));
  const fresh = useGame(JSON.parse(JSON.stringify(fedGame)) as GameState);
  assert.deepEqual(coords(fresh.frameAt(age)), coords(frameA));
  assert.deepEqual(materialCoords(fresh.frameAt(age)), materialCoords(frameA));
  const app = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");
  assert.match(app, /careGame:\s*life\.game/);
});
