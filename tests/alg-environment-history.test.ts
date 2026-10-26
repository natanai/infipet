import test from "node:test";
import assert from "node:assert/strict";
import {
  HOUR, advanceGame, commandGame, createGame, validateGameState,
  type GameState,
} from "../src/gameplay";
import { createEnvironmentalHistory } from "../src/environment";

const BIRTH = 12 * HOUR;
const save = (s: GameState): GameState =>
  validateGameState(JSON.parse(JSON.stringify(s)));

function livedLife(wellFed: boolean): GameState {
  let s = createGame("CARE-REPLAY-SEED", "infant", BIRTH);
  for (let hour = 1; hour <= 6; hour++) {
    s = advanceGame(s, BIRTH + hour * HOUR);
    if (wellFed)
      s = commandGame(s, { type: "feed", food: "meal" },
        BIRTH + hour * HOUR, "meal-" + hour);
  }
  return s;
}

test("[CARE-001/A1] exact chronological reconstruction preserves command order and accepted status", () => {
  let s = createGame("CARE-ORDER", "infant", BIRTH);
  s = advanceGame(s, BIRTH + HOUR);
  s = commandGame(s, { type: "feed", food: "meal" }, BIRTH + HOUR, "meal");
  s = commandGame(s, { type: "feed", food: "protein" }, BIRTH + HOUR, "protein");
  s = commandGame(s, { type: "clean" }, BIRTH + HOUR, "clean");
  const history = createEnvironmentalHistory(s);
  assert.deepEqual(history.eventsThrough(1).map(e => e.id),
    ["meal", "protein", "clean"]);
  assert.ok(history.eventsThrough(1).every(e => e.accepted));
  assert.equal(history.eventsThrough(0.99).length, 0);
  assert.equal(history.atHour(1).provenance.latestCareSampleHour, 1);
  assert.equal(history.atHour(1).physiology.nutrition, 1);
  assert.equal(history.atHour(1).provenance.nutrition, "sampled-hunger");
  assert.equal(history.atHour(1).cumulative.trainingSessions, 0,
    "feeding and cleaning are not fictitious exercise");
  assert.throws(() => history.atHour(1.001), RangeError);
  assert.throws(() => history.atHour(-0.1), RangeError);
});

test("[CARE-001/A2] saved, reconstructed and out-of-order historical queries are bit-identical", () => {
  const original = livedLife(true);
  const beforeSave = createEnvironmentalHistory(original);
  const afterSave = createEnvironmentalHistory(save(original));
  for (const hour of [6, 0, 4.5, 0.25, 3, 6, 1, 4.5]) {
    assert.deepEqual(beforeSave.atHour(hour), afterSave.atHour(hour));
    assert.deepEqual(beforeSave.atHour(hour), beforeSave.atHour(hour));
    assert.deepEqual(beforeSave.eventsThrough(hour), afterSave.eventsThrough(hour));
  }
  assert.deepEqual(beforeSave.samples, afterSave.samples);
  assert.deepEqual(beforeSave.commands, afterSave.commands);
});

test("[CARE-001/A1] no command or later care sample affects an earlier age", () => {
  const initial = createGame("CARE-CAUSAL", "infant", BIRTH);
  const earlier = advanceGame(initial, BIRTH + HOUR / 2);
  const before = createEnvironmentalHistory(earlier).atHour(0.5);
  let later = commandGame(earlier, { type: "feed", food: "protein" },
    BIRTH + HOUR, "protein-at-hour-one");
  later = commandGame(later, { type: "start-game", game: "training" },
    BIRTH + 2 * HOUR, "training-at-hour-two");
  later = advanceGame(later, BIRTH + 3 * HOUR);
  const future = createEnvironmentalHistory(later);
  assert.deepEqual(future.atHour(0.5), before);
  assert.equal(future.eventsThrough(0.5).length, 0);
  assert.equal(future.atHour(0.5).cumulative.trainingSessions, 0);
  assert.equal(future.atHour(2).cumulative.trainingSessions, 1);
});

test("[CARE-001/A1] observed deprivation accumulates without treating attempts as meals", () => {
  const fed = createEnvironmentalHistory(livedLife(true));
  const missed = createEnvironmentalHistory(livedLife(false));
  assert.ok(missed.atHour(6).cumulative.nutritionDeficitDays >
    fed.atHour(6).cumulative.nutritionDeficitDays);
  assert.ok(missed.atHour(6).exposure.nutrition <
    fed.atHour(6).exposure.nutrition);
  assert.equal(missed.atHour(0).cumulative.nutritionDeficitDays, 0);
  assert.ok(missed.atHour(6).cumulative.restDeficitDays >= 0);
  assert.equal(missed.atHour(6).cumulative.trainingSessions, 0);
});

test("[CARE-001/A2] old saves without optional nutrition retain neutral unknown provenance", () => {
  const old = JSON.parse(JSON.stringify(livedLife(true))) as GameState;
  for (const sample of old.careSamples) delete sample.nutrition;
  const reconstructed = createEnvironmentalHistory(validateGameState(old));
  assert.equal(reconstructed.atHour(6).provenance.nutrition, "legacy-unsampled");
  assert.equal(reconstructed.atHour(6).physiology.nutrition, 0.75);
  assert.equal(reconstructed.atHour(6).cumulative.nutritionDeficitDays, 0);
});

test("[CARE-001/A2] a created history is an immutable snapshot independent of future game writes", () => {
  const birth = createGame("CARE-SNAPSHOT", "infant", BIRTH);
  const first = createEnvironmentalHistory(birth);
  const before = first.atHour(0);
  let continued = commandGame(birth, { type: "start-game", game: "training" },
    BIRTH + HOUR / 4, "training");
  continued = commandGame(continued, { type: "cancel" },
    BIRTH + HOUR / 4, "cancel");
  assert.deepEqual(first.atHour(0), before);
  assert.equal(first.commands.length, 0);
  assert.equal(createEnvironmentalHistory(continued).atHour(0.25).cumulative.trainingSessions, 1);
});
