import test from "node:test";
import assert from "node:assert/strict";
import { HOUR, advanceGame, commandGame, createGame, validateGameState, type GameState } from "../src/gameplay";
import {
  createCareMaterialDevelopment, createEnvironmentalHistory,
  careMaterialOperatorsAt,
} from "../src/environment";
import { materialSourceAncestry, materialDevelopmentAt } from "../src/development";
import { compileGenome, compileLabGenome, type InheritedGenome } from "../src/simulation/genome";
import { describeSource } from "../src/simulation/source-atlas";
import { compileSources } from "../src/simulation/material";
import { drawing } from "./alg-development-fixtures";

const SEED = "CARE-GEOMETRY-527";
const START = 12 * HOUR;
const atlas = describeSource(compileSources(drawing([
  ".........",
  "...###...",
  "..#####..",
  ".#######.",
  "..#####..",
  "...###...",
]), 0));

/** Identical caretaker policy except feeding frequency; do not interrupt sleep. */
function tend(s: GameState, hour: number, feedingEvery: number): GameState {
  s = advanceGame(s, START + hour * HOUR);
  if (s.dead) return s;
  if (s.attention.discipline)
    s = commandGame(s, { type: "discipline" }, START + hour * HOUR,
      "discipline-" + hour);
  if (hour % 8 === 0)
    s = commandGame(s, { type: "clean" }, START + hour * HOUR, "clean-" + hour);
  if (hour % feedingEvery === 0 && !s.sleeping && s.meters.hunger < 4)
    s = commandGame(s, { type: "feed", food: "meal" },
      START + hour * HOUR, "feed-" + hour);
  if (s.health.sickness)
    s = commandGame(s, { type: "medicine" }, START + hour * HOUR,
      "medicine-" + hour);
  return s;
}
function live(until: number, feedingEvery: number, seed = SEED): GameState {
  let s = createGame(seed, "infant", START);
  for (let hour = 1; hour <= until; hour++) {
    s = tend(s, hour, feedingEvery);
    assert.equal(s.dead, false,
      "Pet died at hour " + hour + " from " + (s.death?.cause ?? "unknown"));
  }
  return s;
}

const geometry = (material: ReturnType<ReturnType<typeof createCareMaterialDevelopment>["materialAt"]>) =>
  material.cells.map(c => c.tissueId + ":" + c.x + "," + c.y).sort();
const sourceIdentity = (material: ReturnType<ReturnType<typeof createCareMaterialDevelopment>["materialAt"]>) =>
  material.sourceCells.map(c => c.id + ":" + c.x + "," + c.y + ":" + c.color).sort();

test("[CARE-001/A1] later feeding cannot modify earlier source-derived material or a completed operation", () => {
  const genome = compileGenome(SEED, "infant");
  const earlier = live(30, 1);
  let later = earlier;
  for (let h = 31; h <= 100; h++) {
    later = tend(later, h, 8);
    assert.equal(later.dead, false,
      "Continued pet died at hour " + h + " from " + (later.death?.cause ?? "unknown"));
  }
  const at30 = createCareMaterialDevelopment(atlas, genome, earlier);
  const at100 = createCareMaterialDevelopment(atlas, genome, later);
  assert.deepEqual(geometry(at30.materialAt(30)), geometry(at100.materialAt(30)));
  assert.deepEqual(at30.materialAt(30), at100.materialAt(30));
  assert.deepEqual(at30.operatorsAt(30), at100.operatorsAt(30));
  const at100Ops = at100.operatorsAt(100);
  const earlyElapsed = at100.operatorsAt(35);
  const elongate = (ops: typeof at100Ops) => ops.filter(op => op.kind === "elongate" && op.atHour + op.durationHours <= 35);
  assert.deepEqual(elongate(earlyElapsed), elongate(at100Ops),
    "Care after an elongation window must not rewrite that already-expressed operator");
  assert.throws(() => at30.materialAt(30.1), RangeError);
});

test("[CARE-001/A2] material frames are identical after save/reload, regardless of query order", () => {
  const genome = compileGenome(SEED, "infant");
  const lived = live(100, 8);
  const restored = validateGameState(JSON.parse(JSON.stringify(lived)));
  const first = createCareMaterialDevelopment(atlas, genome, lived);
  const second = createCareMaterialDevelopment(atlas, genome, restored);
  assert.deepEqual(first.program, second.program);
  for (const hour of [100, 0, 35, 12.5, 70, 35, 100]) {
    assert.deepEqual(first.materialAt(hour), second.materialAt(hour));
    assert.deepEqual(first.operatorsAt(hour), second.operatorsAt(hour));
    assert.deepEqual(first.materialAt(hour), first.materialAt(hour));
  }
  const original = materialDevelopmentAt(first.program, 0);
  assert.deepEqual(first.materialAt(0), original);
  assert.equal(sourceIdentity(first.materialAt(100)).length,
    first.program.source.sourceCells.length);
});

test("[CARE-002/A1] same drawing and ordinary seed: different recorded feeding produces different cells", () => {
  const genome = compileGenome(SEED, "infant");
  const before = JSON.stringify(genome);
  const fed = createCareMaterialDevelopment(atlas, genome, live(100, 1));
  const deprived = createCareMaterialDevelopment(atlas, genome, live(100, 8));
  assert.deepEqual(fed.program, deprived.program,
    "Only lived care changes; birth material and genetic schedule must be identical");
  const well = fed.materialAt(100), stressed = deprived.materialAt(100);
  assert.notDeepEqual(geometry(well), geometry(stressed),
    "Care history must produce genuinely different anatomy coordinates and tissues");
  assert.deepEqual(sourceIdentity(well), sourceIdentity(stressed));
  assert.deepEqual(sourceIdentity(well), sourceIdentity(fed.program.source));
  assert.ok(well.cells.length > well.sourceCells.length);
  assert.ok(well.cells.length > stressed.cells.length,
    "Nutritional deprivation can suppress actual source-directed cell growth");
  assert.ok(well.cells.every(c => materialSourceAncestry(well, c.id).length > 0));
  assert.ok(stressed.cells.every(c => materialSourceAncestry(stressed, c.id).length > 0));
  assert.ok(fed.history.atHour(100).cumulative.nutritionDeficitDays <
    deprived.history.atHour(100).cumulative.nutritionDeficitDays);
  assert.equal(JSON.stringify(genome), before);
});

test("[CARE-002/A2] same recorded care, different genetic sensitivity yields different structural expression", () => {
  const history = live(100, 8);
  const low = compileLabGenome(SEED, "infant", { sensitivity: 0 });
  const high = compileLabGenome(SEED, "infant", { sensitivity: 1 });
  const beforeLow = JSON.stringify(low), beforeHigh = JSON.stringify(high);
  const a = createCareMaterialDevelopment(atlas, low, history);
  const b = createCareMaterialDevelopment(atlas, high, history);
  assert.deepEqual(a.program.source, b.program.source);
  assert.deepEqual(a.program.operators, b.program.operators,
    "Only environmental sensitivity locus differs; no new anatomy is assigned");
  assert.notEqual(a.history.atHour(100).exposure.nutrition, 1);
  assert.notDeepEqual(geometry(a.materialAt(100)), geometry(b.materialAt(100)),
    "Different inherited sensitivity must be observable in anatomy under the same deprivation");
  assert.equal(JSON.stringify(low), beforeLow);
  assert.equal(JSON.stringify(high), beforeHigh);
  assert.throws(() => careMaterialOperatorsAt(a.program,
    createEnvironmentalHistory(history), high.genotype, 100),
    /permanent genome/);
});

test("No invented anatomy for empty artwork and no side effects on original source graph", () => {
  const empty = describeSource(compileSources(drawing([]), 0));
  const genome: InheritedGenome = compileGenome(SEED, "infant");
  const life = live(100, 1);
  const compiled = createCareMaterialDevelopment(empty, genome, life);
  assert.equal(compiled.program.operators.length, 0);
  assert.equal(compiled.materialAt(100).cells.length, 0);
  assert.deepEqual(compiled.materialAt(0), compiled.program.source);
});
