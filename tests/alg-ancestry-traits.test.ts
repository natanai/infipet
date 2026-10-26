import test from "node:test";
import assert from "node:assert/strict";
import {
  ancestry, getNode, getProvenance, resolveBiologicalConstraints,
  developmentalPossibilities, lifetimeDevelopmentalTrajectory,
} from "../src/phylogeny";
import {
  candidateBirthPriors, candidateDevelopmentalMaps, describeCandidateTrajectory,
} from "../src/lineage/phylogeny-priors";

test("[PHY-002/A1] descendants inherit and refine sourced reference-clade constraints", () => {
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
  assert.equal(land.semantics, "reference-clade-evidence-not-lifetime-gate");
  assert.equal(resolveBiologicalConstraints("does-not-exist"), undefined);
  assert.equal(getProvenance("ncbi:3193")?.kind, "scientific");
});

test("[PHY-002/A2] one pet explores anatomical inspirations across kingdoms without scientific ancestry changes", () => {
  const birthId = "ott244265"; // Mammalia reference is NOT a proven diagnosis of the ink.
  const birthAncestry = ancestry(birthId).map(n => n.id);
  const originalParent = getNode(birthId)?.parentId;
  const references = ["ncbi:3193", "ncbi:4890", "ott244265"];
  const map = developmentalPossibilities(birthId, references)!;
  assert.deepEqual(map.fixedBirthReferenceLineage, birthAncestry);
  assert.deepEqual(map.possibilities.map(p => p.referenceId), references);
  assert.ok(map.possibilities.slice(0, 2).every(p =>
    p.referenceEdgeDistance > 0 &&
    p.availability === "reference-only-not-a-lifetime-permission-gate" &&
    p.role === "anatomical-inspiration"));
  assert.equal(map.possibilities[0].sharedReferenceAncestorId, "ncbi:2759");
  assert.equal(map.possibilities[1].sharedReferenceAncestorId, "ncbi:33154");
  assert.equal(developmentalPossibilities("unknown"), undefined);

  const waypoints = [
    { atHour: 20, anatomicalReferenceId: "ncbi:3193", influence: "seed" },
    { atHour: 72, anatomicalReferenceId: "ncbi:4890", influence: "care" },
    { atHour: 120, anatomicalReferenceId: "ott244265", influence: "combined" },
  ] as const;
  const life = lifetimeDevelopmentalTrajectory(birthId, waypoints);
  assert.deepEqual(life, lifetimeDevelopmentalTrajectory(birthId, waypoints));
  assert.deepEqual(life.fixedBirthReferenceLineage, birthAncestry);
  assert.deepEqual(life.waypoints.map(w => w.inspiration.referenceId), references);
  assert.ok(life.waypoints.every(w => w.transitionMeaning === "single-pet-ontogenetic-analogy"));
  assert.equal(life.waypoints[0].inspiration.provenance.kind, "scientific");
  assert.ok(life.waypoints[0].availableOperatorHints.some(op => op.operator === "wall-deposition"));
  assert.ok(life.waypoints[0].availableOperatorHints.some(op => op.operator === "tissue-remodeling"));
  assert.equal(life.execution, "development-engine-not-implemented");
  assert.deepEqual(ancestry(birthId).map(n => n.id), birthAncestry);
  assert.equal(getNode(birthId)?.parentId, originalParent);
  assert.throws(() => lifetimeDevelopmentalTrajectory(birthId, [
    { atHour: 20, anatomicalReferenceId: "ncbi:3193", influence: "seed" },
    { atHour: 20, anatomicalReferenceId: "ncbi:4890", influence: "care" },
  ]), /strictly increasing/);
  assert.throws(() => lifetimeDevelopmentalTrajectory(birthId, [
    { atHour: 3, anatomicalReferenceId: "not-a-taxon", influence: "seed" },
  ]), /Unrepresented anatomical inspiration/);
  assert.throws(() => lifetimeDevelopmentalTrajectory(birthId, [
    { atHour: Infinity, anatomicalReferenceId: "ncbi:3193", influence: "seed" },
  ]), /strictly increasing/);

  const inferred = candidateBirthPriors([birthId, "unknown", birthId]);
  assert.deepEqual(inferred.map(x => x.candidateId), [birthId]);
  assert.equal(inferred[0].development.semantics, "reference-clade-evidence-not-lifetime-gate");
  const maps = candidateDevelopmentalMaps([birthId, "unknown", birthId], references);
  assert.equal(maps.length, 1);
  assert.deepEqual(maps[0].possibilities.map(p => p.referenceId), references);
  assert.deepEqual(describeCandidateTrajectory(birthId, waypoints), life);
});
