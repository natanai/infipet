/** Normative elapsed-time clock. No Date, timezone, frame clock or wall-clock reads. */
export const DAILY_INTERVAL_MS = 86_400_000;
export const FINAL_ANATOMICAL_CHECK = 365;
export const DAILY_HOURS = 24;
export type DailyCareWindowV1 = Readonly<{
  version: 1;
  hatchAtMs: number;
  checkIndex: number;
  startMs: number;
  endMs: number;
  /** Time integrals divided by exactly 86,400,000ms. Unknown intervals
   * contribute zero availability and are explicitly counted, never fake care. */
  forcing: Readonly<{
    nutrition: number; rest: number; activity: number; threat: number;
    security: number; observedFraction: number;
  }>;
  acceptedCommands: number;
  rejectedCommands: number;
  observations: number;
  activeMs: number;
  absentMs: number;
  unknownMs: number;
  unknown: readonly string[];
  provenanceDigest: string;
}>;
export function dailyCheckTime(hatchAtMs:number,checkIndex:number):number {
  if (!Number.isSafeInteger(hatchAtMs)||hatchAtMs<0 ||
      !Number.isSafeInteger(checkIndex)||checkIndex<0||checkIndex>FINAL_ANATOMICAL_CHECK ||
      !Number.isSafeInteger(hatchAtMs+checkIndex*DAILY_INTERVAL_MS))
    throw new RangeError("Invalid daily anatomical clock");
  return hatchAtMs+checkIndex*DAILY_INTERVAL_MS;
}
export function completedDailyChecks(hatchAtMs:number,nowMs:number):number {
  dailyCheckTime(hatchAtMs,FINAL_ANATOMICAL_CHECK);
  if(!Number.isSafeInteger(nowMs)||nowMs<hatchAtMs)
    throw new RangeError("Invalid backward daily chronology");
  return Math.min(FINAL_ANATOMICAL_CHECK,Math.floor((nowMs-hatchAtMs)/DAILY_INTERVAL_MS));
}
export function validateDailyCareWindow(w:DailyCareWindowV1):void {
  if(!w||w.version!==1 ||w.checkIndex<1 ||
      w.startMs!==dailyCheckTime(w.hatchAtMs,w.checkIndex-1)||
      w.endMs!==dailyCheckTime(w.hatchAtMs,w.checkIndex)||
      !w.forcing||Array.isArray(w.forcing)||
      !["nutrition","rest","activity","threat","security","observedFraction"].every(key=>{
        const value=(w.forcing as Record<string,number>)[key];
        return Number.isFinite(value)&&value>=0&&value<=1;
      })||Object.keys(w.forcing).length!==6||
      ![w.acceptedCommands,w.rejectedCommands,w.observations,w.activeMs,w.absentMs,w.unknownMs]
        .every(v=>Number.isSafeInteger(v)&&v>=0)||
      w.activeMs+w.absentMs+w.unknownMs!==DAILY_INTERVAL_MS ||
      !Array.isArray(w.unknown)||!w.unknown.every(s=>typeof s==="string")||
      typeof w.provenanceDigest!=="string"||!w.provenanceDigest.length)
    throw new RangeError("Invalid exact DailyCareWindowV1");
}
