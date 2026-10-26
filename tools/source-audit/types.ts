import type { NeedKeyframe } from "../../src/needs";
import type { PetPart, Pixel } from "../../src/simulation";
import type { FrameDescriptor } from "../audit/metrics";
import type { AuditStage, CareSeedCount, ProbeSet } from "./protocol";

export type Source = {
  id: string;
  name: string;
  parts: PetPart[];
  sourceHash: string;
  variant?: string;
  parentSourceId?: string;
  expectations: string[];
};
export type CasePlan = {
  id: string;
  group: "primary" | "source" | "care";
  sourceId: string;
  seed: string;
  seedIndex: number;
  historyId: string;
  keyframes: NeedKeyframe[];
  ages: number[];
  needId?: string;
  onset?: number;
  fulfillment?: number;
  expectation?: string;
};
export type Manifest = {
  protocolVersion: string;
  metricVersion: string;
  runId: string;
  stage: AuditStage;
  probes: ProbeSet;
  /** Explicit for new captures; historical captures used the documented default of two. */
  careSeedCount?: CareSeedCount;
  createdAt: string;
  sourceHashes: Record<string, string>;
  captureHash: string;
  sources: Source[];
  seeds: string[];
  histories: { id: string; label: string; keyframes: NeedKeyframe[] }[];
  cases: CasePlan[];
  expected: ReturnType<typeof import("./protocol").stageCounts>;
  runtime: { node: string; platform: string };
};
export type LineagePart = {
  id: string;
  kind: string;
  parentId: string | null;
  sourceIds: string[];
  relationship?: string;
  count: number;
  visible: number;
  center: { x: number; y: number };
  width: number;
  height: number;
  readiness: number;
};
export type View = {
  id: string;
  blindLabel: string;
  kind: "endpoint" | "interior" | "pose" | "source" | "care";
  age: number;
  time: number;
  phase?: number;
  actualPhase: number | null;
  poseDiagnostics?: unknown;
  fromAge?: number;
  toAge?: number;
  elapsedMs: number;
  valid: boolean;
  hash: string;
  pixels: Pixel[];
  /** Diagnostic occupancy from actual body/head/enclosure parts, independent of pigments. */
  corePixels?: Pixel[];
  coreHash?: string;
  coreDescriptor?: FrameDescriptor;
  regionalPixels?: Pixel[];
  regionalHash?: string;
  regionalOccupancy?: {
    coreUnion: number;
    head: number;
    trunk: number;
    enclosure: number;
    headTrunkOverlap: number;
    headFraction: number;
    trunkFraction: number;
    enclosureFraction: number;
    headToTrunk: number | null;
    unit: "projected occupied pixels, not physical mass";
  };
  descriptor: FrameDescriptor;
  development: unknown;
  wellbeing: unknown;
  lineage: LineagePart[];
  sourceTracking: {
    expected: number;
    represented: number;
    contributing: number;
    expectedHosts: number;
    correctHosts: number;
    missing: string[];
    hostMismatches: string[];
  };
  movement: string;
  motionPace: number;
  camera?: unknown;
};
export type CaseResult = {
  plan: CasePlan;
  genome: unknown;
  program: unknown;
  genomeHash: string;
  inheritedHash: string | null;
  inheritedPath: string | null;
  birthFidelity: boolean;
  seekAgreement: boolean;
  futureEventCausality: boolean;
  views: View[];
  error?: string;
};
export type Score = 0 | 1 | 2 | 3 | null;
export type CoreChange = {
  kind:
    | "mass-redistribution"
    | "core-partition"
    | "core-fusion"
    | "axial-reorganization"
    | "cavity-opening"
    | "cavity-enclosure";
  evidence: string;
};
export type ChangeInventory = {
  coreOrganization: CoreChange[];
  functionalRoles: {
    from: string;
    to: string;
    evidence: string;
    independentOfCoreOrganization?: boolean;
  }[];
  enclosure: {
    change: string;
    evidence: string;
    independentOfCoreOrganization?: boolean;
  }[];
  regionalAnatomy?: {
    kind: "regional-occupancy" | "head-trunk-organization" | "topology";
    regions: string[];
    evidence: string;
    independentOfCoreOrganization: boolean;
    normalizedEvidence?: {
      from: number;
      to: number;
      unit: "fraction-of-core-union" | "head/trunk-ratio";
    };
  }[];
  sourceContinuity: string[];
  /** True when the observed difference is limited to excluded nuisance/length changes. */
  scalingAppendageRotationOrPostureOnly: boolean | null;
};
export type Review = {
  protocolVersion: string;
  id: string;
  caseId: string;
  kind: "transition" | "source-counterfactual" | "care-response" | "motion";
  fromAge: number;
  toAge: number;
  controlCaseId?: string;
  requiredViewIds: string[];
  requiredDiagnosticIds: string[];
  reviewer: string | null;
  reviewerKind: "agent" | "human" | null;
  role: "primary" | "secondary" | null;
  status: "unreviewed" | "reviewed";
  evolution: Score;
  descent: Score;
  causalCare: Score;
  continuity: Score;
  featureCoherence: Score;
  inspectedViewIds: string[];
  evidenceHashes: Record<string, string>;
  inspectedDiagnosticIds: string[];
  diagnosticEvidenceHashes: Record<string, string>;
  changeInventory: ChangeInventory | null;
  notes: string;
};
export type Rate = {
  numerator: number;
  denominator: number;
  percent: number | null;
  condition: string;
  age: number | string;
};
export type Tile = {
  id: string;
  caseId: string;
  sourceId: string;
  historyId: string;
  group: string;
  blindLabel: string;
  kind: string;
  age: number;
  time: number;
  phase?: number;
  page: string;
  x: number;
  y: number;
  development: unknown;
};
