import test from "node:test";
import assert from "node:assert/strict";
import { createMaterialGraph, reconstructMaterialGraph, materialSourceAncestry } from "../src/development/material-graph";
import { compileMaterialDevelopment, materialDevelopmentAt, MATERIAL_LIMITS } from "../src/development/operators";
import { fixtures, drawing, materialInputs } from "./alg-development-fixtures";

test("[DEV-001/A1] every cell has original authored source ancestry, including generated growth", () => {
  for (const [name, art] of Object.entries(fixtures)) {
    const { atlas, genome } = materialInputs(art);
    const graph = createMaterialGraph(atlas);
    const original = art.flatMap(p => p.pixels);
    assert.equal(graph.sourceCells.length, original.length, name);
    assert.deepEqual(graph.cells, graph.sourceCells, name);
    assert.ok(graph.sourceCells.every(c =>
      c.provenance === "authored" && c.sourceIds.length === 1 &&
      c.sourceIds[0] === c.id && c.operationId === null), name);
    const program = compileMaterialDevelopment(atlas, genome);
    assert.deepEqual(materialDevelopmentAt(program, 0).cells, graph.sourceCells, name);
    for (const hour of [20, 70, 130, 240]) {
      const frame = materialDevelopmentAt(program, hour);
      const originals = new Set(graph.sourceCells.map(c => c.id));
      assert.ok(frame.cells.every(c =>
        c.sourceIds.length > 0 && c.sourceIds.every(id => originals.has(id))), name);
      assert.ok(frame.cells.every(c => materialSourceAncestry(frame, c.id).length), name);
      assert.ok(frame.cells.every(c => c.x >= 0 && c.x < MATERIAL_LIMITS.world &&
        c.y >= 0 && c.y < MATERIAL_LIMITS.world), name);
      assert.ok(frame.cells.length - graph.sourceCells.length <= MATERIAL_LIMITS.addedCells, name);
      assert.deepEqual(frame.sourceCells, graph.sourceCells, name);
    }
  }
  const cavity = createMaterialGraph(materialInputs(fixtures.cavity).atlas);
  assert.ok(cavity.protectedVoids.includes("18,18"));
  const cavityInput = materialInputs(fixtures.cavity);
  const late = materialDevelopmentAt(
    compileMaterialDevelopment(cavityInput.atlas, cavityInput.genome), 240);
  assert.ok(late.cells.every(c => !c.provenance.startsWith("generated") ||
    !cavity.protectedVoids.includes(c.x + "," + c.y)));
  assert.equal(createMaterialGraph(materialInputs(fixtures.empty).atlas).cells.length, 0);
});

test("[DEV-001/A2] attachment identities, islands and replay survive time and serialization", () => {
  const assembled = [
    { ...drawing(["##", "##"], "body")[0], id: "origin" },
    { ...drawing(["#"], "tail")[0], id: "limb",
      position: { x: 2, y: 1 }, parentId: "origin" },
  ];
  const { atlas, genome } = materialInputs(assembled);
  const program = compileMaterialDevelopment(atlas, genome);
  const birth = program.source;
  assert.ok(birth.links.some(link => link.kind === "attachment" &&
    link.fromTissueId.startsWith("limb/island/")), JSON.stringify(birth.links));
  for (const hour of [0, 50, 100, 240]) {
    const graph = materialDevelopmentAt(program, hour);
    assert.deepEqual(graph.links.slice(0, birth.links.length), birth.links);
    assert.deepEqual(graph.tissues.slice(0, birth.tissues.length).map(t =>
      [t.id, t.parentId, t.sourcePartId]), birth.tissues.map(t =>
      [t.id, t.parentId, t.sourcePartId]));
    assert.deepEqual(reconstructMaterialGraph(JSON.parse(JSON.stringify(graph))), graph);
    assert.deepEqual(materialDevelopmentAt(program, hour), graph);
  }
  assert.deepEqual(materialDevelopmentAt(program, 20), materialDevelopmentAt(program, 20));
  // A single imported part may contain multiple genuine detached islands.
  const detached = createMaterialGraph(materialInputs(fixtures.disconnected).atlas);
  assert.equal(detached.tissues.length, 3);
  assert.equal(detached.links.length, 0);
});
