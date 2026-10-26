import test from "node:test";
import assert from "node:assert/strict";
import { createSimulation } from "../src/simulation";
import { clonePreset } from "../src/presets";
import {
  APPEARANCE_NEED_IDS,
  type ModeledNeedId,
  type NeedKeyframe,
} from "../src/needs";
import {
  ADAPTATION_RULES,
  ADAPTATION_RULES_VERSION,
  appliedCareSensitivity,
} from "../src/simulation/adaptation-rules";
import { compileSources } from "../src/simulation/material";
import { describeSource } from "../src/simulation/source-atlas";
import { compileGenome } from "../src/simulation/genome";
import {
  compileDevelopment,
  resolveDevelopment,
} from "../src/simulation/development";
import { createNeedsSimulation } from "../src/needs";

const seeds = Array.from({ length: 4 }, (_, i) => `life-v7-genome-0${i + 1}`);
const source = clonePreset("canine-cub");
const event = (
  needId: ModeledNeedId,
  day: number,
  fulfillment: number,
): NeedKeyframe => ({ needId, tick: day * 24, fulfillment });
const sim = (seed: string, timeline: NeedKeyframe[] = []) =>
  createSimulation(source, seed, "infant", { needTimeline: timeline });
const diagnostics = (s: ReturnType<typeof sim>, age: number) =>
  s.developmentAt(age).diagnostics as any;

test("continuous six-hour expression is distinct from slow tissue and cannot use a raw dial jump", () => {
  for (const seed of seeds)
    for (const id of APPEARANCE_NEED_IDS) {
      const baseline = sim(seed),
        changed = sim(seed, [event(id, 150, 0)]);
      assert.deepEqual(changed.genome, baseline.genome);
      assert.deepEqual(changed.program, baseline.program);
      assert.deepEqual(
        changed.frameAt(150).pixels,
        baseline.frameAt(150).pixels,
      );
      assert.equal(changed.stateAt(150).needs[id].fulfillment, 0);
      const boundary = diagnostics(changed, 150),
        early = diagnostics(changed, 150 + 1e-6),
        sixHours = diagnostics(changed, 150.25);
      assert.equal(boundary.activeNeedSignals[id].load, 0);
      assert.ok(
        early.activeNeedSignals[id].load > 0 &&
          early.activeNeedSignals[id].load < 0.001,
      );
      assert.ok(
        sixHours.activeNeedSignals[id].load > sixHours.needSignals[id].load * 2,
      );
      assert.equal(
        sixHours.activeNeedSignals[id].load,
        changed.stateAt(150.25).needDrivers[id].shortage,
      );
      assert.equal(sixHours.adaptationRulesVersion, ADAPTATION_RULES_VERSION);
      for (const other of APPEARANCE_NEED_IDS)
        if (other !== id)
          assert.deepEqual(
            sixHours.activeNeedSignals[other],
            diagnostics(baseline, 150.25).activeNeedSignals[other],
          );
      const before = changed.frameAt(149.9);
      changed.frameAt(1000);
      assert.deepEqual(changed.frameAt(149.9), before);
    }
});

test("late Rest and Fitness alter actual movement pace within six hours in both directions", () => {
  for (const seed of seeds)
    for (const id of ["rest", "physical-fitness"] as const) {
      const base = sim(seed).frameAt(150.25),
        low = sim(seed, [event(id, 150, 0)]).frameAt(150.25),
        high = sim(seed, [event(id, 150, 1)]).frameAt(150.25);
      assert.ok(low.motionPace < base.motionPace - 0.02);
      assert.ok(high.motionPace > base.motionPace + 0.02);
      assert.ok(low.motionAmplitude < base.motionAmplitude);
    }
});

test("one-sided positive profiles do not manufacture new postures or positive tissue effects", () => {
  for (const seed of seeds)
    for (const id of ["safety", "security", "relaxation"] as const) {
      const baseline = sim(seed),
        tended = sim(seed, [event(id, 150, 1)]);
      assert.equal(ADAPTATION_RULES[id].positiveStructuralResponse, false);
      for (const age of [150, 150.25, 157, 164, 240]) {
        assert.deepEqual(
          tended.frameAt(age).pixels,
          baseline.frameAt(age).pixels,
        );
        assert.equal(
          tended.frameAt(age).motionPace,
          baseline.frameAt(age).motionPace,
        );
        assert.equal(
          diagnostics(tended, age).activeNeedSignals[id].opportunity,
          0,
        );
      }
    }
});

test("Trust exposure and rooted effector reach respond in opposite directions while keeping facial identity", () => {
  for (const seed of seeds) {
    const neutral = sim(seed),
      withdrawn = sim(seed, [event("trust", 150, 0)]),
      opened = sim(seed, [event("trust", 150, 1)]);
    const base = diagnostics(neutral, 164),
      low = diagnostics(withdrawn, 164),
      high = diagnostics(opened, 164);
    const overlap = (d: any) =>
      d.regionalAnatomy.headClearances.find((h: any) => h.sourceId === "head")
        .projectedOverlap;
    assert.ok(overlap(low) > overlap(base));
    assert.ok(overlap(high) < overlap(base));
    assert.ok(
      low.activeRegionResponses.some(
        (r: any) => r.kind === "tail" && r.length < 1,
      ),
    );
    assert.ok(
      high.activeRegionResponses.some(
        (r: any) => r.kind === "tail" && r.length > 1,
      ),
    );
    for (const s of [withdrawn, opened]) {
      const frame = s.frameAt(164);
      assert.ok(frame.parts.find((p) => p.id === "head")!.pixels.length > 0);
      for (const id of ["eye-left", "eye-right", "mouth"])
        assert.ok(frame.parts.find((p) => p.id === id)!.pixels.length > 0);
      assert.notDeepEqual(frame.pixels, neutral.frameAt(164).pixels);
      assert.deepEqual(s.genome, neutral.genome);
    }
  }
});

test("fast recovery does not erase chronic tissue memory and long seeks remain order independent", () => {
  for (const id of ["safety", "rest", "physical-fitness"] as const) {
    const changed = sim(seeds[0], [event(id, 150, 0), event(id, 164, 1)]);
    const after = diagnostics(changed, 171),
      later = diagnostics(changed, 300);
    assert.ok(after.activeNeedSignals[id].load < 1e-5);
    assert.ok(after.needSignals[id].load > 0.02);
    assert.ok(later.needSignals[id].load < after.needSignals[id].load);
    const early = changed.frameAt(150.25);
    changed.frameAt(1_000_000);
    assert.deepEqual(changed.frameAt(150.25), early);
  }
});

test("combined severe expression stays bounded without adding a new face or limbs", () => {
  for (const seed of seeds) {
    const severe = sim(
        seed,
        APPEARANCE_NEED_IDS.map((id) => event(id, 150, 0)),
      ),
      neutral = sim(seed);
    const a = severe.frameAt(164),
      b = neutral.frameAt(164);
    assert.ok(
      a.pixels.every(
        (p) =>
          Number.isInteger(p.x) &&
          Number.isInteger(p.y) &&
          p.x >= 0 &&
          p.y >= 0 &&
          p.x < 64 &&
          p.y < 64,
      ),
    );
    assert.deepEqual(
      a.parts
        .filter((p) => ["eye", "mouth"].includes(p.kind))
        .map((p) => p.id)
        .sort(),
      b.parts
        .filter((p) => ["eye", "mouth"].includes(p.kind))
        .map((p) => p.id)
        .sort(),
    );
    assert.deepEqual(
      severe.developmentAt(164).commitments,
      neutral.developmentAt(164).commitments,
    );
    assert.ok(a.motionPace > 0 && a.motionAmplitude > 0);
  }
});

test("inherited sensitivity scales applied response once without changing clocks, raw needs or branch choices", () => {
  const tissues = compileSources(source, 1),
    atlas = describeSource(tissues),
    genome = compileGenome("sensitivity-contract");
  const low = compileDevelopment(atlas, { ...genome, sensitivity: 0.7 }),
    high = compileDevelopment(atlas, { ...genome, sensitivity: 1.3 });
  assert.equal(appliedCareSensitivity(0.7), 0.85);
  assert.equal(appliedCareSensitivity(1.3), 1.15);
  const neutral = createNeedsSimulation(genome.seed, []);
  const zeroLow = resolveDevelopment(
      low,
      tissues,
      164,
      neutral.stateAt,
      neutral.morphologyAt,
    ),
    zeroHigh = resolveDevelopment(
      high,
      tissues,
      164,
      neutral.stateAt,
      neutral.morphologyAt,
    );
  assert.deepEqual(zeroLow.regions, zeroHigh.regions);
  assert.deepEqual(zeroLow.expression, { paceFactor: 1, motionFactor: 1 });
  assert.deepEqual(zeroHigh.expression, zeroLow.expression);
  assert.deepEqual(low.regionalLayout.genes, high.regionalLayout.genes);
  assert.deepEqual(low.stages, high.stages);
  for (const id of APPEARANCE_NEED_IDS) {
    const needs = createNeedsSimulation(genome.seed, [event(id, 150, 0)]),
      before = needs.stateAt(164);
    const a = resolveDevelopment(
        low,
        tissues,
        164,
        needs.stateAt,
        needs.morphologyAt,
      ),
      b = resolveDevelopment(
        high,
        tissues,
        164,
        needs.stateAt,
        needs.morphologyAt,
      ),
      da = a.state.diagnostics as any,
      db = b.state.diagnostics as any;
    assert.deepEqual(da.needSignals, db.needSignals);
    assert.deepEqual(da.activeNeedSignals, db.activeNeedSignals);
    assert.deepEqual(needs.stateAt(164), before);
    assert.deepEqual(a.state.commitments, b.state.commitments);
    const early = createNeedsSimulation(genome.seed, [event(id, 0, 0)]);
    assert.deepEqual(
      resolveDevelopment(low, tissues, 75, early.stateAt, early.morphologyAt)
        .state.commitments,
      resolveDevelopment(high, tissues, 75, early.stateAt, early.morphologyAt)
        .state.commitments,
      "response sensitivity does not alter early conditional mutation/operation choices",
    );
    assert.equal(da.needResponseSensitivity.inherited, 0.7);
    assert.equal(db.needResponseSensitivity.inherited, 1.3);
    assert.equal(da.needResponseSensitivity.applied, 0.85);
    assert.equal(db.needResponseSensitivity.applied, 1.15);
    assert.ok(
      Math.abs(
        db.appliedNeedMagnitudes.current[id].load /
          da.appliedNeedMagnitudes.current[id].load -
          1.15 / 0.85,
      ) < 1e-12,
    );
    if (id === "trust") {
      const length = (d: any) =>
        d.activeRegionResponses.find((r: any) => r.sourceId === "tail").length;
      assert.ok(
        Math.abs((1 - length(db)) / (1 - length(da)) - 1.15 / 0.85) < 1e-12,
        "effector coefficient uses the inherited multiplier exactly once",
      );
    }
    if (id === "rest")
      assert.ok(
        Math.abs(
          (1 - b.expression.paceFactor) / (1 - a.expression.paceFactor) -
            1.15 / 0.85,
        ) < 1e-12,
        "movement uses the same multiplier exactly once",
      );
  }
});
