import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import crypto from "node:crypto";
import { extractSubtree, parseNewick } from "./newick";
import { PROFILE_SPECS } from "./profiles";

const ROOT = path.resolve(process.cwd(), "data/phylogeny");
const UPSTREAM = path.join(ROOT, "upstream");
const TREE = path.join(UPSTREAM, "opentree16.1_tree/labelled_supertree/labelled_supertree.tre");
const ANNOTATIONS = path.join(UPSTREAM, "opentree16.1_tree/annotations.json");
const TAXONOMY = path.join(UPSTREAM, "ott3.7.3/taxonomy.tsv");

function digest(file: string) {
  return new Promise<string>((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    fs.createReadStream(file).on("data", (chunk) => hash.update(chunk)).on("error", reject).on("end", () => resolve(hash.digest("hex")));
  });
}

class Lines {
  private fd: number;
  private buffer = "";
  count = 0;
  constructor(file: string) { this.fd = fs.openSync(file, "w"); }
  add(value: string) { this.buffer += value + "\n"; this.count++; if (this.buffer.length > 1_000_000) this.flush(); }
  flush() { if (this.buffer) { fs.writeSync(this.fd, this.buffer); this.buffer = ""; } }
  close() { this.flush(); fs.closeSync(this.fd); }
}

async function build() {
  fs.mkdirSync(ROOT, { recursive: true });
  console.log("Extracting the exact Metazoa subtree from the pinned synthetic tree...");
  const animalNewick = extractSubtree(fs.readFileSync(TREE, "utf8"), "ott691846");
  fs.writeFileSync(path.join(ROOT, "animals.newick"), animalNewick);
  const nodes = parseNewick(animalNewick);
  const index = new Map(nodes.map((n, i) => [n.id, i]));
  const supportedProfileIds = new Set(PROFILE_SPECS.map((profile) => `ott${profile.ottId}`).filter((id) => index.has(id)));
  // The parser emits parents before descendants. Every represented node therefore
  // receives the nearest actual supported ancestor, with neutral Metazoa at root.
  const inheritedProfiles: string[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    inheritedProfiles[i] = supportedProfileIds.has(node.id) ? node.id : node.parent >= 0 ? inheritedProfiles[node.parent] : "ott691846";
    if (!inheritedProfiles[i]) throw new Error(`Missing inherited profile for ${node.id}`);
  }
  const annotations = JSON.parse(fs.readFileSync(ANNOTATIONS, "utf8"));
  if (annotations.synth_id !== "opentree16.1" || annotations.taxonomy_version !== "3.7draft3") throw new Error("Unexpected upstream versions");
  const retained = new Set<number>();
  const unresolved: Record<string, unknown>[] = PROFILE_SPECS.filter((p) => !index.has(`ott${p.ottId}`)).map((p) => ({ name: p.name, ottId: p.ottId, reason: "Taxonomic anchor absent from this synthetic tree; no fabricated node or edge is substituted." }));
  for (const p of PROFILE_SPECS) {
    let i = index.get(`ott${p.ottId}`);
    while (i !== undefined && i >= 0 && !retained.has(i)) { retained.add(i); i = nodes[i].parent; }
  }
  const runtimeMetadata = new Map<string, Record<string, unknown>>();
  const seen = new Uint8Array(nodes.length);
  const output = new Lines(path.join(ROOT, "nodes.jsonl"));
  const edges = new Lines(path.join(ROOT, "edges.tsv"));
  edges.add("parent_id\tchild_id");
  let leaves = 0, named = 0, supported = 0, conflicted = 0;
  const localAnnotations: Record<string, unknown> = {};
  for (const n of nodes) {
    if (!n.children.length) leaves++;
    if (n.parent >= 0) edges.add(`${nodes[n.parent].id}\t${n.id}`);
    const a = annotations.nodes[n.id];
    if (a) {
      localAnnotations[n.id] = a;
      if (Object.keys(a.supported_by ?? {}).length) supported++;
      if (Object.keys(a.conflicts_with ?? {}).length) conflicted++;
    }
  }
  edges.close();
  const record = (i: number, taxonomy?: Record<string, unknown>) => {
    const n = nodes[i];
    const a = annotations.nodes[n.id];
    const value = {
      id: n.id,
      parentId: n.parent < 0 ? null : nodes[n.parent].id,
      childCount: n.children.length,
      profileId: inheritedProfiles[i],
      profileKind: "fictional-development-profile",
      ...(taxonomy ?? { ottId: null, name: null, rank: null, taxonomyParentId: null, sourceIds: [], flags: [] }),
      evidence: a ? {
        supportedBy: Object.keys(a.supported_by ?? {}),
        conflictsWith: Object.keys(a.conflicts_with ?? {}),
        resolves: Object.keys(a.resolves ?? {}),
      } : { supportedBy: [], conflictsWith: [], resolves: [] },
    };
    output.add(JSON.stringify(value));
    if (retained.has(i)) runtimeMetadata.set(n.id, value);
    seen[i] = 1;
  };
  console.log(`Reading OTT metadata for ${nodes.length.toLocaleString()} represented animal nodes...`);
  let taxonomyParents = new Int32Array(16_000_000);
  // Taxonomy order is irrelevant: match stable IDs, never guess relationships from row order.
  for await (const line of readline.createInterface({ input: fs.createReadStream(TAXONOMY), crlfDelay: Infinity })) {
    const c = line.split("\t|\t");
    const numericId = Number(c[0]);
    if (Number.isInteger(numericId) && numericId > 0) {
      if (numericId >= taxonomyParents.length) {
        const expanded = new Int32Array(Math.max(taxonomyParents.length * 2, numericId + 1));
        expanded.set(taxonomyParents); taxonomyParents = expanded;
      }
      taxonomyParents[numericId] = Number(c[1]) || 0;
    }
    const id = `ott${c[0]}`;
    const i = index.get(id);
    if (i === undefined) continue;
    if (seen[i]) throw new Error(`Duplicate taxon ${id}`);
    const taxonomy = {
      ottId: Number(c[0]), name: c[2], rank: c[3],
      taxonomyParentId: c[1] ? `ott${c[1]}` : null,
      sourceIds: c[4] ? c[4].split(",") : [],
      flags: c[6]?.trim() ? c[6].trim().split(",") : [],
    };
    named++;
    record(i, taxonomy);
  }
  for (let i = 0; i < nodes.length; i++) if (!seen[i]) {
    if (nodes[i].id.startsWith("ott")) throw new Error(`Missing OTT metadata for ${nodes[i].id}`);
    record(i);
  }
  output.close();
  // Broken taxonomic anchors are resolved diagnostically, never forced into the tree.
  for (const missing of unresolved) {
    const target = Number(missing.ottId);
    const membership = new Int8Array(taxonomyParents.length);
    membership[target] = 1;
    const belongs = (id: number) => {
      const trail: number[] = [];
      let cursor = id;
      while (cursor > 0 && !membership[cursor]) {
        trail.push(cursor); cursor = taxonomyParents[cursor];
      }
      const result = cursor > 0 && membership[cursor] === 1;
      for (const entry of trail) membership[entry] = result ? 1 : -1;
      return result;
    };
    const members: number[] = [];
    for (let i = 0; i < nodes.length; i++) if (nodes[i].id.startsWith("ott") && belongs(Number(nodes[i].id.slice(3)))) members.push(i);
    if (!members.length) { missing.resolution = "no-represented-descendants"; continue; }
    const ancestorPath = (i: number) => { const result: number[] = []; while (i >= 0) { result.push(i); i = nodes[i].parent; } return result.reverse(); };
    let common = ancestorPath(members[0]);
    for (const i of members.slice(1)) {
      const candidate = ancestorPath(i); let j = 0;
      while (j < common.length && j < candidate.length && common[j] === candidate[j]) j++;
      common = common.slice(0, j);
    }
    const mrca = common[common.length - 1];
    let mrcaTips = 0;
    const pending = [mrca];
    while (pending.length) { const i = pending.pop()!; if (!nodes[i].children.length) mrcaTips++; else pending.push(...nodes[i].children); }
    const memberTips = members.filter((i) => !nodes[i].children.length).length;
    const fallback = [...common].reverse().find((i) => PROFILE_SPECS.some((p) => nodes[i].id === `ott${p.ottId}`));
    Object.assign(missing, { resolution: "mrca-of-all-represented-taxonomic-descendants", mrcaId: nodes[mrca].id, representedTaxa: members.length, representedTips: memberTips, mrcaTips, containsOtherTips: mrcaTips !== memberTips, fallbackProfileId: fallback === undefined ? "ott691846" : nodes[fallback].id });
  }
  fs.writeFileSync(path.join(ROOT, "annotations.json"), JSON.stringify({
    ...annotations, nodes: localAnnotations,
    extraction: { rootId: "ott691846", scope: "Every node in the represented Metazoa synthetic subtree" },
  }) + "\n");
  const runtimeNodes = [...retained].sort((a, b) => a - b).map((i) => {
    const n = nodes[i];
    const m = runtimeMetadata.get(n.id)!;
    return { id: n.id, parentId: n.parent < 0 ? null : nodes[n.parent].id,
      name: m.name, ottId: m.ottId, rank: m.rank,
      sourceChildCount: n.children.length,
      children: n.children.filter((c) => retained.has(c)).map((c) => nodes[c].id),
      evidence: m.evidence,
    };
  });
  const profiles = PROFILE_SPECS.filter((p) => index.has(`ott${p.ottId}`)).map((p) => ({
    id: `ott${p.ottId}`, name: p.name, ottId: p.ottId, traits: p.traits,
    kind: "fictional-development-profile", sourceAnchor: "exact-synthetic-node",
  }));
  const runtime = { datasetVersion: "opentree16.1/ott3.7.3", profileVersion: "infipet-animal-profiles-v1", rootId: "ott691846", nodes: runtimeNodes, profiles, unresolvedProfiles: unresolved };
  fs.writeFileSync(path.resolve("src/phylogeny/catalog-data.json"), JSON.stringify(runtime, null, 2) + "\n");
  const rawFiles = ["animals.newick", "nodes.jsonl", "edges.tsv", "annotations.json"];
  const sourceFiles = [
    { file: "upstream/opentree16.1_tree.tgz", url: "https://files.opentreeoflife.org/synthesis/opentree16.1/opentree16.1_tree.tgz" },
    { file: "upstream/ott3.7.3.tgz", url: "https://files.opentreeoflife.org/ott/ott3.7.3/ott3.7.3.tgz" },
    { file: "upstream/opentree16.1_tree/labelled_supertree/labelled_supertree.tre", url: "https://files.opentreeoflife.org/synthesis/opentree16.1/output/labelled_supertree/labelled_supertree.tre" },
    { file: "upstream/opentree16.1_tree/annotations.json", url: "https://files.opentreeoflife.org/synthesis/opentree16.1/output/annotated_supertree/annotations.json" },
    { file: "upstream/ott3.7.3/taxonomy.tsv", url: "https://files.opentreeoflife.org/ott/ott3.7.3/ott3.7.3.tgz" },
    { file: "upstream/ott-properties.json", url: "https://files.opentreeoflife.org/ott/ott3.7.3/properties.json" },
    { file: "upstream/synthesis-index.html", url: "https://files.opentreeoflife.org/synthesis/opentree16.1/output/index.html" },
  ];
  const files = await Promise.all([...sourceFiles, ...rawFiles.map((file) => ({ file, url: null }))].map(async (f) => ({ ...f, bytes: fs.statSync(path.join(ROOT, f.file)).size, sha256: await digest(path.join(ROOT, f.file)) })));
  const runtimeFile = path.resolve("src/phylogeny/catalog-data.json");
  const manifest = {
    schemaVersion: 2, datasetVersion: runtime.datasetVersion, profileVersion: runtime.profileVersion,
    retrievedOn: "2026-10-25", synthesisCompleted: annotations.date_completed,
    upstreamSyntheticTips: annotations.num_tips, taxonomyVersion: annotations.taxonomy_version,
    root: { id: "ott691846", name: "Metazoa" },
    coverage: { nodes: nodes.length, tips: leaves, edges: nodes.length - 1, namedTaxa: named, unnamedSyntheticNodes: nodes.length - named, nodesWithPhylogeneticSupport: supported, nodesWithConflictingInputs: conflicted, nodesWithInheritedProfile: inheritedProfiles.length, runtimeNodes: runtimeNodes.length, runtimeProfiles: profiles.length },
    unresolvedProfiles: unresolved,
    runtimeCatalog: { file: "src/phylogeny/catalog-data.json", bytes: fs.statSync(runtimeFile).size, sha256: await digest(runtimeFile) },
    license: { data: "CC0 where not limited by pre-existing terms; taxonomy properties declare cc0", url: "https://tree.opentreeoflife.org/opentree/about/licenses", taxonomyProperties: "upstream/ott-properties.json" },
    limits: ["All represented descendants of Metazoa in this pinned synthesis; not all living or extinct animal species.", "Many relationships are taxonomy-only. Polytomies and conflicting source annotations are retained.", "Branch lengths and divergence dates are absent from this source and are not invented.", "The source release page contains stale date/version prose; embedded annotations and pipeline metadata supply version/completion facts.", "Game developmental traits are authored adaptations, not inferred ancestral traits or mutation probabilities."],
    files,
  };
  fs.writeFileSync(path.join(ROOT, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  console.log(JSON.stringify(manifest.coverage, null, 2));
  console.log(`Runtime catalog has ${runtimeNodes.length} exact ancestry nodes and ${profiles.length} supported profiles.`);
  if (unresolved.length) console.log("Unsupported exact anchors:", unresolved);
}

build().catch((error) => { console.error(error); process.exitCode = 1; });
