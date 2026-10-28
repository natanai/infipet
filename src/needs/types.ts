import type {
  APPEARANCE_NEED_IDS,
  FeelingSatisfaction,
  NeedId,
} from "./catalog";

/** Initial timeline window; this is not a lifespan or biological limit. */
export const DEFAULT_PREVIEW_DAYS = 240;
/** @deprecated Use DEFAULT_PREVIEW_DAYS for UI windows; chronology is open-ended. */
export const MAX_DEVELOPMENT_DAYS = DEFAULT_PREVIEW_DAYS;
export const MAX_NEED_TICK = Number.MAX_SAFE_INTEGER;
export const MAX_SIMULATION_DAYS = MAX_NEED_TICK / 24;
export const DEFAULT_FULFILLMENT = 0.75;
/** Six physiological channels through 8,761 hourly daily-life observations. */
export const MAX_NEED_KEYFRAMES = 65536;
export type NeedKeyframe = {
  needId: NeedId;
  tick: number;
  fulfillment: number;
};
export type NeedState = {
  fulfillment: number;
  /** Fast fulfillment average, 0..1; six-hour half life. */
  shortTerm: number;
  /** Cumulative deficit-days relative to the .75 default. */
  exposure: number;
  /** Slow unmet-need memory, 0..1; seven-day half life. */
  memory: number;
};
export type ModeledNeedId = (typeof APPEARANCE_NEED_IDS)[number];
/** Independent causal inputs; a raw dial is never mistaken for accumulated adaptation. */
export type NeedDevelopmentDriver = Readonly<{
  fulfillment: number;
  shortTerm: number;
  exposure: number;
  memory: number;
  /** Immediate unmet signal; available to causal decisions at the current boundary. */
  acuteDeficit: number;
  /** Six-hour response to fulfillment below the neutral .75 baseline. */
  shortage: number;
  /** Positive six-hour response above the neutral .75 baseline. */
  opportunity: number;
  /** Continuous adaptation input: .55 shortage + .45 chronic memory. */
  load: number;
}>;
export type NeedDevelopmentDrivers = Readonly<
  Record<ModeledNeedId, NeedDevelopmentDriver>
>;
export type NeedMorphologySignals = Readonly<
  Record<ModeledNeedId, Readonly<{ load: number; opportunity: number }>>
>;
export type WellbeingState = {
  /** Elapsed ms since hatch; an old save did not record this past interval. */
  physiologyEvidence?:Readonly<{unknownInterval:Readonly<{fromMs:number;toMs:number}>}>;
  tick: number;
  developmentalAge: number;
  needs: Record<NeedId, NeedState>;
  readonly needDrivers: NeedDevelopmentDrivers;
  feelings: {
    id: string;
    title: string;
    intensity: number;
    satisfaction: FeelingSatisfaction;
  }[];
  development: {
    protection: number;
    recovery: number;
    vigor: number;
    vigilance: number;
    guarding: number;
    defensiveDisplay: number;
    noveltyDrive: number;
  };
};
