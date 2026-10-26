import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import { animalProfiles, ancestry, childrenOf, datasetVersion, getNode, isDescendant, nearestSupportedProfile, nodes, rootId, unresolvedProfiles } from "../src/phylogeny";
import { extractSubtree, parseNewick } from "../tools/phylogeny/newick";
import { lookupRawNode } from "../tools/phylogeny/lookup";

test("pinned compact animal catalog is source-derived, connected and bounded", () => {
  assert.equal(datasetVersion, "opentree16.1/ott3.7.3");
  assert.equal(rootId, "ott691846");
  assert.ok(nodes.length < 200);
  assert.equal(animalProfiles.length, 19);
  for (const node of nodes) {
    const path = ancestry(node.id);
    assert.equal(path[0].id, node.id);
    assert.equal(path.at(-1)?.id, rootId);
    assert.equal(new Set(path.map((entry) => entry.id)).size, path.length);
    for (const child of childrenOf(node.id)) assert.equal(child.parentId, node.id);
  }
  const manifest = JSON.parse(fs.readFileSync("data/phylogeny/manifest.json", "utf8"));
  const runtime = fs.readFileSync("src/phylogeny/catalog-data.json");
  assert.equal(crypto.createHash("sha256").update(runtime).digest("hex"), manifest.runtimeCatalog.sha256);
  assert.ok(manifest.coverage.nodes > 1_000_000);
  assert.equal(manifest.coverage.edges, manifest.coverage.nodes - 1);
  assert.equal(manifest.coverage.nodesWithInheritedProfile, manifest.coverage.nodes);
});

test("offline lookup resolves unbundled raw taxa to their actual nearest supported ancestor", {
  skip: !fs.existsSync("data/phylogeny/nodes.jsonl")
    ? "Excluded 560 MB raw dataset is required for this offline integration test"
    : false,
}, async () => {
  assert.equal(getNode("ott35864"), undefined);
  const crocodile = await lookupRawNode(35864);
  assert.equal(crocodile?.name, "Crocodylus niloticus");
  assert.equal(crocodile?.profileId, "ott229562");
  assert.equal(crocodile?.profileKind, "fictional-development-profile");
  const placozoan = await lookupRawNode("ott570365");
  assert.equal(placozoan?.profileId, "ott570376");
  await assert.rejects(lookupRawNode("not-a-taxon"), /Expected an OTT ID/);
});

test("ancestry follows the scientific tree and avoids invented cross-clade edges", () => {
  assert.ok(isDescendant("ott81461", "ott229562")); // Aves, Tetrapoda
  assert.ok(isDescendant("ott244265", "ott125642")); // Mammalia, Chordata
  assert.ok(!isDescendant("ott81461", "ott244265"));
  assert.ok(!isDescendant("ott632179", "ott125642"));
  assert.ok(isDescendant(rootId, rootId));
  assert.equal(nearestSupportedProfile("ott81461")?.name, "Aves");
  assert.equal(getNode("unrecognized"), undefined);
  assert.deepEqual(ancestry("unrecognized"), []);
  assert.equal(nearestSupportedProfile("unrecognized"), undefined);
});

test("broken source clades remain explicitly unresolved", () => {
  assert.equal(getNode("ott195672"), undefined);
  assert.ok(unresolvedProfiles.some((entry) => entry.name === "Crocodylia"));
  assert.ok(!animalProfiles.some((entry) => entry.ottId === 195672));
});

test("iterative Newick extraction preserves all nodes, polytomies and unlabeled taxonomic MRCAs", () => {
  const tree = "((ott1,ott2,ott3)mrcaott1ott2,(ott4)ott5)ott6;";
  assert.equal(extractSubtree(tree, "mrcaott1ott2"), "(ott1,ott2,ott3)mrcaott1ott2;\n");
  const parsed = parseNewick(tree);
  assert.equal(parsed.length, 7);
  assert.equal(parsed[1].children.length, 3);
  assert.throws(() => parseNewick("(ott1,ott1)ott2;"), /Duplicate/);
  assert.throws(() => parseNewick("(ott1,ott2;"), /Unterminated/);
  assert.throws(() => extractSubtree(tree, "ott123"), /lacks/);
});
