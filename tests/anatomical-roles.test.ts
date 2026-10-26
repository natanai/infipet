import test from "node:test";
import assert from "node:assert/strict";
import { clonePreset } from "../src/presets";
import { compileSources } from "../src/simulation/material";
import { describeSource } from "../src/simulation/source-atlas";
import { compileAnatomicalRoles } from "../src/simulation/anatomical-roles";
import { buildFunctionalGraph } from "../src/simulation/locomotion";
import type { PetPart } from "../src/simulation/model";

const atlas = (parts: PetPart[]) => describeSource(compileSources(parts, 1));

test("source quadruped roles yield four distinct persistent footfall phases and inherited foot roles", () => {
  const source = atlas(clonePreset("canine-cub"));
  const roles = compileAnatomicalRoles(source);
  for (const role of ["fore-left", "fore-right", "hind-left", "hind-right"]) {
    assert.equal(roles.get(`leg-${role}`), role);
    assert.equal(roles.get(`foot-${role}`), role);
  }
  const graph = buildFunctionalGraph(
    source.patches.map((p) => ({
      id: p.id,
      kind: p.kind,
      role: p.kind,
      center: p.center,
      anchor: p.source.pivot,
      tip: p.source.tip,
      sourceIds: [p.id],
      readiness: 1,
      parentId: p.source.parentId,
      anatomicalRole: roles.get(p.id),
    })),
    "quadruped",
  );
  assert.equal(new Set(graph.limbs.map((leg) => leg.phaseOffset)).size, 4);
  assert.deepEqual(
    new Set(graph.limbs.map((leg) => leg.role)),
    new Set(["fore-left", "fore-right", "hind-left", "hind-right"]),
  );
});

test("names, source IDs, source order, pigment and translation never choose the anatomical phase", () => {
  for (const preset of ["canine-cub", "sprout", "beetle"]) {
    const parts = clonePreset(preset),
      baseline = compileAnatomicalRoles(atlas(parts));
    const ids = new Map(
      parts.map((part, i) => [part.id, `anonymous-${parts.length - i}`]),
    );
    const edited = [...parts].reverse().map((part) => ({
      ...part,
      id: ids.get(part.id)!,
      name: "unrelated display name",
      parentId: part.parentId ? ids.get(part.parentId)! : null,
      position: { x: part.position.x + 2, y: part.position.y - 3 },
      pixels: [...part.pixels]
        .reverse()
        .map((pixel) => ({ ...pixel, color: "#774499" })),
    }));
    const renamed = compileAnatomicalRoles(atlas(edited));
    for (const [id, role] of baseline)
      assert.equal(renamed.get(ids.get(id)!), role, `${preset}: ${id}`);
  }
});

test("source mirrors preserve fore/hind facing and use a coherent drawing-plane side convention", () => {
  const mirror = (parts: PetPart[]) =>
    parts.map((part) => ({
      ...part,
      position: { x: 0, y: 0 },
      pixels: part.pixels.map((pixel) => ({
        ...pixel,
        x: 31 - part.position.x - pixel.x,
        y: part.position.y + pixel.y,
      })),
    }));
  const cub = clonePreset("canine-cub");
  const original = compileAnatomicalRoles(atlas(cub));
  const mirrored = compileAnatomicalRoles(atlas(mirror(cub)));
  for (const [id, role] of original) assert.equal(mirrored.get(id), role, id);
  const upright = compileAnatomicalRoles(atlas(mirror(clonePreset("sprout"))));
  assert.equal(upright.get("leg-left"), "right");
  assert.equal(upright.get("leg-right"), "left");
});

test("clearly separated six-leg clusters retain fore, middle and hind pairs", () => {
  const roles = compileAnatomicalRoles(atlas(clonePreset("beetle")));
  for (const side of ["left", "right"])
    for (const [index, rank] of ["fore", "middle", "hind"].entries()) {
      assert.equal(roles.get(`leg-${side}-${index}`), `${rank}-${side}`);
      assert.equal(roles.get(`foot-${side}-${index}`), `${rank}-${side}`);
    }
});

test("indistinguishable coincident supports share one conservative role instead of relying on IDs", () => {
  const body: PetPart = {
    id: "body",
    kind: "body",
    name: "body",
    parentId: null,
    position: { x: 8, y: 8 },
    pixels: Array.from({ length: 40 }, (_, i) => ({
      x: i % 10,
      y: Math.floor(i / 10),
      color: "#fff",
    })),
  };
  const legs: PetPart[] = [
    "fore-left",
    "fore-right",
    "hind-left",
    "hind-right",
  ].map((id) => ({
    id,
    kind: "leg",
    name: id,
    parentId: "body",
    position: { x: 12, y: 11 },
    pixels: Array.from({ length: 4 }, (_, y) => ({ x: 0, y, color: "#fff" })),
  }));
  const roles = compileAnatomicalRoles(atlas([body, ...legs]));
  assert.equal(new Set(legs.map((leg) => roles.get(leg.id))).size, 1);
  assert.equal(roles.size, 4);
});

test("compiled roles are cached read-only source data and need no developmental or pose state", () => {
  const source = atlas(clonePreset("canine-cub")),
    before = JSON.stringify(source);
  const a = compileAnatomicalRoles(source),
    b = compileAnatomicalRoles(source);
  assert.strictEqual(a, b);
  assert.equal("set" in a, false);
  assert.equal("delete" in a, false);
  assert.equal(JSON.stringify(source), before);
  assert.equal(compileAnatomicalRoles(atlas(clonePreset("bean"))).size, 0);
});

test("persistent source roles retain phase through screen reordering and anonymous folded rig nodes", () => {
  for (const preset of ["canine-cub", "sprout"]) {
    const source = atlas(clonePreset(preset)),
      roles = compileAnatomicalRoles(source);
    const aliases = new Map(
      source.patches.map((patch, i) => [
        patch.id,
        `node-${source.patches.length - i}`,
      ]),
    );
    const nodes = source.patches.map((p) => ({
      id: aliases.get(p.id)!,
      kind: p.kind,
      role: p.kind,
      center: p.center,
      anchor: p.source.pivot,
      tip: p.source.tip,
      sourceIds: [p.id],
      readiness: 1,
      parentId: p.source.parentId ? aliases.get(p.source.parentId) : null,
      anatomicalRole: roles.get(p.id),
    }));
    const before = buildFunctionalGraph(nodes);
    const fold = (p: { x: number; y: number }) => ({
      x: 64 - p.x,
      y: 64 - p.y,
    });
    const after = buildFunctionalGraph(
      [...nodes]
        .reverse()
        .map((node) => ({
          ...node,
          center: fold(node.center),
          anchor: fold(node.anchor),
          tip: fold(node.tip),
        })),
    );
    for (const limb of before.limbs) {
      const later = after.limbs.find((candidate) => candidate.id === limb.id)!;
      assert.equal(
        later.role,
        limb.role,
        `${preset}: role changed after folding`,
      );
      assert.equal(
        later.phaseOffset,
        limb.phaseOffset,
        `${preset}: ${limb.role} phase changed after folding`,
      );
    }
  }
});
