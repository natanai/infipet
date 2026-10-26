import test from "node:test";
import assert from "node:assert/strict";
import { clonePreset } from "../src/presets";
import { compileSources } from "../src/simulation/material";
import { describeSource } from "../src/simulation/source-atlas";
import { compileGenome, type InheritedGenome } from "../src/simulation/genome";
import { createNeedsSimulation } from "../src/needs";
import {
  compileRegionalLayout,
  regionalLayoutAt,
  type RegionalCareSignals,
} from "../src/simulation/regional-layout";

const NEEDS = [
  "safety",
  "security",
  "trust",
  "rest",
  "relaxation",
  "physical-fitness",
] as const;
function fixture(
  seed = "life-v7-genome-01",
  preference?: InheritedGenome["protectionPreference"],
) {
  const atlas = describeSource(compileSources(clonePreset("canine-cub"), 1));
  const genome = compileGenome(seed);
  return compileRegionalLayout(
    atlas,
    preference ? { ...genome, protectionPreference: preference } : genome,
  );
}
const full = (
  id: (typeof NEEDS)[number],
  positive = false,
): RegionalCareSignals => ({
  [id]: { load: positive ? 0 : 1, opportunity: positive ? 1 : 0 },
});
function currentAt(
  simulation: ReturnType<typeof createNeedsSimulation>,
  age: number,
): RegionalCareSignals {
  const drivers = simulation.stateAt(age).needDrivers;
  return Object.fromEntries(
    NEEDS.map((id) => [
      id,
      { load: drivers[id].shortage, opportunity: drivers[id].opportunity },
    ]),
  );
}
function tissue(layout: ReturnType<typeof regionalLayoutAt>) {
  return layout.domains.map((d) => ({
    radius: d.radius,
    massShare: d.massShare,
  }));
}
function pose(layout: ReturnType<typeof regionalLayoutAt>) {
  return layout.domains.map((d) => ({ center: d.center, angle: d.angle }));
}

test("six-hour posture signals do not grow instant tissue or alter genetic operation clocks", () => {
  for (let seed = 1; seed <= 4; seed++) {
    const program = fixture(`life-v7-genome-0${seed}`),
      base = regionalLayoutAt(program, 150);
    const profiles = new Set<string>();
    for (const id of NEEDS) {
      const changed = regionalLayoutAt(program, 150, {}, full(id));
      assert.deepEqual(
        tissue(changed),
        tissue(base),
        `${id} created instantaneous tissue`,
      );
      assert.notDeepEqual(
        pose(changed),
        pose(base),
        `${id} has no fast postural response`,
      );
      assert.equal(changed.axisConfiguration, base.axisConfiguration);
      assert.equal(changed.functionalStrategy, base.functionalStrategy);
      assert.deepEqual(
        [changed.axisProgress, changed.massProgress, changed.contourProgress],
        [base.axisProgress, base.massProgress, base.contourProgress],
      );
      assert.equal(changed.domains.length, base.domains.length);
      profiles.add(JSON.stringify(pose(changed)));
    }
    assert.equal(
      profiles.size,
      6,
      "need responses collapsed to one generic posture",
    );
  }
});

test("Safety selects compatible inherited defenses while Security measurably braces regional roots", () => {
  const responses = new Set<string>();
  for (const preference of [
    "curl",
    "enclose",
    "withdraw",
    "reinforce",
  ] as const) {
    const program = fixture(undefined, preference),
      base = regionalLayoutAt(program, 150);
    const guarded = regionalLayoutAt(program, 150, {}, full("safety"));
    assert.notDeepEqual(pose(guarded), pose(base));
    assert.deepEqual(tissue(guarded), tissue(base));
    responses.add(JSON.stringify(pose(guarded)));
  }
  assert.equal(responses.size, 4);
  const program = fixture(),
    base = regionalLayoutAt(program, 150),
    braced = regionalLayoutAt(program, 150, {}, full("security"));
  const axis = program.source!.frame.axis;
  const span = (x: typeof base) =>
    Math.abs(
      (x.domains[2].center.x - x.domains[0].center.x) * axis.x +
        (x.domains[2].center.y - x.domains[0].center.y) * axis.y,
    );
  assert(
    span(braced) - span(base) >
      (program.source!.frame.max - program.source!.frame.min + 1) * 0.2,
  );
});

test("Trust changes anterior exposure in opposite directions and Relaxation changes relative curvature", () => {
  const program = fixture(),
    base = regionalLayoutAt(program, 150),
    source = program.source!;
  const front = source.frontAtHighU ? 2 : 0,
    sign = source.frontAtHighU ? 1 : -1;
  const openness = (x: typeof base) =>
    sign *
    ((x.domains[front].center.x - base.domains[front].center.x) *
      source.frame.axis.x +
      (x.domains[front].center.y - base.domains[front].center.y) *
        source.frame.axis.y);
  assert(
    openness(regionalLayoutAt(program, 150, {}, full("trust", true))) >
      source.size * 0.25,
  );
  assert(
    openness(regionalLayoutAt(program, 150, {}, full("trust"))) <
      -source.size * 0.25,
  );
  const tense = regionalLayoutAt(program, 150, {}, full("relaxation"));
  const turns = tense.domains.map((d, i) => d.angle - base.domains[i].angle);
  assert(turns[0] * turns[2] < 0);
  assert(Math.abs(turns[0]) > 0.2 && Math.abs(turns[2]) > 0.2);
  assert.deepEqual(tissue(tense), tissue(base));
});

test("slow Rest repairs cross-sections while Fitness prioritizes existing load-bearing masses", () => {
  const program = fixture(),
    base = regionalLayoutAt(program, 150);
  const rested = regionalLayoutAt(program, 150, full("rest", true));
  const fit = regionalLayoutAt(program, 150, full("physical-fitness", true));
  const tired = regionalLayoutAt(program, 150, full("rest"));
  const gains = (x: typeof base) =>
    x.domains.map((d, i) => d.massShare / base.domains[i].massShare);
  const restGain = gains(rested),
    fitnessGain = gains(fit);
  assert(restGain[1] > (restGain[0] + restGain[2]) / 2);
  assert(
    fitnessGain[0] - fitnessGain[1] > 0.2 &&
      fitnessGain[2] - fitnessGain[1] > 0.2,
  );
  assert(rested.domains[1].radius.y / base.domains[1].radius.y > 1.2);
  assert(rested.domains[1].radius.x / base.domains[1].radius.x < 1.1);
  assert(tired.domains[1].radius.y / base.domains[1].radius.y < 0.8);
  assert.deepEqual(pose(rested), pose(base));
  assert.deepEqual(pose(fit), pose(base));
});

test("one-sided positive profiles stay neutral and zero signals preserve source geometry exactly", () => {
  const program = fixture();
  const zero = Object.fromEntries(
    NEEDS.map((id) => [id, { load: 0, opportunity: 0 }]),
  );
  for (const age of [
    0, 0.25, 1, 7, 14, 21, 30, 37.5, 60, 75, 90, 120, 150, 240,
  ]) {
    assert.deepEqual(
      regionalLayoutAt(program, age, zero, zero),
      regionalLayoutAt(program, age),
    );
    for (const id of ["safety", "security", "relaxation"] as const)
      assert.deepEqual(
        regionalLayoutAt(program, age, full(id, true), full(id, true)),
        regionalLayoutAt(program, age),
      );
  }
  const all = Object.fromEntries(
    NEEDS.map((id) => [id, { load: 1, opportunity: 1 }]),
  );
  assert.deepEqual(
    regionalLayoutAt(program, 0, all, all).domains,
    regionalLayoutAt(program, 0).domains,
  );
});

test("actual six-hour fulfillment filters preserve intervention boundaries and allow fast elder guarding", () => {
  const program = fixture(undefined, "withdraw");
  const needs = createNeedsSimulation("care-causality", [
    { needId: "safety", tick: 150 * 24, fulfillment: 0 },
  ]);
  const neutral = createNeedsSimulation("care-causality", []);
  const read = (age: number) =>
    regionalLayoutAt(
      program,
      age,
      needs.morphologyAt(age),
      currentAt(needs, age),
    );
  for (const age of [0, 149, 150])
    assert.deepEqual(
      read(age),
      regionalLayoutAt(
        program,
        age,
        neutral.morphologyAt(age),
        currentAt(neutral, age),
      ),
    );
  const boundary = read(150),
    afterSixHours = read(150.25);
  assert.notDeepEqual(pose(afterSixHours), pose(boundary));
  const movement = Math.max(
    ...afterSixHours.domains.map((d, i) =>
      Math.hypot(
        d.center.x - boundary.domains[i].center.x,
        d.center.y - boundary.domains[i].center.y,
      ),
    ),
  );
  assert(movement > program.source!.size * 0.1);
  const tissueChange = Math.max(
    ...afterSixHours.domains.map((d, i) =>
      Math.abs(d.radius.y / boundary.domains[i].radius.y - 1),
    ),
  );
  assert(
    tissueChange < 0.01,
    "fast guarding must not instantly grow protective bulk",
  );
});

test("quick postural recovery leaves chronic tissue memory that softens over weeks", () => {
  const program = fixture();
  const needs = createNeedsSimulation("retained-tissue", [
    { needId: "safety", tick: 0, fulfillment: 0 },
    { needId: "safety", tick: 75 * 24, fulfillment: 1 },
  ]);
  const response = (age: number) =>
    regionalLayoutAt(
      program,
      age,
      needs.morphologyAt(age),
      currentAt(needs, age),
    );
  const factor = (age: number) =>
    response(age).domains[0].radius.y /
      regionalLayoutAt(program, age).domains[0].radius.y -
    1;
  assert(factor(82) > 0.005);
  assert(factor(180) < factor(82));
  assert((currentAt(needs, 82).safety?.load ?? 1) < 1e-6);
  assert.deepEqual(pose(response(82)), pose(regionalLayoutAt(program, 82)));
});

test("moderate care retains inherited regional mass priorities and severe combinations remain bounded", () => {
  const moderate = Object.fromEntries(
    NEEDS.map((id) => [id, { load: 1 / 3, opportunity: 0 }]),
  );
  const severe = Object.fromEntries(
    NEEDS.map((id) => [id, { load: 1, opportunity: 0 }]),
  );
  const tended = Object.fromEntries(
    NEEDS.map((id) => [id, { load: 0, opportunity: 1 }]),
  );
  const dominant = (x: ReturnType<typeof regionalLayoutAt>) =>
    [...x.domains].sort((a, b) => b.massShare - a.massShare)[0].id;
  for (let seed = 1; seed <= 16; seed++) {
    const program = fixture(`life-v7-genome-${String(seed).padStart(2, "0")}`);
    for (const age of [30, 75, 120, 150]) {
      const base = regionalLayoutAt(program, age);
      const cared = regionalLayoutAt(program, age, moderate, moderate);
      assert.equal(dominant(cared), dominant(base));
      assert.equal(cared.axisConfiguration, base.axisConfiguration);
      assert.equal(cared.functionalStrategy, base.functionalStrategy);
      for (const signals of [severe, tended]) {
        const x = regionalLayoutAt(program, age, signals, signals);
        for (let i = 0; i < x.domains.length; i++)
          for (const axis of ["x", "y"] as const) {
            const relative =
              x.domains[i].radius[axis] / base.domains[i].radius[axis];
            assert(relative >= 0.65 - 1e-12 && relative <= 1.55 + 1e-12);
          }
      }
    }
  }
});

test("inherited sensitivity scales each applied response once while raw signals and neutral anatomy stay fixed", () => {
  const atlas = describeSource(compileSources(clonePreset("canine-cub"), 1));
  const inherited = compileGenome("fixed-raw-inputs");
  const low = compileRegionalLayout(atlas, { ...inherited, sensitivity: 0.7 });
  const high = compileRegionalLayout(atlas, { ...inherited, sensitivity: 1.3 });
  assert(low.careSensitivity < high.careSensitivity);
  assert.deepEqual(low.genes, high.genes);
  assert.deepEqual(low.stages, high.stages);
  for (const age of [0, 0.25, 1, 7, 14, 21, 30, 37.5, 75, 90, 120, 150, 240])
    assert.deepEqual(regionalLayoutAt(low, age), regionalLayoutAt(high, age));
  const vector = (layout: ReturnType<typeof regionalLayoutAt>) =>
    layout.domains.flatMap((d) => [
      d.center.x,
      d.center.y,
      d.radius.x,
      d.radius.y,
      d.angle,
    ]);
  const base = vector(regionalLayoutAt(low, 150)),
    expectedRatio = high.careSensitivity / low.careSensitivity;
  for (const id of NEEDS) {
    const signals = Object.freeze({
      [id]: Object.freeze({ load: 0.35, opportunity: 0.15 }),
    });
    const before = JSON.stringify(signals);
    const a = vector(regionalLayoutAt(low, 150, signals, signals));
    const b = vector(regionalLayoutAt(high, 150, signals, signals));
    let compared = 0;
    for (let i = 0; i < a.length; i++)
      if (Math.abs(a[i] - base[i]) > 1e-8) {
        const ratio = (b[i] - base[i]) / (a[i] - base[i]);
        assert(
          Math.abs(ratio - expectedRatio) < 1e-8,
          `${id}: sensitivity was missing or applied more than once`,
        );
        compared++;
      }
    assert(compared > 0, `${id}: no applied response to fixed nonzero signals`);
    assert.equal(JSON.stringify(signals), before);
  }
});
