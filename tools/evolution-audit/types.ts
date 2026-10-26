import type { FrameDescriptor } from "../audit/metrics";
import type { PetFrame, PetPart, Pixel } from "../../src/simulation";
import type { AuditStage } from "./protocol";

export type AuditView = {
  id: string;
  blindLabel: string;
  kind: "endpoint" | "interior" | "pose";
  age: number;
  time: number;
  action: "idle" | "move";
  phase?: number;
  actualPhase?: number | null;
  poseDiagnostics?: unknown;
  fromAge?: number;
  toAge?: number;
  descriptor: FrameDescriptor;
  hash: string;
  pixels: Pixel[];
  evolution: unknown;
  movement: PetFrame["movementMode"];
  feelings: PetFrame["wellbeing"]["feelings"];
  protectedFeatures: {
    tested: number;
    retained: number;
    rasterContributors: number;
  };
  valid: boolean;
  elapsedMs: number;
};
export type AuditCase = {
  id: string;
  presetId: string;
  seed: string;
  seedIndex: number;
  historyId: string;
  geneticHash: string;
  birthFidelity: boolean;
  seekAgreement: boolean;
  views: AuditView[];
  error?: string;
};
export type AuditManifest = {
  protocolVersion: string;
  metricVersion: string;
  runId: string;
  stage: AuditStage;
  createdAt: string;
  engineHash: string;
  engineHashes: Record<string, string>;
  expected: {
    presets: number;
    seeds: number;
    histories: number;
    cases: number;
    endpoints: number;
    interiors: number;
    poses: number;
    views: number;
  };
  presets: { id: string; name: string; parts: PetPart[]; sourceHash: string }[];
  seeds: string[];
  histories: { id: string; label: string; keyframes: unknown[] }[];
  ages: readonly number[];
  runtime: { node: string; platform: string };
};
export type Rate = {
  numerator: number;
  denominator: number;
  percent: number | null;
  condition: string;
  age: number | string;
};
export type VisualReview = {
  caseId: string;
  fromAge: number;
  toAge: number;
  reviewer: string | null;
  reviewerKind: "agent" | "human" | null;
  status: "unreviewed" | "reviewed";
  distinctiveness: 0 | 1 | 2 | 3 | null;
  featureCoherence: 0 | 1 | 2 | 3 | null;
  transformationRichness: 0 | 1 | 2 | 3 | null;
  continuity: 0 | 1 | 2 | 3 | null;
  notes: string;
};
