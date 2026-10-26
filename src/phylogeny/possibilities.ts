import type {
  PhylogenyView,
  SourceProvenance,
} from "./index";
import type {
  DevelopmentOperator,
  DevelopmentPrior,
  OperatorPrior,
} from "./traits";

/**
 * Three deliberately separate concepts:
 * 1. Reference ancestry: immutable scientific parent edges of taxa in the data.
 * 2. Anatomical possibility: an operator/trait inspiration, never a taxon assignment.
 * 3. One-pet trajectory: chronological chosen inspirations; does not change (1).
 *
 * These are planning contracts, NOT growth operations, species succession,
 * offspring, population genetics, or a proof that any transition is viable.
 */
export type AnatomicalPossibility = Readonly<{
  role: "anatomical-inspiration";
  referenceId: string;
  provenance: SourceProvenance;
  /** Scientific reference evidence for this taxon, not lifetime hard limits. */
  referencePriors: DevelopmentPrior;
  /** Measured in represented graph edges, not anatomical feasibility or probability. */
  referenceEdgeDistance: number;
  sharedReferenceAncestorId: string;
  /** No arbitrary birth-clade gate; seed, care, and physical continuity are downstream. */
  availability: "reference-only-not-a-lifetime-permission-gate";
}>;

export type DevelopmentalPossibilityMap = Readonly<{
  version: "infipet-developmental-possibilities-v1";
  birthReferenceId: string;
  /** The real taxa's ancestral relationships; NOT a drawing species diagnosis. */
  fixedBirthReferenceLineage: readonly string[];
  possibilities: readonly AnatomicalPossibility[];
}>;

export type LifetimeWaypointInput = Readonly<{
  atHour: number;
  anatomicalReferenceId: string;
  /** Descriptive input only: the growth engine decides how these affect anatomy. */
  influence: "seed" | "care" | "environment" | "combined" | "unspecified";
}>;

export type LifetimeAnatomicalWaypoint = Readonly<{
  atHour: number;
  inspiration: AnatomicalPossibility;
  influence: LifetimeWaypointInput["influence"];
  /** Carry both sides' generic operators so remodeling is not blocked by the previous clade. */
  availableOperatorHints: readonly OperatorPrior[];
  previousAnatomicalReferenceId: string;
  /** No mutation of birth lineage or scientific parent relationships. */
  transitionMeaning: "single-pet-ontogenetic-analogy";
}>;

export type LifetimeDevelopmentalTrajectory = Readonly<{
  version: "infipet-lifetime-trajectory-contract-v1";
  birthReferenceId: string;
  fixedBirthReferenceLineage: readonly string[];
  waypoints: readonly LifetimeAnatomicalWaypoint[];
  /** Structural continuity, timing, expression and physical plausibility belong to Development. */
  execution: "development-engine-not-implemented";
}>;

/** Pure graph distances measure relationship only, never biological possibility. */
function referenceDistance(
  view: PhylogenyView,
  from: string,
  to: string,
): { sharedId: string; edges: number } | undefined {
  const common = view.commonAncestor(from, to);
  if (!common) return undefined;
  const source = view.ancestry(from).findIndex(n => n.id === common.id);
  const destination = view.ancestry(to).findIndex(n => n.id === common.id);
  return { sharedId: common.id, edges: source + destination };
}

/**
 * Build available anatomical inspirations from the compact reference taxonomy.
 * The *reference* is sourced, but switching inspirations is game ontogeny, NOT
 * a claim the individual became a different scientific species.
 *
 * No taxonomic branch is forbidden just because it is distant. A renderer must
 * still ensure anatomy, original ink identity, and continuous transformations.
 */
export function exploreDevelopmentalPossibilities(
  view: PhylogenyView,
  birthReferenceId: string,
  candidateReferenceIds: readonly string[] = view.nodes.map(n => n.id),
): DevelopmentalPossibilityMap | undefined {
  if (!view.getNode(birthReferenceId)) return undefined;
  const seen = new Set<string>();
  const possibilities: AnatomicalPossibility[] = [];
  for (const referenceId of candidateReferenceIds) {
    if (seen.has(referenceId)) continue;
    seen.add(referenceId);
    const provenance = view.getProvenance(referenceId);
    const priors = view.resolveBiologicalConstraints(referenceId);
    const link = referenceDistance(view, birthReferenceId, referenceId);
    if (!provenance || !priors || !link) continue;
    possibilities.push({
      role: "anatomical-inspiration", referenceId, provenance,
      referencePriors: priors,
      referenceEdgeDistance: link.edges,
      sharedReferenceAncestorId: link.sharedId,
      availability: "reference-only-not-a-lifetime-permission-gate",
    });
  }
  return {
    version: "infipet-developmental-possibilities-v1",
    birthReferenceId,
    fixedBirthReferenceLineage: view.ancestry(birthReferenceId).map(n => n.id),
    possibilities,
  };
}

const uniqueOperators = (
  first: readonly OperatorPrior[],
  second: readonly OperatorPrior[],
): readonly OperatorPrior[] => {
  const keys = new Set<string>();
  return [...first, ...second].filter(hint => {
    // Preserve distinct scientific versus fictional provenance.
    const key = hint.operator + "/" + hint.provenance + "/" + hint.introducedBy;
    if (keys.has(key)) return false;
    keys.add(key);
    return true;
  });
};

/**
 * Record a hypothetical sequence chosen by a future genotype/care planner.
 * Do NOT auto-select a species or render a growth path. Any sourced inspiration
 * can follow any other, with structural plausibility delegated to Development.
 */
export function describeLifetimeDevelopmentalTrajectory(
  view: PhylogenyView,
  birthReferenceId: string,
  waypoints: readonly LifetimeWaypointInput[],
): LifetimeDevelopmentalTrajectory {
  const birth = exploreDevelopmentalPossibilities(view, birthReferenceId, [birthReferenceId]);
  if (!birth) throw new Error("Unrepresented birth reference: " + birthReferenceId);
  const result: LifetimeAnatomicalWaypoint[] = [];
  let previousHour = -Infinity;
  let previousReferenceId = birthReferenceId;
  for (const point of waypoints) {
    if (!Number.isFinite(point.atHour) || point.atHour < 0 ||
        point.atHour <= previousHour) {
      throw new Error("Developmental waypoints must have strictly increasing nonnegative hours");
    }
    const priorReference = view.resolveBiologicalConstraints(previousReferenceId);
    const current = exploreDevelopmentalPossibilities(
      view, birthReferenceId, [point.anatomicalReferenceId],
    )?.possibilities[0];
    if (!current || !priorReference)
      throw new Error("Unrepresented anatomical inspiration: " + point.anatomicalReferenceId);
    result.push({
      atHour: point.atHour,
      influence: point.influence,
      inspiration: current,
      previousAnatomicalReferenceId: previousReferenceId,
      availableOperatorHints: uniqueOperators(priorReference.operatorHints, current.referencePriors.operatorHints),
      transitionMeaning: "single-pet-ontogenetic-analogy",
    });
    previousHour = point.atHour;
    previousReferenceId = point.anatomicalReferenceId;
  }
  return {
    version: "infipet-lifetime-trajectory-contract-v1",
    birthReferenceId,
    fixedBirthReferenceLineage: birth.fixedBirthReferenceLineage,
    waypoints: result,
    execution: "development-engine-not-implemented",
  };
}

/** Shared operator names for the procedural engine; no sprite or species lookup. */
export type AnatomicalDevelopmentOperator = DevelopmentOperator;
