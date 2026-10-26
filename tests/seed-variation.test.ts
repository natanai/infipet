import assert from "node:assert/strict";
import test from "node:test";
import {
  silhouetteDifference,
  preserveDevelopmentalAge,
  findSeedVariation,
} from "../src/seed-variation";
import { createSimulation, createStarterAnatomy } from "../src/simulation";
import type { NeedKeyframe } from "../src/needs";

test("silhouette comparison ignores recoloring and duplicate painted cells", () => {
  const a = [{ x: 1, y: 2, color: "#fff" }];
  assert.equal(silhouetteDifference(a, [{ ...a[0], color: "#000" }, a[0]]), 0);
  assert.equal(silhouetteDifference(a, [{ x: 2, y: 2, color: "#fff" }]), 1);
  assert.equal(silhouetteDifference([], []), 0);
});

test("seed changes preserve developmental age or incubation fraction", () => {
  assert.equal(
    preserveDevelopmentalAge(82, { hatchAt: 7 }, { hatchAt: 9, maxAge: 249 }),
    84,
  );
  assert.equal(
    preserveDevelopmentalAge(3.5, { hatchAt: 7 }, { hatchAt: 9, maxAge: 249 }),
    4.5,
  );
  assert.equal(
    preserveDevelopmentalAge(75, { hatchAt: 0 }, { hatchAt: 0, maxAge: 240 }),
    75,
  );
});

test("bounded reroll searches real grown silhouettes under unchanged need conditions", async () => {
  const parts = createStarterAnatomy("biped");
  const needTimeline: NeedKeyframe[] = [
    { needId: "safety", tick: 0, fulfillment: 0.1 },
  ];
  const build = (seed: string) =>
    createSimulation(parts, seed, "infant", { needTimeline });
  const current = build("seed-variation-original");
  let index = 0;
  const result = await findSeedVariation({
    current,
    build,
    nextSeed: () => `seed-variation-${index++}`,
  });
  assert.equal(result.different, true);
  assert.ok(result.difference >= 0.05);
  assert.ok(result.attempts <= 16);
  assert.deepEqual(
    build(result.seed).frameAt(0).pixels,
    current.frameAt(0).pixels,
  );
  assert.equal(build(result.seed).stateAt(75).needs.safety.fulfillment, 0.1);
});

test("empty artwork reports the bounded comparison limit honestly", async () => {
  let calls = 0;
  const result = await findSeedVariation({
    current: createSimulation([], "empty"),
    build: (seed) => createSimulation([], seed),
    nextSeed: () => `empty-${calls++}`,
  });
  assert.equal(calls, 16);
  assert.equal(result.different, false);
  assert.equal(result.difference, 0);
  assert.notEqual(result.seed, "empty");
});
