/**
 * Legacy continuous-clock mathematical reference API. Ordinary player simulation does not import this scheduler; it uses daily-runtime.ts. This module remains for independent comparison of shared transaction primitives, with no authority over the player clock.
 */
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
  /** Checkpoints PLUS a distinct most-recent integer-hour state. */
  retainedStateCount: () => number;
  /** A provenanced immutable completed canonical hour, never a fractional state. */
  exportCanonicalStates: (throughHour?: number) => readonly UnifiedMaterialState[];
  /** Observation only: zero cold advances on a successful history-prefix reuse. */
  evaluationStats: () => Readonly<{cold: number; resumed: number; imported: number}>;
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
  // Zero credit outside the operator's *permanent* birth-time window.
  // Intersect before iterating: an 8192h query must not scan thousands of
  // irrelevant hours for an operator that only lives during a short interval.
  // Inside the overlap preserve the original left/right arithmetic, hourly
  // chaos sample and care.interval calls exactly, including fractional ends.
  const begin = Math.max(fromHour, op.atHour);
  const end = Math.min(toHour, op.atHour + op.durationHours);
  if (!(end > begin)) return 0;
  let total = 0;
  let cursor = begin;
  while (cursor < end) {
    const edge = Math.min(end, Math.floor(cursor) + 1);
    if (!(edge > cursor)) throw new RangeError("Unresolvable chaos-hour boundary");
    const hours = care
      ? care.interval(cursor,edge).find(e=>e.operatorId===op.id)?.expressedHours
      : edge - cursor;
    if (hours === undefined)
      throw new TypeError("Missing operator in recorded-care chronology");
    total += hours * materialOperatorChaosRate(op,cursor);
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
  /** Internal authenticated-prefix handoff; the caller must verify history first. */
  canonicalStates?: readonly UnifiedMaterialState[];
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
  // The operator's fixed lifetime is a hard support interval for earning
  // credit. This pruning only eliminates provable zero integrals, NEVER an
  // operation/decision or a chronological iterative hour.
  const records = new Map(current.material.records.map(r=>[r.operatorId,r]));
  for (const op of program.operators) {
    if (op.atHour >= edge || op.atHour + op.durationHours <= current.atHour)
      continue;
    const rec = records.get(op.id);
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
  if (!Number.isFinite(hour)||hour<current.atHour ||
      hour>UNIFIED_MAX_HOUR ||(care&&hour>care.maxHour) ||
      (history&&hour>history.maxHour))
    throw new RangeError("Requested anatomy extends beyond chronological evidence/domain");
  let state=current;
  // A permanent operator cannot accrue expression outside its exact support.
  // Beyond the greatest support end, every weighted increment is IDENTICALLY
  // zero; retain the existing accumulated floating-point value unchanged.
  const lastSupportEnd=Math.max(0,...program.operators.map(op=>
    op.atHour+op.durationHours));
  // Each outer step is bounded by the next integer resource interval, the
  // next fractional remodeling operation, or the requested query cutoff.
  while(state.atHour < hour) {
    const start=state.atHour;
    const completion=Math.floor(start)+1;
    const remodeling=remodelingProposalsBetween(remod,start,
      Math.min(hour,completion));
    const firstRemodel=remodeling[0]?.atHour ?? Infinity;
    const upper=Math.min(hour,completion,firstRemodel);
    const outsideAllSupports=start>=lastSupportEnd;
    const threshold=outsideAllSupports?null:
      nextPhysicalThreshold(program,care,state,upper);
    let next=threshold!==null?Math.min(upper,threshold):upper;
        if(!(next>start))throw new RangeError("Nonadvancing integrated material clock");
    const progress=outsideAllSupports?state.expressedRateHours:
      Object.fromEntries(program.operators.map(op=>[
        op.id,(state.expressedRateHours[op.id]??0)+
          chaosWeightedCareHours(op,start,next,care),
      ]));
    // A mere frame request is not a physical event. Only quantized material
    // thresholds, remodeling events, and integer resource completions may
    // commit anatomical work. Otherwise retain the unconsumed operator
    // cursor while updating the pure care integral; the next real event
    // receives the entire contiguous interval and cannot be double-counted.
    const atThreshold=threshold!==null && next===threshold;
    const atRemodel=remodeling.some(p=>p.atHour===next);
    const atInteger=next===completion;
    if(!atThreshold && !atRemodel && !atInteger) {
      state={
        ...state,atHour:next,expressedRateHours:progress,
        care:care&&state.care?care.advance(state.care,next).next:null,
      };
      continue;
    }
    // Once EVERY permanent material operator has irreversibly settled,
    // no later care or chaotic rate may add an operator decision. Preserve
    // the exact immutable records/decisions and advance the ledger cutoff
    // without revalidating/rebuilding the full source graph each hour.
    // Iterative growth, fractional remodeling, and physiological exposure
    // STILL execute at all their original chronological boundaries.
    const material=state.material.records.every(record=>record.settled)
      ? {
          graph:state.graph,
          state:{...state.material,nextHour:next},
        }
      : stepMaterialOperatorChronology(
          state.graph,program,state.material,{
            fromHour:state.material.nextHour,toHour:next,
            expressions:program.operators.map(op=>({
              operatorId:op.id,cumulative:cap(progress[op.id]/op.durationHours),
            })),
          });
    let graph=material.graph;
    let remodelingState=state.remodeling;
    // At the exact proposed T, material threshold commits first. Equal-time
    // remodeling proposals are already stable by operation ID and ordinal.
    for(const p of remodeling.filter(p=>p.atHour===next)) {
      const applied=applyRemodelingProposal(graph,remod,p,remodelingState);
      graph=applied.graph;remodelingState=applied.chronology;
    }
    let iterative=state.iterative;
    if(next===completion) {
      const result=stepIterativeChronology(program,graph,iterative,
        recordedIterativeResources(history,completion-1));
      graph=result.graph;iterative=result.state;
    }
    state={
      graph, atHour:next,
      material:material.state,iterative,remodeling:remodelingState,
      care:care&&state.care ? care.advance(state.care,next).next : null,
      expressedRateHours:progress,
    };
    if(Number.isSafeInteger(state.atHour) &&
       state.atHour%UNIFIED_CHECKPOINT_INTERVAL===0) onCheckpoint?.(state);
  }
  return state;
}
/**
 * Runtime-only credentials for physically immutable canonical snapshots.
 * Weak keys do not retain evicted creatures. Unbranded/modified snapshots
 * cannot be injected into another timeline, even when public fingerprints
 * happen to be equal. All material and care chronology remains authoritative.
 */
const canonicalAttestations=new WeakMap<UnifiedMaterialState,Readonly<{
  program:MaterialDevelopmentProgram; hour:number;
}>>();
function sealedCheckpoint<T>(value:T):T {
  if(value&&typeof value==="object"&&!Object.isFrozen(value)){
    for(const child of Object.values(value))sealedCheckpoint(child);
    Object.freeze(value);
  }
  return value;
}
function copyCheckpoint<T>(value:T):T {
  return Array.isArray(value) ? value.map(copyCheckpoint) as T
    : value&&typeof value==="object"
      ? Object.fromEntries(Object.entries(value).map(([k,v])=>[k,copyCheckpoint(v)])) as T
      : value;
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
  // One canonical completed integer hour, independent of display pose and
  // fractional frame requests. Do NOT cache the intermediate fractional
  // result: the next query must derive threshold crossings from a canonical
  // integer boundary, not a previous request's arbitrary cutoff.
  let hotHour:UnifiedMaterialState|null=null;
  let cold=0, resumed=0;
  // Canonical completed states are transferred by immutable reference.
  // The sealed graph cannot be changed by any saved life, including its
  // original owner; only a newly committed physical transaction creates
  // a different graph.
  let imported=0;
  for(const candidate of (options.canonicalStates??[]).slice(0,UNIFIED_CHECKPOINT_LIMIT)){
    const h=candidate.atHour;
    const attestation=canonicalAttestations.get(candidate);
    if(!attestation || attestation.program!==program ||
       attestation.hour!==h || !Object.isFrozen(candidate) ||
       !Number.isSafeInteger(h) || h<=0 || h>maxHour ||
       candidate.iterative.nextHour!==h ||
       candidate.graph.sourceFingerprint!==program.source.sourceFingerprint ||
       candidate.material.programFingerprint!==program.fingerprint ||
       candidate.material.genotypeFingerprint!==program.genomeFingerprint ||
       candidate.iterative.fingerprint!==program.fingerprint ||
       candidate.iterative.genomeFingerprint!==program.genomeFingerprint ||
       candidate.material.nextHour!==h ||
       Boolean(candidate.care)!==Boolean(care) ||
       (candidate.care &&
        (candidate.care.throughHour!==h ||
         candidate.care.programFingerprint!==program.fingerprint ||
         candidate.care.genotypeFingerprint!==program.genomeFingerprint)) ||
       candidate.graph.events.some(event=>event.atHour>h))
      throw new TypeError("Cannot import an incompatible or fractional material checkpoint");
    if(checkpoints.has(h))throw new TypeError("Duplicate imported canonical hour");
    checkpoints.set(h,candidate);
    imported++;
  }
  if(imported) hotHour=checkpoints.get(Math.max(...checkpoints.keys()))!;
  const birth=()=>beginning(program,care);
  function replay(hour:number):UnifiedMaterialState {
    return advance(birth(),hour,program,remod,care,history);
  }
  function at(hour:number):UnifiedMaterialState {
    if(!Number.isFinite(hour)||hour<0||hour>maxHour)
      throw new RangeError("Cannot extrapolate beyond recorded or anatomical horizon");
    let initial=birth();
    const boundary=Math.floor(hour);
    for(const [time,checkpoint] of checkpoints)
      if(time<=boundary && time>=initial.atHour) initial=checkpoint;
    if(hotHour && hotHour.atHour<=boundary &&
       hotHour.atHour>=initial.atHour) initial=hotHour;
    const checkpoint=(state:UnifiedMaterialState)=>{
      checkpoints.delete(state.atHour);
      checkpoints.set(state.atHour,state);
      while(checkpoints.size>UNIFIED_CHECKPOINT_LIMIT)
        checkpoints.delete(checkpoints.keys().next().value!);
    };
    // Record provenance BEFORE advancing to the canonical floor. Without
    // this distinction a cold 0->N run would be misreported as a resume.
    const fromImportedOrLocalCheckpoint=initial.atHour>0;
    if(initial.atHour<boundary)
      initial=advance(initial,boundary,program,remod,care,history,checkpoint);
    if(initial.atHour===boundary) hotHour=initial;
    const result=advance(initial,hour,program,remod,care,history,checkpoint);
    if(hour>0) {
      if(fromImportedOrLocalCheckpoint) resumed++;
      else cold++;
    }
    return result;
  }
  return {version:1,program,maxHour,birth,at,replay,
    checkpointCount:()=>checkpoints.size,
    retainedStateCount:()=>checkpoints.size+
      Number(!!hotHour&&!checkpoints.has(hotHour.atHour)),
    exportCanonicalStates:(throughHour=maxHour)=> {
      // Material graphs and iterative ledgers become large in late life.
      // Transfer only the newest completed hour that is causally safe.
      // Earlier reverse seeks use independent replay or the local bounded LRU.
      // Filtering BEFORE copying prevents copying invalidated future states.
      let latest:UnifiedMaterialState|null=null;
      for(const state of checkpoints.values())
        if(state.atHour>0 && state.atHour<=throughHour &&
           (!latest||state.atHour>latest.atHour))latest=state;
      // Hour zero is birth, not an incremental checkpoint. In particular,
      // a normal newly hatched 1-second update must not try importing it.
      if(hotHour&&hotHour.atHour>0&&hotHour.atHour<=throughHour &&
         (!latest||hotHour.atHour>latest.atHour))latest=hotHour;
      if(!latest)return [];
      // Only the first transfer ever needs a copy. Reimported, already
      // attested states stay deeply immutable and can be reused by reference
      // across arbitrarily many 1s clock ticks without repeated allocations.
      let immutable=latest;
      if(!canonicalAttestations.has(latest)){
        immutable=sealedCheckpoint(copyCheckpoint(latest));
        canonicalAttestations.set(immutable,{program,hour:immutable.atHour});
        if(hotHour===latest)hotHour=immutable;
        if(checkpoints.get(latest.atHour)===latest)
          checkpoints.set(latest.atHour,immutable);
      }
      return [immutable];
    },
    evaluationStats:()=>Object.freeze({cold,resumed,imported})};
}
