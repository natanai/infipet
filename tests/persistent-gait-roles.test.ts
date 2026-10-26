import test from "node:test";
import assert from "node:assert/strict";
import {
  buildFunctionalGraph,
  type RigNode,
} from "../src/simulation/locomotion";

test("compiled anatomical roles survive crossing positions, renamed identifiers and reordered controllers", () => {
  const roles = ["fore-left", "hind-right", "fore-right", "hind-left"];
  const nodes: RigNode[] = roles.map((role, i) => ({
    id: `arbitrary-${i}`,
    kind: "leg",
    role: "leg",
    anatomicalRole: role,
    center: { x: 10 + i * 5, y: 20 },
    anchor: { x: 10 + i * 5, y: 17 },
    tip: { x: 10 + i * 5, y: 30 },
    readiness: 1,
    sourceIds: [],
  }));
  const original = buildFunctionalGraph(nodes, "quadruped");
  const crossed = buildFunctionalGraph(
    [...nodes].reverse().map((n, i) => ({
      ...n,
      id: `renamed-${i}`,
      center: { x: 50 - n.center.x, y: n.center.y },
      anchor: { x: 50 - n.anchor.x, y: n.anchor.y },
      tip: { x: 50 - n.tip.x, y: n.tip.y },
    })),
    "quadruped",
  );
  assert.equal(new Set(original.limbs.map((l) => l.phaseOffset)).size, 4);
  assert.deepEqual(
    Object.fromEntries(original.limbs.map((l) => [l.role, l.phaseOffset])),
    Object.fromEntries(crossed.limbs.map((l) => [l.role, l.phaseOffset])),
  );
  const retired = buildFunctionalGraph(
    nodes.filter((n) => n.anatomicalRole?.startsWith("hind")),
    "biped",
  );
  assert.equal(
    retired.limbs.find((l) => l.role === "hind-left")?.phaseOffset,
    0,
  );
  assert.equal(
    retired.limbs.find((l) => l.role === "hind-right")?.phaseOffset,
    0.5,
  );
});

test("hopping requires at least two developed support chains", () => {
  const leg: RigNode = {
    id: "support",
    kind: "leg",
    role: "left",
    anatomicalRole: "left",
    center: { x: 25, y: 27 },
    anchor: { x: 25, y: 24 },
    tip: { x: 25, y: 32 },
    sourceIds: [],
    readiness: 1,
  };
  assert.equal(buildFunctionalGraph([leg], "hop").controllerFamily, "float");
  assert.equal(
    buildFunctionalGraph(
      [leg, { ...leg, id: "other", anatomicalRole: "right", readiness: 0.2 }],
      "hop",
    ).controllerFamily,
    "float",
  );
  assert.equal(
    buildFunctionalGraph(
      [leg, { ...leg, id: "other", anatomicalRole: "right" }],
      "hop",
    ).controllerFamily,
    "hop",
  );
});
