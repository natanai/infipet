import type {
  PetPart,
  SourceMode,
  Pixel,
  PetAction,
  Point,
  PartFrame,
} from "../../src/simulation";
import type { GameCommand, GameStage, GameState } from "../../src/gameplay";

export type MonoBitmap = { width: number; height: number; rows: string[] };
export type ReferenceStatus =
  "observed" | "community-extracted-reference" | "provisional" | "unavailable";
export type RetroCatalog = {
  schemaVersion: number;
  devices: {
    id: string;
    name: string;
    edition: string;
    rootCharacterId: string;
    characterIds: string[];
  }[];
  characters: {
    id: string;
    deviceId: string;
    name: string;
    stage: string;
    gameStage?: GameStage;
    root: boolean;
    target?: MonoBitmap | null;
    targetStatus?: string;
    sprite?: {
      file?: string;
      sourceUrl?: string;
      verification?: string;
      [key: string]: unknown;
    };
  }[];
  edges: {
    from: string;
    to: string;
    deviceId: string;
    evidence?: unknown;
    status?: string;
    careHint?: string;
    [key: string]: unknown;
  }[];
};
export type RetroSource = { id: string; parts: PetPart[]; mode: SourceMode };
export type WitnessVersions = {
  prototype: string;
  gameplay: number;
  rules: string;
  lineage: string;
  needsCatalog: string;
  needsRules: number;
};
/** This is the entire renderer recipe. It intentionally contains no target bitmap or path. */
export type WitnessRecipe = {
  version: 1;
  versions: WitnessVersions;
  source: RetroSource;
  seed: string;
  startedAtMs: number;
  utcOffsetMinutes: number;
  policyId: string;
  endHour: number;
  commands: { id: string; atHour: number; command: GameCommand }[];
};
export type RetroCheckpoint = {
  id: string;
  characterId: string;
  name: string;
  atHour: number;
  expectedStage: GameStage;
  target?: MonoBitmap;
  referenceStatus: ReferenceStatus;
  referenceTiming: "combined-clock-adaptation" | "documented" | "unknown";
  referenceAgeHours?: number;
  careEvidence: "documented" | "provisional" | "unknown";
  animationTime: number;
  expectedBranch?: string;
  sampleKind?:
    "reference" | "transition" | "action" | "interstage" | "retention";
  action?: PetAction;
  actionTarget?: Point;
};
export type RetroCase = {
  id: string;
  deviceId: string;
  rootCharacterId: string;
  characterIds: string[];
  source: RetroSource;
  checkpoints: RetroCheckpoint[];
  nativeHistory?: {
    editionId: string;
    routeId: string;
    teenHistoryKind: number;
    adultHistoryKind: number;
    commandHistoryStatus: "unverified-controller-mapping";
  };
};
export type CapturedCheckpoint = {
  checkpoint: RetroCheckpoint;
  game: GameState;
  pixels: Pixel[];
  frameHash: string;
  sourceIntegrity: {
    missingSourceIds: string[];
    emptyFaceIds: string[];
    hiddenFaceIds: string[];
    unverifiedFaceTransportIds?: string[];
    lowContrastFaceIds?: string[];
  };
  genomeFingerprint: string;
  parts?: PartFrame[];
  sourceFeatureContrasts?: Record<string, number>;
};
export type ShapeMetrics = {
  silhouetteIoU: number;
  filledSilhouetteIoU: number;
  pixelAgreement: number;
  aspectSimilarity: number;
  densitySimilarity: number;
  components: { actual: number; target: number };
  holes: { actual: number; target: number };
  alignment: {
    dx: number;
    dy: number;
    gridSize: number;
    transform: "translate-and-uniform-scale";
  };
};
export type CheckpointScore = {
  id: string;
  characterId: string;
  name: string;
  atHour: number;
  expectedStage: GameStage;
  actualStage: GameStage;
  animationTime: number;
  status: "unscored" | "failed" | "machine-candidate";
  unavailableReason?: string;
  metrics: ShapeMetrics | null;
  stageReached: boolean;
  alive: boolean;
  sourcePreserved: boolean;
  actualBranch: string | null;
  expectedBranch: string | null;
  referenceBranchMatched: boolean | null;
  frameHash: string;
  targetHash: string | null;
  referenceTiming: RetroCheckpoint["referenceTiming"];
  careEvidence: RetroCheckpoint["careEvidence"];
  relativeDimensions?: null | {
    actual: {
      left: number;
      top: number;
      width: number;
      height: number;
      ink: number;
    };
    target: {
      left: number;
      top: number;
      width: number;
      height: number;
      ink: number;
    };
    actualWidthRatio: number;
    targetWidthRatio: number;
    actualHeightRatio: number;
    targetHeightRatio: number;
    widthSimilarity: number;
    heightSimilarity: number;
    passed: boolean;
  };
  sourceFeatureGeometry?: {
    id: string;
    sourcePartIds: string[];
    kind: string;
    relativeX: number;
    relativeY: number;
    relativeWidth: number;
    relativeHeight: number;
    contrast: number | null;
    transport: string;
  }[];
  referenceFeatureGeometry?: "unverified";
};
export type LifecycleScore = {
  gameEligible: boolean;
  status: "unscored" | "failed" | "candidate-needs-visual-review";
  worstIoU: number | null;
  meanIoU: number | null;
  scoredStages: number;
  totalStages: number;
  birthExact: boolean;
  referenceParityEstablished: false;
  visualReview: "unreviewed";
  checkpoints: CheckpointScore[];
  fullLifeComplete?: boolean;
  fullLifeEligible?: boolean;
  terminal?: TerminalEvidence;
  nativeHistoryStatus?:
    | "not-applicable"
    | "unverified-controller-mapping"
    | "verified-command-trace";
  diagnostics?: DiagnosticEvidence;
};
export type DiagnosticEvidence = {
  scheduleVersion: string;
  status: "passed" | "failed" | "unscored";
  maximumMaterialStep: number;
  maximumFeatureStep: number;
  failures: string[];
  samples: {
    id: string;
    atHour: number;
    animationTime: number;
    action: PetAction;
    kind: string;
    frameHash: string;
    sourcePreserved: boolean;
    alive: boolean;
    stage: GameStage;
    bounds: {
      left: number;
      top: number;
      width: number;
      height: number;
      ink: number;
    };
    referenceMetrics: ShapeMetrics | null;
  }[];
};
export type TerminalEvidence = {
  complete: boolean;
  terminal: null | {
    atHour: number;
    cause: string;
    stage: GameStage;
    stateHash: string;
    commandCount: number;
  };
  finalReferenceHour: number;
  finalFormLivedHours: number | null;
  noInputsAfterDeath: boolean;
  finalFormRetained: boolean;
  restart: {
    freshGameCreated: boolean;
    emptyCommandHistory: boolean;
    zeroCareAndBattles: boolean;
    stateHash: string;
    creationUI: "requires-visual-review";
  };
};
export type SearchResult = {
  caseId: string;
  candidatesTried: number;
  seedsTried: number;
  policiesTried: string[];
  searchMode?: "full" | "staged";
  status?: LifecycleScore["status"];
  prefixSearch?: {
    attemptedInputs: number;
    prefixSimulations: number;
    fullLivesSimulated: number;
    rejectedAt: Record<string, number>;
    rejectionReasons?: Record<string,number>;
    unscoredReference: boolean;
    bestRejectedPrefix?: {
      seed: string;
      policyId: string;
      atHour: number;
      worstIoU: number | null;
      frameHash: string;
      relativeSizePassed?:boolean;
      sourcePreserved?:boolean;
      stageReached?:boolean;
    };
    bestRawSizeEligiblePrefix?: {seed:string;policyId:string;atHour:number;worstIoU:number|null;frameHash:string};
  };
  winner: {
    recipe: WitnessRecipe;
    score: LifecycleScore;
    captures: CapturedCheckpoint[];
  } | null;
};
export type RetroAuditSummary = {
  version: 1;
  runId: string;
  generatedAt: string;
  versions: WitnessVersions;
  searchMode?: "full" | "staged";
  stagedSearch?: {
    uniqueInputCandidates: number;
    prefixSimulations: number;
    uniquePrefixInputs?: number;
    fullLivesSimulated: number;
    budgetExhausted: boolean;
    elapsedMs: number;
    nextByRoot: Record<string, { seedIndex: number; policyIndex: number }>;
  };
  counts: {
    paths: number;
    candidates: number;
    unscored: number;
    failed: number;
    machineCandidates: number;
    visuallyAccepted: 0;
    gameEligible?: number;
    fullLifeEligible?: number;
    nativeHistoryUnverified?: number;
  };
  paths: {
    id: string;
    deviceId: string;
    characterIds: string[];
    rootCharacterId: string;
    status: LifecycleScore["status"];
    unavailableReason?: string;
    gameEligible?: boolean | null;
    fullLifeEligible?: boolean | null;
    nativeHistory?: RetroCase["nativeHistory"];
    prefixSearch?: SearchResult["prefixSearch"];
    best?: {
      seed: string;
      policyId: string;
      worstIoU: number | null;
      meanIoU: number | null;
      witnessFile: string;
      checkpoints: CheckpointScore[];
      terminal?: TerminalEvidence;
      diagnostics?: DiagnosticEvidence;
      nativeHistoryStatus?: LifecycleScore["nativeHistoryStatus"];
      fullLifeComplete?: boolean;
    };
  }[];
};
export type PublishedWitnessData = {
  version: 1;
  recipes: Record<string, WitnessRecipe>;
  byPath: Record<string, string>;
  checksums: Record<string, Record<string, string>>;
};
