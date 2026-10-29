import test from "node:test";
import assert from "node:assert/strict";
import { drawingFromMonochromeRows } from "../src/drawing-features";
import { inferAnatomy, paintStroke } from "../src/drawing";
import { chooseAuthoredReference } from "../src/lineage/authored-neighbor";
import { inferSourceAffinities } from "../src/lineage/source-classifier";
import { compileRuntimeBiology } from "../src/integration";
import { FANTASY_PATHS } from "../src/phylogeny/fantasy-paths";
import { createPhylogenyView } from "../src/phylogeny";
import { createMaterialGraph } from "../src/development/material-graph";
import { sourceFeatures } from "../src/development/anatomical-features";
import { anatomicalContinuityFailure } from "../src/development/anatomical-continuity";
import { materialInputs, drawing } from "./alg-development-fixtures";
import type { PartKind, PetPart } from "../src/simulation/model";

const seeded = (parts: PetPart[], seed = "AUTHORED-BRUSH") => {
  const { atlas, genome } = materialInputs(parts, seed);
  return { atlas, genome };
};
const typed = (kind: PartKind, id: string, x: number, y: number): PetPart => ({
  id, kind, name: kind, parentId: null, position: { x: 0, y: 0 },
  pixels: [{ x, y, color: "#AAAAAA" }],
});

test("[AUTHORED/A1] default and unselected monochrome geometry never invent anatomy", () => {
  for (const rows of [
    ["#####", "#.#.#", "#####", "#...#", "#####"],
    ["#.#.#", ".###.", "#.#.#", ".#.#."],
    ["######", "##..##", "######"],
  ]) {
    const parts = drawingFromMonochromeRows(rows);
    assert.equal(parts.length, 1);
    assert.equal(parts[0].kind, "body");
    assert.equal(parts[0].parentId, null);
  }
  const raw = drawingFromMonochromeRows(["#####", "#...#", "#.#.#", "#...#", "#####"]);
  const { atlas } = seeded(raw);
  const graph = createMaterialGraph(atlas);
  const contract = sourceFeatures(graph.sourceCells);
  assert.equal(contract.features.filter(f => f.kind === "eye").length, 0);
  assert.equal(contract.features.filter(f => f.kind === "mouth").length, 0);
  assert.ok(contract.features.every(f => f.ports.length === 0),
    "geometric extrema must not become implicitly protected appendages");
});

test("[AUTHORED/A2] selected anatomical labels are immutable even under geometry changes", () => {
  const kinds: PartKind[] = ["body", "eye", "eye", "wing", "horn"];
  const near = kinds.map((kind, i) => typed(kind, "part-" + i, 7 + i, 8));
  const far = kinds.map((kind, i) => typed(kind, "part-" + i, i * 5, 28 - i * 5));
  for (const seed of ["alpha-1", "beta-2"]) {
    const a = seeded(near, seed), b = seeded(far, seed);
    assert.deepEqual(
      chooseAuthoredReference(a.atlas, seed)?.candidates.map(c => c.nodeId),
      chooseAuthoredReference(b.atlas, seed)?.candidates.map(c => c.nodeId),
      "geometry cannot affect developmental reference ranking",
    );
    assert.equal(inferSourceAffinities(a.atlas).bestAffinity,
      inferSourceAffinities(b.atlas).bestAffinity);
    assert.equal(compileRuntimeBiology(a.atlas, a.genome).scientificPetAssignment, null);
  }
});

test("[AUTHORED/A3] multiple separately drawn eyes remain separate authored parts", () => {
  let parts = paintStroke([], "body", "#AAAAAA",
    [{ x: 7, y: 7 }, { x: 18, y: 7 }, { x: 18, y: 20 }, { x: 7, y: 20 }]);
  parts = paintStroke(parts, "eye", "#FFFFFF", [{ x: 10, y: 11 }]);
  parts = paintStroke(parts, "eye", "#FFFFFF", [{ x: 15, y: 11 }]);
  assert.equal(parts.filter(p => p.kind === "eye").length, 2);
  const graph = createMaterialGraph(seeded(parts).atlas);
  const eyeParts = sourceFeatures(graph.sourceCells).features.filter(f => f.kind === "eye");
  assert.equal(eyeParts.length, 2);
  assert.equal(new Set(eyeParts.map(f => f.sourcePartId)).size, 2);
  assert.equal(anatomicalContinuityFailure(graph.sourceCells, graph.cells, graph), null);
  const deleted = graph.cells.filter(c => !eyeParts[0].sourceIds.includes(c.id));
  assert.match(anatomicalContinuityFailure(graph.sourceCells, deleted, graph) ?? "",
    /drawn-feature-lost/);
});

test("[AUTHORED/A4] near-looking marks never acquire parents or change selected kind", () => {
  const parts = inferAnatomy([
    typed("body", "body", 5, 5),
    typed("eye", "eye", 5, 6),
    typed("leg", "leg", 5, 7),
  ]);
  assert.deepEqual(parts.map(p => p.kind), ["body", "eye", "leg"]);
  assert.ok(parts.every(p => p.parentId === null),
    "unsupported semantic parent guessing must not occur");
});

test("[AUTHORED/A5] unlabeled blobs are seed-resolved, fantasy branches are real game references", () => {
  const paths = createPhylogenyView(FANTASY_PATHS);
  assert.deepEqual(paths.validate(), []);
  const parts = drawing(["####", "####", "####", "####"], "body");
  const { atlas } = seeded(parts);
  const outcomes = new Set<string>();
  for (let i = 0; i < 24; i++) {
    const chosen = chooseAuthoredReference(atlas, "blob-" + i)!;
    assert.equal(chosen.status, "seeded-ambiguous");
    assert.deepEqual(chosen.authoredCounts, { body: 1 });
    assert.equal(chosen.roleEvidence, "player-selected-brush-only");
    assert.ok(paths.getNode(chosen.referenceId));
    outcomes.add(chosen.referenceId);
  }
  assert.ok(outcomes.size > 1, "identical body ink can have distinct seed paths");
  assert.ok([...outcomes].some(id => id.startsWith("fiction:")),
    "fantasy nodes must be reachable without inventing a named body part");
});
