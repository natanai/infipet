/**
 * CARE-001/002: chronologically expressed, source-material anatomy.
 *
 * The Development owner generates the *only* anatomical schedule; care can
 * modulate those existing operators, never invent a species, tissue or sprite.
 */
import {
  applyMaterialOperators,
  compileMaterialDevelopment,
  type MaterialDevelopmentProgram,
  type MaterialGraph,
  type MaterialOperator,
  type MaterialOperatorKind,
} from "../development";
import type { GameState } from "../gameplay";
import type { DevelopmentalGenotype } from "../genetics";
import type { DevelopmentPrior } from "../phylogeny";
import type { InheritedGenome } from "../simulation/genome";
import type { SourceAtlas } from "../simulation/source-atlas";
import { createEnvironmentalHistory, type EnvironmentalHistory } from "./history";
import { compileCareDevelopmentSignals } from "./reaction-norm";

const clamp = (n: number) => Math.max(0, Math.min(1, n));
const geneticOperator: Readonly<Record<MaterialOperatorKind,
  "tip-extension" | "branch-axis" | "surface-expansion" |
  "tissue-remodeling" | "appendage-extension" | "wall-deposition">> = {
  elongate: "tip-extension",
  expand: "surface-expansion",
  branch: "branch-axis",
  bud: "appendage-extension",
  fuse: "tissue-remodeling",
  resorb: "tissue-remodeling",
  remodel: "tissue-remodeling",
  reinforce: "wall-deposition",
};

/**
 * Historic integration splits at each hourly sample, integer hour and
 * fractional-time command. No integral references pressure *after* the
 * requested anatomical frame, or after the operator's own growth window.
 *
 * A completed operator's final strength is permanently determined by the
 * environmental experience in its active interval, not by today's meters.
 * The same source cells and schedule are passed to the authoritative engine.
 */
export function careMaterialOperatorsAt(
  program: MaterialDevelopmentProgram,
  history: EnvironmentalHistory,
  genotype: DevelopmentalGenotype,
  atHour: number,
): readonly MaterialOperator[] {
  if (genotype.fingerprint !== program.genomeFingerprint)
    throw new TypeError("Care and material program must share a permanent genome");
  if (!Number.isFinite(atHour) || atHour < 0 || atHour > history.maxHour)
    throw new RangeError("Material query must be within recorded care history");
  const cache = new Map<number, ReturnType<typeof compileCareDevelopmentSignals>>();
  function response(hour: number, kind: MaterialOperatorKind): number {
    let signals = cache.get(hour);
    if (!signals) {
      signals = compileCareDevelopmentSignals(genotype, history.atHour(hour),
        program.signals.biologicalPrior ?? undefined);
      cache.set(hour, signals);
    }
    const op = signals.operators[geneticOperator[kind]];
    return op.inheritedPotential > 0
      ? clamp(op.expressedPotential / op.inheritedPotential)
      : 0;
  }
  return Object.freeze(program.operators.map(op => {
    const start = op.atHour, end = Math.min(atHour, start + op.durationHours);
    if (end <= start || op.strength === 0) return Object.freeze({ ...op });
    const cuts = new Set<number>([start, end]);
    for (let hour = Math.floor(start) + 1; hour < end; hour++) cuts.add(hour);
    for (const sample of history.samples)
      if (sample.hour > start && sample.hour < end) cuts.add(sample.hour);
    for (const command of history.commands)
      if (command.atHour > start && command.atHour < end) cuts.add(command.atHour);
    const boundaries = [...cuts].sort((a, b) => a - b);
    let weighted = 0;
    for (let i = 1; i < boundaries.length; i++) {
      const a = boundaries[i - 1], b = boundaries[i];
      if (b <= a) continue;
      weighted += (b - a) * response((a + b) / 2, op.kind);
    }
    // The operator engine already multiplies strength by elapsed/duration;
    // averaging only across *elapsed* time avoids double-discounting growth.
    const effective = weighted / (end - start);
    return Object.freeze({ ...op, strength: clamp(op.strength * effective) });
  }));
}

export type CareMaterialDevelopment = Readonly<{
  version: 1;
  /** Original source-material ancestry, seed and canonical operator schedule. */
  program: MaterialDevelopmentProgram;
  history: EnvironmentalHistory;
  genotypeFingerprint: string;
  operatorsAt: (hour: number) => readonly MaterialOperator[];
  materialAt: (hour: number) => MaterialGraph;
}>;

/**
 * Minimal runtime adapter. Pass an already-compiled SourceAtlas, once-assigned
 * genome and saved GameState. No new care storage or Development-owned edits.
 */
export function createCareMaterialDevelopment(
  atlas: SourceAtlas,
  genome: InheritedGenome,
  game: GameState,
  prior?: DevelopmentPrior,
): CareMaterialDevelopment {
  if (genome.seed !== game.seed || genome.mode !== game.mode)
    throw new TypeError("Material genome and recorded life must be the same pet");
  const program = compileMaterialDevelopment(atlas, genome, prior);
  const history = createEnvironmentalHistory(game);
  const operatorsAt = (hour: number) =>
    careMaterialOperatorsAt(program, history, genome.genotype, hour);
  const materialAt = (hour: number) => applyMaterialOperators(
    program.source, operatorsAt(hour), hour, program.signals);
  return Object.freeze({
    version: 1 as const, program, history,
    genotypeFingerprint: genome.genotype.fingerprint,
    operatorsAt, materialAt,
  });
}
