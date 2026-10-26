export {
  ENVIRONMENT_HISTORY_VERSION,
  createEnvironmentalHistory,
} from "./history";
export type {
  EnvironmentalHistory,
  EnvironmentPressure,
  RecordedCareEvidence,
  SampledCareEvidence,
} from "./history";
export { compileCareDevelopmentSignals } from "./reaction-norm";
export type { CareDevelopmentSignals, CareOperatorSignal } from "./reaction-norm";

export {
  careMaterialOperatorsAt,
  createCareMaterialDevelopment,
} from "./material-development";
export type { CareMaterialDevelopment } from "./material-development";
