import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFunctionalGraph,
  poseFunctionalGraph,
  solveTwoLink,
  transformLocomotionPoint,
  POSE_PHASES,
  type RigNode,
} from "../src/simulation/locomotion";

function quadruped(): RigNode[] {
  const nodes: RigNode[] = [
    {
      id: "body",
      kind: "body",
      role: "trunk",
      center: { x: 30, y: 30 },
      anchor: { x: 23, y: 30 },
      tip: { x: 37, y: 32 },
      sourceIds: ["body"],
      readiness: 1,
    },
  ];
  for (const [role, x, y] of [
    ["hind-left", 25, 31],
    ["hind-right", 26, 30],
    ["fore-left", 35, 31],
    ["fore-right", 36, 30],
  ] as const) {
    nodes.push({
      id: `leg-${role}`,
      kind: "leg",
      role,
      center: { x, y: 35 },
      anchor: { x, y },
      tip: { x: x + 0.5, y: 40 },
      sourceIds: [`leg-${role}`],
      readiness: 1,
    });
    nodes.push({
      id: `foot-${role}`,
      kind: "foot",
      role,
      center: { x: x + 0.5, y: 40 },
      anchor: { x: x + 0.5, y: 40 },
      tip: { x: x + 1, y: 40 },
      parentId: `leg-${role}`,
      sourceIds: [`foot-${role}`],
      readiness: 1,
    });
  }
  return nodes;
}

test("quadruped contacts have four stable role-based footfall phases", () => {
  const graph = buildFunctionalGraph(quadruped(), "quadruped");
  assert.equal(graph.controllerFamily, "quadruped");
  assert.equal(graph.movementMode, "walk");
  assert.equal(new Set(graph.limbs.map((limb) => limb.phaseOffset)).size, 4);
  const result = Array.from({ length: POSE_PHASES }, (_, phase) =>
    poseFunctionalGraph(graph, { time: phase / POSE_PHASES, action: "move" }),
  );
  assert.deepEqual(
    result.map((pose) => pose.phase),
    [0, 1, 2, 3, 4, 5, 6, 7],
  );
  assert.ok(
    result.every(
      (pose) => pose.contacts.filter((contact) => contact.planted).length === 3,
    ),
  );
  assert.ok(
    result.some((pose) =>
      pose.contacts.some(
        (contact) =>
          !contact.planted && contact.localPoint.y < graph.groundY - 0.5,
      ),
    ),
  );
});

test("stance points stay locked in virtual world space and bones retain length", () => {
  const graph = buildFunctionalGraph(quadruped(), "quadruped");
  const stance = new Map<string, { x: number; y: number }>();
  for (let tick = 0; tick <= 32; tick++) {
    const pose = poseFunctionalGraph(graph, { time: tick / 8, action: "move" });
    assert.ok(pose.diagnostics.maximumBoneError < 0.002);
    assert.ok(pose.diagnostics.maximumContactError < 0.002);
    assert.ok(pose.diagnostics.maximumGroundPenetration < 0.002);
    for (const contact of pose.contacts.filter((contact) => contact.planted)) {
      const key = `${contact.id}:${contact.step}`;
      const old = stance.get(key);
      if (old)
        assert.ok(
          Math.hypot(
            old.x - contact.worldPoint.x,
            old.y - contact.worldPoint.y,
          ) < 0.003,
          key,
        );
      stance.set(key, contact.worldPoint);
    }
  }
});

test("role phases and poses do not depend on input order or translation", () => {
  const source = quadruped();
  const original = buildFunctionalGraph(source, "quadruped");
  assert.deepEqual(
    buildFunctionalGraph([...source].reverse(), "quadruped"),
    original,
  );
  const delta = { x: -12.25, y: 7.5 };
  const translated = buildFunctionalGraph(
    source.map((node) => ({
      ...node,
      center: { x: node.center.x + delta.x, y: node.center.y + delta.y },
      anchor: { x: node.anchor.x + delta.x, y: node.anchor.y + delta.y },
      tip: { x: node.tip.x + delta.x, y: node.tip.y + delta.y },
    })),
    "quadruped",
  );
  assert.deepEqual(
    original.limbs.map((limb) => [limb.id, limb.role, limb.phaseOffset]),
    translated.limbs.map((limb) => [limb.id, limb.role, limb.phaseOffset]),
  );
  for (let phase = 0; phase < 8; phase++) {
    const a = poseFunctionalGraph(original, {
        time: phase / 8,
        action: "move",
      }),
      b = poseFunctionalGraph(translated, { time: phase / 8, action: "move" });
    for (const id of Object.keys(a.transforms)) {
      assert.ok(
        Math.abs(a.transforms[id].tip.x + delta.x - b.transforms[id].tip.x) <
          0.002,
      );
      assert.ok(
        Math.abs(a.transforms[id].tip.y + delta.y - b.transforms[id].tip.y) <
          0.002,
      );
    }
  }
});

test("IK clamps unreachable feet instead of stretching bones", () => {
  const hip = { x: 0, y: 0 },
    result = solveTwoLink(hip, { x: 100, y: 100 }, 3, 4);
  assert.ok(Math.abs(Math.hypot(result.joint.x, result.joint.y) - 3) < 0.002);
  assert.ok(
    Math.abs(
      Math.hypot(result.tip.x - result.joint.x, result.tip.y - result.joint.y) -
        4,
    ) < 0.002,
  );
  assert.ok(Math.hypot(result.tip.x, result.tip.y) <= 7.001);
  assert.ok(result.error > 100);
});

test("explicit-time held poses repeat after seeking in a different order", () => {
  const graph = buildFunctionalGraph(quadruped(), "quadruped");
  const expected = poseFunctionalGraph(graph, {
    time: 0.401,
    action: "move",
    pace: 0.8,
  });
  for (const time of [10, 0, 2.2, 7.4])
    poseFunctionalGraph(graph, { time, action: "move", pace: 0.8 });
  assert.deepEqual(
    poseFunctionalGraph(graph, { time: 0.401, action: "move", pace: 0.8 }),
    expected,
  );
  assert.deepEqual(
    poseFunctionalGraph(graph, { time: 0.402, action: "move", pace: 0.8 }),
    expected,
  );
});

test("fin labels and immature wings cannot grant flight", () => {
  const wings = (role: string, readiness: number): RigNode[] =>
    [-1, 1].map((side) => ({
      id: `wing${side}`,
      kind: "wing",
      role,
      center: { x: 32 + side * 8, y: 30 },
      anchor: { x: 32, y: 30 },
      tip: { x: 32 + side * 12, y: 30 },
      sourceIds: [],
      readiness,
    }));
  assert.equal(
    buildFunctionalGraph(wings("fin", 1), "flutter").controllerFamily,
    "float",
  );
  assert.equal(
    buildFunctionalGraph(wings("flight-wing", 0.4), "flutter").controllerFamily,
    "float",
  );
  assert.equal(
    buildFunctionalGraph(wings("flight-wing", 1), "flutter").controllerFamily,
    "flutter",
  );
  assert.equal(
    buildFunctionalGraph(wings("fin", 1), "swim").movementMode,
    "undulate",
  );
});

test("serpentine movement bends material along an intrinsic spine", () => {
  const node: RigNode = {
    id: "body",
    kind: "body",
    role: "trunk",
    center: { x: 30, y: 30 },
    anchor: { x: 20, y: 30 },
    tip: { x: 40, y: 30 },
    spine: [
      { x: 20, y: 30 },
      { x: 30, y: 25 },
      { x: 40, y: 30 },
    ],
    sourceIds: ["body"],
    readiness: 1,
  };
  const graph = buildFunctionalGraph([node], "serpentine"),
    pose = poseFunctionalGraph(graph, { time: 0.125, action: "move" });
  const a = transformLocomotionPoint({ x: 21, y: 30 }, pose.transforms.body),
    b = transformLocomotionPoint({ x: 39, y: 30 }, pose.transforms.body);
  assert.notEqual(a.y - 30, b.y - 30);
  assert.equal(pose.transforms.body.rotation, 0);
});

test("floating owned features never acquire ground contacts", () => {
  const nodes = quadruped();
  const pose = poseFunctionalGraph(buildFunctionalGraph(nodes, "float"), {
    time: 0.125,
    action: "move",
  });
  assert.ok(
    pose.contacts.every(
      (contact) => !contact.planted && contact.supportWeight === 0,
    ),
  );
});

test("many disconnected legs share at most32 controllers without losing fragment transforms", () => {
  const fragments: RigNode[] = Array.from({ length: 90 }, (_, i) => ({
    id: `fragment-${String(i).padStart(3, "0")}`,
    kind: "leg",
    role: "leg",
    center: { x: 10 + (i % 15), y: 20 + Math.floor(i / 15) },
    anchor: { x: 10 + (i % 15), y: 19 + Math.floor(i / 15) },
    tip: { x: 10 + (i % 15), y: 22 + Math.floor(i / 15) },
    sourceIds: [`fragment-${i}`],
    readiness: 1,
  }));
  const graph = buildFunctionalGraph(fragments, "crawler"),
    pose = poseFunctionalGraph(graph, { time: 0.125, action: "move" });
  assert.equal(graph.nodes.length, 90);
  assert.equal(graph.limbs.length, 32);
  assert.equal(pose.diagnostics.boneLengths.length, 32);
  assert.equal(Object.keys(graph.sharedControls).length, 58);
  for (const node of fragments) assert.ok(pose.transforms[node.id]);
  for (const id of Object.keys(graph.sharedControls))
    assert.equal(pose.transforms[id].joint, undefined);
});

test("nascent limbs unfold at their developing tips before bearing ground weight", () => {
  const nodes = quadruped();
  nodes.push({
    id: "growing-leg",
    kind: "leg",
    role: "middle-left",
    center: { x: 30, y: 31 },
    anchor: { x: 30, y: 30 },
    tip: { x: 30, y: 32 },
    sourceIds: [],
    readiness: 0.2,
  });
  const graph = buildFunctionalGraph(nodes, "quadruped"),
    pose = poseFunctionalGraph(graph, { time: 0.125, action: "move" });
  const growing = pose.transforms["growing-leg"],
    contact = pose.contacts.find((c) => c.id === "growing-leg")!;
  assert.ok(
    growing.tip.y < 34,
    "an unfolding leg must not be stretched down to the40px floor",
  );
  assert.equal(contact.planted, false);
  assert.equal(contact.supportWeight, 0);
  const baseline = buildFunctionalGraph(
    nodes.filter((node) => node.id !== "growing-leg"),
    "quadruped",
  );
  assert.equal(
    graph.stride,
    baseline.stride,
    "a small growing leg must not shorten the mature support gait",
  );
});
