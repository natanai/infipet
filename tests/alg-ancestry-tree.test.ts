import test from "node:test";
import assert from "node:assert/strict";
import animalCatalog from "../src/phylogeny/catalog-data.json";
import {
  ancestry, childrenOf, commonAncestor, datasetVersion, fullRootId,
  getNode, getProvenance, isDescendant, lineageMembership,
  nearestSupportedProfile, nodes, parentOf, rootId, validatePhylogeny,
  crossKingdomVersion,
} from "../src/phylogeny";

test("[PHY-001/A1] sourced plant, fungal, and animal roots retain external IDs and versions", () => {
  assert.equal(rootId, animalCatalog.rootId);
  assert.equal(datasetVersion, animalCatalog.datasetVersion);
  assert.match(crossKingdomVersion, /2026-10-25/);
  for (const [id, taxonId] of [
    ["ncbi:2759", 2759], ["ncbi:33154", 33154],
    ["ncbi:33090", 33090], ["ncbi:4751", 4751],
    ["ncbi:3193", 3193], ["ncbi:451864", 451864],
  ] as const) {
    const provenance = getProvenance(id);
    assert.equal(provenance?.kind, "scientific");
    if (provenance?.kind !== "scientific") throw new Error("Missing scientific source");
    assert.ok(provenance.externalTaxonIds.some(ref => ref.database === "ncbi" && ref.id === taxonId));
    assert.ok(provenance.sourceVersion);
  }
  const animalRoot = getProvenance(rootId);
  assert.equal(animalRoot?.kind, "scientific");
  if (animalRoot?.kind !== "scientific") throw new Error("Missing animal crosswalk");
  assert.ok(animalRoot.externalTaxonIds.some(ref => ref.database === "ott" && ref.id === 691846));
  assert.ok(animalRoot.externalTaxonIds.some(ref => ref.database === "ncbi" && ref.id === 33208));
  for (const original of animalCatalog.nodes) {
    const current = getNode(original.id)!;
    assert.equal(current.id, original.id);
    assert.equal(current.ottId, original.ottId);
    assert.deepEqual(current.evidence, original.evidence);
    assert.deepEqual(current.children, original.children);
    if (original.id !== rootId) assert.equal(current.parentId, original.parentId);
  }
  assert.equal(nearestSupportedProfile("ott244265")?.name, "Mammalia");
  assert.equal(nearestSupportedProfile("ncbi:3193"), undefined);
});

test("[PHY-001/A2] all edges are sourced, acyclic, and queries are deterministic", () => {
  assert.deepEqual(validatePhylogeny(), []);
  assert.equal(getNode(fullRootId)?.name, "Eukaryota");
  assert.equal(parentOf(fullRootId), undefined); // ancestry beyond Eukaryota is unrepresented
  assert.equal(parentOf(rootId)?.name, "Opisthokonta");
  assert.equal(parentOf("ncbi:4751")?.id, "ncbi:33154");
  assert.equal(parentOf("ncbi:3193")?.id, "ncbi:131221");
  assert.deepEqual(
    childrenOf("ncbi:33154").map(node => node.id).sort(),
    ["ncbi:4751", rootId].sort(),
  );
  assert.equal(commonAncestor(rootId, "ncbi:4751")?.id, "ncbi:33154");
  assert.equal(commonAncestor("ncbi:3193", "ncbi:5204")?.id, fullRootId);
  assert.equal(commonAncestor("ncbi:3193", "unknown"), undefined);
  assert.deepEqual(ancestry("ncbi:3193").map(n => n.id), [
    "ncbi:3193", "ncbi:131221", "ncbi:35493", "ncbi:33090", fullRootId,
  ]);
  assert.deepEqual(ancestry("unknown"), []);
  assert.ok(isDescendant("ott244265", rootId));
  assert.ok(lineageMembership("ott244265", "ncbi:33154"));
  assert.ok(!lineageMembership("ncbi:3041", rootId));
  assert.equal(new Set(nodes.map(node => node.id)).size, nodes.length);
  for (const node of nodes) {
    const parents = ancestry(node.id);
    assert.equal(new Set(parents.map(n => n.id)).size, parents.length);
    assert.equal(parents.at(-1)?.id, fullRootId);
    if (!node.parentId) continue;
    const source = getProvenance(node.id);
    assert.equal(source?.kind, "scientific");
    if (source?.kind !== "scientific") throw new Error("Missing provenance");
    assert.ok(source.parentEdgeSourceUrl?.startsWith("https://"));
  }
});
