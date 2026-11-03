/**
 * STAGE-001 — one named ontogenetic life over the existing daily-365 clock.
 *
 * This module is pure presentation/scheduling geometry. It NEVER adds cells,
 * switches a species, changes the genetic source, reads a clock, or picks a
 * target stage sprite. Physical material can change only in daily-step.ts.
 *
 * All boundaries are inclusive and fixed for this algorithm version.
 */
import {FINAL_ANATOMICAL_CHECK} from "./daily-contract";

export const DEVELOPMENT_STAGES = [
  {stage:"egg",startCheck:0,endCheck:20,representativeCheck:10},
  {stage:"infant",startCheck:21,endCheck:80,representativeCheck:60},
  {stage:"teen",startCheck:81,endCheck:170,representativeCheck:140},
  {stage:"adult",startCheck:171,endCheck:280,representativeCheck:245},
  {stage:"elder",startCheck:281,endCheck:FINAL_ANATOMICAL_CHECK,representativeCheck:345},
] as const;
export type DevelopmentStage = typeof DEVELOPMENT_STAGES[number]["stage"];
export const STAGE_BOUNDARY_CHECKS = [21,81,171,281] as const;
export const STAGE_TRANSITION_HALF_WIDTH = 12 as const;
export const STAGE_REPRESENTATIVE_CHECKS = [10,60,140,245,345] as const;

/** Zero is exact original ink; 365 is final anatomical commitment. */
export function stageAtCheck(check:number):DevelopmentStage{
 if(!Number.isSafeInteger(check)||check<0||check>FINAL_ANATOMICAL_CHECK)
  throw new RangeError("Invalid developmental stage check");
 for(const epoch of DEVELOPMENT_STAGES)
  if(check>=epoch.startCheck&&check<=epoch.endCheck)return epoch.stage;
 throw new Error("Uncovered daily developmental stage");
}
export function developmentalStageIndex(check:number):number{
 const name=stageAtCheck(check);
 return DEVELOPMENT_STAGES.findIndex(epoch=>epoch.stage===name);
}
/** A nonnegative age may exceed maturity, but never reopens anatomy. */
export function stageAtElapsedDays(days:number):DevelopmentStage{
 if(!Number.isFinite(days)||days<0)
  throw new RangeError("Invalid elapsed developmental age");
 return stageAtCheck(Math.min(FINAL_ANATOMICAL_CHECK,Math.floor(days)));
}
/** Triangular fixed opportunity pulse; not an automatic shape operation. */
export function transitionPressure(check:number):number{
 stageAtCheck(check);
 let pressure=0;
 for(const boundary of STAGE_BOUNDARY_CHECKS)
  pressure=Math.max(pressure,Math.max(0,
   1-Math.abs(check-boundary)/STAGE_TRANSITION_HALF_WIDTH));
 return pressure;
}
/** Stable [0,1] stage and transition weights, not image/silhouette targets. */
export const STAGE_PRESSURE_WEIGHTS = {
 egg: {reorganization:0.8,articulation:0.3,reattachment:0.2,specialization:0.2,consolidation:0.9},
 infant: {reorganization:0.9,articulation:0.8,reattachment:0.5,specialization:0.6,consolidation:0.7},
 teen: {reorganization:1,articulation:1,reattachment:0.9,specialization:1,consolidation:0.4},
 adult: {reorganization:0.9,articulation:0.9,reattachment:1,specialization:1,consolidation:0.9},
 elder: {reorganization:0.9,articulation:0.7,reattachment:0.8,specialization:1,consolidation:0.8},
} as const satisfies Record<DevelopmentStage,Record<string,number>>;
