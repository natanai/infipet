import assert from "node:assert/strict";
import test from "node:test";
import {
  APPEARANCE_NEED_IDS,
  createNeedsSimulation,
  DEFAULT_PREVIEW_DAYS,
  MAX_NEED_TICK,
  MAX_SIMULATION_DAYS,
  normalizeNeedTimeline,
  type ModeledNeedId,
  type NeedKeyframe,
} from "../src/needs";

const close = (a: number, b: number) =>
  assert.ok(Math.abs(a - b) < 1e-10, `${a} != ${b}`);
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const deficit = (value: number) => clamp(1 - value / 0.75);
function hourlyReference(age: number, events: NeedKeyframe[]) {
  const raw = APPEARANCE_NEED_IDS.map(() => 0.75),
    fast = [...raw];
  const memory = raw.map(() => 0),
    exposure = raw.map(() => 0);
  const load = raw.map(() => 0),
    opportunity = raw.map(() => 0);
  const apply = (tick: number) =>
    events
      .filter((event) => event.tick === tick)
      .forEach((event) => {
        const i = APPEARANCE_NEED_IDS.indexOf(event.needId as ModeledNeedId);
        if (i >= 0) raw[i] = event.fulfillment;
      });
  const advance = (tick: number, fraction = 1) => {
    const t = clamp((tick / 24 - 100) / 60),
      elder = t * t * (3 - 2 * t);
    for (let i = 0; i < 6; i++) {
      const halfLife = [4, 9, 7, 2, 3, 8][i] * (1 + elder * 1.8);
      const weight = 1 - Math.exp((-Math.LN2 * fraction) / (halfLife * 24));
      load[i] +=
        (0.55 * deficit(fast[i]) + 0.45 * memory[i] - load[i]) * weight;
      opportunity[i] +=
        (clamp((fast[i] - 0.75) / 0.25) - opportunity[i]) * weight;
      fast[i] +=
        (raw[i] - fast[i]) * (1 - Math.exp((-Math.LN2 * fraction) / 6));
      memory[i] +=
        (deficit(raw[i]) - memory[i]) *
        (1 - Math.exp((-Math.LN2 * fraction) / (7 * 24)));
      exposure[i] += (deficit(raw[i]) * fraction) / 24;
    }
  };
  apply(0);
  const target = Math.floor(age * 24 + 1e-9);
  for (let tick = 0; tick < target; tick++) {
    advance(tick);
    apply(tick + 1);
  }
  const fraction = age * 24 - target;
  if (fraction > 0) advance(target, fraction);
  return { raw, fast, memory, exposure, load, opportunity };
}

test("240 days is a preview window while needs and keyframes continue indefinitely", () => {
  assert.equal(DEFAULT_PREVIEW_DAYS, 240);
  assert.equal(MAX_NEED_TICK, Number.MAX_SAFE_INTEGER);
  const events: NeedKeyframe[] = [
    { needId: "safety", tick: 365 * 24, fulfillment: 0 },
    { needId: "safety", tick: 3650 * 24, fulfillment: 1 },
    { needId: "rest", tick: 1_000_000 * 24, fulfillment: 0 },
  ];
  assert.deepEqual(normalizeNeedTimeline(events), events);
  const simulation = createNeedsSimulation("long-life", events);
  for (const day of [365, 3650, 1_000_000]) {
    assert.equal(simulation.stateAt(day).developmentalAge, day);
    assert.equal(simulation.stateAt(day).tick, day * 24);
  }
  assert.equal(simulation.stateAt(365 - 1 / 24).needs.safety.fulfillment, 0.75);
  assert.equal(simulation.stateAt(365).needs.safety.fulfillment, 0);
  assert.equal(
    simulation.stateBeforeTick(3650 * 24).needs.safety.fulfillment,
    0,
  );
  assert.equal(simulation.stateAt(3650).needs.safety.fulfillment, 1);
  assert.equal(simulation.stateAt(1_000_000).needs.rest.fulfillment, 0);
  for (const age of [NaN, Infinity, -Infinity, -1])
    assert.equal(simulation.stateAt(age).developmentalAge, 0);
});

test("analytical needs and morphology preserve the former hourly replay through day240", () => {
  const events: NeedKeyframe[] = APPEARANCE_NEED_IDS.flatMap((needId, i) => [
    { needId, tick: i * 7, fulfillment: i % 2 ? 1 : 0 },
    { needId, tick: 31 * 24 + i, fulfillment: i % 2 ? 0.1 : 0.95 },
    { needId, tick: 121 * 24 + i * 3, fulfillment: 0.75 },
  ]);
  const simulation = createNeedsSimulation("hourly-equivalence", events);
  for (const age of [0, 0.125, 0.5, 7, 30, 31.5, 75, 120, 143.125, 240]) {
    const reference = hourlyReference(age, events),
      state = simulation.stateAt(age),
      morphology = simulation.morphologyAt(age);
    APPEARANCE_NEED_IDS.forEach((id, i) => {
      close(state.needs[id].fulfillment, reference.raw[i]);
      close(state.needs[id].shortTerm, reference.fast[i]);
      close(state.needs[id].memory, reference.memory[i]);
      close(state.needs[id].exposure, reference.exposure[i]);
      close(morphology[id].load, reference.load[i]);
      close(morphology[id].opportunity, reference.opportunity[i]);
    });
  }
});

test("post240 analytical filter convolution handles both directions across neutral fulfillment", () => {
  const events: NeedKeyframe[] = APPEARANCE_NEED_IDS.flatMap((needId, i) => [
    { needId, tick: 0, fulfillment: i % 2 ? 1 : 0 },
    { needId, tick: 250 * 24, fulfillment: i % 2 ? 0 : 1 },
    { needId, tick: 300 * 24, fulfillment: 0.75 },
  ]);
  const simulation = createNeedsSimulation("crossing", events);
  for (const age of [240, 250.125, 250.5, 251, 280, 365, 3650]) {
    const reference = hourlyReference(age, events),
      actual = simulation.morphologyAt(age);
    APPEARANCE_NEED_IDS.forEach((id, i) => {
      close(actual[id].load, reference.load[i]);
      close(actual[id].opportunity, reference.opportunity[i]);
    });
  }
});

test("million-day seeks have bounded caches and never iterate millions of hourly ticks", () => {
  const events: NeedKeyframe[] = [
    { needId: "safety", tick: 365 * 24, fulfillment: 0 },
    { needId: "safety", tick: 3650 * 24, fulfillment: 0.75 },
  ];
  const simulation = createNeedsSimulation("bounded-long", events);
  const expected = simulation.morphologyAt(1_000_000),
    state = simulation.stateAt(1_000_000);
  assert.equal(state.tick, 24_000_000);
  close(state.needs.safety.exposure, 3650 - 365);
  assert.ok(simulation.getReplayStats().morphologyHourlySteps <= 240 * 24);
  for (let i = 1; i <= 100; i++) {
    simulation.stateAt(i * 10000);
    simulation.morphologyAt(i * 10000);
  }
  assert.ok(simulation.getReplayStats().wellbeingCheckpoints <= 32);
  assert.ok(simulation.getReplayStats().morphologyCheckpoints <= 32);
  assert.ok(simulation.getReplayStats().morphologyHourlySteps <= 240 * 24);
  simulation.morphologyAt(0);
  simulation.stateBeforeTick(3650 * 24);
  assert.deepEqual(simulation.morphologyAt(1_000_000), expected);
  assert.deepEqual(simulation.stateAt(1_000_000), state);
  const future = createNeedsSimulation("bounded-long", [
    ...events,
    { needId: "rest", tick: 2_000_000 * 24, fulfillment: 0 },
  ]);
  assert.deepEqual(future.morphologyAt(1_000_000), expected);
  assert.deepEqual(future.stateAt(1_000_000), state);
});

test("the numeric safe-hour boundary remains legal and pre-event exact", () => {
  const simulation = createNeedsSimulation("numeric-boundary", [
    { needId: "trust", tick: MAX_NEED_TICK, fulfillment: 0 },
  ]);
  assert.equal(
    simulation.stateBeforeTick(MAX_NEED_TICK).needs.trust.fulfillment,
    0.75,
  );
  assert.equal(simulation.stateAt(MAX_SIMULATION_DAYS).tick, MAX_NEED_TICK);
  assert.equal(
    simulation.stateAt(MAX_SIMULATION_DAYS).needs.trust.fulfillment,
    0,
  );
  const morphology = simulation.morphologyAt(MAX_SIMULATION_DAYS);
  for (const signal of Object.values(morphology))
    assert.ok(
      Number.isFinite(signal.load) && Number.isFinite(signal.opportunity),
    );
  assert.throws(
    () =>
      normalizeNeedTimeline([
        { needId: "trust", tick: MAX_NEED_TICK + 1, fulfillment: 0 },
      ]),
    /safe whole hour/,
  );
});
