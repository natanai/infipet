/** A persisted stage boundary, measured in developmental hours after hatching. */
export type DevelopmentStagePoint = Readonly<{
  id: string;
  atHour: number;
  care: number;
  training: number;
  battle: number;
}>;

/** Chronological care and authored grooming remain independent of morphology time. */
export type LiveDevelopmentContext = Readonly<{
  hatchAtHours: number;
  stagePoints: readonly DevelopmentStagePoint[];
  /** End of hatchling, infant, juvenile, adult, in hours after hatching. */
  stageEndHours: readonly number[];
}>;

export type LineageTraitModifiers = Readonly<{
  elongation: number;
  widening: number;
  curvature: number;
  support: number;
  membrane: number;
  enclosure: number;
}>;

export type LineagePlacement = Readonly<{
  nodeId: string;
  profileId: string;
  confidence: "broad" | "supported";
  evidence: readonly string[];
}>;

export type LineageCommitment = Readonly<{
  stageId: string;
  atHour: number;
  nodeId: string;
  profileId: string;
  seedPotential: number;
  careContribution: number;
}>;

export type LineageProgram = Readonly<{
  version: string;
  fingerprint: string;
  placement: LineagePlacement;
  commitments: readonly LineageCommitment[];
}>;

export type LineageState = LineagePlacement &
  Readonly<{
    name: string;
    commitments: readonly LineageCommitment[];
    version: string;
  }>;
