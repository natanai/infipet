import type { SourceAtlas } from "../simulation/source-atlas";
import type { PartKind } from "../simulation/model";
import { hash } from "../simulation/model";
import { createPhylogenyView } from "../phylogeny";
import { FANTASY_PATHS } from "../phylogeny/fantasy-paths";

/**
 * Play-only nearest-reference search over the supported phylogenetic graph.
 * Observations are the PLAYER-SELECTED BRUSH LABELS and their separate source
 * parts; pixel coordinates, silhouette, distance, color, symmetry, cavities,
 * texture and image recognition are not read or used.
 *
 * Distance is a deterministic, documented heuristic against represented
 * reference anatomical role priors, NOT a diagnosis of ancestry. Equal labels
 * with any different valid geometry give the same ranking for a fixed seed.
 * The single pet retains its actual immutable ancestry/source throughout life.
 */
export const AUTHORED_NEIGHBOR_VERSION = "authored-neighbor-v1" as const;
type Role = Exclude<PartKind, "body" | "decoration" | "egg">;
type Candidate = Readonly<{ id: string; roles: readonly Role[] }>;
/**
 * Coarse *reference* affordances only: never an adult template. These are
 * deliberately nonexclusive: horns and wings can also arise from ordinary
 * body material during later development, if physical/genetic conditions
 * support the operations. More detailed, evidence-backed taxa can extend
 * this catalogue without changing the fundamental source-ownership model.
 */
export const REFERENCE_ROLES: readonly Candidate[] = Object.freeze([
  { id: "ott691846", roles: [] },
  { id: "ott641033", roles: ["arm"] },
  { id: "ott802117", roles: ["head", "eye", "mouth", "foot"] },
  { id: "ott632179", roles: ["head", "eye", "mouth", "leg", "arm"] },
  { id: "ott773483", roles: ["head", "eye", "mouth", "tail"] },
  { id: "ott544595", roles: ["head", "eye", "mouth", "leg", "tail"] },
  { id: "ott244265", roles: ["head", "eye", "mouth", "ear", "leg", "tail", "hair"] },
  { id: "ott35881", roles: ["head", "eye", "mouth", "leg", "tail"] },
  { id: "ott81461", roles: ["head", "eye", "mouth", "wing", "leg", "tail"] },
  { id: "ncbi:33090", roles: [] },
  { id: "ncbi:3193", roles: [] },
  { id: "ncbi:4751", roles: [] },
  { id: "fiction:dragon", roles: ["head", "eye", "mouth", "leg", "tail", "wing", "horn"] },
  { id: "fiction:griffin", roles: ["head", "eye", "mouth", "wing", "leg", "tail"] },
  { id: "fiction:phoenix", roles: ["head", "eye", "wing", "leg", "tail"] },
  { id: "fiction:unicorn", roles: ["head", "eye", "mouth", "leg", "tail", "horn", "hair"] },
  { id: "fiction:merfolk", roles: ["head", "eye", "mouth", "arm", "hand", "tail"] },
  { id: "fiction:dryad", roles: ["head", "arm", "hair"] },
  { id: "fiction:mycelial-spirit", roles: [] },
  { id: "fiction:chimera", roles: ["head", "eye", "mouth", "leg", "tail", "horn"] },
]);
export type AuthoredReferenceCandidate = Readonly<{
  nodeId: string;
  /** Signed role agreement, before seed tiebreaking. */
  structuralScore: number;
  /** Deterministic, bounded tie-break only; cannot outweigh a role mismatch. */
  tieBreak: number;
}>;
export type AuthoredReference = Readonly<{
  version: typeof AUTHORED_NEIGHBOR_VERSION;
  referenceId: string;
  /** Nonempty, separately authored parts by selected brush; no geometry. */
  authoredCounts: Readonly<Partial<Record<PartKind, number>>>;
  roleEvidence: "player-selected-brush-only";
  status: "seeded-ambiguous" | "typed-heuristic";
  /**
   * Body-only (including non-anatomical decoration) starts undifferentiated.
   * Every supported real or fantastical tree node remains eligible; the
   * selected birth reference is orientation, not a phylogenetic gate.
   */
  developmentalPotential: "pluripotent" | "authored-specialized";
  candidates: readonly AuthoredReferenceCandidate[];
}>;
const roleSet = new Set<string>([
  "head", "arm", "hand", "leg", "foot", "eye", "mouth",
  "ear", "tail", "wing", "horn", "hair",
]);
export function authoredBrushCounts(atlas: SourceAtlas): Readonly<Partial<Record<PartKind, number>>> {
  const counts: Partial<Record<PartKind, number>> = {};
  for (const patch of atlas.patches) {
    // A patch is a distinct explicit user-selected or imported part. No raster
    // connected-component detection is performed here or used to relabel it.
    if (!patch.source.cells.length) continue;
    counts[patch.kind] = (counts[patch.kind] ?? 0) + 1;
  }
  return counts;
}
export function chooseAuthoredReference(atlas: SourceAtlas, seed: string): AuthoredReference | null {
  const counts = authoredBrushCounts(atlas);
  if (!Object.values(counts).some(n => n > 0)) return null;
  const tree = createPhylogenyView(FANTASY_PATHS);
  const used = Object.entries(counts).filter(([kind, n]) =>
    roleSet.has(kind) && n > 0);
  // Include the FULL represented tree rather than the short handpicked
  // reference list. Every real and fantastical branch can be a birth anchor
  // for an uncommitted Body organism, and no later branch is excluded.
  // Roles are annotations on a small set of nodes, not gates.
  const annotated = new Map(REFERENCE_ROLES.map(candidate => [candidate.id, candidate.roles]));
  for (const id of annotated.keys())
    if (!tree.getNode(id)) throw new Error("Unknown declared reference: " + id);
  const scored: AuthoredReferenceCandidate[] = tree.nodes.map(node => {
    if (!tree.resolveBiologicalConstraints(node.id))
      throw new Error("Unresolvable supported reference: " + node.id);
    const allowed = new Set(annotated.get(node.id) ?? []);
    // A declared anatomical role is evidence, not a biologically impossible
    // morphology if the reference does not list it. Do not reward absence of
    // user-authored parts or use birth pixel area as confidence.
    const structuralScore = used.reduce((sum, [kind, n]) =>
      sum + Math.min(3, n) * (allowed.has(kind as Role) ? 2 : -1), 0);
    const tieBreak = hash(seed + "|authored-neighbor|" + node.id) / 4294967296;
    return { nodeId: node.id, structuralScore, tieBreak };
  }).sort((a, b) => b.structuralScore - a.structuralScore ||
    b.tieBreak - a.tieBreak || a.nodeId.localeCompare(b.nodeId));
  return {
    version: AUTHORED_NEIGHBOR_VERSION,
    referenceId: scored[0].nodeId,
    authoredCounts: counts,
    roleEvidence: "player-selected-brush-only",
    status: used.length ? "typed-heuristic" : "seeded-ambiguous",
    developmentalPotential: used.length ? "authored-specialized" : "pluripotent",
    candidates: scored,
  };
}
