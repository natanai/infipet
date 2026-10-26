import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import { extractSubtree, parseNewick } from "./newick";

async function hashFile(file: string) {
  const hash = crypto.createHash("sha256");
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

/** Verifies every raw node/edge against the exact Newick, not sampled rows. */
export async function validateDataset(root = path.resolve("data/phylogeny"), verifyUpstream = true) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
  for (const entry of manifest.files) {
    if (!verifyUpstream && entry.file.startsWith("upstream/")) continue;
    const file = path.join(root, entry.file);
    assert.equal(fs.statSync(file).size, entry.bytes, `Bytes: ${entry.file}`);
    assert.equal(await hashFile(file), entry.sha256, `SHA256: ${entry.file}`);
  }
  const newick = fs.readFileSync(path.join(root, "animals.newick"), "utf8");
  if (verifyUpstream) {
    const full = fs.readFileSync(path.join(root, "upstream/opentree16.1_tree/labelled_supertree/labelled_supertree.tre"), "utf8");
    assert.equal(newick, extractSubtree(full, manifest.root.id), "Extraction preserves the complete source subtree verbatim");
  }
  const nodes = parseNewick(newick);
  const index = new Map(nodes.map((node, i) => [node.id, i]));
  const runtimePath = path.resolve(manifest.runtimeCatalog.file);
  assert.equal(await hashFile(runtimePath), manifest.runtimeCatalog.sha256);
  const runtime = JSON.parse(fs.readFileSync(runtimePath, "utf8"));
  const profileIds = new Set<string>(runtime.profiles.map((profile: { id: string }) => profile.id));
  const seen = new Uint8Array(nodes.length);
  let count = 0, named = 0, tips = 0;
  for await (const line of readline.createInterface({ input: fs.createReadStream(path.join(root, "nodes.jsonl")), crlfDelay: Infinity })) {
    const record = JSON.parse(line);
    const i = index.get(record.id);
    assert.notEqual(i, undefined, `Extra raw node ${record.id}`);
    const expected = nodes[i!];
    assert.equal(seen[i!], 0, `Duplicate raw node ${record.id}`);
    seen[i!] = 1;
    assert.equal(record.parentId, expected.parent < 0 ? null : nodes[expected.parent].id, `Source parent: ${record.id}`);
    assert.equal(record.childCount, expected.children.length, `Child count: ${record.id}`);
    let ancestorIndex = i!;
    while (!profileIds.has(nodes[ancestorIndex].id) && nodes[ancestorIndex].parent >= 0) ancestorIndex = nodes[ancestorIndex].parent;
    assert.ok(profileIds.has(nodes[ancestorIndex].id), `Supported ancestor: ${record.id}`);
    assert.equal(record.profileId, nodes[ancestorIndex].id, `Nearest supported profile: ${record.id}`);
    assert.equal(record.profileKind, "fictional-development-profile");
    if (record.ottId !== null) { named++; assert.equal(record.id, `ott${record.ottId}`); assert.ok(record.name); }
    else assert.match(record.id, /^mrcaott/);
    if (!record.childCount) tips++;
    count++;
  }
  assert.equal(count, nodes.length);
  assert.equal(count, manifest.coverage.nodes);
  assert.equal(named, manifest.coverage.namedTaxa);
  assert.equal(tips, manifest.coverage.tips);
  assert.equal(count, manifest.coverage.nodesWithInheritedProfile);
  const edgeSeen = new Uint8Array(nodes.length);
  let edges = 0;
  for await (const line of readline.createInterface({ input: fs.createReadStream(path.join(root, "edges.tsv")), crlfDelay: Infinity })) {
    if (line === "parent_id\tchild_id") continue;
    const [parent, child] = line.split("\t");
    const i = index.get(child);
    assert.notEqual(i, undefined);
    assert.equal(edgeSeen[i!], 0);
    edgeSeen[i!] = 1;
    assert.ok(nodes[i!].parent >= 0);
    assert.equal(parent, nodes[nodes[i!].parent].id);
    edges++;
  }
  assert.equal(edges, nodes.length - 1);
  assert.equal(edges, manifest.coverage.edges);
  for (const node of runtime.nodes) {
    const i = index.get(node.id)!;
    assert.notEqual(i, undefined);
    assert.equal(node.parentId, nodes[i].parent < 0 ? null : nodes[nodes[i].parent].id);
    for (const child of node.children) assert.equal(nodes[index.get(child)!].parent, i);
  }
  return { nodes: count, tips, edges, profiles: runtime.profiles.length, runtimeNodes: runtime.nodes.length };
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("tools/phylogeny/validate.ts")) {
  validateDataset(undefined, !process.argv.includes("--derived-only")).then((result) => console.log("Validated full animal extraction:", result)).catch((error) => { console.error(error); process.exitCode = 1; });
}
