import { createHash } from "node:crypto";
import type { NeedId, NeedKeyframe } from "../../src/needs";

export const PROTOCOL_VERSION = "source-development-v7-audit3";
export const METRIC_VERSION = "source-coherence-v7-metrics3";
export const AGES = [0, 30, 75, 120] as const;
export const INTERIOR_FRACTIONS = [1 / 6, 2 / 6, 3 / 6, 4 / 6, 5 / 6];
/** Raw seeds, never filtered using the attractive reroll search. */
export const SEEDS = Array.from(
  { length: 16 },
  (_, i) => `life-v7-genome-${String(i + 1).padStart(2, "0")}`,
);
export const NEEDS: NeedId[] = [
  "safety",
  "security",
  "trust",
  "rest",
  "relaxation",
  "physical-fitness",
];
export const CARE_ONSETS = [0, 7, 90, 150];
export const CARE_OFFSETS = [0, 0.25, 1, 7, 14];
export const HISTORIES: {
  id: string;
  label: string;
  keyframes: NeedKeyframe[];
}[] = [
  { id: "neutral", label: "All needs 75%", keyframes: [] },
  {
    id: "safety-unmet",
    label: "Safety 0% from birth",
    keyframes: [{ needId: "safety", tick: 0, fulfillment: 0 }],
  },
  {
    id: "safety-recovery",
    label: "Safety 0%; restored to 100% day 75",
    keyframes: [
      { needId: "safety", tick: 0, fulfillment: 0 },
      { needId: "safety", tick: 1800, fulfillment: 1 },
    ],
  },
  {
    id: "rest-fitness-tended",
    label: "Rest and Fitness 100% from birth",
    keyframes: [
      { needId: "rest", tick: 0, fulfillment: 1 },
      { needId: "physical-fitness", tick: 0, fulfillment: 1 },
    ],
  },
];
export type AuditStage = "proof" | "three" | "full";
export type ProbeSet = "none" | "source" | "care" | "all";
/** Cohort size only; changing this option does not change scoring definitions. */
export type CareSeedCount = 2 | 4;
export function parseCareSeeds(value: string | number = 2): CareSeedCount {
  if (value !== 2 && value !== 4 && value !== "2" && value !== "4")
    throw new Error("--care-seeds must be 2 or 4");
  return Number(value) as CareSeedCount;
}
export const digest = (value: unknown) =>
  createHash("sha256")
    .update(
      typeof value === "string" || Buffer.isBuffer(value)
        ? value
        : JSON.stringify(value),
    )
    .digest("hex");
export const textOrder = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
export function stageCounts(
  stage: AuditStage,
  probes: ProbeSet = "none",
  careSeeds: CareSeedCount = 2,
) {
  parseCareSeeds(careSeeds);
  const presets = stage === "proof" ? 1 : stage === "three" ? 3 : 6;
  const seeds = stage === "full" ? 16 : 4,
    histories = stage === "full" ? 4 : 1;
  const cases = presets * seeds * histories,
    endpoints = cases * 4;
  const interiors = stage === "full" ? 0 : cases * 15,
    poses = stage === "full" ? 0 : endpoints * 8;
  const sourceCases = ["source", "all"].includes(probes) ? 6 * 2 : 0;
  const careCases = ["care", "all"].includes(probes)
    ? (NEEDS.length * 2 + 1) * CARE_ONSETS.length * careSeeds
    : 0;
  return {
    presets,
    seeds,
    histories,
    primaryCases: cases,
    sourceCases,
    careCases,
    cases: cases + sourceCases + careCases,
    endpoints,
    interiors,
    poses,
    coreDiagnosticViews: endpoints,
    regionalMaskArtifacts: endpoints,
    sourceViews: sourceCases * 4,
    careViews: careCases * CARE_OFFSETS.length,
    views:
      endpoints +
      interiors +
      poses +
      sourceCases * 4 +
      careCases * CARE_OFFSETS.length,
  };
}
