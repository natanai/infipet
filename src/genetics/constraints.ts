import {
  DEVELOPMENTAL_CHANNELS,
  type DevelopmentalChannels,
  type DevelopmentalGenotype,
} from "./channels";

/**
 * Structural projection of Agent 1's proposed src/phylogeny/traits.ts
 * DevelopmentPrior (algorithm/phylogeny, PR #7). Not authoritative or
 * integration-verified until PHY-002 reaches main and is tested directly.
 *
 * No scientific numerical expression limits exist in that public contract.
 * Its allowed categorical states are priors, not impossible/possible verdicts.
 */
export type PriorTraitDimension = "organization" | "wallMaterial" | "growthPattern";
export type PriorOperator =
  | "tip-extension" | "branch-axis" | "surface-expansion"
  | "tissue-remodeling" | "appendage-extension" | "wall-deposition";
export type PriorProvenance = "scientific" | "fictional";
export type ProposedDevelopmentPrior = Readonly<{
  taxonId: string;
  fixedAncestry: readonly string[];
  constraints: Readonly<Partial<Record<PriorTraitDimension, Readonly<{
    allowed: readonly string[];
    introducedBy: string;
    refinedBy: readonly string[];
    evidenceUrls: readonly string[];
  }>>>>;
  operatorHints: readonly Readonly<{
    operator: PriorOperator;
    introducedBy: string;
    evidenceUrl: string;
    provenance: PriorProvenance;
  }>[];
  includesFiction: boolean;
  version: string;
}>;

export type EvidenceState =
  | Readonly<{ status: "unknown" }>
  | Readonly<{
    status: "supported";
    allowed: readonly string[];
    introducedBy: string;
    refinedBy: readonly string[];
    evidenceUrls: readonly string[];
  }>;
export type OperatorEvidence =
  | Readonly<{ status: "unknown" }>
  | Readonly<{
    status: "supported";
    sources: readonly Readonly<{
      introducedBy: string;
      evidenceUrl: string;
      provenance: PriorProvenance;
    }>[];
  }>;
export const PRIOR_OPERATORS: readonly PriorOperator[] = [
  "tip-extension", "branch-axis", "surface-expansion",
  "tissue-remodeling", "appendage-extension", "wall-deposition",
] as const;
const PRIOR_DIMENSIONS = ["organization", "wallMaterial", "growthPattern"] as const;

export type AncestralTraitConstraints = Readonly<{
  schemaVersion: 1;
  lineageNodeId: string;
  fixedAncestry: readonly string[];
  priorVersion: string;
  includesFiction: boolean;
  traits: Readonly<Record<PriorTraitDimension, EvidenceState>>;
  operators: Readonly<Record<PriorOperator, OperatorEvidence>>;
}>;
export type GeneticExpression = Readonly<{
  /** Genetic magnitudes are unchanged. Categorical priors cannot justify numeric clamps. */
  channels: DevelopmentalChannels;
  lineage: AncestralTraitConstraints | null;
}>;

/**
 * Convert the *existing proposed* PHY-002 category/operator prior into
 * inspectable signals. Unknown == unrepresented by evidence, never forbidden.
 * This adapter does not fabricate min/max thresholds, functional anatomy or
 * organism destinations.
 */
export function adaptDevelopmentPrior(
  prior: ProposedDevelopmentPrior,
): AncestralTraitConstraints {
  if (!prior || !prior.taxonId || !prior.version ||
      prior.fixedAncestry[0] !== prior.taxonId)
    throw new TypeError("Invalid DevelopmentPrior ancestry provenance");
  for (const dimension of Object.keys(prior.constraints))
    if (!PRIOR_DIMENSIONS.includes(dimension as PriorTraitDimension))
      throw new TypeError("Unknown DevelopmentPrior trait dimension: " + dimension);
  const traits = {} as Record<PriorTraitDimension, EvidenceState>;
  for (const dimension of PRIOR_DIMENSIONS) {
    const evidence = prior.constraints[dimension];
    if (!evidence) {
      traits[dimension] = { status: "unknown" };
      continue;
    }
    if (!evidence.introducedBy || !prior.fixedAncestry.includes(evidence.introducedBy) ||
        !evidence.allowed.length || !evidence.evidenceUrls.length ||
        evidence.evidenceUrls.some(url => !/^https:\/\//.test(url)) ||
        evidence.refinedBy.some(id => !prior.fixedAncestry.includes(id)))
      throw new TypeError("Unverified prior trait evidence: " + dimension);
    traits[dimension] = {
      status: "supported",
      allowed: [...evidence.allowed],
      introducedBy: evidence.introducedBy,
      refinedBy: [...evidence.refinedBy],
      evidenceUrls: [...evidence.evidenceUrls],
    };
  }
  const operators = {} as Record<PriorOperator, OperatorEvidence>;
  for (const name of PRIOR_OPERATORS) {
    const source = prior.operatorHints.filter(hint => hint.operator === name);
    if (source.some(hint =>
      !prior.fixedAncestry.includes(hint.introducedBy) ||
      (hint.provenance === "scientific" && !/^https:\/\//.test(hint.evidenceUrl)) ||
      !["scientific", "fictional"].includes(hint.provenance)))
      throw new TypeError("Unverified prior operator evidence: " + name);
    operators[name] = source.length
      ? { status: "supported", sources: source.map(hint => ({
          introducedBy: hint.introducedBy,
          evidenceUrl: hint.evidenceUrl,
          provenance: hint.provenance,
        })) }
      : { status: "unknown" };
  }
  if (prior.operatorHints.some(hint => !PRIOR_OPERATORS.includes(hint.operator)))
    throw new TypeError("Unknown developmental operator");
  if (!prior.includesFiction &&
      prior.operatorHints.some(hint => hint.provenance === "fictional"))
    throw new TypeError("Fictional operators require fictional provenance");
  return {
    schemaVersion: 1,
    lineageNodeId: prior.taxonId,
    fixedAncestry: [...prior.fixedAncestry],
    priorVersion: prior.version,
    includesFiction: prior.includesFiction,
    traits,
    operators,
  };
}

/** Only the lineage annotation changes. Care and phylogeny cannot edit genotype. */
export function expressGenotype(
  inherited: DevelopmentalGenotype,
  constraints?: AncestralTraitConstraints,
): GeneticExpression {
  const channels = {} as Record<string, Record<string, number>>;
  for (const group of Object.keys(DEVELOPMENTAL_CHANNELS)) {
    channels[group] = {};
    for (const trait of Object.keys(DEVELOPMENTAL_CHANNELS[group as keyof DevelopmentalChannels]))
      channels[group][trait] =
        (inherited.channels[group as keyof DevelopmentalChannels] as Record<string, number>)[trait];
  }
  return { channels: channels as DevelopmentalChannels, lineage: constraints ?? null };
}
