import {
  createPhylogenyView,
  exploreDevelopmentalPossibilities,
  describeLifetimeDevelopmentalTrajectory,
  type DevelopmentPrior,
  type SourceProvenance,
  type SpeculativeBranchInput,
  type DevelopmentalPossibilityMap,
  type LifetimeWaypointInput,
  type LifetimeDevelopmentalTrajectory,
} from "../phylogeny";

/**
 * Interface for drawing inference and seed genetics.
 *
 * Scientific reference ancestry is fixed. A pet's anatomical inspiration can
 * change during its life, even between distant reference branches. That is
 * ontogeny/game transformation, NOT a literal species change, breeding,
 * reproduction, or population evolution. No drawing is force-classified here.
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

/**
 * Ranked candidates are supplied by inference; this does NOT rank them.
 * Anatomical inspirations are NOT blocked by the pet's birth-reference clade.
 * Any supported source (including a labeled fiction overlay) is inspectable.
 */
export function candidateDevelopmentalMaps(
  candidateIds: readonly string[],
  referenceIds?: readonly string[],
  fictionalBranches: readonly SpeculativeBranchInput[] = [],
): readonly DevelopmentalPossibilityMap[] {
  const view = createPhylogenyView(fictionalBranches);
  const seen = new Set<string>();
  return candidateIds.flatMap(id => {
    if (seen.has(id)) return [];
    seen.add(id);
    const map = exploreDevelopmentalPossibilities(view, id, referenceIds);
    return map ? [map] : [];
  });
}

/** A typed outline, not a growth renderer or a care-dependent path selector. */
export function describeCandidateTrajectory(
  birthReferenceId: string,
  waypoints: readonly LifetimeWaypointInput[],
  fictionalBranches: readonly SpeculativeBranchInput[] = [],
): LifetimeDevelopmentalTrajectory {
  return describeLifetimeDevelopmentalTrajectory(
    createPhylogenyView(fictionalBranches), birthReferenceId, waypoints,
  );
}
