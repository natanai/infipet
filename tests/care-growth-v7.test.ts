import assert from "node:assert/strict";
import test from "node:test";
import {
  APPEARANCE_NEED_IDS,
  type ModeledNeedId,
  type NeedKeyframe,
} from "../src/needs";
import { clonePreset } from "../src/presets";
import {
  createSimulation,
  type PetFrame,
  type PetSimulation,
} from "../src/simulation";

// Fixed sequential raw genomes: no reroll filtering or replacement after measurement.
const SEEDS = Array.from(
  { length: 4 },
  (_, index) => `care-v7-probe-${index + 1}`,
);
const SOURCE = clonePreset("canine-cub");
const neutralCache = new Map<string, PetSimulation>();
const neutral = (seed: string) => {
  let simulation = neutralCache.get(seed);
  if (!simulation) {
    simulation = createSimulation(SOURCE, seed);
    neutralCache.set(seed, simulation);
  }
  return simulation;
};
const event = (
  needId: ModeledNeedId,
  day: number,
  fulfillment: number,
): NeedKeyframe => ({ needId, tick: Math.round(day * 24), fulfillment });
const withCare = (seed: string, timeline: NeedKeyframe[]) =>
  createSimulation(SOURCE, seed, "infant", { needTimeline: timeline });
type Signals = Record<ModeledNeedId, { load: number; opportunity: number }>;
function signals(simulation: PetSimulation, day: number): Signals {
  const result = simulation.developmentAt(day).diagnostics?.needSignals;
  assert.ok(
    result && typeof result === "object",
    "development exposes independently replayed need mediators",
  );
  return result as Signals;
}
function centeredSilhouette(frame: PetFrame): Set<string> {
  assert.ok(frame.pixels.length > 0);
  const xs = frame.pixels.map((pixel) => pixel.x),
    ys = frame.pixels.map((pixel) => pixel.y);
  const cx = Math.floor((Math.min(...xs) + Math.max(...xs)) / 2);
  const cy = Math.floor((Math.min(...ys) + Math.max(...ys)) / 2);
  return new Set(
    frame.pixels.map((pixel) => `${pixel.x - cx},${pixel.y - cy}`),
  );
}
function shapeDifference(a: PetFrame, b: PetFrame): number {
  const aa = centeredSilhouette(a),
    bb = centeredSilhouette(b);
  const union = new Set([...aa, ...bb]);
  let changed = 0;
  for (const key of union) if (aa.has(key) !== bb.has(key)) changed++;
  return changed / union.size;
}

for (const needId of APPEARANCE_NEED_IDS) {
  for (const onset of [0, 17, 89, 143]) {
    test(`v7 ${needId} alone affects at least 3/4 Cub genomes within14 days after day${onset}`, () => {
      const observed: { seed: string; distance: number }[] = [];
      for (const seed of SEEDS) {
        const baseline = neutral(seed),
          changed = withCare(seed, [event(needId, onset, 0)]);
        assert.deepEqual(
          changed.genome,
          baseline.genome,
          "care conditions never reroll inherited genetics",
        );
        assert.deepEqual(
          changed.program,
          baseline.program,
          "care decisions are derived, not written into genetic potential",
        );
        assert.deepEqual(
          changed.frameAt(onset).pixels,
          baseline.frameAt(onset).pixels,
          "a new dial value cannot instantaneously remold tissue",
        );
        assert.equal(changed.stateAt(onset).needs[needId].fulfillment, 0);
        if (onset > 0) {
          const before = onset - 0.5 / 24;
          assert.deepEqual(
            changed.frameAt(before),
            baseline.frameAt(before),
            "the future event cannot leak into pre-event interpolation",
          );
        }
        const beforeSignal = signals(changed, onset)[needId].load;
        const afterSixHours = signals(changed, onset + 0.25)[needId].load;
        assert.ok(
          afterSixHours > beforeSignal,
          "continuous replay responds within the interval, not only at an operation decision",
        );
        const currentSignals = signals(changed, onset + 14);
        assert.ok(currentSignals[needId].load > afterSixHours);
        for (const other of APPEARANCE_NEED_IDS)
          if (other !== needId)
            assert.deepEqual(
              currentSignals[other],
              signals(baseline, onset + 14)[other],
              "one shortage does not replace every need with a shared maximum",
            );
        const distance = shapeDifference(
          changed.frameAt(onset + 14),
          baseline.frameAt(onset + 14),
        );
        observed.push({ seed, distance });
        if (onset > 120)
          assert.deepEqual(
            changed.developmentAt(onset + 14).commitments,
            baseline.developmentAt(onset + 14).commitments,
            "late remodeling cannot rewrite completed early choices",
          );
      }
      const responders = observed.filter((value) => value.distance >= 0.01);
      assert.ok(
        responders.length >= 3,
        `${needId}, onset${onset}: expected≥3/4 with≥1% centered binary silhouette change by14days; ${JSON.stringify(observed)}`,
      );
    });
  }
}

test("v7 day-zero conditions remain observable without altering the infant artwork", () => {
  for (const needId of APPEARANCE_NEED_IDS) {
    const baseline = neutral(SEEDS[0]),
      changed = withCare(SEEDS[0], [event(needId, 0, 0)]);
    assert.deepEqual(changed.frameAt(0).pixels, baseline.frameAt(0).pixels);
    assert.equal(changed.stateAt(0).needDrivers[needId].acuteDeficit, 1);
    assert.equal(changed.stateAt(0).needDrivers[needId].load, 0);
    assert.ok(signals(changed, 1)[needId].load > 0);
  }
});

test("v7 equal current fulfillment retains distinct history and recovery softens its mediator", () => {
  for (const needId of APPEARANCE_NEED_IDS) {
    const seed = SEEDS[0];
    const recovering = withCare(seed, [
      event(needId, 0, 0),
      event(needId, 30, 1),
    ]);
    const alwaysTended = withCare(seed, [event(needId, 0, 1)]);
    assert.equal(
      recovering.stateAt(31).needs[needId].fulfillment,
      alwaysTended.stateAt(31).needs[needId].fulfillment,
    );
    assert.ok(
      signals(recovering, 31)[needId].load >
        signals(alwaysTended, 31)[needId].load,
    );
    assert.notDeepEqual(
      recovering.frameAt(31).pixels,
      alwaysTended.frameAt(31).pixels,
    );
    const first = signals(recovering, 31)[needId].load;
    const middle = signals(recovering, 75)[needId].load;
    const late = signals(recovering, 120)[needId].load;
    assert.ok(
      first > middle && middle > late,
      `${needId} acquired response softens over weeks`,
    );
    const commitments = recovering.developmentAt(120).commitments;
    assert.deepEqual(
      recovering.developmentAt(240).commitments,
      commitments,
      "recovery does not retroactively change committed choices",
    );
  }
});

test("v7 late-life recovery is continuous and continues after the final milestone", () => {
  const seed = SEEDS[1],
    needId = "safety";
  const simulation = withCare(seed, [
    event(needId, 143, 0),
    event(needId, 157, 0.75),
  ]);
  const shortage = signals(simulation, 157)[needId].load;
  const weekLater = signals(simulation, 164)[needId].load;
  const recovered = signals(simulation, 220)[needId].load;
  assert.ok(shortage > 0 && recovered < weekLater && recovered > 0);
  assert.equal(simulation.stateAt(164).needs.safety.fulfillment, 0.75);
  assert.equal(simulation.frameAt(240).stage, "elderly");
  assert.ok(simulation.frameAt(240).capabilities.canMove);
});

test("v7 oscillating care and hourly interventions replay identically through cache eviction", () => {
  const timeline = [
    ...[10, 17, 24, 31, 38, 45].map((day, index) =>
      event("safety", day, index % 2 ? 1 : 0),
    ),
    event("rest", 18 + 7 / 24, 0),
    event("rest", 42 + 11 / 24, 1),
    event("trust", 143 + 1 / 24, 0),
    event("trust", 171 + 5 / 24, 1),
  ];
  const seed = SEEDS[2],
    simulation = withCare(seed, timeline),
    repeated = withCare(seed, timeline);
  const expected = simulation.frameAt(87.125, { time: 0.375, action: "move" });
  const evolution = simulation.developmentAt(87.125);
  for (const day of [
    240, 0, 31, 17, 157, 30, 90, 10, 75, 120, 145, 62, 28, 11, 99, 140, 171,
    200, 20, 46,
  ])
    simulation.frameAt(day, { time: 0.625, action: "greet" });
  assert.deepEqual(
    simulation.frameAt(87.125, { time: 0.375, action: "move" }),
    expected,
  );
  assert.deepEqual(simulation.developmentAt(87.125), evolution);
  assert.deepEqual(
    repeated.frameAt(87.125, { time: 0.375, action: "move" }),
    expected,
  );
  assert.deepEqual(simulation.genome, neutral(seed).genome);
  const future = withCare(seed, [
    ...timeline,
    event("physical-fitness", 220, 0),
  ]);
  assert.deepEqual(
    future.frameAt(87.125, { time: 0.375, action: "move" }),
    expected,
  );
});
