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
