import assert from "node:assert/strict";
import test from "node:test";
import {
  APPEARANCE_NEED_IDS,
  createNeedsSimulation,
  DEFAULT_FULFILLMENT,
  DEVELOPMENT_PROFILES_VERSION,
  NEED_IDS,
  MAX_NEED_TICK,
  REGIONAL_NEED_PROFILES,
  type NeedKeyframe,
} from "../src/needs";

const close = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`);
const event = (
  needId: NeedKeyframe["needId"],
  tick: number,
  fulfillment: number,
): NeedKeyframe => ({ needId, tick, fulfillment });

test("each modeled need retains an independent driver rather than a maximum-collapsed signal", () => {
  const baseline = createNeedsSimulation("drivers").stateAt(14);
  assert.deepEqual(Object.keys(baseline.needDrivers), APPEARANCE_NEED_IDS);
  for (const needId of APPEARANCE_NEED_IDS) {
    const state = createNeedsSimulation("drivers", [
      event(needId, 0, 0),
    ]).stateAt(14);
    const driver = state.needDrivers[needId];
    assert.equal(driver.fulfillment, 0);
    assert.ok(driver.load > 0.8);
    assert.ok(driver.memory > 0.7);
    assert.equal(driver.acuteDeficit, 1);
    assert.equal(driver.opportunity, 0);
    for (const other of APPEARANCE_NEED_IDS)
      if (other !== needId)
        assert.deepEqual(state.needDrivers[other], baseline.needDrivers[other]);
    close(driver.shortTerm, state.needs[needId].shortTerm);
    close(driver.memory, state.needs[needId].memory);
    close(driver.exposure, state.needs[needId].exposure);
  }
});

test("day-zero raw conditions are available without inventing pre-birth adaptation", () => {
  const simulation = createNeedsSimulation("birth-drivers", [
    event("safety", 0, 0),
  ]);
  const atBirth = simulation.stateAt(0).needDrivers.safety;
  assert.equal(atBirth.acuteDeficit, 1);
  assert.equal(atBirth.fulfillment, 0);
  assert.equal(atBirth.shortTerm, DEFAULT_FULFILLMENT);
  assert.equal(atBirth.memory, 0);
  assert.equal(atBirth.load, 0);
  const afterSixHours = simulation.stateAt(0.25).needDrivers.safety;
  close(afterSixHours.shortage, 0.5);
  assert.ok(afterSixHours.load > 0);
  assert.ok(afterSixHours.load < simulation.stateAt(7).needDrivers.safety.load);
});

test("well-tended fulfillment supplies positive independent opportunity", () => {
  for (const needId of APPEARANCE_NEED_IDS) {
    const driver = createNeedsSimulation("tended", [
      event(needId, 0, 1),
    ]).stateAt(1).needDrivers[needId];
    close(driver.opportunity, 0.9375);
    assert.equal(driver.shortage, 0);
    assert.equal(driver.load, 0);
    assert.equal(driver.memory, 0);
    assert.equal(driver.acuteDeficit, 0);
  }
});

test("pre-event hourly boundaries are exact after arbitrary seeks, including tick zero", () => {
  const simulation = createNeedsSimulation("pre-event", [
    event("safety", 0, 0),
    event("safety", 6, 1),
    event("rest", 24, 0),
  ]);
  assert.equal(simulation.stateBeforeTick(0).needs.safety.fulfillment, 0.75);
  assert.equal(simulation.stateAt(0).needs.safety.fulfillment, 0);
  const before = simulation.stateBeforeTick(6),
    at = simulation.stateAt(6 / 24);
  assert.equal(before.needs.safety.fulfillment, 0);
  assert.equal(at.needs.safety.fulfillment, 1);
  close(before.needs.safety.shortTerm, at.needs.safety.shortTerm);
  close(before.needs.safety.memory, at.needs.safety.memory);
  assert.equal(simulation.stateBeforeTick(24).needs.rest.fulfillment, 0.75);
  assert.equal(simulation.stateAt(1).needs.rest.fulfillment, 0);
  simulation.stateAt(240);
  simulation.stateAt(0);
  simulation.stateAt(137.5);
  assert.deepEqual(simulation.stateBeforeTick(6), before);
  const future = createNeedsSimulation("future", [event("trust", 37, 0)]);
  const neutral = createNeedsSimulation("future");
  assert.deepEqual(future.stateBeforeTick(37), neutral.stateBeforeTick(37));
  assert.deepEqual(future.stateAt(36.5 / 24), neutral.stateAt(36.5 / 24));
  assert.equal(future.stateAt(37 / 24).needDrivers.trust.acuteDeficit, 1);
  for (const tick of [-1, 1.5, NaN, Infinity, MAX_NEED_TICK + 1])
    assert.throws(() => simulation.stateBeforeTick(tick), /integer from 0 to/);
});

test("recovery retains independent history and softens continuous adaptation over weeks", () => {
  const recovering = createNeedsSimulation("recovery", [
    event("safety", 0, 0),
    event("safety", 30 * 24, 1),
  ]);
  const alwaysTended = createNeedsSimulation("recovery", [
    event("safety", 0, 1),
  ]);
  const early = recovering.stateAt(31).needDrivers.safety;
  const late = recovering.stateAt(60).needDrivers.safety;
  assert.equal(
    early.fulfillment,
    alwaysTended.stateAt(31).needDrivers.safety.fulfillment,
  );
  assert.ok(early.memory > alwaysTended.stateAt(31).needDrivers.safety.memory);
  assert.ok(early.load > late.load && late.load > 0);
  assert.ok(early.exposure > 0);
  close(early.exposure, late.exposure);
  assert.deepEqual(
    recovering.stateAt(60).needDrivers.rest,
    alwaysTended.stateAt(60).needDrivers.rest,
  );
});

test("the other 61 needs remain structurally unmodeled without disappearing from wellbeing", () => {
  const baseline = createNeedsSimulation("unmodeled-drivers").stateAt(3);
  const unmodeled = NEED_IDS.filter(
    (id) => !(APPEARANCE_NEED_IDS as readonly string[]).includes(id),
  );
  assert.equal(unmodeled.length, 61);
  for (const needId of unmodeled) {
    const state = createNeedsSimulation("unmodeled-drivers", [
      event(needId, 0, 0),
    ]).stateAt(3);
    assert.equal(state.needs[needId].fulfillment, 0);
    assert.deepEqual(state.needDrivers, baseline.needDrivers);
    assert.ok(state.feelings.length > 0);
  }
});

test("regional profiles declare separate fictional mechanisms and immutable functional costs", () => {
  assert.equal(DEVELOPMENT_PROFILES_VERSION, "regional-need-profiles-v1");
  assert.deepEqual(Object.keys(REGIONAL_NEED_PROFILES), APPEARANCE_NEED_IDS);
  assert.equal(
    new Set(
      Object.values(REGIONAL_NEED_PROFILES).map((profile) => profile.mediator),
    ).size,
    6,
  );
  for (const profile of Object.values(REGIONAL_NEED_PROFILES)) {
    assert.equal(profile.fictional, true);
    assert.ok(
      profile.purpose.length > 0 &&
        profile.shortageResponse.length > 0 &&
        profile.tendedResponse.length > 0,
    );
    assert.ok(profile.functionalCosts.length >= 1);
    assert.ok(
      Object.values(profile.regions).every(
        (weight) => weight > 0 && weight <= 1,
      ),
    );
    assert.ok(
      Object.isFrozen(profile) &&
        Object.isFrozen(profile.regions) &&
        Object.isFrozen(profile.functionalCosts),
    );
  }
  const a = createNeedsSimulation("gene-a", [event("safety", 0, 0)]).stateAt(
    10,
  );
  const b = createNeedsSimulation("gene-b", [event("safety", 0, 0)]).stateAt(
    10,
  );
  assert.deepEqual(
    a.needDrivers,
    b.needDrivers,
    "needs conditions do not reroll with inherited genetics",
  );
  assert.ok(
    Object.isFrozen(a.needDrivers) && Object.isFrozen(a.needDrivers.safety),
  );
  assert.throws(() => {
    (a.needDrivers.safety as { load: number }).load = 0;
  });
});
