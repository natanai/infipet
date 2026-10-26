import type { SourceAtlas } from "../simulation/source-atlas";
import { inferInkMorphology, type InkMorphology } from "./ink-signature";

/**
 * Morphological affinities are hypotheses, not taxonomic placements.
 * In particular, "plant" and "fungus" are supported even without the
 * multi-kingdom source tree; no fictitious or unsourced taxon IDs are emitted.
 */
export type BiologicalAffinity = "animal" | "plant" | "fungus" | "unresolved";
export type ObservedFeature =
  | "bilateralSymmetry" | "radialOrganization" | "elongation"
  | "branching" | "repeatedAppendages" | "cavities"
  | "detachment" | "attachment" | "scarceInk";

export type AffinityEvidence = Readonly<{
  feature: ObservedFeature;
  /** Dimensionless 0..1 from the drawing, not player-authored anatomical labels. */
  measured: number;
  /** Heuristic scoring weight, not a statistically estimated likelihood. */
  weight: number;
  contribution: number;
}>;

/**
 * A minimal structural read-only port implemented by Agent 1's PhylogenyView.
 * Crucially, callers pass a GRAPH, never self-certified scientific strings.
 * The graph is Infipet's verified taxonomic reference, not a pet genotype.
 */
export type ScientificPhylogenyPort = Readonly<{
  getNode: (id: string) => Readonly<{
    id: string;
    parentId: string | null;
    origin?: "scientific" | "fictional";
  }> | undefined;
  getProvenance: (id: string) => Readonly<{
    kind: "scientific" | "fictional";
    source: string;
    sourceVersion: string;
    sourceNodeId?: string;
    parentEdgeSourceUrl?: string | null;
    externalTaxonIds: readonly Readonly<{ database: "ott" | "ncbi"; id: number }>[];
  }> | undefined;
  lineageMembership: (id: string, ancestorId: string) => boolean;
}>;

/** A possibility linked to an actually represented, sourced tree node. */
export type VerifiedTaxonAnchor = Readonly<{
  affinity: Exclude<BiologicalAffinity, "unresolved">;
  nodeId: string;
  source: string;
  sourceVersion: string;
  sourceNodeId: string;
  externalTaxonIds: readonly Readonly<{ database: "ott" | "ncbi"; id: number }>[];
}>;

/** Callers may nominate IDs but cannot nominate or certify provenance. */
export type AffinityTaxonomyOptions = Readonly<{
  phylogeny: ScientificPhylogenyPort;
  /** Omitted affinities use only the represented high-level clade anchor. */
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
  phylogeny: ScientificPhylogenyPort,
): VerifiedTaxonAnchor | null {
  const rootId = cladeRoots[affinity];
  const node = phylogeny.getNode(id);
  const root = phylogeny.getNode(rootId);
  if (!node || !root || node.id !== id || root.id !== rootId ||
      node.origin !== "scientific" || root.origin !== "scientific") return null;
  const provenance = phylogeny.getProvenance(id);
  const rootProvenance = phylogeny.getProvenance(rootId);
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
  if (!authentic(provenance, id, node.parentId) ||
      !authentic(rootProvenance, rootId, root.parentId) ||
      !phylogeny.lineageMembership(id, rootId)) return null;
  const scientific = provenance!;
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

const terms: Record<BiologicalAffinity, readonly (readonly [ObservedFeature, number])[]> = {
  animal: [
    ["bilateralSymmetry", 0.34], ["repeatedAppendages", 0.62],
    ["elongation", 0.12], ["radialOrganization", 0.1],
  ],
  plant: [
    ["branching", 0.62], ["attachment", 0.17],
    ["elongation", 0.18], ["radialOrganization", 0.22],
  ],
  fungus: [
    ["branching", 0.58], ["detachment", 0.2],
    ["radialOrganization", 0.10], ["cavities", 0.08],
  ],
  unresolved: [
    ["scarceInk", 0.90], ["detachment", 0.42],
    ["cavities", 0.15],
  ],
};
const baseline: Record<BiologicalAffinity, number> = {
  animal: 0, plant: 0, fungus: 0, unresolved: 0.45,
};

function observed(m: InkMorphology): Record<ObservedFeature, number> {
  const count = m.signature.occupiedCells;
  return {
    bilateralSymmetry: m.bilateralSymmetry,
    radialOrganization: m.radialOrganization,
    elongation: m.elongation,
    branching: clamp01(m.branchJunctions / 3),
    repeatedAppendages: clamp01(m.repeatedAppendages / 5),
    cavities: clamp01(m.cavityCount / 3),
    detachment: clamp01(m.detachedComponents / 4),
    attachment: count ? clamp01(m.attachedFraction * (m.branchJunctions > 0 ? 1 : 0)) : 0,
    scarceInk: 1 - m.observationStrength,
  };
}

/**
 * Pure, seed-independent candidate ranking. Silhouette-only evidence can
 * motivate affinities, but cannot diagnose cellular structure, physiology,
 * reproductive mode, genetic lineage, or whether a drawing is fictional.
 */
export function rankBiologicalAffinities(
  morphology: InkMorphology,
  taxonomy?: AffinityTaxonomyOptions,
): AffinityInference {
  const values = observed(morphology);
  const scored = affinities.map((affinity) => {
    const evidence = terms[affinity].map(([feature, weight]) => ({
      feature, measured: round(values[feature]), weight,
      contribution: round(values[feature] * weight),
    }));
    const score = baseline[affinity] +
      evidence.reduce((total, item) => total + item.contribution, 0);
    const taxon = affinity === "unresolved" || !taxonomy ? null : (
      (taxonomy.candidateNodeIds?.[affinity] ?? [cladeRoots[affinity]])
        .map(id => verifyTaxonPossibility(affinity, id, taxonomy.phylogeny))
        .find(candidate => candidate !== null) ?? null
    );
    return { affinity, evidence, score, taxon };
  });
  // Deliberate high-temperature softmax: simple geometric resemblances
  // cannot produce unwarranted, near-certain biological assignments.
  const exps = scored.map((item) => Math.exp(item.score / 1.7));
  const total = exps.reduce((sum, value) => sum + value, 0);
  const candidates: RankedAffinity[] = scored.map((item, i) => ({
    ...item, probability: exps[i] / total,
  })).sort((a, b) => b.probability - a.probability ||
    affinities.indexOf(a.affinity) - affinities.indexOf(b.affinity));
  const [first, second] = candidates;
  const margin = first.probability - second.probability;
  const entropy = -candidates.reduce((sum, c) =>
    sum + c.probability * Math.log(c.probability), 0) / Math.log(candidates.length);
  return {
    version: "ink-affinity-v1", morphology, candidates,
    bestAffinity: first.affinity, uncertainty: clamp01(entropy),
    margin,
    confidence: morphology.observationStrength > 0.75 &&
      first.probability >= 0.4 && margin >= 0.1 ? "tentative" : "insufficient",
    probabilityKind: "heuristic-not-calibrated",
  };
}

/**
 * Integration usage after Agent 1 is merged:
 *
 * import * as phylogeny from "../phylogeny";
 * const observed = inferSourceAffinities(atlas, {
 *   phylogeny,
 *   candidateNodeIds: { plant: ["ncbi:3193"] },
 * });
 * // observed.candidates are hypotheses, NOT a committed taxonomic identity.
 * // Absence of graph verification leaves candidate.taxon null.
 *
 * Seed, care, time and the single pet's future developmental trajectory belong
 * to Integration; neither this method nor its input mutates its birth ancestry.
 */
export function inferSourceAffinities(
  atlas: SourceAtlas,
  taxonomy?: AffinityTaxonomyOptions,
): AffinityInference {
  return rankBiologicalAffinities(inferInkMorphology(atlas), taxonomy);
}
