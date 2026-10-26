import test from "node:test";
import assert from "node:assert/strict";
import {
  ancestry, getNode, resolveBiologicalConstraints,
} from "../src/phylogeny";

test("[PHY-002/A1] descendants inherit and refine evidence-backed developmental constraints", () => {
  const green = resolveBiologicalConstraints("ncbi:33090")!;
  const land = resolveBiologicalConstraints("ncbi:3193")!;
  const fungi = resolveBiologicalConstraints("ncbi:4751")!;
  const ascomycete = resolveBiologicalConstraints("ncbi:4890")!;
  assert.deepEqual(green.constraints.wallMaterial?.allowed, ["cellulose-rich", "other"]);
  assert.deepEqual(land.constraints.wallMaterial?.allowed, ["cellulose-rich"]);
  assert.equal(land.constraints.wallMaterial?.introducedBy, "ncbi:33090");
  assert.deepEqual(land.constraints.wallMaterial?.refinedBy, ["ncbi:3193"]);
  assert.deepEqual(fungi.constraints.wallMaterial?.allowed, ["chitin-glucan", "other"]);
  assert.deepEqual(ascomycete.constraints.wallMaterial?.allowed, ["chitin-glucan"]);
  assert.equal(ascomycete.constraints.wallMaterial?.introducedBy, "ncbi:4751");
  assert.deepEqual(ascomycete.constraints.wallMaterial?.refinedBy, ["ncbi:451864"]);
  assert.ok(land.operatorHints.some(op => op.operator === "branch-axis" && op.provenance === "scientific"));
  assert.ok(ascomycete.operatorHints.some(op => op.operator === "tip-extension" && op.provenance === "scientific"));
  assert.ok(land.constraints.growthPattern?.evidenceUrls.every(url => url.startsWith("https://")));
  assert.ok(resolveBiologicalConstraints("ott244265")?.operatorHints.some(op => op.operator === "tissue-remodeling"));
  assert.equal(resolveBiologicalConstraints("does-not-exist"), undefined);
});

test("[PHY-002/A2] ancestry is an immutable birth input, not a lifetime stage transition", () => {
  const fixed = resolveBiologicalConstraints("ncbi:3193")!;
  const initialParent = getNode(fixed.taxonId)?.parentId;
  const immutableChain = ancestry(fixed.taxonId).map(x => x.id);
  for (const hour of [0, 24, 48, 500, 12000]) {
    // A developmental engine may inspect this prior at any age or after care
    // events, but neither interface accepts a new lineage as a stage outcome.
    const state = resolveBiologicalConstraints(fixed.taxonId)!;
    assert.equal(state.taxonId, fixed.taxonId);
    assert.deepEqual(state.fixedAncestry, immutableChain);
    assert.equal(getNode(state.taxonId)?.parentId, initialParent);
    assert.ok(hour >= 0);
  }
  assert.equal(fixed.includesFiction, false);
});
