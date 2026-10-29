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
 * Current unreleased metadata version. No historical pet-format compatibility
 * or animal-taxonomy identity token is retained. Anatomical development is
 * owned by the immutable brush/seed/tree material program, NOT this report.
 */
export const LINEAGE_RULES_VERSION = "authored-potential-v1";

const neutral: LineageTraitModifiers = Object.freeze({
  elongation: 1,
  widening: 1,
  curvature: 1,
  support: 1,
  membrane: 1,
  enclosure: 1,
});

/**
 * Scientific ancestry remains unresolved for every player-made organism.
 * Stage diagnostics may explain authored BRUSH kinds but never use holes,
 * symmetry, outline, pigment, proximity or silhouette to identify anything.
 * The actual seed-chosen tree inspiration lives in compileRuntimeBiology().
 */
export function classifySource(atlas: SourceAtlas): LineagePlacement {
  const inferred = inferSourceAffinities(atlas);
  const declared = atlas.patches
    .filter(p=>p.source.cells.length>0)
    .map(p=>p.kind)
    .sort();
  const evidence: string[] = [
    declared.length
      ? "player-selected part kinds: " + declared.join(", ")
      : "empty source; no authored part identity",
    "source kind evidence only; no image-based species inference",
    `declared-brush affinity uncertainty: ${inferred.uncertainty.toFixed(4)}`,
  ];
  return {
    nodeId: "unresolved",
    profileId: "unresolved",
    confidence: "broad",
    evidence,
  };
}

/**
 * A nonauthoritative stage metadata report for the current prototype.
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
 * No taxonomy lookup may change this one pet's ancestry based on an
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
