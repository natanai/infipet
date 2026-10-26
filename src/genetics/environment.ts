import type { GeneticExpression } from "./constraints";
import type { DevelopmentalChannels } from "./channels";

/** Environmental inputs are separate from all inherited and lineage inputs. */
export type DevelopmentalExposure = Readonly<{
  nutrition: number;
  activity: number;
  threat: number;
}>;
export type ExpressedDevelopment = Readonly<{
  atAge: number;
  inheritedExpression: GeneticExpression;
  effectiveGrowthRate: number;
  effectiveSupport: number;
  protectiveResponse: number;
}>;
const unit = (v: number) =>
  Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;

/**
 * A pure reaction norm. This does not schedule stages, alter genotype or
 * introduce a new creature lookup. Later development algorithms may use
 * these as environmental *signals*, not inherited or taxonomic facts.
 */
export function expressEnvironmentalResponse(
  expression: GeneticExpression,
  exposure: DevelopmentalExposure,
  atAge: number,
): ExpressedDevelopment {
  if (!Number.isFinite(atAge) || atAge < 0)
    throw new RangeError("Invalid developmental age");
  const c: DevelopmentalChannels = expression.channels;
  const growth = c.growth.rate *
    (1 - c.sensitivity.nutrition * (1 - unit(exposure.nutrition)));
  const support = c.support.rigidity *
    (0.75 + 0.25 * c.sensitivity.activity * unit(exposure.activity));
  const protection = c.sensitivity.threat * unit(exposure.threat);
  return {
    atAge,
    inheritedExpression: expression,
    effectiveGrowthRate: unit(growth),
    effectiveSupport: unit(support),
    protectiveResponse: unit(protection),
  };
}
