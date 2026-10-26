import test from "node:test";
import assert from "node:assert/strict";
import { compileSources } from "../src/simulation/material";
import { describeSource } from "../src/simulation/source-atlas";
import { inferInkMorphology } from "../src/lineage/ink-signature";
import {
  inferSourceAffinities,
  type VerifiedTaxonAnchor,
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
  const sourceAnchor: VerifiedTaxonAnchor = {
    affinity: "plant", nodeId: "tree-supplied", source: "taxon-provider",
    sourceVersion: "verified-release", externalTaxonId: "external-provider-id",
    provenance: "verified-scientific",
  };
  const withAnchor = inferSourceAffinities(base, [sourceAnchor]);
  assert.deepEqual(withAnchor.candidates.find((c) => c.affinity === "plant")!.taxon, sourceAnchor);
  assert.equal(withAnchor.candidates.find((c) => c.affinity === "animal")!.taxon, null);
  assert.equal(withAnchor.candidates.find((c) => c.affinity === "unresolved")!.taxon, null);
});
