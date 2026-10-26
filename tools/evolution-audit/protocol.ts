import { createHash } from "node:crypto";
import type { NeedKeyframe } from "../../src/needs";

export const PROTOCOL_VERSION = "evolution-v6-audit1";
export const METRIC_VERSION = "morphology-v6-audit1";
export const AGES = [0, 30, 75, 120] as const;
export const INTERIOR_FRACTIONS = [1 / 6, 2 / 6, 3 / 6, 4 / 6, 5 / 6];
/** Published raw genomes; do not call the attractive reroll search. */
export const SEEDS = Array.from(
  { length: 16 },
  (_, index) => `life-v6-genome-${String(index + 1).padStart(2, "0")}`,
);
export const HISTORIES: {
  id: string;
  label: string;
  keyframes: NeedKeyframe[];
}[] = [
  { id: "neutral", label: "Every need at 75%", keyframes: [] },
  {
    id: "safety-unmet",
    label: "Safety 0% from birth",
    keyframes: [{ needId: "safety", tick: 0, fulfillment: 0 }],
  },
  {
    id: "safety-recovery",
    label: "Safety 0%; restored to100% day75",
    keyframes: [
      { needId: "safety", tick: 0, fulfillment: 0 },
      { needId: "safety", tick: 75 * 24, fulfillment: 1 },
    ],
  },
  {
    id: "rest-fitness-tended",
    label: "Rest and Fitness100% from birth",
    keyframes: [
      { needId: "rest", tick: 0, fulfillment: 1 },
      { needId: "physical-fitness", tick: 0, fulfillment: 1 },
    ],
  },
];
export type AuditStage = "proof" | "three" | "full";
export const digest = (value: unknown): string =>
  createHash("sha256")
    .update(
      typeof value === "string" || Buffer.isBuffer(value)
        ? value
        : JSON.stringify(value),
    )
    .digest("hex");
export function stageCounts(stage: AuditStage) {
  const presets = stage === "proof" ? 1 : stage === "three" ? 3 : 6;
  const seeds = stage === "full" ? 16 : 4;
  const histories = stage === "full" ? 4 : 1;
  const endpoints = presets * seeds * histories * AGES.length;
  const interiors =
    stage === "full"
      ? 0
      : presets * seeds * histories * 3 * INTERIOR_FRACTIONS.length;
  const poses = stage === "full" ? 0 : endpoints * 8;
  return {
    presets,
    seeds,
    histories,
    cases: presets * seeds * histories,
    endpoints,
    interiors,
    poses,
    views: endpoints + interiors + poses,
  };
}
