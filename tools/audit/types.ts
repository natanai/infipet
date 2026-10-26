import type { PetPart, Pixel } from "../../src/simulation";
import type { NeedKeyframe } from "../../src/needs";
import type { FrameDescriptor } from "./metrics";

export type Rate = { numerator: number; denominator: number; percent: number | null; ci95?: [number, number] };
export type History = { id: string; label: string; group: string; timeline: NeedKeyframe[] };
export type Manifest = {
  protocolVersion: string; metricVersion: string; runId: string; createdAt: string;
  seedCount: number; seeds: string[]; ages: number[]; render: { action: "idle"; time: 0 };
  presets: { id: string; name: string; parts: PetPart[]; sourceHash: string; cues: string[]; hosts: Record<string, string | null>; limitations: string[] }[];
  histories: History[]; versions: Record<string, string | number>;
  engineHashes: Record<string, string>; engineHash: string; runtime: Record<string, string>;
  expected: { cases: number; frames: number; scheduledReviewFrames: number };
};
export type Integrity = {
  valid: boolean; retained: number; expected: number; hostsCorrect: number; hostsTested: number;
  jointsValid: number; jointsTested: number; facesInside: number; facesTested: number;
  edgePixels: number; generatedIds: string[]; generatedKinds: string[]; forbiddenGenerated: number;
};
export type FrameResult = {
  age: number; hash: string; silhouetteHash: string; descriptor: FrameDescriptor; integrity: Integrity;
  feelings: { id: string; intensity: number }[]; capabilities: string; milliseconds: number;
};
export type CaseResult = {
  presetId: string; seedIndex: number; historyId: string; fingerprint: string;
  noveltyEligible: boolean; birthExact: boolean; genomeStable: boolean;
  replay: { checked: number; matched: number }; frames: FrameResult[]; errors: string[];
};
export type AgeMetrics = { age: number; rates: Record<string, Rate> };
export type CareComparison = { historyId: string; rates: Record<string, Rate>; meanDistance: number; recoveryPercent?: number | null; convergencePercent?: number | null };
export type PresetSummary = {
  id: string; name: string; rates: Record<string, Rate>; byAge: AgeMetrics[]; care: CareComparison[];
  variance: { age: number; panel: string; seedPercent: number | null; historyPercent: number | null; interactionPercent: number | null; seedDominates: boolean | null }[];
  movements: Record<string, number>; structures: Record<string, number>; featureChanges: Record<string, Rate>;
  nearest: { seedIndex: number; otherSeedIndex: number; distance: number }[];
  geneticsByHistory: { historyId: string; rates: Record<string, Rate> }[];
};
export type Supplemental = {
  controls: { cases: number; frames: number; geometryUnchanged: Rate; feelingsChanged: Rate; emittedFeelings: string[]; failures: unknown[]; expectedCases?: number; expectedFrames?: number; byNeed?: Record<string, { cases: number; frames: number; geometryUnchanged: Rate; feelingsChanged: Rate }> };
  boundaries: { checked: number; causal: Rate; finite: Rate; failures: unknown[]; expectedFrames?: number; expectedCausal?: number };
  robustness: { checked: number; valid: Rate; replay: Rate; cases: unknown[]; birthExact?: Rate; hatchBoundaries?: Rate; failedCases?: number };
  motion: { frames: number; valid: Rate; contactValid: Rate; clips: { id: string; path: string; frameIds: string[] }[]; failures?: unknown[]; expectedFrames?: number; options?: { ages: number[]; phases: number[]; actions: string[]; playTarget: { x: number; y: number } } };
};
export type Summary = {
  runId: string; generatedAt: string; engineUnchanged: boolean;
  counts: { completedCases: number; expectedCases: number; frames: number; expectedFrames: number; failedCases: number };
  rates: Record<string, Rate>; presets: PresetSummary[];
  performance: { samples: number; p50: number; p95: number; maximum: number; under16: Rate; under33: Rate; under100: Rate; note: string };
  supplemental?: Supplemental; visual?: Record<string, unknown>; findings: { severity: string; title: string; detail: string; examples?: string[] }[];
};
export type ReviewScores = { distinctiveness: number | null; coherence: number | null; richness: number | null; continuity: number | null };
export type VisualReview = {
  reviewer: string; kind: "agent" | "human"; pageId: string; rowIds: string[];
  scores: ReviewScores; notes: string; defects: string[]; reviewedAt: string;
};
export type ReviewRow = { id: string; frameIds: string[]; kind: "overview" | "lifecycle" | "flagged" | "motion"; atlas: string; seedIndex: number; ageIndices: number[] };
export type ReviewPage = { id: string; path: string; secondary: boolean; rows: ReviewRow[] };
export type ReviewSchedule = { version: string; frameCount: number; secondaryFrameCount: number; pages: ReviewPage[]; frameKey: Record<string, { presetId: string; historyId: string; seedIndex: number; age: number }> };

export type Raster = { width: number; height: number; rgba: Uint8Array };
export type PixelFrame = { pixels: Pixel[] };
