import { compileMaterialDevelopment, type MaterialDevelopmentProgram } from "../development";
import { createCareMaterialDevelopment, type CareMaterialDevelopment } from "../environment";
import type { GameState } from "../gameplay";
import { inferSourceAffinities, type AffinityInference, type BiologicalAffinity } from "../lineage/source-classifier";
import {
  createPhylogenyView,
  exploreDevelopmentalPossibilities,
  type DevelopmentalPossibilityMap,
  type SourceProvenance,
  type DevelopmentPrior,
} from "../phylogeny";
import {
  adaptDevelopmentPrior,
  compileDevelopmentGeneticSignals,
  expressGenotype,
  type DevelopmentGeneticSignals,
} from "../genetics";
import { genomeCacheKey, type InheritedGenome } from "../simulation/genome";
import type { SourceAtlas } from "../simulation/source-atlas";

/**
 * Pure birth-time composition of the *merged* observation, phylogeny, and
 * genetics contracts. This is diagnostic data for the existing renderer, not
 * a second growth engine or an assignment of a real taxon to drawn pixels.
 *
 * The optional reference IDs are developer/Lab-only inspiration queries. They
 * never change inferred ancestry, inherited alleles, or save data.
 */
export const RUNTIME_BIOLOGY_VERSION = "runtime-biological-possibilities-v1" as const;

export type ReferenceHypothesis = Readonly<{
  affinity: Exclude<BiologicalAffinity, "unresolved">;
  heuristicWeight: number;
  referenceId: string;
  provenance: SourceProvenance;
  /** Scientific lineage belongs to this *reference taxon*, not to the pet. */
  referenceAncestry: readonly string[];
  signals: DevelopmentGeneticSignals;
  anatomicalPossibilities: DevelopmentalPossibilityMap;
}>;

export type RuntimeBiology = Readonly<{
  version: typeof RUNTIME_BIOLOGY_VERSION;
  sourceGeometryHash: string;
  sourceCellCount: number;
  /** Full identity; unlike the historical short fingerprint, includes the seed. */
  genomeIdentity: string;
  observation: AffinityInference;
  /** Unconditioned genetic potential: ambiguity is not a developmental gate. */
  geneticSignals: DevelopmentGeneticSignals;
  /** Multiple hypothetical reference ancestries; no pet species is selected. */
  references: readonly ReferenceHypothesis[];
  scientificPetAssignment: null;
  physicalOperatorsConnected: false;
  chronologicalExposureConnected: false;
}>;

export function compileRuntimeBiology(
  atlas: SourceAtlas,
  inherited: InheritedGenome,
  anatomicalReferenceIds: readonly string[] = [],
): RuntimeBiology {
  // Presence of a scientific reference is independent of the heuristic score.
  // Empty ink deliberately retains unknown evidence and no reference anchors.
  const observation = inferSourceAffinities(atlas, {});
  const tree = createPhylogenyView();
  const candidateIds = observation.candidates.flatMap(candidate =>
    candidate.taxon ? [candidate.taxon.nodeId] : []);
  const possibleIds = [...new Set([...candidateIds, ...anatomicalReferenceIds])];
  const references: ReferenceHypothesis[] = observation.candidates.flatMap(candidate => {
    const verified = candidate.taxon;
    if (!verified || candidate.affinity === "unresolved") return [];
    const source = tree.getProvenance(verified.nodeId);
    const prior = tree.resolveBiologicalConstraints(verified.nodeId);
    const possibilities = exploreDevelopmentalPossibilities(
      tree, verified.nodeId, possibleIds,
    );
    if (!source || !prior || !possibilities) return [];
    return [{
      affinity: candidate.affinity,
      heuristicWeight: candidate.probability,
      referenceId: verified.nodeId,
      provenance: source,
      referenceAncestry: possibilities.fixedBirthReferenceLineage,
      signals: compileDevelopmentGeneticSignals(
        expressGenotype(inherited.genotype, adaptDevelopmentPrior(prior)),
      ),
      anatomicalPossibilities: possibilities,
    }];
  });
  return {
    version: RUNTIME_BIOLOGY_VERSION,
    sourceGeometryHash: atlas.geometryHash,
    sourceCellCount: atlas.cellCount,
    genomeIdentity: genomeCacheKey(inherited),
    observation,
    geneticSignals: compileDevelopmentGeneticSignals(
      expressGenotype(inherited.genotype),
    ),
    references,
    scientificPetAssignment: null,
    physicalOperatorsConnected: false,
    chronologicalExposureConnected: false,
  };
}

/**
 * Select a *soft anatomical operator inspiration*, never an organism's
 * scientific identity. A ranking is heuristic and cannot disallow any
 * morphology. All alternatives remain exposed on RuntimeBiology.
 *
 * The physical engine reads only generic DevelopmentPrior operator evidence
 * and the permanent seed genotype. No reference species becomes a destination.
 */
function anatomicalPrior(biology: RuntimeBiology): DevelopmentPrior | undefined {
  const inspiration = biology.references[0];
  return inspiration?.anatomicalPossibilities.possibilities.find(
    possibility => possibility.referenceId === inspiration.referenceId,
  )?.referencePriors;
}

/** Use exactly the same soft reference prior for uncared and recorded-care material. */
export function compileRuntimeMaterialProgram(
  atlas: SourceAtlas,
  inherited: InheritedGenome,
  biology: RuntimeBiology,
): MaterialDevelopmentProgram {
  return compileMaterialDevelopment(atlas, inherited, anatomicalPrior(biology));
}

/** A chronological saved pet's actual care now controls visible material growth. */
export function compileRuntimeCareMaterial(
  atlas: SourceAtlas,
  inherited: InheritedGenome,
  biology: RuntimeBiology,
  game: GameState,
): CareMaterialDevelopment {
  return createCareMaterialDevelopment(atlas, inherited, game, anatomicalPrior(biology));
}
