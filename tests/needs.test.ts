import assert from "node:assert/strict";
import test from "node:test";
import {
  APPEARANCE_NEED_IDS,
  commitNeedTimeline,
  createNeedsSimulation,
  createNeedTimelineHistory,
  DEFAULT_FULFILLMENT,
  feelingNeedEdges,
  feelingRuleFallbacks,
  feelingsById,
  MAX_NEED_TICK,
  NEED_IDS,
  needValueAt,
  normalizeNeedTimeline,
  redoNeedTimeline,
  removeNeedKeyframe,
  setNeedKeyframe,
  undoNeedTimeline,
  type NeedId,
  type NeedKeyframe,
} from "../src/needs";

const close = (actual: number, expected: number, epsilon = 1e-10) =>
  assert.ok(Math.abs(actual - expected) < epsilon, actual + " != " + expected);
const event = (
  needId: NeedId,
  tick: number,
  fulfillment: number,
): NeedKeyframe => ({ needId, tick, fulfillment });

test("hourly values are exact steps, including integer-hour/24 floating arithmetic", () => {
  const hours = [1, 5, 7, 31, 1001, 1025, 2047, 4093, 5759];
  const timeline = [
    ...hours.map((tick, i) => event("rest", tick, i % 2 ? 0.9 : 0.1)),
    event("safety", 5760, 0),
  ];
  const simulation = createNeedsSimulation("hour", timeline);
  assert.equal(
    simulation.stateAt(0).needs.rest.fulfillment,
    DEFAULT_FULFILLMENT,
  );
  for (const [i, tick] of hours.entries()) {
    const before = simulation.stateAt((tick - 0.000001) / 24);
    const at = simulation.stateAt(tick / 24);
    assert.equal(before.tick, tick - 1);
    assert.equal(at.tick, tick);
    assert.equal(at.needs.rest.fulfillment, i % 2 ? 0.9 : 0.1);
  }
  assert.equal(simulation.stateAt(240).needs.safety.fulfillment, 0);
  assert.equal(simulation.stateAt(240).tick, 240 * 24);
  assert.equal(simulation.stateAt(300).developmentalAge, 300);
  assert.equal(MAX_NEED_TICK, Number.MAX_SAFE_INTEGER);
});

test("timeline editing preserves future events, validates input, and restores undo/redo exactly", () => {
  const initial = [
    event("rest", 100, 1),
    event("safety", 24, 0.1),
    event("rest", 0, 0.5),
  ];
  assert.equal(needValueAt(initial, "rest", 99), 0.5);
  assert.equal(needValueAt(initial, "rest", 100), 1);
  assert.equal(needValueAt(initial, "trust", 100), 0.75);
  const edited = setNeedKeyframe(initial, event("rest", 24, 0.3));
  assert.equal(edited.find((frame) => frame.tick === 100)?.fulfillment, 1);
  assert.deepEqual(initial, [
    event("rest", 100, 1),
    event("safety", 24, 0.1),
    event("rest", 0, 0.5),
  ]);
  assert.equal(
    needValueAt(removeNeedKeyframe(edited, "rest", 24), "rest", 99),
    0.5,
  );
  assert.deepEqual(
    normalizeNeedTimeline([event("rest", 0, 0.1), event("rest", 0, 0.2)]),
    [event("rest", 0, 0.2)],
  );
  let history = createNeedTimelineHistory(initial);
  history = commitNeedTimeline(history, edited);
  history = commitNeedTimeline(history, removeNeedKeyframe(edited, "rest", 0));
  assert.deepEqual(
    undoNeedTimeline(undoNeedTimeline(history)).present,
    normalizeNeedTimeline(initial),
  );
  assert.deepEqual(
    redoNeedTimeline(undoNeedTimeline(history)).present,
    history.present,
  );
  const branch = commitNeedTimeline(undoNeedTimeline(history), [
    event("trust", 0, 0),
  ]);
  assert.deepEqual(branch.future, []);
  assert.throws(() => setNeedKeyframe([], event("rest", 0.5, 0)), /whole hour/);
  assert.throws(
    () => setNeedKeyframe([], event("rest", 0, NaN)),
    /number from/,
  );
  assert.throws(
    () => normalizeNeedTimeline([{ needId: "food", tick: 0, fulfillment: 0 }]),
    /unknown need/,
  );
});

test("fast fulfillment, cumulative exposure, and persistent memory use separate time scales", () => {
  const simulation = createNeedsSimulation("timescales", [
    event("safety", 0, 0),
    event("safety", 14 * 24, 1),
  ]);
  const acute = simulation.stateAt(0),
    day7 = simulation.stateAt(7),
    day14 = simulation.stateAt(14),
    recovered = simulation.stateAt(21);
  assert.equal(acute.needs.safety.fulfillment, 0);
  assert.equal(acute.needs.safety.shortTerm, 0.75);
  assert.equal(acute.needs.safety.memory, 0);
  assert.equal(acute.development.vigilance, 0.7);
  close(day7.needs.safety.exposure, 7);
  close(day7.needs.safety.memory, 0.5);
  assert.ok(day7.needs.safety.shortTerm < 0.000001);
  assert.equal(day14.needs.safety.fulfillment, 1);
  close(day14.needs.safety.memory, 0.75);
  close(recovered.needs.safety.memory, 0.375);
  close(recovered.needs.safety.exposure, 14);
  assert.ok(recovered.needs.safety.shortTerm > 0.9999);
  assert.ok(recovered.development.protection < day14.development.protection);
  assert.ok(recovered.development.protection > 0);
});

test("only six modeled needs affect appearance channels and each retains an independent response", () => {
  const baseline = createNeedsSimulation("causal", []).stateAt(30);
  for (const needId of APPEARANCE_NEED_IDS) {
    const stressed = createNeedsSimulation("causal", [
      event(needId, 0, 0),
    ]).stateAt(30);
    assert.notDeepEqual(stressed.development, baseline.development, needId);
    for (const value of Object.values(stressed.development))
      assert.ok(value >= 0 && value <= 1);
  }
  for (const needId of NEED_IDS.filter(
    (id) => !(APPEARANCE_NEED_IDS as readonly string[]).includes(id),
  )) {
    const stressed = createNeedsSimulation("causal", [
      event(needId, 0, 0),
    ]).stateAt(30);
    assert.deepEqual(stressed.development, baseline.development, needId);
  }
});

test("every canonical need can emit an appropriate unmet clue beside positive feelings", () => {
  const baseline = createNeedsSimulation("clues", []).stateAt(3);
  assert.ok(
    baseline.feelings.every((feeling) => feeling.satisfaction === "met"),
  );
  for (const needId of NEED_IDS) {
    const state = createNeedsSimulation("clues", [event(needId, 0, 0)]).stateAt(
      3,
    );
    const unmet = state.feelings.filter(
      (feeling) => feeling.satisfaction === "unmet",
    );
    assert.ok(unmet.length, needId);
    assert.ok(
      unmet.some(
        (feeling) =>
          feelingNeedEdges.some(
            (edge) => edge.feelingId === feeling.id && edge.needId === needId,
          ) ||
          feelingRuleFallbacks.some(
            (rule) =>
              rule.needId === needId &&
              (rule.feelingIds as readonly string[]).includes(feeling.id),
          ),
      ),
      needId,
    );
    assert.ok(
      state.feelings.some((feeling) => feeling.satisfaction === "met"),
      needId,
    );
    assert.ok(state.feelings.every((feeling) => feelingsById.has(feeling.id)));
  }
  const acute = createNeedsSimulation("clues", [event("safety", 0, 0)]).stateAt(
    0,
  );
  assert.ok(
    acute.feelings.some(
      (feeling) => feeling.satisfaction === "unmet" && feeling.intensity >= 0.9,
    ),
  );
});

test("care seek order, bounded daily cache eviction, and future edits preserve exact past replay", () => {
  const timeline = [
    event("safety", 0, 0.2),
    event("rest", 31 * 24, 0),
    event("safety", 60 * 24, 1),
    event("rest", 80 * 24, 1),
  ];
  const simulation = createNeedsSimulation("replay", timeline);
  const reference = simulation.stateAt(75.125);
  for (const age of [240, 0, 239.75, 1.25, 120, 75.125, 200, 4])
    simulation.stateAt(age);
  assert.deepEqual(simulation.stateAt(75.125), reference);
  assert.deepEqual(
    createNeedsSimulation("replay", timeline).stateAt(75.125),
    reference,
  );
  const future = setNeedKeyframe(timeline, event("security", 200 * 24, 0));
  assert.deepEqual(
    createNeedsSimulation("replay", future).stateAt(75.125),
    reference,
  );
  const changed = setNeedKeyframe(timeline, event("rest", 40 * 24, 0.4));
  assert.notDeepEqual(
    createNeedsSimulation("replay", changed).stateAt(75.125),
    reference,
  );
  assert.deepEqual(
    createNeedsSimulation(
      "replay",
      undoNeedTimeline(
        commitNeedTimeline(createNeedTimelineHistory(timeline), changed),
      ).present,
    ).stateAt(75.125),
    reference,
  );
});

test("captured input and returned states cannot mutate later simulation results", () => {
  const timeline = [event("safety", 0, 0)];
  const simulation = createNeedsSimulation("immutable", timeline);
  const first = simulation.stateAt(10);
  timeline[0].fulfillment = 1;
  timeline.push(event("trust", 0, 0));
  assert.throws(() => {
    first.needs.safety.fulfillment = 1;
  }, TypeError);
  assert.throws(() => {
    first.feelings[0].title = "not a feeling";
  }, TypeError);
  assert.throws(() => {
    first.development.protection = 0;
  }, TypeError);
  assert.deepEqual(simulation.stateAt(10), first);
});

test("seed style is deterministic and no locale-dependent comparison participates in replay", () => {
  const original = String.prototype.localeCompare;
  String.prototype.localeCompare = () => {
    throw new Error("locale-dependent");
  };
  try {
    const a = createNeedsSimulation("seed-a", [event("safety", 0, 0)]).stateAt(
      25,
    );
    const b = createNeedsSimulation("seed-b", [event("safety", 0, 0)]).stateAt(
      25,
    );
    assert.deepEqual(a.needs, b.needs);
    assert.deepEqual(a.development, b.development);
    assert.notDeepEqual(a.feelings, b.feelings);
    assert.deepEqual(
      createNeedsSimulation("seed-a", [event("safety", 0, 0)]).stateAt(25),
      a,
    );
  } finally {
    String.prototype.localeCompare = original;
  }
});
