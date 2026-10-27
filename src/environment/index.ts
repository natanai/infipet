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

export {
  CARE_EXPOSURE_VERSION,
  CARE_EXPOSURE_LIMITS,
  createCareOperatorChronology,
} from "./operator-chronology";
export type {
  OperatorExpressionCredit,
  CareExpressionCursor,
  CareExposureAdvance,
  CareOperatorChronology,
} from "./operator-chronology";

export {summarizeDailyCareWindow,createDailyCareWindowSummarizer} from "./daily-care";
export type {DailyCareWindowV1} from "./daily-care";
