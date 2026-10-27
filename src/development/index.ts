/** Single-organism physical development, separate from the existing display renderer. */
export {
  createMaterialGraph,
  reconstructMaterialGraph,
  materialSourceAncestry,
} from "./material-graph";
export type {
  MaterialCell, MaterialTissue, MaterialSite, MaterialLink,
  MaterialEvent, MaterialGraph,
} from "./material-graph";
export {
  applyMaterialOperators,
  compileMaterialDevelopment,
  materialDevelopmentAt,
  MATERIAL_LIMITS,
} from "./operators";
export type {
  MaterialOperator, MaterialOperatorKind, MaterialDevelopmentProgram,
} from "./operators";

export {
  CHAOS_VERSION, CHAOS_MODULUS, CHAOS_MAX_TICK,
  seedChaos, stepChaos, reverseChaos, chaosAt,
  chaoticProgress, chaoticTurn, validateMaterialChaos,
} from "./chaos";
export type { ChaosState, MaterialChaos } from "./chaos";

/** DEV-002 chronological operator ledger; runtime/Environment handoff. */
export {
  initializeMaterialOperatorChronology,
  stepMaterialOperatorChronology,
  materialOperatorChaosRate, materialMaximumCumulativeExpression,
} from "./operator-chronology";
export type {
  MaterialCumulativeExpression, MaterialExpressionInterval,
  MaterialExpressionRecord, MaterialOperatorChronologyState,
  MaterialOperatorDecision, MaterialOperatorReason, MaterialOperatorTransaction,
} from "./operator-chronology";

/** Merged DEV-003 / DEV-004 public exports, awaiting an incremental transition port. */
export {
  ITERATIVE_LIMITS,
  createIterativeGrowth,
  iterativeGrowthAt,
  allocateGrowthCredits,
  assessIterativePlacement,
} from "./iterative-growth";
export type {
  LightExposure,
  IterativeExposure,
  IterativeGrowthFrame,
  IterativeGrowthProgram,
  IterativeGrowthSite,
  IterativeGrowthLedger,
  GrowthSuppression,
} from "./iterative-growth";
export {
  REMODEL_LIMITS,
  compileLifetimeRemodeling,
  lifetimeRemodelingAt,
  mechanicalCapabilities,
  mechanicalRegions,
  auditRemodelLegibility,
} from "./lifetime-remodeling";
export type {
  LifetimeRemodelingProgram,
  LifetimeRemodelingFrame,
  RemodelOperation,
  RemodelTransition,
  RemodelDeferral,
  MechanicalCapability,
  MechanicalRegion,
} from "./lifetime-remodeling";

/** Composable, lifetime-bounded incremental operators (NOT cumulative snapshots). */
export { materialOperatorPotential } from "./operators";
export {
  ITERATIVE_CHRONOLOGY_MAX_HOURS,
  createIterativeChronologyState,
  stepIterativeChronology,
  replayIterativeChronology,
} from "./iterative-chronology";
export type {
  PersistentGrowthSite, GrowthSiteChange,
  IterativeChronologyState, IterativeChronologyStep,
} from "./iterative-chronology";
export {
  remodelingProposalsBetween,
  applyRemodelingProposal,
  applyRemodelingInterval,
  EMPTY_REMODELING_CHRONOLOGY,
  remodelingMechanicalState,
} from "./remodel-transactions";
export type {
  RemodelingProposal, RemodelingAttempt, RemodelingHinge,
  RemodelingChronology, RemodelingTransaction, RemodelingInterval,
} from "./remodel-transactions";

/** DEV-005: speculative hints compile to real unified material transactions. */
export {
  SPECULATIVE_LIMITS, SPECULATIVE_OPERATOR_MAP,
  compileSpeculativeMaterialComposition, speculativePhysicalOutcomes,
} from "./speculative-material";
export type {
  SpeculativeOperatorBinding, SpeculativeCompileSuppression,
  SpeculativeMaterialComposition, SpeculativePhysicalOutcome,
} from "./speculative-material";
