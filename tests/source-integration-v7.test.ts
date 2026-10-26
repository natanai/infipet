import assert from "node:assert/strict";
import test from "node:test";
import { createSimulation, type PetPart } from "../src/simulation";
import { clonePreset } from "../src/presets";

const fixture = (): PetPart[] => [
  {
    id: "trunk",
    kind: "body",
    name: "Trunk",
    position: { x: 0, y: 0 },
    parentId: null,
    pixels: Array.from({ length: 70 }, (_, i) => ({
      x: 10 + (i % 10),
      y: 15 + Math.floor(i / 10),
      color: "#FFFFFF",
    })),
  },
  {
    id: "face",
    kind: "head",
    name: "Face",
    position: { x: 0, y: 0 },
    parentId: "trunk",
    pixels: Array.from({ length: 35 }, (_, i) => ({
      x: 12 + (i % 7),
      y: 8 + Math.floor(i / 7),
      color: "#FFFFFF",
    })),
  },
  {
    id: "eye",
    kind: "eye",
    name: "Eye",
    position: { x: 0, y: 0 },
    parentId: "face",
    pixels: [{ x: 14, y: 10, color: "#000000" }],
  },
];

test("v7 distinguishes source, inherited genome and developmental program fingerprints", () => {
  const a = createSimulation(fixture(), "stable-genome");
  const edited = fixture();
  edited[0].pixels.push({ x: 20, y: 18, color: "#FFFFFF" });
  const b = createSimulation(edited, "stable-genome");
  assert.deepEqual(a.genome, b.genome);
  const aa = a.developmentAt(75),
    bb = b.developmentAt(75);
  assert.equal(aa.genomeFingerprint, bb.genomeFingerprint);
  assert.notEqual(aa.sourceFingerprint, bb.sourceFingerprint);
  assert.notEqual(aa.programFingerprint, bb.programFingerprint);
  assert.notDeepEqual(a.frameAt(75).pixels, b.frameAt(75).pixels);
});

test("v7 inherited genes are independent of source identities, palette, ordering and need history", () => {
  const source = fixture(),
    changed = structuredClone(source);
  for (const p of changed) {
    p.id = "new-" + p.id;
    if (p.parentId) p.parentId = "new-" + p.parentId;
    for (const c of p.pixels) c.color = "#987654";
  }
  const original = createSimulation(source, "same");
  const variants = [
    createSimulation(changed.reverse(), "same"),
    createSimulation(clonePreset("ribbon"), "same"),
    createSimulation(source, "same", "infant", {
      needTimeline: [{ needId: "safety", tick: 0, fulfillment: 0 }],
    }),
  ];
  for (const v of variants) assert.deepEqual(v.genome, original.genome);
});

test("v7 renaming material identities cannot change structural pixels", () => {
  const source = fixture(),
    renamed = structuredClone(source);
  const ids = new Map(
    renamed.map((p, i) => [p.id, `renamed-${renamed.length - i}`]),
  );
  for (const p of renamed) {
    p.id = ids.get(p.id)!;
    p.parentId = p.parentId ? ids.get(p.parentId)! : null;
  }
  const a = createSimulation(source, "rename"),
    b = createSimulation(renamed, "rename");
  for (const day of [0, 7, 30, 75, 120, 240])
    assert.deepEqual(
      a.frameAt(day).pixels,
      b.frameAt(day).pixels,
      `day ${day}`,
    );
});

test("v7 exact pre-event fractional anatomy excludes later need keyframes", () => {
  const age = 19 + 1 / 24,
    tick = Math.round(age * 24);
  const a = createSimulation(fixture(), "future");
  const b = createSimulation(fixture(), "future", "infant", {
    needTimeline: [
      { needId: "safety", tick, fulfillment: 0 },
      { needId: "rest", tick, fulfillment: 0 },
    ],
  });
  for (const time of [0, 7, age - 1e-5, age - 1 / 48]) {
    assert.deepEqual(a.developmentAt(time), b.developmentAt(time));
    assert.deepEqual(a.frameAt(time).pixels, b.frameAt(time).pixels);
  }
});

test("v7 diagnostics are immutable snapshots and source editing never mutates earlier programs", () => {
  const sim = createSimulation(fixture(), "snapshot");
  const state = sim.developmentAt(75);
  assert.ok(Object.isFrozen(state));
  assert.ok(Object.isFrozen(state.anatomy));
  assert.throws(() => {
    state.commitments.push({ id: "bad", tick: 0, option: "bad" });
  });
  assert.deepEqual(sim.developmentAt(75), state);
});

test("v7 life remains finite, changing and functional beyond the initial preview window", () => {
  const simulation = createSimulation(
    clonePreset("canine-cub"),
    "endless-life",
  );
  assert.equal(simulation.openEnded, true);
  const frames = [120, 240, 365, 3650, 1000000].map((age) =>
    simulation.frameAt(age),
  );
  for (const frame of frames) {
    assert.equal(frame.stage, "elderly");
    assert.equal(frame.age, frame.developmentalAge);
    assert.ok(frame.pixels.length > 0);
    assert.ok(frame.motionPace >= 0.15 && frame.motionAmplitude > 0);
    assert.ok(
      frame.pixels.every(
        (p) =>
          Number.isInteger(p.x) &&
          Number.isInteger(p.y) &&
          p.x >= 0 &&
          p.x < 64 &&
          p.y >= 0 &&
          p.y < 64,
      ),
    );
  }
  assert.ok(
    new Set(frames.map((frame) => JSON.stringify(frame.pixels))).size >= 4,
  );
  assert.ok(frames.at(-1)!.motionPace < frames[0].motionPace);
  assert.deepEqual(
    simulation.frameAt(3650),
    createSimulation(clonePreset("canine-cub"), "endless-life").frameAt(3650),
  );
});
