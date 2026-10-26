import {
  createPhylogenyView,
  type DevelopmentPrior,
  type SourceProvenance,
  type SpeculativeBranchInput,
} from "../phylogeny";

/**
 * Contract for the drawing-inference and seed-genetics agents.
 *
 * One candidate ID -> one fixed ancestral prior for ONE pet's lifetime.
 * This is ontogeny, never reproduction, cross-generation population evolution,
 * or transitions into different taxa as the pet gets older.
 * Candidate rankings belong to inference; genomes/care histories are NOT read
 * here, and a drawing is never force-classified by this module.
 */
export type BirthLineagePrior = Readonly<{
  candidateId: string;
  provenance: SourceProvenance;
  development: DevelopmentPrior;
}>;

/** Unknown IDs are skipped; no fake ancestry or invented fallback taxon. */
export function candidateBirthPriors(
  candidateIds: readonly string[],
  fictionalBranches: readonly SpeculativeBranchInput[] = [],
): readonly BirthLineagePrior[] {
  const tree = createPhylogenyView(fictionalBranches);
  const seen = new Set<string>();
  const priors: BirthLineagePrior[] = [];
  for (const id of candidateIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    const provenance = tree.getProvenance(id);
    const development = tree.resolveBiologicalConstraints(id);
    if (!provenance || !development) continue;
    priors.push({ candidateId: id, provenance, development });
  }
  return priors;
}
