import test from "node:test";
import assert from "node:assert/strict";
import {
  createGroomingSimulation,
  normalizeGroomTimeline,
  groomResponse,
  GROOMING_RULES,
  type GroomStroke,
  type GroomingBinding,
} from "../src/simulation/grooming";
import { compileGenome } from "../src/simulation/genome";

const binding = (
  id = "hair",
  kind: GroomingBinding["kind"] = "hair",
): GroomingBinding => ({
  id,
  kind,
  sourceIds: [id],
  materialAnchor: { x: 30, y: 25 },
  growthAxis: { x: 0, y: -1 },
  influenceRadius: 6,
  geneticOpportunity: { length: 1, bend: 1 },
});
const stroke = (
  tick = 0,
  direction = { x: 0, y: -1 },
  strength = 1,
  sourceId = "hair",
): GroomStroke => ({
  tick,
  sourceId,
  materialAnchor: { x: 30, y: 25 },
  direction,
  strength,
});

test("grooming is gradual, directional, capped and relaxes over weeks", () => {
  const simulation = createGroomingSimulation([stroke()]);
  assert.equal(simulation.stateAt(0, [binding()]).byRegion.hair.lengthDelta, 0);
  const early = simulation.stateAt(1, [binding()]).byRegion.hair.lengthDelta;
  const grown = simulation.stateAt(10, [binding()]).byRegion.hair.lengthDelta;
  assert.ok(early > 0 && grown > early && grown <= 0.25);
  assert.ok(
    simulation.stateAt(112, [binding()]).byRegion.hair.lengthDelta <
      grown * 0.15,
  );
  const backward = createGroomingSimulation([
    stroke(0, { x: 0, y: 1 }),
  ]).stateAt(10, [binding()]);
  assert.ok(backward.byRegion.hair.lengthDelta < 0);
  const sideways = createGroomingSimulation([
    stroke(0, { x: 1, y: 0 }),
  ]).stateAt(10, [binding()]);
  assert.ok(sideways.byRegion.hair.bendRadians > 0);
  assert.equal(sideways.byRegion.hair.lengthDelta, 0);
});

test("arbitrary seeking, input order and a fresh replay reproduce exactly", () => {
  const timeline = [
    stroke(0),
    stroke(36, { x: 1, y: 0 }, 0.4),
    stroke(71, { x: 0, y: 1 }, 0.2),
  ];
  const a = createGroomingSimulation(timeline),
    b = createGroomingSimulation([...timeline].reverse());
  for (const age of [18, 0.5, 30, 2, 200, 3.7, 18])
    assert.deepEqual(a.stateAt(age, [binding()]), b.stateAt(age, [binding()]));
});

test("future strokes and future daily input cannot affect any earlier state", () => {
  const past = createGroomingSimulation([stroke(0, { x: 0, y: -1 }, 0.4)]);
  const withFuture = createGroomingSimulation([
    stroke(0, { x: 0, y: -1 }, 0.4),
    stroke(12, { x: 1, y: 0 }),
    stroke(1000),
  ]);
  for (const age of [0, 0.1, 0.499999, 0.5 - Number.EPSILON])
    assert.deepEqual(
      past.stateAt(age, [binding()]),
      withFuture.stateAt(age, [binding()]),
    );
  assert.equal(
    withFuture.stateAt(0.5, [binding()]).byRegion.hair.lengthDelta,
    past.stateAt(0.5, [binding()]).byRegion.hair.lengthDelta,
  );
});

test("hourly input applies on its exact developmental boundary without an instant shape jump", () => {
  for (let hour = 1; hour <= 24; hour++) {
    const s = createGroomingSimulation([stroke(hour)]),
      at = hour / 24;
    assert.equal(s.stateAt(at - 1e-8, [binding()]).input.appliedStrokes, 0);
    assert.equal(s.stateAt(at, [binding()]).input.appliedStrokes, 1);
    assert.equal(s.stateAt(at, [binding()]).byRegion.hair.lengthDelta, 0);
    assert.ok(s.stateAt(at + 1, [binding()]).byRegion.hair.lengthDelta > 0);
  }
});

test("per-day input is chronological and repeated commands cannot bypass its cap", () => {
  const duplicate = Array.from({ length: 100 }, (_, i) => ({
    ...stroke(),
    id: "spam-" + i,
  }));
  assert.equal(normalizeGroomTimeline(duplicate).length, 1);
  const diverse = Array.from({ length: 24 }, (_, i) =>
    stroke(i, { x: i % 2 ? 1 : -1, y: -1 }, 0.25),
  );
  const s = createGroomingSimulation(diverse),
    state = s.stateAt(10, [binding()]);
  assert.equal(state.input.acceptedStrength, GROOMING_RULES.dailyInputBudget);
  assert.equal(state.input.cappedStrength, 5);
  assert.ok(state.input.days.every((day) => day.acceptedStrength <= 1));
  const twoDays = createGroomingSimulation([stroke(0), stroke(24)]).stateAt(
    10,
    [binding()],
  );
  assert.equal(twoDays.input.acceptedStrength, 2);
});

test("long grooming histories respect inherited opportunities and gentle budget limits", () => {
  const many = Array.from({ length: 200 }, (_, day) =>
    stroke(day * 24, { x: 1, y: -1 }),
  );
  const b = binding();
  b.geneticOpportunity = { length: 0.2, bend: 0.4 };
  const result = createGroomingSimulation(many).stateAt(200, [b]).byRegion.hair;
  assert.ok(Math.abs(result.lengthDelta) <= 0.25 * 0.2);
  assert.ok(Math.abs(result.bendRadians) <= (Math.PI / 9) * 0.4);
  assert.ok(result.priorityBias <= 0.08 * 0.4);
  const closed = binding();
  closed.geneticOpportunity = { length: 0, bend: 0 };
  const noOpportunity = createGroomingSimulation(many).stateAt(200, [closed])
    .byRegion.hair;
  assert.equal(noOpportunity.lengthDelta, 0);
  assert.equal(noOpportunity.bendRadians, 0);
  assert.equal(noOpportunity.priorityBias, 0);
});

test("protected face and detail layers receive no independent deformation", () => {
  const bindings = [
    binding("eye", "eye"),
    binding("mouth", "mouth"),
    binding("mark", "decoration"),
    binding("hair"),
  ];
  const input = bindings.map((b) => stroke(0, { x: 1, y: -1 }, 0.25, b.id));
  const result = createGroomingSimulation(input).stateAt(10, bindings);
  assert.equal(result.byRegion.eye, undefined);
  assert.equal(result.byRegion.mouth, undefined);
  assert.equal(result.byRegion.mark, undefined);
  assert.ok(result.byRegion.hair.lengthDelta > 0);
});

test("source clips keep a groomed material island on its own divided successor", () => {
  const left = binding("left", "body"),
    right = binding("right", "body");
  left.sourceIds = right.sourceIds = ["body"];
  left.sourceClip = { axis: "x", min: 0, max: 31 };
  right.sourceClip = { axis: "x", min: 31, max: 64 };
  const input = stroke(0, { x: 0, y: -1 }, 1, "body");
  input.materialAnchor.x = 32;
  const r = createGroomingSimulation([input]).stateAt(10, [right, left]);
  assert.equal(r.byRegion.left.lengthDelta, 0);
  assert.ok(r.byRegion.right.lengthDelta > 0);
});

test("explicit absorbed-material aliases and generated parent inheritance preserve history", () => {
  const body = binding("body", "body");
  body.sourceAliases = [
    {
      sourceId: "old-tail",
      sourceAnchor: { x: 10, y: 10 },
      targetAnchor: { x: 30, y: 25 },
    },
  ];
  const grown = binding("grown", "wing");
  grown.sourceIds = [];
  grown.parentId = "body";
  grown.inheritParent = true;
  const old = stroke(0, { x: 0, y: -1 }, 1, "old-tail");
  old.materialAnchor = { x: 10, y: 10 };
  const r = createGroomingSimulation([old]).stateAt(10, [grown, body]);
  assert.ok(
    r.byRegion.body.lengthDelta > 0 && r.byRegion.grown.lengthDelta > 0,
  );
  assert.ok(r.byRegion.grown.lengthDelta < r.byRegion.body.lengthDelta);
  assert.deepEqual(r.byRegion.body.influences[0].materialAnchor, {
    x: 30,
    y: 25,
  });
  assert.equal(r.byRegion.grown.influences[0].inherited, true);
});

test("opposite equal directions cancel shape bias without changing the stored source or genome", () => {
  const a = stroke(0, { x: 0, y: -1 }, 0.5),
    b = stroke(0, { x: 0, y: 1 }, 0.5),
    source = binding();
  const original = structuredClone([a, b, source]),
    genome = compileGenome("unchanged-genome");
  const r = createGroomingSimulation([a, b]).stateAt(10, [source]).byRegion
    .hair;
  assert.equal(r.lengthDelta, 0);
  assert.equal(r.bendRadians, 0);
  assert.deepEqual([a, b, source], original);
  assert.deepEqual(compileGenome("unchanged-genome"), genome);
});

test("grooming replay is immutable, tolerates invalid input and handles far-future finite queries", () => {
  const input = stroke(),
    s = createGroomingSimulation([
      input,
      { ...input, tick: -1 },
      { ...input, tick: 0.5 },
      { ...input, strength: NaN },
    ]);
  input.strength = 0;
  assert.equal(s.timeline.length, 1);
  const r = s.stateAt(10, [binding()]);
  assert.ok(
    Object.isFrozen(r) &&
      Object.isFrozen(r.byRegion.hair) &&
      Object.isFrozen(s.timeline),
  );
  assert.throws(() => {
    (r.byRegion.hair as any).lengthDelta = 20;
  }, TypeError);
  assert.equal(s.stateAt(1_000_000, [binding()]).byRegion.hair.lengthDelta, 0);
  assert.equal(groomResponse(-1), 0);
  assert.equal(groomResponse(0), 0);
  const huge = normalizeGroomTimeline([
    stroke(0, { x: Number.MAX_VALUE, y: Number.MAX_VALUE }),
  ]);
  assert.ok(
    Math.abs(Math.hypot(huge[0].direction.x, huge[0].direction.y) - 1) < 1e-9,
  );
});

test("all 10,000 sampled directions normalize idempotently across JSON save and reload", () => {
  for (let i = 0; i < 10_000; i++) {
    const angle = (i * Math.PI * 2) / 10_000;
    const first = normalizeGroomTimeline([
      stroke(0, { x: Math.cos(angle), y: Math.sin(angle) }),
    ]);
    const second = normalizeGroomTimeline(JSON.parse(JSON.stringify(first)));
    assert.deepEqual(
      second,
      first,
      `direction ${i} has a stable canonical angle bin`,
    );
    assert.deepEqual(normalizeGroomTimeline(second), first);
  }
});

test("bounded influence diagnostics retain full response sums and material focus", () => {
  const input = Array.from({ length: 240 }, (_, i) => ({
    ...stroke(i, { x: 0, y: -1 }, 0.1),
    materialAnchor: { x: 29 + (i % 3), y: 25 },
  }));
  const r = createGroomingSimulation(input).stateAt(20, [binding()]).byRegion
    .hair;
  assert.ok(r.influenceCount > 8);
  assert.equal(r.influences.length, 8);
  assert.ok(
    r.memory >
      r.influences.reduce((sum, influence) => sum + influence.weight, 0),
  );
  assert.ok(Math.abs(r.lengthDelta - 0.25 * Math.tanh(r.memory / 1.5)) < 1e-12);
  assert.ok(r.materialFocus.x >= 29 && r.materialFocus.x <= 31);
});
