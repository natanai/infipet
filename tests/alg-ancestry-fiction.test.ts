import test from "node:test";
import assert from "node:assert/strict";
import {
  createPhylogenyView, getNode, getProvenance,
  type SpeculativeBranchInput,
} from "../src/phylogeny";

const inputs: SpeculativeBranchInput[] = [
  {
    id: "fiction:synthetic-surface",
    parentId: "ott691846",
    name: "Invented flexible surface",
    rationale: "Testing a hypothetical sheet-forming capability; not a real clade.",
    operatorHints: ["wall-deposition", "branch-axis"],
  },
  {
    id: "fiction:synthetic-variant",
    parentId: "fiction:synthetic-surface",
    name: "Invented layered variant",
    rationale: "A second explicitly fictional possibility.",
    operatorHints: ["surface-expansion"],
  },
];

test("[PHY-003/A1] every invented node is unmistakably fictional and excluded from scientific taxonomy", () => {
  const view = createPhylogenyView(inputs);
  for (const input of inputs) {
    const node = view.getNode(input.id);
    const provenance = view.getProvenance(input.id);
    assert.equal(node?.origin, "fictional");
    assert.equal(node?.ottId, null);
    assert.equal(provenance?.kind, "fictional");
    assert.equal(provenance?.externalTaxonIds.length, 0);
    assert.equal(provenance?.parentEdgeSourceUrl, null);
    assert.equal(provenance?.source, "infipet-speculative-v1");
  }
  assert.deepEqual(view.validate(), []);
  assert.equal(getNode(inputs[0].id), undefined);
  assert.equal(getProvenance("ott691846")?.kind, "scientific");
  assert.throws(() => createPhylogenyView([{ ...inputs[0], id: "ott999999" as SpeculativeBranchInput["id"] }]));
  assert.throws(() => createPhylogenyView([{ ...inputs[0], parentId: "missing" }]));
  assert.throws(() => createPhylogenyView([{ ...inputs[0], parentId: inputs[0].id }]));
});

test("[PHY-003/A2] fictional operators use the same typed developmental prior contract", () => {
  const view = createPhylogenyView(inputs);
  const prior = view.resolveBiologicalConstraints(inputs[1].id)!;
  assert.equal(prior.taxonId, inputs[1].id);
  assert.equal(prior.includesFiction, true);
  assert.deepEqual(prior.fixedAncestry.slice(0, 3), [
    "fiction:synthetic-variant", "fiction:synthetic-surface", "ott691846",
  ]);
  assert.deepEqual(prior.constraints.wallMaterial?.allowed, ["unwalled"]);
  assert.ok(prior.operatorHints.some(op => op.operator === "tissue-remodeling" && op.provenance === "scientific"));
  assert.ok(prior.operatorHints.some(op => op.operator === "wall-deposition" && op.provenance === "fictional"));
  assert.equal(view.commonAncestor(inputs[1].id, "ncbi:4751")?.id, "ncbi:33154");
  assert.equal(view.isDescendant(inputs[1].id, "ott691846"), true);
  assert.equal(view.getNode("ott691846")?.origin, "scientific");
});
