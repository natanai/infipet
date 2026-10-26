import { createHash } from "node:crypto";
import { NEEDS_CATALOG_VERSION, NEEDS_RULES_VERSION, type NeedId } from "../../src/needs";
import type { History, Rate } from "./types";

export const PROTOCOL_VERSION = "household-v1";
export const METRIC_VERSION = "normalized-morphology-v1";
export const AGES = [0, 7, 15, 30, 75, 90, 120, 180, 240];
export const MODELED_NEEDS = ["safety", "security", "trust", "rest", "relaxation", "physical-fitness"] as const satisfies readonly NeedId[];
export const SEEDS = Array.from({ length: 128 }, (_, i) => createHash("sha256").update(`infipet-household-v1:${i}`).digest("hex").slice(0, 16));
export const REVIEW_SEEDS = [0, 16, 32, 48, 64, 80, 96, 112];
export const SMALL_REVIEW_SEEDS = [0, 32, 64, 96];
export const REVIEW_AGES = [0, 30, 75, 120, 240];
export const HISTORIES: History[] = [
  { id: "neutral", label: "Default 75%", group: "neutral", timeline: [] },
  ...[0.5, 0, 1].flatMap((value) => MODELED_NEEDS.map((needId): History => ({
    id: `${needId}-${value * 100}`, label: `${needId} ${value * 100}% from birth`,
    group: value === 0 ? "severe" : "moderate", timeline: [{ needId, tick: 0, fulfillment: value }],
  }))),
  ...MODELED_NEEDS.map((needId): History => ({ id: `${needId}-recovery`, label: `${needId} 0% → 100% on day 75`, group: "recovery", timeline: [{ needId, tick: 0, fulfillment: 0 }, { needId, tick: 1800, fulfillment: 1 }] })),
  { id: "safety-late", label: "Safety falls to 0% on day 75", group: "late", timeline: [{ needId: "safety", tick: 1800, fulfillment: 0 }] },
  { id: "combined-stress", label: "Safety + Rest + Fitness 0%", group: "combined", timeline: ["safety", "rest", "physical-fitness"].map((needId) => ({ needId: needId as NeedId, tick: 0, fulfillment: 0 })) },
  { id: "tended-resources", label: "Rest + Fitness 100%", group: "positive", timeline: ["rest", "physical-fitness"].map((needId) => ({ needId: needId as NeedId, tick: 0, fulfillment: 1 })) },
];
export const VERSIONS = { algorithm: 5, schema: 5, catalog: NEEDS_CATALOG_VERSION, needsRules: NEEDS_RULES_VERSION };
export const rate = (numerator: number, denominator: number): Rate => ({ numerator, denominator, percent: denominator ? numerator / denominator * 100 : null });
export const digest = (value: unknown) => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
export const frameId = (presetId: string, seedIndex: number, historyId: string, age: number) => `${presetId}/s${String(seedIndex).padStart(3, "0")}/${historyId}/d${age}`;
export const scheduledHistoryIds = ["neutral", "safety-0", "rest-0", "physical-fitness-0", "safety-recovery", "safety-late", "tended-resources"];
export const smallHistoryIds = ["security-0", "trust-0", "relaxation-0"];
