import test from "node:test";
import assert from "node:assert/strict";
import { compileSources } from "../src/simulation/material";
import { describeSource } from "../src/simulation/source-atlas";
import { inferInkMorphology } from "../src/lineage/ink-signature";
import {
  createPhylogenyView, getNode, getProvenance, lineageMembership,
  type PhylogenyView,
} from "../src/phylogeny";
import {
  inferSourceAffinities,
  verifyTaxonPossibility,
  type ScientificPhylogenyPort,
} from "../src/lineage/source-classifier";
import type { PetPart } from "../src/simulation/model";

function draw(rows: readonly string[], color = "#ffffff"): PetPart[] {
  return [{
    id: "unlabeled", kind: "body", name: "anything", parentId: null,
    position: { x: 8, y: 8 },
    pixels: rows.flatMap((row, y) => [...row].flatMap((c, x) =>
      c === "#" ? [{ x, y, color }] : [])),
  }];
}
const atlas = (parts: PetPart[]) => describeSource(compileSources(parts, 1));
const rank = (rows: readonly string[]) => inferSourceAffinities(atlas(draw(rows)));

test("[OBS-002/A1] empty, simple, disconnected, and fantastical ink remain unresolved without animal bias", () => {
  for (const rows of [
    [], ["###", "###", "###"], ["#.......#"], 
    ["#.#.#.#", ".#####.", "#..#..#"],
  ]) {
    const result = rank(rows);
    assert.equal(result.confidence, "insufficient");
    assert.ok(result.candidates.find((c) => c.affinity === "animal")!.probability < 0.5);
    assert.ok(result.candidates.some((c) => c.affinity === "plant"));
    assert.ok(result.candidates.some((c) => c.affinity === "fungus"));
    assert.ok(result.candidates.some((c) => c.affinity === "unresolved"));
    assert.ok(result.uncertainty >= 0 && result.uncertainty <= 1);
  }
  assert.equal(rank([]).bestAffinity, "unresolved");
  assert.equal(rank([]).morphology.observationStrength, 0);
});

test("[OBS-002/A2] geometric descriptors and inspectable alternatives are independent of authored labels", () => {
  const cross = ["..#....", "..#....", "..#....", "#######", "..#....", "..#....", "..#...."];
  const star = inferInkMorphology(atlas(draw(cross)));
  assert.ok(star.branchJunctions >= 1, JSON.stringify(star));
  assert.ok(star.branchEndpoints >= 3);
  assert.ok(star.repeatedAppendages >= 2);
  assert.equal(star.cavityCount, 0);
  const bilateral = inferInkMorphology(atlas(draw([
    "...#...", "..###..", ".#####.", "#######", ".#####.", "..###..", "...#...",
  ])));
  assert.equal(bilateral.bilateralSymmetry, 1);
  assert.equal(bilateral.radialOrganization, 1);
  const ring = inferInkMorphology(atlas(draw(["#####", "#...#", "#...#", "#...#", "#####"])));
  assert.equal(ring.cavityCount, 1);
  const fragments = inferInkMorphology(atlas(draw(["#.....#", ".......", "#.....#"])));
  assert.equal(fragments.detachedComponents, 3);
  assert.ok(fragments.attachedFraction < 1);

  const base = atlas(draw(cross));
  const recoloredAndRelabeled = draw(cross, "#123456").map((part) => ({
    ...part, kind: "wing" as const, name: "arbitrary label", id: "different",
    pixels: [...part.pixels].reverse(),
  }));
  assert.deepEqual(inferInkMorphology(base), inferInkMorphology(atlas(recoloredAndRelabeled)));

  const result = inferSourceAffinities(base);
  assert.equal(result.probabilityKind, "heuristic-not-calibrated");
  assert.ok(Math.abs(result.candidates.reduce((sum, c) => sum + c.probability, 0) - 1) < 1e-12);
  for (const candidate of result.candidates) {
    assert.equal(candidate.taxon, null);
    assert.ok(candidate.evidence.length > 0);
    for (const e of candidate.evidence) {
      assert.ok(Number.isFinite(e.measured) && Number.isFinite(e.contribution));
      assert.ok(e.measured >= 0 && e.measured <= 1);
    }
  }
});

test("[OBS-002/A2] real scientific references verify through merged PHY-001 graph, never caller-provided certification", () => {
  // Compile-time contract: Agent 1's concrete PhylogenyView and module exports
  // both satisfy the exported observation adapter, not an invented mock.
  const view: PhylogenyView = createPhylogenyView();
  const port: ScientificPhylogenyPort = view;
  const moduleExports: ScientificPhylogenyPort = {
    getNode, getProvenance, lineageMembership,
  };
  assert.deepEqual(view.validate(), []);
  const authentic = [
    ["animal", "ott691846", "ott", 691846],
    ["plant", "ncbi:33090", "ncbi", 33090],
    ["fungus", "ncbi:4751", "ncbi", 4751],
    ["plant", "ncbi:3193", "ncbi", 3193],
  ] as const;
  for (const [affinity, id, database, externalId] of authentic) {
    assert.equal(port.getNode(id)?.origin, "scientific");
    assert.equal(moduleExports.getNode(id)?.id, id);
    const expected = view.getProvenance(id);
    assert.equal(expected?.kind, "scientific");
    const observed = verifyTaxonPossibility(affinity, id);
    assert.ok(observed, "legitimate taxon did not resolve: " + id);
    assert.equal(observed.affinity, affinity);
    assert.equal(observed.nodeId, id);
    assert.equal(observed.source, expected.source);
    assert.equal(observed.sourceVersion, expected.sourceVersion);
    assert.equal(observed.sourceNodeId, id);
    assert.ok(observed.externalTaxonIds.some(ref =>
      ref.database === database && ref.id === externalId));
  }
  assert.equal(view.lineageMembership("ncbi:3193", "ncbi:33090"), true);
  assert.equal(view.lineageMembership("ncbi:4751", "ncbi:33090"), false);
  assert.equal(view.lineageMembership("ott691846", "ncbi:4751"), false);

  const cross = atlas(draw(["..#..", ".###.", "#####", ".###.", "..#.."]));
  const baseline = inferSourceAffinities(cross);
  const linked = inferSourceAffinities(cross, {});
  assert.equal(linked.candidates.length, 4);
  assert.deepEqual(linked.candidates.map(c => [c.affinity, c.probability]),
    baseline.candidates.map(c => [c.affinity, c.probability]));
  assert.equal(linked.uncertainty, baseline.uncertainty);
  assert.equal(linked.confidence, baseline.confidence);
  assert.equal(linked.candidates.find(c => c.affinity === "animal")?.taxon?.nodeId, "ott691846");
  assert.equal(linked.candidates.find(c => c.affinity === "plant")?.taxon?.nodeId, "ncbi:33090");
  assert.equal(linked.candidates.find(c => c.affinity === "fungus")?.taxon?.nodeId, "ncbi:4751");
  assert.equal(linked.candidates.find(c => c.affinity === "unresolved")?.taxon, null);
  assert.equal(inferSourceAffinities(atlas([]), {}).candidates.some(c => c.taxon !== null), false);

  const fictionalTree = createPhylogenyView([{
    id: "fiction:branching-bird", parentId: "ncbi:33090",
    name: "Illustrative hybrid", rationale: "Deliberately fictional art",
    operatorHints: ["branch-axis"],
  }]);
  assert.equal(fictionalTree.getNode("fiction:branching-bird")?.origin, "fictional");
  assert.equal(fictionalTree.getProvenance("fiction:branching-bird")?.kind, "fictional");

  // [OBS-002/A2] Reject external-looking but unsupported IDs, synthetic
  // MRCA placeholders without an external source ID, and wrong clades.
  for (const [affinity, id] of [
    ["plant", "ncbi:999999999"], ["plant", "ncbi:NotAnId"],
    ["animal", "mrcaott42ott3989"], ["plant", "fiction:branching-bird"],
    ["fungus", "fiction:branching-bird"], ["animal", "ncbi:3193"],
    ["plant", "ott691846"], ["fungus", "ncbi:33090"],
    ["plant", "ncbi:2759"],
  ] as const) {
    assert.equal(verifyTaxonPossibility(affinity, id), null,
      "unverified placement must be rejected: " + affinity + "/" + id);
  }
  assert.equal(view.getNode("mrcaott42ott3989")?.origin, "scientific");
  assert.deepEqual(view.getProvenance("mrcaott42ott3989")?.externalTaxonIds, []);
  const nominations = inferSourceAffinities(cross, {
    candidateNodeIds: {
      plant: ["fiction:branching-bird", "ncbi:3193"],
      animal: ["ncbi:3193", "unknown:alien"],
      fungus: ["ncbi:33090"],
    },
  });
  assert.equal(nominations.candidates.find(c => c.affinity === "plant")?.taxon?.nodeId,
    "ncbi:3193");
  assert.equal(nominations.candidates.find(c => c.affinity === "animal")?.taxon, null);
  assert.equal(nominations.candidates.find(c => c.affinity === "fungus")?.taxon, null);
  assert.deepEqual(nominations.candidates.map(c => [c.affinity, c.probability]),
    baseline.candidates.map(c => [c.affinity, c.probability]));
});
