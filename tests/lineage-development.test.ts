import test from "node:test";
import assert from "node:assert/strict";
import { createSimulation, createStarterAnatomy } from "../src/simulation";
import { compileGenome } from "../src/simulation/genome";
import { compileSources } from "../src/simulation/material";
import { describeSource } from "../src/simulation/source-atlas";
import { clonePreset } from "../src/presets";
import { createNeedsSimulation } from "../src/needs";
import { animalProfiles, isDescendant } from "../src/phylogeny";
import {
  classifySource,
  compileLineage,
  lineageAt,
  lineageCandidates,
  createDevelopmentClock,
  type LiveDevelopmentContext,
} from "../src/lineage";

const points = (care = 0.75, training = 0.5, battle = 0.5) => [
  { id: "hatchling", atHour: 0, care, training, battle },
  { id: "infant", atHour: 1, care, training, battle },
  { id: "juvenile", atHour: 49, care, training, battle },
  { id: "adult", atHour: 121, care, training, battle },
  { id: "advanced", atHour: 193, care, training, battle },
];
const live = (
  care = 0.75,
  training = 0.5,
  battle = 0.5,
): LiveDevelopmentContext => ({
  hatchAtHours: 0,
  stagePoints: points(care, training, battle),
  stageEndHours: [1, 49, 121, 193],
});
const atlas = () =>
  describeSource(compileSources(clonePreset("canine-cub"), 1));

test("placement is a conservative geometry affinity independent of pigment, labels, seed and care", () => {
  const original = clonePreset("canine-cub");
  const edited = original
    .map((part) => ({
      ...part,
      name: "renamed",
      pixels: [...part.pixels]
        .reverse()
        .map((pixel) => ({ ...pixel, color: "#cc3322" })),
    }))
    .reverse();
  const a = classifySource(describeSource(compileSources(original, 1)));
  const b = classifySource(describeSource(compileSources(edited, 999)));
  assert.deepEqual(a, b);
  assert.equal(
    animalProfiles.find((profile) => profile.id === a.nodeId)?.name,
    "Bilateria",
  );
  assert.equal(classifySource(describeSource([])).confidence, "broad");
});

test("every compressed playable transition follows exact represented tree ancestry", () => {
  for (const profile of animalProfiles)
    for (const child of lineageCandidates(profile.id)) {
      assert.notEqual(child.id, profile.id);
      assert.ok(isDescendant(child.id, profile.id));
      assert.ok(
        !animalProfiles.some(
          (between) =>
            between.id !== profile.id &&
            between.id !== child.id &&
            isDescendant(child.id, between.id) &&
            isDescendant(between.id, profile.id),
        ),
      );
    }
  const tree = compileLineage(
    atlas(),
    compileGenome("lineage-route"),
    points(),
  );
  let ancestor = tree.placement.nodeId;
  for (const point of tree.commitments) {
    assert.ok(isDescendant(point.nodeId, ancestor));
    ancestor = point.nodeId;
  }
  assert.deepEqual(
    compileLineage(atlas(), compileGenome("lineage-route"), points()),
    tree,
  );
});

test("future stage commitments cannot influence earlier lineage expression", () => {
  const all = compileLineage(atlas(), compileGenome("future-stage"), points());
  const prefix = compileLineage(
    atlas(),
    compileGenome("future-stage"),
    points().slice(0, 2),
  );
  assert.deepEqual(lineageAt(all, 40), lineageAt(prefix, 40));
  const full = createSimulation(
    clonePreset("canine-cub"),
    "future-stage",
    "infant",
    { liveContext: live() },
  );
  const old = createSimulation(
    clonePreset("canine-cub"),
    "future-stage",
    "infant",
    { liveContext: { ...live(), stagePoints: points().slice(0, 2) } },
  );
  assert.deepEqual(full.frameAt(40 / 24).pixels, old.frameAt(40 / 24).pixels);
});

test("care and achievements can select different seeded branches without altering inherited genome", () => {
  const source = atlas();
  let seed = "";
  for (let i = 0; i < 120; i++) {
    const candidate = `care-route-${i}`;
    const a = compileLineage(source, compileGenome(candidate), points(0, 0, 0));
    const b = compileLineage(source, compileGenome(candidate), points(1, 1, 1));
    if (
      a.commitments.some(
        (point, index) => point.nodeId !== b.commitments[index].nodeId,
      )
    ) {
      seed = candidate;
      break;
    }
  }
  assert.ok(
    seed,
    "documented care weights must affect some seed potential fields",
  );
  const a = createSimulation(clonePreset("canine-cub"), seed, "infant", {
    liveContext: live(0, 0, 0),
  });
  const b = createSimulation(clonePreset("canine-cub"), seed, "infant", {
    liveContext: live(1, 1, 1),
  });
  assert.deepEqual(a.genome, b.genome);
  assert.notDeepEqual(
    a.frameAt(220 / 24).pixels,
    b.frameAt(220 / 24).pixels,
    "route must change real source-material growth",
  );
});

test("morphology time is invertible and continuous while care keeps biological hour boundaries", () => {
  const clock = createDevelopmentClock(live());
  for (const hour of [0, 0.5, 1, 49, 121, 193, 220])
    assert.ok(
      Math.abs(
        clock.toChronological(clock.toMorphology(hour / 24)) * 24 - hour,
      ) < 1e-8,
    );
  for (const [hour, morphology] of [
    [0, 0],
    [1, 10],
    [49, 30],
    [121, 75],
    [193, 120],
  ]) {
    assert.equal(clock.toMorphology(hour / 24), morphology);
    assert.ok(
      Math.abs(clock.toMorphology((hour + 1e-7) / 24) - morphology) < 1e-5,
    );
  }
  const timeline = [
    { needId: "rest" as const, tick: 24, fulfillment: 0.1 },
    { needId: "rest" as const, tick: 80, fulfillment: 1 },
  ];
  const sim = createSimulation(
    clonePreset("canine-cub"),
    "clock-test",
    "infant",
    { liveContext: live(), needTimeline: timeline },
  );
  const needs = createNeedsSimulation("clock-test", timeline);
  for (const hour of [23.99, 24, 25, 49, 80, 121]) {
    assert.deepEqual(
      sim.frameAt(hour / 24).wellbeing,
      needs.stateAt(hour / 24),
    );
    assert.equal(sim.frameAt(hour / 24).developmentalAge, hour / 24);
  }
  const frame = sim.frameAt(220 / 24);
  for (const hour of [121, 1, 49, 220, 0, 80])
    sim.frameAt(hour / 24, { time: 1 });
  assert.deepEqual(sim.frameAt(220 / 24), frame);
});

test("live eggs use game hatching time and classify hatchling anatomy instead of the shell", () => {
  const sim = createSimulation(
    createStarterAnatomy("egg"),
    "egg-lineage",
    "egg",
    { liveContext: { ...live(), hatchAtHours: 5 / 60 } },
  );
  assert.equal(sim.hatchAt, 5 / 60 / 24);
  assert.equal(sim.frameAt(4 / 60 / 24).stage, "egg");
  assert.equal(sim.frameAt(4 / 60 / 24).evolution?.lineage, undefined);
  assert.notEqual(sim.frameAt(5 / 60 / 24).stage, "egg");
  assert.ok(sim.frameAt(5 / 60 / 24).evolution?.lineage);
});

test("live grooming records biological hours and a captured context cannot mutate replay", () => {
  const context = {
    ...live(),
    stageEndHours: [1, 49, 121, 193],
    stagePoints: points(),
  };
  const sim = createSimulation(
    clonePreset("canine-cub"),
    "live-grooming",
    "infant",
    { liveContext: context },
  );
  const before = sim.frameAt(2);
  let stroke = null;
  for (const part of before.parts) {
    if (part.kind !== "body") continue;
    for (const pixel of part.pixels) {
      stroke = sim.groomingStrokeAt(2, pixel, { x: pixel.x + 3, y: pixel.y });
      if (stroke) break;
    }
    if (stroke) break;
  }
  assert.ok(stroke);
  assert.equal(stroke.tick, 48);
  context.stageEndHours[2] = 1000;
  context.stagePoints[1].care = 0;
  assert.deepEqual(sim.frameAt(2), before);
});
