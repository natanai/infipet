import type { SourceAtlas } from "../simulation/source-atlas";
import {
  getNode, getProvenance, lineageMembership,
} from "../phylogeny";
import type { PhylogenyView } from "../phylogeny";
import { inferInkMorphology, type InkMorphology } from "./ink-signature";

/**
 * Morphological affinities are hypotheses, not taxonomic placements.
 * In particular, "plant" and "fungus" are supported even without the
 * multi-kingdom source tree; no fictitious or unsourced taxon IDs are emitted.
 */
export type BiologicalAffinity = "animal" | "plant" | "fungus" | "unresolved";
export type ObservedFeature = "brush:declared" | "brush:unspecified";

export type AffinityEvidence = Readonly<{
  feature: ObservedFeature;
  /** Dimensionless 0..1 from the drawing, not player-authored anatomical labels. */
  measured: number;
  /** Heuristic scoring weight, not a statistically estimated likelihood. */
  weight: number;
  contribution: number;
}>;

/**
 * Compile-time binding to the merged, provenance-backed PHY-001 API.
 * The production adapter reads these canonical exports, not caller-created
 * provenance objects or a self-certifying substitute graph.
 */
export type ScientificPhylogenyPort = Pick<
  PhylogenyView, "getNode" | "getProvenance" | "lineageMembership"
>;
const verifiedTree: ScientificPhylogenyPort = {
  getNode, getProvenance, lineageMembership,
};

/** A possibility linked to an actually represented, sourced tree node. */
export type VerifiedTaxonAnchor = Readonly<{
  affinity: Exclude<BiologicalAffinity, "unresolved">;
  nodeId: string;
  source: string;
  sourceVersion: string;
  sourceNodeId: string;
  externalTaxonIds: readonly Readonly<{ database: "ott" | "ncbi"; id: number }>[];
}>;

/** Caller suggestions select reference possibilities, NEVER supply verification. */
export type AffinityTaxonomyOptions = Readonly<{
  /** Omitted affinities use only represented broad clade nodes. */
  candidateNodeIds?: Readonly<Partial<Record<
    Exclude<BiologicalAffinity, "unresolved">, readonly string[]
  >>>;
}>;

/** Versioned, represented ancestry-clade roots in Agent 1's verified graph. */
const cladeRoots = {
  animal: "ott691846",
  plant: "ncbi:33090",
  fungus: "ncbi:4751",
} as const;

/**
 * Do not let callers counterfeit taxonomy: derive every field from Agent 1's
 * graph and its provenance. Synthetic/internal MRCA nodes lacking an external
 * taxon ID cannot be presented as independently verified taxonomic placements.
 *
 * A returned anchor is only a reference to a *possible developmental prior*;
 * it never certifies that the ink is an organism of this ancestry.
 */
export function verifyTaxonPossibility(
  affinity: Exclude<BiologicalAffinity, "unresolved">,
  id: string,
): VerifiedTaxonAnchor | null {
  const rootId = cladeRoots[affinity];
  const node = verifiedTree.getNode(id);
  const root = verifiedTree.getNode(rootId);
  if (!node || !root || node.id !== id || root.id !== rootId ||
      node.origin !== "scientific" || root.origin !== "scientific") return null;
  const provenance = verifiedTree.getProvenance(id);
  const rootProvenance = verifiedTree.getProvenance(rootId);
  const authentic = (p: typeof provenance, nodeId: string, parentId: string | null) =>
    Boolean(p && p.kind === "scientific" &&
      (p.source === "Open Tree of Life" || p.source === "NCBI Taxonomy") &&
      p.sourceNodeId === nodeId &&
      p.sourceVersion.trim().length > 0 &&
      (parentId === null || Boolean(p.parentEdgeSourceUrl?.trim())) &&
      p.externalTaxonIds.some(ref =>
        Number.isSafeInteger(ref.id) && ref.id > 0 &&
        (ref.database === "ott" || ref.database === "ncbi") &&
        (nodeId.startsWith("ncbi:") ? ref.database === "ncbi" &&
          String(ref.id) === nodeId.slice(5) :
          nodeId.startsWith("ott") ? ref.database === "ott" &&
          String(ref.id) === nodeId.slice(3) : true)
      ));
  if (provenance?.kind !== "scientific" ||
      !authentic(provenance, id, node.parentId) ||
      !authentic(rootProvenance, rootId, root.parentId) ||
      !verifiedTree.lineageMembership(id, rootId)) return null;
  const scientific = provenance;
  return {
    affinity, nodeId: node.id, source: scientific.source,
    sourceVersion: scientific.sourceVersion,
    sourceNodeId: scientific.sourceNodeId!,
    externalTaxonIds: scientific.externalTaxonIds.map(t => ({
      database: t.database, id: t.id,
    })),
  };
}

export type RankedAffinity = Readonly<{
  affinity: BiologicalAffinity;
  score: number;
  probability: number;
  evidence: readonly AffinityEvidence[];
  /** Null means there is no *verified* matching scientific anchor yet. */
  taxon: VerifiedTaxonAnchor | null;
}>;

export type AffinityInference = Readonly<{
  version: "ink-affinity-v1";
  morphology: InkMorphology;
  candidates: readonly RankedAffinity[];
  bestAffinity: BiologicalAffinity;
  /** Normalized Shannon entropy: 1 = maximal ambiguity. */
  uncertainty: number;
  /** Difference between the largest and second-largest heuristic weights. */
  margin: number;
  confidence: "insufficient" | "tentative";
  /**
   * Outputs sum to 1, but are explicitly *heuristic normalized weights*.
   * They are NOT calibrated frequencies or probabilities of true ancestry.
   */
  probabilityKind: "heuristic-not-calibrated";
}>;

const affinities: readonly BiologicalAffinity[] = [
  "animal", "plant", "fungus", "unresolved",
];
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const round = (n: number) => Math.round(n * 1e8) / 1e8;

/**
 * The player's selected brush is the ONLY authority for anatomical meaning.
 * Do not infer animals, plants, fungi, eyes or limbs from outline, symmetry,
 * color, proximity, holes, or connected-component shape.
 *
 * Scores here are declared-part evidence for possible developmental references,
 * not scientific species assignments. Body-only drawings are unclassified
 * blobs: their actual development reference is selected from the tree using
 * the immutable seed, without relabelling any source material.
 *
 * inkMorphology is returned for physical/diagnostic statistics only. It never
 * contributes to an affinity score or anatomical label.
 */
export function inferSourceAffinities(
  atlas: SourceAtlas,
  taxonomy?: AffinityTaxonomyOptions,
): AffinityInference {
  const morphology = inferInkMorphology(atlas);
  const counts = new Map<string, number>();
  for (const part of atlas.patches) {
    if (!part.source.cells.length) continue;
    counts.set(part.kind, (counts.get(part.kind) ?? 0) + 1);
  }
  const count = (kind: string) => counts.get(kind) ?? 0;
  const animals = count("eye") + count("mouth") + count("ear") +
    count("head") + count("arm") + count("hand") + count("leg") +
    count("foot") + count("tail") + count("wing") + count("horn");
  const directed = animals + count("hair") + count("egg");
  const scores: Record<BiologicalAffinity, number> = {
    animal: Math.min(2, 0.23 * animals + 0.05 * (count("hair") + count("egg"))),
    plant: 0,
    fungus: 0,
    unresolved: directed ? 0.18 : 0.65,
  };
  // No dedicated leaf/root or fungal-tissue brush currently exists. Plant
  // and fungal references remain valid seeded possibilities for body-only ink.
  const scored = affinities.map(affinity => {
    const score = scores[affinity];
    const taxon = affinity === "unresolved" || !morphology.signature.occupiedCells
      ? null
      : (taxonomy?.candidateNodeIds?.[affinity] ?? [cladeRoots[affinity]])
        .map(id => verifyTaxonPossibility(affinity, id))
        .find(candidate => candidate !== null) ?? null;
    // Exactly one transparent explanation of the declared-part-only score.
    // No image descriptor is ever used in this semantic decision.
    const evidence: AffinityEvidence[] = [{
      feature: directed ? "brush:declared" : "brush:unspecified",
      measured: score > 0 ? 1 : 0,
      weight: score,
      contribution: score,
    }];
    return { affinity, score, taxon, evidence };
  });
  const weights = scored.map(item => Math.exp(item.score / 1.7));
  const sum = weights.reduce((n, v) => n + v, 0);
  const candidates = scored.map((item, i) => ({
    ...item, probability: weights[i] / sum,
  })).sort((a, b) => b.probability - a.probability ||
    affinities.indexOf(a.affinity) - affinities.indexOf(b.affinity));
  const [first, second] = candidates;
  const entropy = -candidates.reduce(
    (n, c) => n + c.probability * Math.log(c.probability), 0,
  ) / Math.log(candidates.length);
  const margin = first.probability - second.probability;
  return {
    version: "ink-affinity-v1",
    morphology, candidates,
    bestAffinity: first.affinity,
    uncertainty: clamp01(entropy),
    margin,
    confidence: directed && first.affinity === "animal" &&
      first.probability >= 0.4 && margin >= 0.1
      ? "tentative" : "insufficient",
    probabilityKind: "heuristic-not-calibrated",
  };
}
