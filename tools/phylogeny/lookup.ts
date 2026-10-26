import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

export type RawAnimalNode = {
  id: string;
  parentId: string | null;
  childCount: number;
  ottId: number | null;
  name: string | null;
  rank: string | null;
  taxonomyParentId: string | null;
  sourceIds: string[];
  flags: string[];
  /** Derived game data; not an OpenTree ancestral-trait inference. */
  profileId: string;
  profileKind: "fictional-development-profile";
  evidence: { supportedBy: string[]; conflictsWith: string[]; resolves: string[] };
};

/** Offline streaming lookup. Never imported into the app or backed by a bulk app index. */
export async function lookupRawNode(id: string | number, file = path.resolve("data/phylogeny/nodes.jsonl")): Promise<RawAnimalNode | undefined> {
  const sourceId = typeof id === "number" ? `ott${id}` : id;
  if (!/^(?:ott\d+|mrcaott\d+ott\d+)$/.test(sourceId)) throw new Error("Expected an OTT ID or exact synthetic MRCA ID");
  const stream = fs.createReadStream(file);
  const lines = readline.createInterface({ input: stream, crlfDelay: Infinity });
  try {
    const prefix = `{"id":${JSON.stringify(sourceId)},`;
    for await (const line of lines) if (line.startsWith(prefix)) return JSON.parse(line) as RawAnimalNode;
    return undefined;
  } finally {
    lines.close();
    stream.destroy();
  }
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("tools/phylogeny/lookup.ts")) {
  const query = process.argv[2];
  if (!query) { console.error("Usage: tsx tools/phylogeny/lookup.ts ott35864"); process.exitCode = 1; }
  else lookupRawNode(/^\d+$/.test(query) ? Number(query) : query).then((node) => {
    if (node) console.log(JSON.stringify(node, null, 2));
    else { console.error(`No represented animal node: ${query}`); process.exitCode = 1; }
  }).catch((error) => { console.error(error); process.exitCode = 1; });
}
