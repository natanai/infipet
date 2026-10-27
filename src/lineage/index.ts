import { inferSourceAffinities } from "./source-classifier";
import { genomeCacheKey, type InheritedGenome } from "../simulation/genome";
import { hash } from "../simulation/model";
import type { SourceAtlas } from "../simulation/source-atlas";
import type {
  DevelopmentStagePoint,
  LineagePlacement,
  LineageProgram,
  LineageTraitModifiers,
} from "./types";

export type {
  DevelopmentStagePoint,
  LiveDevelopmentContext,
  LineagePlacement,
  LineageProgram,
  LineageTraitModifiers,
} from "./types";
export { createDevelopmentClock } from "./clock";

/**
 * Persistence compatibility token: existing life-v10 saves contain this exact
 * lineage recipe identifier. Kept stable so correcting an invalid scientific
 * claim does not silently delete existing pets. NOT an animal-only algorithm.
 */
export const LINEAGE_RULES_VERSION = "animal-affinity-v1";

const neutral: LineageTraitModifiers = Object.freeze({
  elongation: 1,
  widening: 1,
  curvature: 1,
  support: 1,
  membrane: 1,
  enclosure: 1,
});

/**
 * The old placement contract is still used in saved-development metadata.
 * A drawing has NO proven scientific ancestry. Inference may have animal,
 * plant, fungal and unresolved hypotheses, never a forced taxonomic anchor.
 * Full ranked evidence lives in src/integration/ and the runtime program.
 */
export function classifySource(atlas: SourceAtlas): LineagePlacement {
  const inferred = inferSourceAffinities(atlas);
  const ink = inferred.morphology.signature;
  const evidence: string[] = [
    `${ink.connectedComponents} connected ink component(s)`,
    `${ink.occupiedCells} authored cell(s)`,
    `observed affinity uncertainty: ${inferred.uncertainty.toFixed(4)}`,
    ...inferred.candidates.map(candidate =>
      `${candidate.affinity}: ${candidate.probability.toFixed(4)} heuristic weight`),
  ];
  if (!ink.occupiedCells) evidence.push("empty source; no biological assignment");
  if (ink.holes) evidence.push(`${ink.holes} enclosed negative space(s)`);
  return {
    nodeId: "unresolved",
    profileId: "unresolved",
    confidence: "broad",
    evidence,
  };
}

/**
 * A diagnostic compatibility bridge for stage metadata.
 * Life stages do NOT advance along descendant taxa, and neither care nor a
 * random draw rewrites scientific ancestry. Developmental inspiration
 * candidates are separately available through compileRuntimeBiology().
 *
 * This deliberately adds NO physical growth operator. The production daily
 * material timeline independently owns physical execution and care forcing.
 */
export function compileLineage(
  atlas: SourceAtlas,
  genome: InheritedGenome,
  points: readonly DevelopmentStagePoint[],
): LineageProgram {
  const placement = classifySource(atlas);
  const commitments = [...points]
    .sort((a, b) => a.atHour - b.atHour || a.id.localeCompare(b.id))
    .map(point => ({
      stageId: point.id,
      atHour: Math.max(0, point.atHour),
      nodeId: placement.nodeId,
      profileId: placement.profileId,
      seedPotential: 0,
      careContribution: 0,
    }));
  return {
    version: LINEAGE_RULES_VERSION,
    fingerprint: hash(JSON.stringify([
      LINEAGE_RULES_VERSION, atlas.geometryHash, genomeCacheKey(genome),
      points,
    ])).toString(16),
    placement,
    commitments,
  };
}

/**
 * The old animal-taxon lookup could change the pet's anatomy based on an
 * invented progression from Metazoa to more specific taxa. Retire that
 * mechanism rather than repurpose scientific identity as a growth control.
 */
export function lineageTraitsAt(
  _program: LineageProgram,
  _hour: number,
): LineageTraitModifiers {
  return { ...neutral };
}

export function lineageAt(program: LineageProgram, hour: number) {
  // Filtering happens AT the queried time; future stage events cannot appear
  // in an earlier lineage snapshot.
  const commitments = program.commitments.filter(point => point.atHour <= hour);
  return {
    ...program.placement,
    name: "Unresolved",
    commitments,
    version: program.version,
  };
}
