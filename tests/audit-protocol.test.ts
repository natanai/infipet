import assert from "node:assert/strict";
import test from "node:test";
import {
  AGES,
  HISTORIES,
  MODELED_NEEDS,
  REVIEW_AGES,
  REVIEW_SEEDS,
  SEEDS,
  SMALL_REVIEW_SEEDS,
  scheduledHistoryIds,
  smallHistoryIds,
} from "../tools/audit/protocol";
import {
  BOUNDARY_AGES,
  CONTROL_AGES,
  MOTION_ACTIONS,
  MOTION_AGES,
  MOTION_PHASES,
  UNMODELED_NEEDS,
} from "../tools/audit/supplemental";
import { HOUSEHOLD_PRESETS, clonePreset } from "../tools/audit/frozen-sources";
import { PRESET_EXPECTATIONS } from "../tools/audit/preset-expectations";
import { NEED_IDS, normalizeNeedTimeline } from "../src/needs";
import { createSimulation } from "../src/simulation";
import { frameHash } from "../tools/audit/metrics";

test("household protocol fixes raw seeds, histories, ages, and separate cohort counts", () => {
  assert.equal(SEEDS.length, 128);
  assert.equal(new Set(SEEDS).size, 128);
  assert.equal(HISTORIES.length, 28);
  assert.equal(new Set(HISTORIES.map((history) => history.id)).size, 28);
  assert.deepEqual(AGES, [0, 7, 15, 30, 75, 90, 120, 180, 240]);
  for (const history of HISTORIES)
    assert.deepEqual(history.timeline, normalizeNeedTimeline(history.timeline));
  assert.equal(
    HOUSEHOLD_PRESETS.length * SEEDS.length * HISTORIES.length,
    35_840,
  );
  assert.equal(
    HOUSEHOLD_PRESETS.length * SEEDS.length * HISTORIES.length * AGES.length,
    322_560,
  );
  assert.deepEqual(SMALL_REVIEW_SEEDS, [0, 32, 64, 96]);
  assert.equal(UNMODELED_NEEDS.length, 61);
  assert.equal(UNMODELED_NEEDS.length + MODELED_NEEDS.length, NEED_IDS.length);
  assert.equal(
    10 * 4 * UNMODELED_NEEDS.length * 2 * CONTROL_AGES.length,
    14_640,
  );
  assert.equal(
    10 *
      4 *
      2 *
      MOTION_AGES.length *
      MOTION_ACTIONS.length *
      MOTION_PHASES.length,
    7_680,
  );
  assert.equal(10 * SEEDS.length * 7 * BOUNDARY_AGES.length, 26_880);
});

test("visual schedule counts unique frames rather than double-counting neutral adult overlap", () => {
  const selected = new Set<string>();
  for (const preset of HOUSEHOLD_PRESETS) {
    for (let seed = 0; seed < SEEDS.length; seed++)
      selected.add(`${preset.id}/${seed}/neutral/75`);
    for (const seed of REVIEW_SEEDS)
      for (const history of scheduledHistoryIds)
        for (const age of REVIEW_AGES)
          selected.add(`${preset.id}/${seed}/${history}/${age}`);
    for (const seed of SMALL_REVIEW_SEEDS)
      for (const history of smallHistoryIds)
        for (const age of REVIEW_AGES)
          selected.add(`${preset.id}/${seed}/${history}/${age}`);
  }
  assert.equal(selected.size, 4_600);
});

test("source audit expectations are independently declared and supported by authored labels", () => {
  for (const preset of HOUSEHOLD_PRESETS) {
    const expected = PRESET_EXPECTATIONS[preset.id];
    assert.ok(expected.cues.length >= 3 && expected.cues.length <= 5);
    assert.ok(expected.limitations.length > 0);
    assert.deepEqual(
      Object.keys(expected.hosts).sort(),
      preset.parts.map((part) => part.id).sort(),
    );
  }
  const fish = clonePreset("goldfish");
  assert.equal(fish.filter((part) => part.kind === "wing").length, 0);
  assert.equal(
    clonePreset("turtle").filter((part) => part.kind === "egg").length,
    0,
  );
  assert.equal(
    clonePreset("corn-snake").filter((part) => part.kind === "leg").length,
    0,
  );
});

test("a future intervention cannot change earlier geometry, wellbeing, or inherited genetics", () => {
  const parts = clonePreset("cat"),
    seed = SEEDS[0];
  const history = [
    { needId: "safety" as const, tick: 0, fulfillment: 0 },
    { needId: "safety" as const, tick: 1800, fulfillment: 1 },
  ];
  const full = createSimulation(parts, seed, "infant", {
    needTimeline: history,
  });
  const early = createSimulation(parts, seed, "infant", {
    needTimeline: history.slice(0, 1),
  });
  const neutral = createSimulation(parts, seed);
  assert.deepEqual(full.genome, early.genome);
  assert.deepEqual(full.genome, neutral.genome);
  full.frameAt(240, { time: 0 });
  for (const age of [75 - 1 / 24, 0, 30, 7]) {
    const a = full.frameAt(age, { time: 0 }),
      b = early.frameAt(age, { time: 0 });
    assert.equal(frameHash(a), frameHash(b));
    assert.deepEqual(a.wellbeing, b.wellbeing);
  }
  assert.equal(full.stateAt(75).needs.safety.fulfillment, 1);
  assert.equal(early.stateAt(75).needs.safety.fulfillment, 0);
  assert.deepEqual(history, [
    { needId: "safety", tick: 0, fulfillment: 0 },
    { needId: "safety", tick: 1800, fulfillment: 1 },
  ]);
});

