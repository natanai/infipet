import test from "node:test";
import assert from "node:assert/strict";
import {
  CARE_EXPOSURE_LIMITS,
  createCareOperatorChronology,
  createEnvironmentalHistory,
  type EnvironmentalHistory,
  type EnvironmentPressure,
} from "../src/environment";
import { compileMaterialDevelopment, type MaterialDevelopmentProgram } from "../src/development";
import { HOUR, advanceGame, commandGame, createGame, validateGameState, type GameState } from "../src/gameplay";
import { compileGenome } from "../src/simulation/genome";
import { materialInputs, fixtures } from "./alg-development-fixtures";

const BIRTH = 12 * HOUR;
const SEED = "CARE-GEOMETRY-527";
const { atlas, genome } = materialInputs(fixtures.blob, SEED);
const original = compileMaterialDevelopment(atlas, genome);
const near = (actual: number, expected: number, label: string) =>
  assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) < 1e-11,
    label + ": " + actual + " !== " + expected);

/** Reuse genuine inherited operator and source/genetics, not a new anatomy. */
function shortProgram(kind: "elongate" | "reinforce", atHour = 0, durationHours = 4):
  MaterialDevelopmentProgram {
  const existing = original.operators.find(o => o.kind === kind)!;
  assert.ok(existing);
  return {
    ...original, fingerprint: original.fingerprint + "/chronology-" + kind,
    operators: [{ ...existing, atHour, durationHours, strength: 0.8 }],
  };
}

const needs = Object.freeze([0.75, 0.75, 0.75, 0.75, 0.75, 0.75]);
/** Independent analytical schedule, not using the implementation's integral. */
function syntheticHistory(): EnvironmentalHistory {
  const commands: EnvironmentalHistory["commands"] = [
    { id: "at-half", atHour: 0.5, accepted: true,
      command: { type: "start-game", game: "training" } },
    { id: "at-one-half", atHour: 1.5, accepted: false,
      command: { type: "feed", food: "meal" } },
  ];
  const samples: EnvironmentalHistory["samples"] = [
    { hour: 0, nutrition: 1, needs },
    { hour: 1, nutrition: 1, needs },
    { hour: 2, nutrition: 0.5, needs },
  ];
  return {
    version: 1, maxHour: 4, samples, commands,
    eventsThrough: hour => commands.filter(c => c.atHour <= hour),
    atHour: hour => {
      // A fractional care transition at .5, then a sample at whole hour 2.
      const nutrition = hour < 0.5 ? 1 : hour < 1 ? 0 : hour < 2 ? 1 : 0.5;
      return {
        atHour: hour,
        exposure: { nutrition, activity: 0.5, threat: 0 },
        physiology: {
          nutrition, restRecovery: 1, physicalFitness: 0.5,
          resourceSecurity: 0.75, persistentStress: 0,
        },
        cumulative: {
          nutritionDeficitDays: 0, nutritionOpportunityDays: 0,
          nutritionMean: 0.75, restDeficitDays: 0, safetyDeficitDays: 0,
          trainingSessions: hour >= 0.5 ? 1 : 0, battles: 0,
        },
        provenance: {
          nutrition: "sampled-hunger", latestCareSampleHour: Math.floor(hour),
          observedCommands: commands.filter(c => c.atHour <= hour).length,
        },
      } satisfies EnvironmentPressure;
    },
  };
}

test("exact piecewise integral independently matches fractional and integer boundaries", () => {
  const p = shortProgram("elongate");
  const chronology = createCareOperatorChronology(p, syntheticHistory(), genome.genotype);
  const inherited = genome.genotype.channels.sensitivity.nutrition;
  const expectedFromQuarterToTwoHalf = 2.25 - 0.75 * inherited;
  const credit = chronology.interval(0.25, 2.5)[0];
  near(credit.activeHours, 2.25, "scheduled active duration");
  near(credit.expressedHours, expectedFromQuarterToTwoHalf, "independent integral");
  near(credit.strengthHours, 0.8 * expectedFromQuarterToTwoHalf, "strength hours");
  near(credit.progressDelta, 0.2 * expectedFromQuarterToTwoHalf, "normalized progress");
  near(chronology.interval(0, 0.5)[0].expressedHours, 0.5,
    "event at right endpoint excluded from preceding interval");
  near(chronology.interval(0.5, 1)[0].expressedHours, 0.5 * (1 - inherited),
    "event at left endpoint included");
  near(chronology.interval(1, 2)[0].expressedHours, 1,
    "sample at right endpoint excluded");
  near(chronology.interval(2, 3)[0].expressedHours, 1 - 0.5 * inherited,
    "sample at left endpoint included");
  near(chronology.interval(3.75, 4)[0].expressedHours, 0.25 * (1 - 0.5 * inherited),
    "fractional final interval");
  assert.equal(chronology.interval(4, 4)[0].progressDelta, 0);
});

test("cursor advances produce only new credits, serialize, and reject overlapping history", () => {
  const chronology = createCareOperatorChronology(shortProgram("elongate"),
    syntheticHistory(), genome.genotype);
  const first = chronology.advance(chronology.initial(), 1.5);
  const replay = chronology.advance(JSON.parse(JSON.stringify(chronology.initial())), 1.5);
  assert.deepEqual(first, replay);
  const second = chronology.advance(first.next, 3);
  const oneShot = chronology.advance(chronology.initial(), 3);
  near(first.deltas[0].progressDelta + second.deltas[0].progressDelta,
    oneShot.deltas[0].progressDelta, "partition additivity");
  near(second.next.progress[first.deltas[0].operatorId],
    oneShot.next.progress[first.deltas[0].operatorId], "final cumulative marker");
  const noOp = chronology.advance(second.next, 3);
  assert.equal(noOp.deltas[0].progressDelta, 0);
  assert.equal(noOp.deltas[0].expressedHours, 0);
  assert.throws(() => chronology.advance(second.next, 2.9), /previously consumed/);
  assert.throws(() => chronology.advance({
    ...first.next, progress: { ...first.next.progress,
      [first.deltas[0].operatorId]: 0.99 },
  }, 3), /conflicts with historical/);
});

test("care differences alter physical permission without rerolling inherited genotype or chaotic program", () => {
  const seed = SEED;
  let well = createGame(seed, "infant", BIRTH);
  let low = createGame(seed, "infant", BIRTH);
  for (let h = 1; h <= 30; h++) {
    well = advanceGame(well, BIRTH + h * HOUR);
    low = advanceGame(low, BIRTH + h * HOUR);
    for (let i = 0; i < 2; i++) {
      const current = i ? low : well;
      if (current.attention.discipline) {
        if (i) low = commandGame(low, { type: "discipline" },
          BIRTH + h * HOUR, "discipline-" + h);
        else well = commandGame(well, { type: "discipline" },
          BIRTH + h * HOUR, "discipline-" + h);
      }
    }
    if (h % 8 === 0) {
      well = commandGame(well, { type: "clean" }, BIRTH + h * HOUR, "clean-" + h);
      low = commandGame(low, { type: "clean" }, BIRTH + h * HOUR, "clean-" + h);
    }
    if (!well.sleeping && well.meters.hunger < 4)
      well = commandGame(well, { type: "feed", food: "meal" },
        BIRTH + h * HOUR, "feed-" + h);
    if (h % 8 === 0 && !low.sleeping && low.meters.hunger < 4)
      low = commandGame(low, { type: "feed", food: "meal" },
        BIRTH + h * HOUR, "feed-" + h);
    if (well.health.sickness)
      well = commandGame(well, { type: "medicine" }, BIRTH + h * HOUR, "medicine-" + h);
    if (low.health.sickness)
      low = commandGame(low, { type: "medicine" }, BIRTH + h * HOUR, "medicine-" + h);
  }
  assert.equal(well.dead, false);
  assert.equal(low.dead, false);
  const originalGenome = JSON.stringify(genome);
  const originalProgram = JSON.stringify(original);
  const fed = createCareOperatorChronology(original, createEnvironmentalHistory(well),
    genome.genotype);
  const hungry = createCareOperatorChronology(original, createEnvironmentalHistory(low),
    genome.genotype);
  const mainId = original.operators.find(o => o.kind === "elongate")!.id;
  const x = fed.advance(fed.initial(), 30).deltas.find(d => d.operatorId === mainId)!;
  const y = hungry.advance(hungry.initial(), 30).deltas.find(d => d.operatorId === mainId)!;
  assert.ok(x.progressDelta > y.progressDelta,
    "better feeding must permit more anatomical growth credit");
  assert.equal(JSON.stringify(genome), originalGenome);
  assert.equal(JSON.stringify(original), originalProgram);
});

test("fractional command affects only following interval, and unsampled nutrition awaits integer evidence", () => {
  let game = createGame(SEED, "infant", BIRTH);
  const before = advanceGame(game, BIRTH + HOUR / 2);
  game = commandGame(before, { type: "start-game", game: "training" },
    BIRTH + HOUR / 2, "train-half");
  game = commandGame(game, { type: "cancel" }, BIRTH + HOUR / 2, "close-half");
  game = advanceGame(game, BIRTH + HOUR);
  const history = createEnvironmentalHistory(game);
  const noTraining = createEnvironmentalHistory(advanceGame(before, BIRTH + HOUR));
  assert.equal(history.commands[0].atHour, 0.5);
  const p = shortProgram("reinforce", 0, 1);
  const a = createCareOperatorChronology(p, history, genome.genotype);
  const b = createCareOperatorChronology(p, noTraining, genome.genotype);
  near(a.interval(0, 0.5)[0].expressedHours, b.interval(0, 0.5)[0].expressedHours,
    "fractional training did not change earlier interval");
  assert.ok(a.interval(0.5, 1)[0].expressedHours >
    b.interval(0.5, 1)[0].expressedHours,
    "accepted fractional training affects following wall-deposition permission");

  // A processed feed at 1.5 is not proof of eating. The next physiological
  // sample at integer hour 2 records the updated hunger fraction.
  let fed = advanceGame(game, BIRTH + 1.5 * HOUR);
  fed = commandGame(fed, { type: "feed", food: "meal" },
    BIRTH + 1.5 * HOUR, "feed-one-half");
  fed = advanceGame(fed, BIRTH + 2 * HOUR);
  const fedHistory = createEnvironmentalHistory(fed);
  assert.equal(fedHistory.atHour(1.75).physiology.nutrition,
    history.atHour(1).physiology.nutrition,
    "unsampled fractional feeding cannot fabricate a meter reading");
  assert.ok(fedHistory.atHour(2).physiology.nutrition >
    fedHistory.atHour(1.75).physiology.nutrition,
    "the next actual hourly sample controls nutrition");
});

/** Ordinary game caretaker with the same policy before and after reconstruction. */
function maintain(s: GameState, hour: number): GameState {
  s = advanceGame(s, BIRTH + hour * HOUR);
  if (s.attention.discipline)
    s = commandGame(s, { type: "discipline" }, BIRTH + hour * HOUR,
      "usual-discipline-" + hour);
  if (hour % 8 === 0)
    s = commandGame(s, { type: "clean" }, BIRTH + hour * HOUR,
      "usual-clean-" + hour);
  if (!s.sleeping && s.meters.hunger < 4)
    s = commandGame(s, { type: "feed", food: "meal" }, BIRTH + hour * HOUR,
      "usual-feed-" + hour);
  if (s.health.sickness)
    s = commandGame(s, { type: "medicine" }, BIRTH + hour * HOUR,
      "usual-medicine-" + hour);
  assert.equal(s.dead, false, "care fixture died at " + hour);
  return s;
}

test("save/reload and extending history preserve previously consumed credit", () => {
  let early = createGame(SEED, "infant", BIRTH);
  for (let h = 1; h <= 12; h++) early = maintain(early, h);
  assert.equal(early.dead, false);
  const earlyHistory = createEnvironmentalHistory(early);
  const old = createCareOperatorChronology(original, earlyHistory, genome.genotype);
  const checkpoint = old.advance(old.initial(), 12).next;
  let later = validateGameState(JSON.parse(JSON.stringify(early))) as GameState;
  for (let h = 13; h <= 20; h++) later = maintain(later, h);
  const newHistory = createEnvironmentalHistory(later);
  const next = createCareOperatorChronology(original, newHistory, genome.genotype);
  assert.deepEqual(old.interval(10, 12), next.interval(10, 12),
    "future history may not revise consumed earlier interval");
  const continued = next.advance(JSON.parse(JSON.stringify(checkpoint)), 20);
  const oneShot = next.advance(next.initial(), 20);
  for (const [i, op] of continued.deltas.entries()) {
    const earlier = checkpoint.progress[op.operatorId];
    near(op.progressDelta + earlier, oneShot.deltas[i].progressAtEnd,
      "new-only credit plus previously recorded progress");
  }
  const reloaded = createCareOperatorChronology(original,
    createEnvironmentalHistory(validateGameState(JSON.parse(JSON.stringify(later)))),
    genome.genotype);
  assert.deepEqual(next.interval(0, 20), reloaded.interval(0, 20));
  assert.deepEqual(next.advance(next.initial(), 20),
    reloaded.advance(reloaded.initial(), 20));
});

test("invalid and nonfinite histories, programs, queries, and cursors are rejected", () => {
  const p = shortProgram("elongate");
  const history = syntheticHistory();
  const malformed = (overrides: Partial<EnvironmentalHistory>) =>
    createCareOperatorChronology(p, { ...history, ...overrides }, genome.genotype);
  assert.throws(() => malformed({ maxHour: NaN }), /Invalid bounded/);
  assert.throws(() => malformed({ maxHour: CARE_EXPOSURE_LIMITS.maxHours + 1 }), /Invalid bounded/);
  assert.throws(() => malformed({ samples: [
    history.samples[1], history.samples[0],
  ] }), /unordered physiological/);
  assert.throws(() => malformed({ samples: [
    { hour: 0, needs, nutrition: Number.NaN },
  ] }), /physiological sample/);
  assert.throws(() => malformed({ commands: [
    history.commands[1], history.commands[0],
  ] }), /care command/);
  assert.throws(() => malformed({ commands: [
    history.commands[0], { ...history.commands[0] },
  ] }), /care command/);
  assert.throws(() => malformed({ atHour: hour => ({
    ...history.atHour(hour), exposure: {
      ...history.atHour(hour).exposure, nutrition: Number.NaN },
  }) }), /Invalid recorded environmental pressure/);
  assert.throws(() => createCareOperatorChronology(p, history,
    compileGenome("OTHER-SEED").genotype), /permanent genetic/);
  const chron = createCareOperatorChronology(p, history, genome.genotype);
  assert.throws(() => chron.interval(-0.1, 1), RangeError);
  assert.throws(() => chron.interval(0, 4.01), RangeError);
  assert.throws(() => chron.interval(2, 1), RangeError);
  assert.throws(() => chron.interval(0, Number.NaN), RangeError);
  assert.throws(() => chron.advance(chron.initial(), Infinity), RangeError);
  assert.throws(() => createCareOperatorChronology({
    ...p, operators: [{ ...p.operators[0], strength: 1.001 }],
  }, history, genome.genotype), /Invalid permanent material/);
});
