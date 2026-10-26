import test from "node:test";
import assert from "node:assert/strict";
import { comparableInputs } from "../tools/audit/compare";
import { withSeedInterval, pairInterval } from "../tools/audit/analysis";
import type { Manifest } from "../tools/audit/types";

const baseline = { metricVersion: "one", protocolVersion: "one", seeds: ["a", "b"], ages: [0, 75], render: { action: "idle", time: 0 }, histories: [{ id: "neutral", timeline: [] }], presets: [{ id: "cat", sourceHash: "frozen" }] } as unknown as Manifest;
test("progress permits engine changes while requiring identical frozen sources, care, and metric definitions", () => {
  assert.ok(comparableInputs(baseline, { ...baseline, engineHash: "new-engine" }));
  for (const altered of [{ metricVersion: "two" }, { protocolVersion: "two" }, { seeds: ["b", "a"] }, { ages: [0, 120] }, { render: { action: "idle", time: 1 } }, { histories: [{ id: "neutral", timeline: [{ needId: "safety", tick: 0, fulfillment: 0 }] }] }, { presets: [{ id: "cat", sourceHash: "changed" }] }]) assert.equal(comparableInputs(baseline, { ...baseline, ...altered } as Manifest), false);
});
test("weighted seed bootstrap does not manufacture collisions from repeated draws", () => {
  assert.deepEqual(pairInterval(Array(6).fill(true), 4).ci95, [100, 100]);
  assert.deepEqual(pairInterval(Array(6).fill(false), 4).ci95, [0, 0]);
});
test("whole-seed intervals are deterministic and keep zero denominators unmeasured", () => {
  assert.deepEqual(withSeedInterval([true, false, true, false]), withSeedInterval([true, false, true, false]));
  assert.deepEqual(withSeedInterval([]), { numerator: 0, denominator: 0, percent: null });
  assert.deepEqual(withSeedInterval([false, false]).ci95, [0, 0]);
  assert.deepEqual(withSeedInterval([true, true]).ci95, [100, 100]);
});
