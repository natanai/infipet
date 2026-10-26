/**
 * INT-001: one source-preserving anatomical timeline built from the real
 * composable DEV-002 / CARE-002 / DEV-003 / DEV-004 transactions.
 *
 * Hour h is since hatching; at timestamp T apply: material threshold
 * transactions, ordered remodeling proposals, then iterative completion if
 * integer T. A new care sample at T governs following half-open intervals.
 *
 * E_i(t)=min(1, integral_(s_i)^min(t,s_i+d_i) q_i(u)*r_i(floor(u))du/d_i)
 * uses Agent 5's exact expressedHours (NOT strengthHours or progressDelta).
 * materialOperatorChaosRate contains the immutable birth-seeded r_i.
 * Inherited strength is applied ONLY inside stepMaterialOperatorChronology.
 *
 * No from-birth snapshots are merged. Every adapter reads/returns the same
 * authoritative MaterialGraph. Module cursors are immutable serializable
 * state, so checkpoints are observationally equivalent to replay from birth.
 */
import { compareText } from "../simulation/model";
import {
  initializeMaterialOperatorChronology,
  stepMaterialOperatorChronology,
  materialOperatorChaosRate,
  materialOperatorPotential,
  createIterativeChronologyState,
  stepIterativeChronology,
  compileLifetimeRemodeling,
  type MaterialDevelopmentProgram, type MaterialGraph,
  type MaterialOperator, type MaterialOperatorChronologyState,
  type IterativeChronologyState, type IterativeExposure,
  type LifetimeRemodelingProgram, type RemodelingChronology, REMODEL_LIMITS,
  type RemodelingProposal, type MaterialExpressionInterval,
} from "../development";
import {
  remodelingProposalsBetween, applyRemodelingProposal,
  EMPTY_REMODELING_CHRONOLOGY,
} from "../development/remodel-transactions";
import type { InheritedGenome } from "../simulation/genome";
import type { EnvironmentalHistory, CareOperatorChronology, CareExpressionCursor } from "../environment";

export const UNIFIED_MAX_HOUR = REMODEL_LIMITS.maxAgeHours;
export const UNIFIED_CHECKPOINT_LIMIT = 16;
export const UNIFIED_CHECKPOINT_INTERVAL = 24;
const EPS = 1e-9;
const cap = (v: number) => Math.max(0, Math.min(1, v));
const roundHour = (v: number) =>
  Math.abs(v - Math.round(v)) < 1e-11 ? Math.round(v) : v;
export type UnifiedMaterialState = Readonly<{
  graph: MaterialGraph;
  atHour: number;
  material: MaterialOperatorChronologyState;
  iterative: IterativeChronologyState;
  remodeling: RemodelingChronology;
  care: CareExpressionCursor | null;
  /** Numerators of E_i, weighted expressed hours (WITHOUT inherited strength). */
  expressedRateHours: Readonly<Record<string, number>>;
}>;
export type UnifiedMaterialTimeline = Readonly<{
  version: 1;
  program: MaterialDevelopmentProgram;
  maxHour: number;
  birth: () => UnifiedMaterialState;
  at: (hour: number) => UnifiedMaterialState;
  /** Independent from-birth evaluation; does not read/write any checkpoint. */
  replay: (hour: number) => UnifiedMaterialState;
  checkpointCount: () => number;
}>;

/** Exact care credit * chaos rate, partitioning wherever r_i changes. */
export function chaosWeightedCareHours(
  op: MaterialOperator,
  fromHour: number,
  toHour: number,
  care: CareOperatorChronology | null,
): number {
  if (![fromHour,toHour].every(Number.isFinite) ||
      fromHour < 0 || toHour < fromHour || toHour > UNIFIED_MAX_HOUR ||
      (care && toHour > care.maxHour))
    throw new RangeError("Weighted expression exceeds recorded or physical chronology");
  let total = 0;
  let cursor = fromHour;
  while (cursor < toHour) {
    const edge = Math.min(toHour, Math.floor(cursor) + 1);
    if (!(edge > cursor)) throw new RangeError("Unresolvable chaos-hour boundary");
    const left = Math.max(cursor,op.atHour);
    const right = Math.min(edge,op.atHour + op.durationHours);
    if (right > left) {
      const hours = care
        ? care.interval(left,right).find(e=>e.operatorId===op.id)?.expressedHours
        : right - left;
      if (hours === undefined)
        throw new TypeError("Missing operator in recorded-care chronology");
      total += hours * materialOperatorChaosRate(op,cursor);
    }
    cursor=edge;
  }
  return total;
}
export function cumulativeChaosCareExpression(
  op: MaterialOperator, hour: number, care: CareOperatorChronology | null,
): number {
  return cap(chaosWeightedCareHours(op,0,hour,care)/op.durationHours);
}
/** No fabricated directional light; available resources are genuine recorded
 * nutrition/security evidence sampled at integer n for [n,n+1). */
export function recordedIterativeResources(
  history: EnvironmentalHistory | null,
  hour: number,
): IterativeExposure {
  if (!Number.isSafeInteger(hour) || hour < 0 ||
      (history && hour > history.maxHour))
    throw new RangeError("No recorded resource pressure at requested hour");
  const pressure = history?.atHour(hour);
  return {
    atHour: hour,
    resources: pressure
      ? cap((pressure.exposure.nutrition +
          pressure.physiology.resourceSecurity) / 2)
      : 0.5,
    light: null,
  };
}
type LiveOptions = Readonly<{
  program: MaterialDevelopmentProgram;
  genome: InheritedGenome;
  care?: CareOperatorChronology;
  history?: EnvironmentalHistory;
  /** An override is useful for exact, independent tissue/relocation tests. */
  remodelingProgram?: LifetimeRemodelingProgram;
}>;

/** Locate each quantum's earliest earned threshold, never its frame-query time.
 * Within [a,b] with floor(a)=floor(b-eps), r_i is constant. Care.integral
 * remains exact inside fractional command intervals. Bisection chooses the
 * first representable crossing within 48 iterations; |deltaT| < 2^-40 h.
 */
function nextPhysicalThreshold(
  program: MaterialDevelopmentProgram,
  care: CareOperatorChronology | null,
  current: UnifiedMaterialState,
  edge: number,
): number | null {
  let earliest = Infinity;
  for (const op of program.operators) {
    const rec = current.material.records.find(r=>r.operatorId===op.id);
    if (!rec || rec.settled || op.strength===0 || op.kind==="fuse") continue;
    const capacity=materialOperatorPotential(op.kind,program.signals);
    const multiplier=op.kind==="branch"?5:7;
    const next=rec.committedUnits + 1;
    if (next>9) continue;
    const required=(next-1e-10) *
      op.durationHours / (multiplier * op.strength * capacity);
    const known=current.expressedRateHours[op.id] ?? 0;
    const increment=chaosWeightedCareHours(op,current.atHour,edge,care);
    if (known+increment+1e-13<required) continue;
    // If previous credit was suppressed/deferred, retry at the next external
    // boundary rather than generating a zero-length artificial transaction.
    if (known >= required-1e-10) continue;
    let lo=current.atHour,hi=edge;
    for(let k=0;k<48;k++) {
      const mid=(lo+hi)/2;
      if (mid===lo || mid===hi) break;
      const progress=known+chaosWeightedCareHours(op,current.atHour,mid,care);
      if (progress >= required) hi=mid; else lo=mid;
    }
    if (hi < earliest) earliest=hi;
  }
  return Number.isFinite(earliest) ? earliest : null;
}
function beginning(program:MaterialDevelopmentProgram,care:CareOperatorChronology|null):UnifiedMaterialState {
  return {
    graph:program.source,atHour:0,
    material:initializeMaterialOperatorChronology(program),
    iterative:createIterativeChronologyState(program),
    remodeling:EMPTY_REMODELING_CHRONOLOGY,
    care:care?.initial() ?? null,
    expressedRateHours:Object.fromEntries(program.operators.map(op=>[op.id,0])),
  };
}
function advance(
  current:UnifiedMaterialState,
  hour:number,
  program:MaterialDevelopmentProgram,
  remod:LifetimeRemodelingProgram,
  care:CareOperatorChronology|null,
  history:EnvironmentalHistory|null,
  onCheckpoint?:(state:UnifiedMaterialState)=>void,
):UnifiedMaterialState {
  if (!Number.isFinite(hour)||hour<current.atHour-EPS ||
      hour>UNIFIED_MAX_HOUR ||(care&&hour>care.maxHour) ||
      (history&&hour>history.maxHour))
    throw new RangeError("Requested anatomy extends beyond chronological evidence/domain");
  let state=current;
  // Each outer step is bounded by the next integer resource interval, the
  // next fractional remodeling operation, or the requested query cutoff.
  while(state.atHour < hour-EPS) {
    const start=state.atHour;
    const completion=Math.floor(start+EPS)+1;
    const remodeling=remodelingProposalsBetween(remod,start,
      Math.min(hour,completion));
    const firstRemodel=remodeling[0]?.atHour ?? Infinity;
    const upper=Math.min(hour,completion,firstRemodel);
    const threshold=nextPhysicalThreshold(program,care,state,upper);
    let next=threshold!==null?Math.min(upper,threshold):upper;
    if(next-start<EPS) next=upper;
    if(!(next>start))throw new RangeError("Nonadvancing integrated material clock");
    const progress=Object.fromEntries(program.operators.map(op=>[
      op.id,(state.expressedRateHours[op.id]??0)+
        chaosWeightedCareHours(op,start,next,care),
    ]));
    const expressions:MaterialExpressionInterval = {
      fromHour:state.material.nextHour,toHour:next,
      expressions:program.operators.map(op=>({
        operatorId:op.id,cumulative:cap(progress[op.id]/op.durationHours),
      })),
    };
    const material=stepMaterialOperatorChronology(
      state.graph,program,state.material,expressions);
    let graph=material.graph;
    let remodelingState=state.remodeling;
    // At the exact proposed T, material threshold commits first. Equal-time
    // remodeling proposals are already stable by operation ID and ordinal.
    for(const p of remodeling.filter(p=>Math.abs(p.atHour-next)<EPS)) {
      const applied=applyRemodelingProposal(graph,remod,p,remodelingState);
      graph=applied.graph;remodelingState=applied.chronology;
    }
    let iterative=state.iterative;
    if(Math.abs(next-completion)<EPS && completion<=hour) {
      const result=stepIterativeChronology(program,graph,iterative,
        recordedIterativeResources(history,completion-1));
      graph=result.graph;iterative=result.state;
    }
    state={
      graph, atHour:roundHour(next),
      material:material.state,iterative,remodeling:remodelingState,
      care:care&&state.care ? care.advance(state.care,next).next : null,
      expressedRateHours:progress,
    };
    if(Number.isSafeInteger(state.atHour) &&
       state.atHour%UNIFIED_CHECKPOINT_INTERVAL===0) onCheckpoint?.(state);
  }
  return state;
}
export function createUnifiedMaterialTimeline(options:LiveOptions):UnifiedMaterialTimeline {
  const {program,genome}=options;
  if(program.genomeFingerprint!==genome.genotype.fingerprint)
    throw new TypeError("Material timeline cannot change the permanent genotype");
  const care=options.care??null,history=options.history??null;
  if(care && (care.programFingerprint!==program.fingerprint ||
      care.genotypeFingerprint!==program.genomeFingerprint ||
      (history&&care.maxHour!==history.maxHour)))
    throw new TypeError("Care timeline does not belong to this saved organism");
  const remod=options.remodelingProgram ??
    compileLifetimeRemodeling(program,genome);
  const maxHour=Math.min(UNIFIED_MAX_HOUR,care?.maxHour??UNIFIED_MAX_HOUR,
    history?.maxHour??UNIFIED_MAX_HOUR);
  const checkpoints=new Map<number,UnifiedMaterialState>();
  const birth=()=>beginning(program,care);
  function replay(hour:number):UnifiedMaterialState {
    return advance(birth(),hour,program,remod,care,history);
  }
  function at(hour:number):UnifiedMaterialState {
    if(!Number.isFinite(hour)||hour<0||hour>maxHour)
      throw new RangeError("Cannot extrapolate beyond recorded or anatomical horizon");
    let initial=birth();
    for(const [time,checkpoint] of checkpoints)
      if(time<=hour && time>=initial.atHour) initial=checkpoint;
    const result=advance(initial,hour,program,remod,care,history,checkpoint=>{
      checkpoints.delete(checkpoint.atHour);
      checkpoints.set(checkpoint.atHour,checkpoint);
      while(checkpoints.size>UNIFIED_CHECKPOINT_LIMIT)
        checkpoints.delete(checkpoints.keys().next().value!);
    });
    return result;
  }
  return {version:1,program,maxHour,birth,at,replay,
    checkpointCount:()=>checkpoints.size};
}
