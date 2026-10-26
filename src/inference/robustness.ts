import type { AffinityInference, BiologicalAffinity, ObservedFeature } from "../lineage/source-classifier";

export type PerturbationCase = Readonly<{
  label: string;
  inference: AffinityInference;
}>;
export type PerturbationResult = Readonly<{
  label: string;
  totalVariation: number;
  maxProbabilityShift: number;
  maxEvidenceShift: number;
  uncertaintyShift: number;
  topAffinityChanged: boolean;
  becameTentative: boolean;
}>;
export type StabilityReport = Readonly<{
  version: "ink-stability-v1";
  cases: readonly PerturbationResult[];
  /** 1 = identical normalized affinity weights in every supplied variation. */
  stability: number;
  worstVariation: number;
  maxEvidenceShift: number;
  confidentJumps: number;
}>;

const affinities: readonly BiologicalAffinity[] = ["animal", "plant", "fungus", "unresolved"];
const features: readonly ObservedFeature[] = [
  "bilateralSymmetry", "radialOrganization", "elongation", "branching",
  "repeatedAppendages", "cavities", "detachment", "attachment", "scarceInk",
];

/**
 * OBS-003 diagnostic for perturbations supplied by callers. No image snapshots;
 * compare measurable evidence and normalized heuristic weights directly.
 * Even a changed top rank can be an inconsequential near-tie.
 */
export function measureInferenceStability(
  reference: AffinityInference,
  variations: readonly PerturbationCase[],
): StabilityReport {
  const probability = (sample: AffinityInference, affinity: BiologicalAffinity) =>
    sample.candidates.find((c) => c.affinity === affinity)?.probability ?? 0;
  const measurement = (sample: AffinityInference, feature: ObservedFeature) =>
    sample.candidates.flatMap((c) => c.evidence)
      .find((item) => item.feature === feature)?.measured ?? 0;
  const cases = variations.map(({ label, inference }) => {
    const shifts = affinities.map((affinity) =>
      Math.abs(probability(reference, affinity) - probability(inference, affinity)));
    const evidenceShifts = features.map((feature) =>
      Math.abs(measurement(reference, feature) - measurement(inference, feature)));
    return {
      label,
      totalVariation: shifts.reduce((sum, value) => sum + value, 0) / 2,
      maxProbabilityShift: Math.max(...shifts),
      maxEvidenceShift: Math.max(...evidenceShifts),
      uncertaintyShift: Math.abs(reference.uncertainty - inference.uncertainty),
      topAffinityChanged: reference.bestAffinity !== inference.bestAffinity,
      becameTentative: reference.confidence !== "tentative" &&
        inference.confidence === "tentative",
    };
  });
  const worstVariation = Math.max(0, ...cases.map((c) => c.totalVariation));
  return {
    version: "ink-stability-v1",
    cases,
    stability: Math.max(0, 1 - worstVariation),
    worstVariation,
    maxEvidenceShift: Math.max(0, ...cases.map((c) => c.maxEvidenceShift)),
    confidentJumps: cases.filter((c) => c.becameTentative && c.totalVariation > 0.2).length,
  };
}
