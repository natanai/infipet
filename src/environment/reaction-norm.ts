/** Pure handoff of fixed genetic potential and observed lifetime pressures. */
import {
  compileDevelopmentGeneticSignals,
  expressEnvironmentalResponse,
  expressGenotype,
  PRIOR_OPERATORS,
  type AncestralTraitConstraints,
  type DevelopmentalGenotype,
  type DevelopmentGeneticSignals,
  type ExpressedDevelopment,
  type PriorOperator,
} from "../genetics";
import type { EnvironmentPressure } from "./history";

const clamp = (n: number) => Math.max(0, Math.min(1, n));

export type CareOperatorSignal = Readonly<{
  /** Fixed genetic capability, never a target species or an anatomy template. */
  inheritedPotential: number;
  /** Potential made available under the recorded pressures at this age. */
  expressedPotential: number;
  /** Preserved taxonomic evidence; unknown does not mean prohibited. */
  evidence: DevelopmentGeneticSignals["operators"][PriorOperator]["evidence"];
  drivers: readonly ("nutrition" | "rest" | "activity" | "threat")[];
}>;
export type CareDevelopmentSignals = Readonly<{
  atHour: number;
  /** Genome identity remains invariant across all histories and ages. */
  genotypeFingerprint: string;
  environmental: EnvironmentPressure;
  genetic: DevelopmentGeneticSignals;
  reaction: ExpressedDevelopment;
  /** Generic operators awaiting the Development algorithm's material graph. */
  operators: Readonly<Record<PriorOperator, CareOperatorSignal>>;
  verifiedAnatomicalIntegration: false;
}>;

/**
 * Supplies numerical reaction-norm inputs to Development. Does not mutate
 * genetics, invent appendages, decide final silhouettes, or claim a rendered
 * structural change. DEV-001/DEV-002 must provide the actual material operator
 * consumers before CARE-002 can satisfy anatomical counterfactual acceptance.
 */
export function compileCareDevelopmentSignals(
  genome: DevelopmentalGenotype,
  environmental: EnvironmentPressure,
  constraints?: AncestralTraitConstraints,
): CareDevelopmentSignals {
  const expression = expressGenotype(genome, constraints);
  const genetic = compileDevelopmentGeneticSignals(expression);
  const reaction = expressEnvironmentalResponse(
    expression, environmental.exposure, environmental.atHour / 24);
  const c = expression.channels;
  const growthAvailability = c.growth.rate > 0
    ? clamp(reaction.effectiveGrowthRate / c.growth.rate)
    : 0;
  const recovery = 0.6 + 0.4 * environmental.physiology.restRecovery;
  const activity = 0.75 + 0.25 * environmental.exposure.activity;
  const days = environmental.atHour / 24;
  const chronicSafety = days > 0
    ? clamp(environmental.cumulative.safetyDeficitDays / days)
    : 0;
  const lowerStress = 1 - 0.35 * chronicSafety;
  const protective = 0.75 + 0.25 * reaction.protectiveResponse;
  const factors: Record<PriorOperator, readonly [number, CareOperatorSignal["drivers"]]> = {
    "tip-extension": [growthAvailability * recovery, ["nutrition", "rest"]],
    "branch-axis": [growthAvailability * recovery, ["nutrition", "rest"]],
    "surface-expansion": [growthAvailability * recovery, ["nutrition", "rest"]],
    "tissue-remodeling": [recovery * lowerStress, ["rest", "threat"]],
    "appendage-extension": [growthAvailability * recovery, ["nutrition", "rest"]],
    "wall-deposition": [activity * protective, ["activity", "threat"]],
  };
  const operators = {} as Record<PriorOperator, CareOperatorSignal>;
  for (const name of PRIOR_OPERATORS) {
    const inherited = genetic.operators[name];
    operators[name] = Object.freeze({
      inheritedPotential: inherited.potential,
      expressedPotential: clamp(inherited.potential * factors[name][0]),
      evidence: inherited.evidence,
      drivers: Object.freeze([...factors[name][1]]),
    });
  }
  return Object.freeze({
    atHour: environmental.atHour,
    genotypeFingerprint: genome.fingerprint,
    environmental,
    genetic,
    reaction,
    operators: Object.freeze(operators),
    verifiedAnatomicalIntegration: false as const,
  });
}
