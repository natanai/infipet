import test from "node:test";
import assert from "node:assert/strict";
import { inferFunctionalMaterial } from "../src/integration/functional-material";
import { buildFunctionalGraph, poseFunctionalGraph, solveTwoLink,
  transformLocomotionPoint, type RigNode } from "../src/simulation/locomotion";
import { poseLinkedMaterial } from "../src/simulation/growth";
import { createSimulation } from "../src/simulation";
import type { Region } from "../src/simulation/development";
import type { MaterialCell, MaterialGraph, MaterialLink } from "../src/development";
import type { PetPart, Point } from "../src/simulation/model";

const d = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const approx = (a: number, b: number, tol = 0.005) =>
  assert.ok(Math.abs(a - b) <= tol, `expected ${a} within ${tol} of ${b}`);

/** Two independent, explicitly attached downward flexures grown from one body. */
function fixture(grown = true, damage: "none" | "link" | "gap" | "rigid" = "none") {
  const ink: MaterialCell[] = Array.from({ length: 13 }, (_, i) => ({
    id: "ink/body/" + i, tissueId: "body/island/0", x: i + 2, y: 10,
    color: "#ffffff", provenance: "authored" as const,
    sourceIds: ["ink/body/" + i], parentCellIds: [], operationId: null,
  }));
  const descendants: MaterialCell[] = [];
  const tissues: MaterialGraph["tissues"][number][] = [{
    id: "body/island/0", sourcePartId: "body", parentId: null,
    relationship: "root", sourceCellIds: ink.map(cell => cell.id),
    growthSiteIds: [], rigidity: 0.2,
  }];
  const links: MaterialLink[] = [];
  for (const [index, x] of [4, 12].entries()) {
    const tissueId = "bud-" + index + "/growth/0";
    const origin = ink.find(cell => cell.x === x)!;
    for (let y = 11; y <= (grown ? 16 : 12); y++) {
      if (damage === "gap" && index === 0 && y === 13) continue;
      descendants.push({
        id: tissueId + "/" + y, tissueId, x, y, color: "#ffffff",
        provenance: "generated", sourceIds: [origin.id],
        parentCellIds: [y === 11 ? origin.id : tissueId + "/" + (y - 1)],
        operationId: "bud-" + index,
      });
    }
    tissues.push({
      id: tissueId, sourcePartId: "body", parentId: "body/island/0",
      relationship: "joint", sourceCellIds: [origin.id],
      growthSiteIds: [], rigidity: damage === "rigid" && index === 0 ? 0.95 : 0.2,
    });
    if (damage !== "link" || index !== 0)
      links.push({ id: "attachment-" + index, kind: "attachment",
        fromTissueId: tissueId, toTissueId: "body/island/0",
        fromCellId: tissueId + "/11", toCellId: origin.id });
  }
  const graph: MaterialGraph = {
    version: 1, sourceFingerprint: "unchanging-birth",
    sourceCells: ink, cells: [...ink, ...descendants],
    tissues, sites: [], links, protectedVoids: [],
    events: grown ? [{ id: "bud", kind: "bud", atHour: 10,
      createdCellIds: descendants.map(cell => cell.id),
      removedCellIds: [], sourceCellIds: ink.map(cell => cell.id) }] : [],
  };
  const region = { id: "body-region", kind: "body", role: "trunk",
    sourceIds: ["body"], parentId: null,
    center: { x: 8, y: 10 }, anchor: { x: 8, y: 10 },
    tip: { x: 8, y: 10 }, source: { id: "body" },
  } as unknown as Region;
  const body: RigNode = {
    id: region.id, kind: "body", role: "trunk",
    center: region.center, anchor: region.anchor, tip: region.tip,
    readiness: 1, sourceIds: ["body"],
  };
  const material = inferFunctionalMaterial(graph, [region], [body]);
  return { graph, material, region };
}

test("[MOT-001/A1] independent law-of-cosines lengths and bounded inverse kinematics", () => {
  for (const angle of [0.3, 0.8, 1.3, 2.1, 3.1]) {
    const hip = { x: 3, y: -1 };
    const target = { x: 3 + 4 * Math.cos(angle), y: -1 + 4 * Math.sin(angle) };
    const upper = 3, lower = 2;
    const solved = solveTwoLink(hip, target, upper, lower, 1);
    approx(d(hip, solved.joint), upper);
    approx(d(solved.joint, solved.tip), lower);
    approx(d(solved.tip, target), 0);
    const projected = (upper * upper - lower * lower + 16) / 8;
    approx(((solved.joint.x - hip.x) * (target.x - hip.x) +
      (solved.joint.y - hip.y) * (target.y - hip.y)) / 4, projected);
  }
});

test("[MOT-001/A1] stance remains fixed in world coordinates while the camera follows", () => {
  const { material } = fixture();
  assert.equal(material.bindings.length, 2);
  const rig = buildFunctionalGraph(material.nodes);
  assert.equal(rig.limbs.length, 2);
  assert.equal(rig.controllerFamily, "biped");
  const p0 = poseFunctionalGraph(rig, { time: 0.125, action: "move" });
  const p1 = poseFunctionalGraph(rig, { time: 0.25, action: "move" });
  const late = poseFunctionalGraph(rig, { time: 10, action: "move" });
  assert.ok(late.diagnostics.worldAdvance > p1.diagnostics.worldAdvance);
  assert.equal(late.locomotionSupported, true);
  assert.ok(late.cameraLagX > p1.cameraLagX);
  assert.ok(Math.abs(late.cameraLagX) <= 3);
  assert.ok(late.cameraWorldX > 0);
  assert.ok(d(p1.worldPosition, p0.worldPosition) > 0);
  const ids = p0.contacts.filter(c => c.planted && p1.contacts.some(
    next => next.id === c.id && next.planted)).map(c => c.id);
  assert.ok(ids.length > 0);
  for (const id of ids) {
    const a = p0.contacts.find(c => c.id === id)!;
    const b = p1.contacts.find(c => c.id === id)!;
    approx(d(a.worldPoint, b.worldPoint), 0, 0.02);
    approx(d(a.worldPoint, a.desiredWorldPoint), 0, 0.04);
  }
  for (const pose of [p0, p1, late]) {
    assert.ok(pose.diagnostics.maximumBoneError < 0.005);
    assert.ok(pose.diagnostics.maximumContactError < 0.2);
    for (const bone of pose.diagnostics.boneLengths) {
      approx(bone.upper, bone.actualUpper);
      approx(bone.lower, bone.actualLower);
    }
  }
});

test("[MOT-001/A1] unsupported labels, unattached matter, and stationary ink cannot travel", () => {
  for (const damage of ["link", "gap", "rigid"] as const) {
    const { material } = fixture(true, damage);
    assert.equal(material.bindings.length, 1);
    const rig = buildFunctionalGraph(material.nodes);
    const pose = poseFunctionalGraph(rig, { time: 16, action: "move" });
    assert.equal(pose.diagnostics.worldAdvance, 0);
    assert.equal(pose.locomotionSupported, false);
    assert.ok(material.evidence.some(e => !e.supported));
  }
  const undeveloped = fixture(false);
  assert.equal(undeveloped.material.bindings.length, 0);
  const staticRig = buildFunctionalGraph(undeveloped.material.nodes);
  assert.equal(poseFunctionalGraph(staticRig, { time: 10, action: "move" })
    .diagnostics.worldAdvance, 0);
  const labeled: RigNode = { id: "fake-foot", kind: "foot", role: "left",
    center: { x: 1, y: 1 }, anchor: { x: 1, y: 1 },
    tip: { x: 1, y: 10 }, sourceIds: [], readiness: 1 };
  assert.equal(buildFunctionalGraph([labeled]).limbs.length, 0);
});

test("[MOT-001/A2] generated material shares its parent hinge and retains exact ancestry", () => {
  const { graph, material } = fixture();
  const rig = buildFunctionalGraph(material.nodes);
  const pose = poseFunctionalGraph(rig, { time: 1.25, action: "move" });
  for (const binding of material.bindings) {
    const child = graph.tissues.find(t => t.id === binding.tissueId)!;
    const cells = graph.cells.filter(cell => cell.tissueId === child.id);
    assert.ok(cells.length >= 4);
    assert.ok(cells.every(cell => cell.provenance === "generated" &&
      cell.operationId && cell.sourceIds.every(id =>
        graph.sourceCells.some(source => source.id === id))));
    assert.ok(binding.evidence.linkIds.length >= 1);
    const controller = pose.transforms[binding.rigId];
    approx(d(poseLinkedMaterial(binding.anchor, binding, controller),
      controller.anchor), 0);
    approx(d(poseLinkedMaterial(binding.tip, binding, controller),
      controller.tip), 0);
    const parent = pose.transforms["body-region"];
    approx(d(transformLocomotionPoint(binding.anchor, parent),
      controller.anchor), 0, 0.005);
  }
});

test("[MOT-001/A2] development changes functionality, not the genome or earlier time", () => {
  const young = fixture(false), adult = fixture(true);
  assert.equal(young.graph.sourceFingerprint, adult.graph.sourceFingerprint);
  assert.deepEqual(young.graph.sourceCells, adult.graph.sourceCells);
  const youngRig = buildFunctionalGraph(young.material.nodes);
  const adultRig = buildFunctionalGraph(adult.material.nodes);
  assert.equal(poseFunctionalGraph(youngRig, { action: "move", time: 8 })
    .worldPosition.x, youngRig.center.x);
  assert.ok(poseFunctionalGraph(adultRig, { action: "move", time: 8 })
    .worldPosition.x > adultRig.center.x);
  const query = (time: number) => poseFunctionalGraph(adultRig, {
    action: "move", time, pace: 1.03125, amplitude: 0.8,
  });
  const earliest = query(0.5);
  query(80);
  query(3.75);
  assert.deepEqual(query(0.5), earliest);
  assert.deepEqual(query(80), poseFunctionalGraph(adultRig, {
    action: "move", time: 80, pace: 1.03125, amplitude: 0.8,
  }));
  for (let t = 0; t < 12; t += 0.125) {
    const p = query(t), next = query(t + 0.125);
    assert.ok(d(p.transforms["body-region"].anchor,
      next.transforms["body-region"].anchor) <= 2);
  }
});

test("[MOT-001/A2] arbitrary limbless player ink remains playable but has no fictional travel", () => {
  const rows = ["...#...", ".#####.", "##...##", ".#####.", "...#..."];
  const parts: PetPart[] = [{
    id: "strange-ink", kind: "body", name: "Untyped", parentId: null,
    position: { x: 0, y: 0 }, pixels: rows.flatMap((row, y) =>
      [...row].flatMap((ch, x) => ch === "#" ?
        [{ x, y, color: "#aa99cc" }] : [])),
  }];
  const sim = createSimulation(parts, "MOT-unfamiliar-3");
  const early = sim.frameAt(2, { time: 2, action: "move" });
  const after = sim.frameAt(2, { time: 8, action: "move" });
  const diagnostic = after.interaction.diagnostics as {
    worldAdvance?: number; materialLocomotionEvidence?: unknown[];
  };
  assert.equal(diagnostic.worldAdvance, 0);
  assert.equal(after.capabilities.canMove, false);
  assert.ok(Array.isArray(diagnostic.materialLocomotionEvidence));
  assert.deepEqual(sim.frameAt(2, { time: 2, action: "move" }), early);
  assert.ok(after.pixels.every(p => p.x >= 0 && p.x < 64 && p.y >= 0 && p.y < 64));
  assert.deepEqual(sim.genome, createSimulation(parts, "MOT-unfamiliar-3").genome);
});
