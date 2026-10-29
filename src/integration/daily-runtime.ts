/** INT-002: the only production anatomical clock. Completed states are pure
 * functions of original material, fixed genome, hatch anchor and consumed
 * evidence. Checkpoint retention is bounded (four per timeline, three lives).
 * Unchanged history shares only recursively frozen states. Mutable or unknown
 * snapshots never become runtime credentials. Reload reconstructs deterministic
 * canonical state; malformed persistence is handled at the storage boundary.
 */
import {createDailyMaterialState,applyDailyMaterialStep,completedDailyChecks,
  FINAL_ANATOMICAL_CHECK,verifyDailyMaterialInventory,type DailyMaterialState,type DailyCareWindowV1,type MaterialDevelopmentProgram} from "../development";
import {compileLifetimeRemodeling,type LifetimeRemodelingProgram} from "../development/lifetime-remodeling";
import {createDailyCareWindowSummarizer} from "../environment/daily-care";
import type {GameState} from "../gameplay";
import type {InheritedGenome} from "../simulation/genome";
import {checkpointDigest} from "./checkpoint-integrity";
import {needValueAt,type NeedKeyframe} from "../needs";
import {REGIONAL_GROWTH_VERSION} from "../development/regional-regulation";
export const DAILY_CHECKPOINT_LIMIT=4;
export const DAILY_LIVING_CACHE_LIMIT=3;
type Options=Readonly<{
  program:MaterialDevelopmentProgram;genome:InheritedGenome;game?:GameState;
  remodelingProgram?:LifetimeRemodelingProgram;canonical?:DailyMaterialState;
  savedCheckpoint?:unknown;birthKey?:string;
  /** Lab-only immutable forcing input; forbidden alongside recorded GameState. */
  previewCare?:PreviewCareInputs;
}>;
export type PersistedDailyCheckpoint=Readonly<{
  version:1;origin:string;historyDigest:string;stateDigest:string;state:DailyMaterialState;
}>;
export type DailyMaterialTimeline=Readonly<{
  maxHour:number;birth:()=>DailyMaterialState;at:(hour:number)=>DailyMaterialState;
  replay:(hour:number)=>DailyMaterialState;
  checkpointCount:()=>number;retainedStateCount:()=>number;
  exportCanonicalState:()=>DailyMaterialState;
  exportSavedCheckpoint:()=>PersistedDailyCheckpoint|undefined;
  evaluationStats:()=>Readonly<{cold:number;resumed:number;imported:number;steps:number}>;
}>;
const credentials=new WeakMap<DailyMaterialState,MaterialDevelopmentProgram>();
// Empty-history birth is a mathematical constant for one program and anchor.
// Sharing this recursively frozen value never transfers a lived care state.
const birthStates=new WeakMap<MaterialDevelopmentProgram,Map<number,DailyMaterialState>>();
function canonicalBirth(program:MaterialDevelopmentProgram,hatch:number):DailyMaterialState{
  const states=birthStates.get(program)??new Map<number,DailyMaterialState>();
  let state=states.get(hatch);
  if(!state){state=createDailyMaterialState(program,hatch);states.set(hatch,state);
    while(states.size>3)states.delete(states.keys().next().value!);birthStates.set(program,states);}
  return state;
}
export type PreviewCareInputs=Readonly<{
  kind:"synthetic-needs-lab-v1";
  /** Exactly authored Lab keyframes; never recorded commands/observations. */
  timeline:readonly NeedKeyframe[];
  /** Direct nutritional forcing supplied by a Lab control. */
  nutrition:number;
}>;
const unit=(v:number)=>Math.max(0,Math.min(1,v));
/**
 * Sample 24 hourly values on [24(k-1),24k), never the following endpoint.
 * These Lab needs proxies are UI controls for EXISTING forcing inputs:
 * rest -> rest, physical-fitness -> activity, security -> security,
 * safety shortfall -> threat. They are not observations or biological rules.
 */
export function createPreviewCareWindow(k:number,input:PreviewCareInputs):DailyCareWindowV1{
  if(input.kind!=="synthetic-needs-lab-v1"||
      !Number.isFinite(input.nutrition)||input.nutrition<0||input.nutrition>1||
      !Number.isSafeInteger(k)||k<1||k>FINAL_ANATOMICAL_CHECK)
    throw new RangeError("Invalid synthetic Needs Lab forcing");
  const start=(k-1)*86400000,end=k*86400000;
  const mean=(id:Parameters<typeof needValueAt>[1])=>{
    let sum=0;
    for(let hour=(k-1)*24;hour<k*24;hour++)
      sum+=needValueAt(input.timeline,id,hour);
    return sum/24;
  };
  const safety=mean("safety");
  const forcing={
    nutrition:input.nutrition,
    rest:unit(mean("rest")),
    activity:unit(mean("physical-fitness")),
    security:unit(mean("security")),
    threat:unit(Math.max(0,0.75-safety)/0.75),
    observedFraction:1,
  };
  return {version:1,hatchAtMs:0,checkIndex:k,startMs:start,endMs:end,
    forcing,acceptedCommands:0,rejectedCommands:0,observations:0,
    activeMs:86400000,absentMs:0,unknownMs:0,
    unknown:["SYNTHETIC NEEDS LAB PREVIEW — not recorded life evidence"],
    provenanceDigest:"preview-lab/"+checkpointDigest(JSON.stringify([k,forcing])),
  };
}
const previewWindow=(k:number):DailyCareWindowV1=>createPreviewCareWindow(k,{
  kind:"synthetic-needs-lab-v1",timeline:[],nutrition:0.75,
});
export function createDailyMaterialTimeline(options:Options):DailyMaterialTimeline {
  const {program,genome,game}=options;
  if(game&&options.previewCare)throw new TypeError("Synthetic Needs Lab care cannot enter a real saved life");
  if(program.genomeFingerprint!==genome.genotype.fingerprint ||
      (game&&(genome.seed!==game.seed||genome.mode!==game.mode)))
    throw new TypeError("Daily anatomy and saved life must have the same immutable origin");
  const hatch=game?.clock.hatchAtMs??0;
  const maxHour=game?Math.max(0,(game.clock.nowMs-hatch)/3600000):Infinity;
  const remodeling=options.remodelingProgram??compileLifetimeRemodeling(program,genome);
  const birth=()=>canonicalBirth(program,hatch);
  const checkpoints=new Map<number,DailyMaterialState>();
  let cold=0,resumed=0,imported=0,steps=0;
  let summarize:ReturnType<typeof createDailyCareWindowSummarizer>|undefined;
  const window=(k:number)=>game?(summarize??=createDailyCareWindowSummarizer(game))(k):
    options.previewCare?createPreviewCareWindow(k,options.previewCare):previewWindow(k);
  let latest=birth();
  let restored:DailyMaterialState|undefined;
  if(game && options.savedCheckpoint && !options.canonical){
    try {
      const candidate=options.savedCheckpoint as PersistedDailyCheckpoint,s=candidate.state;
      const through=hatch+s.completedChecks*86400000;
      if(candidate.version!==1||candidate.origin!==checkpointDigest(options.birthKey??program.fingerprint)||
          candidate.stateDigest!==checkpointDigest(JSON.stringify(s))||
          candidate.historyDigest!==evidenceDigest(game,through)||
          s.clock!=="daily-365-v1"||s.version!==1||s.algorithmVersion!==REGIONAL_GROWTH_VERSION||s.hatchAtMs!==hatch||
          s.programFingerprint!==program.fingerprint||s.genomeFingerprint!==program.genomeFingerprint||
          s.completedChecks<1||s.completedChecks>Math.min(365,Math.floor(maxHour/24))||
          s.checks.length!==s.completedChecks||s.material.nextHour!==s.completedChecks||
          s.iterative.nextHour!==s.completedChecks||
          JSON.stringify(s.graph.sourceCells)!==JSON.stringify(program.source.sourceCells))throw new Error("Stale daily checkpoint");
      verifyDailyMaterialInventory(s.graph,hatch,s.completedChecks,program.source,{material:program.operators,remodeling:remodeling.operations,structuralRigidity:program.signals.channels.support.rigidity,repatterning:{seed:remodeling.seed,elongation:program.signals.channels.growth.elongation,expansion:program.signals.channels.growth.expansion,membrane:program.signals.channels.support.membrane}});
      const care=createDailyCareWindowSummarizer(game);
      for(let i=0;i<s.checks.length;i++)if(s.checks[i].checkIndex!==i+1||
        s.checks[i].atMs!==hatch+(i+1)*86400000||s.checks[i].careDigest!==care(i+1).provenanceDigest)
        throw new Error("Invalid checkpoint chronological evidence");
      restored=JSON.parse(JSON.stringify(s)) as DailyMaterialState;
      const freeze=(v:unknown)=>{if(v&&typeof v==="object"&&!Object.isFrozen(v)){Object.values(v).forEach(freeze);Object.freeze(v);}};
      freeze(restored);credentials.set(restored,program);
    }catch{ /* An optional cache never has permission to erase or corrupt a life. */ }
  }
  if(options.canonical??restored){
    const s=(options.canonical??restored)!;
    if(credentials.get(s)!==program||!Object.isFrozen(s)||s.algorithmVersion!==REGIONAL_GROWTH_VERSION||s.hatchAtMs!==hatch||
        s.completedChecks>Math.min(365,Math.floor(maxHour/24)))
      throw new TypeError("Incompatible daily checkpoint credential");
    latest=s;checkpoints.set(s.completedChecks,s);imported=1;
  }
  function index(hour:number){
    if(!Number.isFinite(hour)||hour<0||hour>maxHour)
      throw new RangeError("Anatomy query exceeds recorded elapsed life");
    // Convert elapsed hours without reconstructing/rounding epoch timestamps.
    return Math.min(FINAL_ANATOMICAL_CHECK,Math.floor(hour/24));
  }
  function advance(state:DailyMaterialState,k:number,retain:boolean){
    let s=state;
    for(let day=s.completedChecks+1;day<=k;day++){
      s=applyDailyMaterialStep(program,genome,s,window(day),remodeling);steps++;
      if(retain){
        credentials.set(s,program);
        checkpoints.set(day,s);
        while(checkpoints.size>DAILY_CHECKPOINT_LIMIT)checkpoints.delete(checkpoints.keys().next().value!);
      }
    }
    return s;
  }
  function replay(hour:number){return advance(birth(),index(hour),false);}
  function at(hour:number){
    const k=index(hour);
    if(k===latest.completedChecks){resumed++;return latest;}
    let initial=birth();
    for(const s of checkpoints.values())if(s.completedChecks<=k&&s.completedChecks>initial.completedChecks)initial=s;
    if(initial.completedChecks>0)resumed++;else if(k>0)cold++;
    const result=advance(initial,k,true);
    if(result.completedChecks>=latest.completedChecks)latest=result;
    return result;
  }
  return {maxHour,birth,at,replay,checkpointCount:()=>checkpoints.size,
    retainedStateCount:()=>checkpoints.size+Number(!checkpoints.has(latest.completedChecks)),
    exportCanonicalState:()=>{credentials.set(latest,program);return latest;},
    exportSavedCheckpoint:()=>game&&latest.completedChecks>0?{
      version:1,origin:checkpointDigest(options.birthKey??program.fingerprint),
      historyDigest:evidenceDigest(game,hatch+latest.completedChecks*86400000),
      stateDigest:checkpointDigest(JSON.stringify(latest)),state:latest}:undefined,
    evaluationStats:()=>({cold,resumed,imported,steps})};
}
type RecordEntry=Readonly<{atMs:number;value:unknown;serialized:string;deeplyFrozen:boolean}>;
type HistoryPrefix=Readonly<{samples:readonly RecordEntry[];observations:readonly RecordEntry[];commands:readonly RecordEntry[]}>;
type Entry={program:MaterialDevelopmentProgram;origin:string;timeline:DailyMaterialTimeline;nowMs:number;evidence:HistoryPrefix};
const living=new Map<string,Entry>();let reused=0,rejected=0;
function prefix(game:GameState,through:number,previous?:HistoryPrefix):HistoryPrefix {
  const record=(value:unknown,atMs:number,nested:unknown,old?:RecordEntry):RecordEntry=>
    old&&old.value===value&&old.deeplyFrozen?old:{atMs,value,serialized:JSON.stringify(value),
    deeplyFrozen:Object.isFrozen(value)&&Object.isFrozen(nested)};
  return {samples:game.careSamples.filter(s=>game.clock.hatchAtMs+s.hour*3600000<through).map((v,i)=>record(v,game.clock.hatchAtMs+v.hour*3600000,v.values,previous?.samples[i])),
    observations:(game.careObservations??[]).filter(o=>o.atMs<through).map((v,i)=>record(v,v.atMs,v.values,previous?.observations[i])),
    commands:game.commandHistory.filter(c=>c.atMs<through).map((v,i)=>record(v,v.atMs,v.command,previous?.commands[i]))};
}
function evidenceDigest(game:GameState,through:number):string {
  return checkpointDigest(JSON.stringify([game.seed,game.mode,game.clock.startedAtMs,game.clock.hatchAtMs,
    game.careSamples.filter(s=>game.clock.hatchAtMs+s.hour*3600000<through),
    (game.careObservations??[]).filter(o=>o.atMs<through),game.commandHistory.filter(c=>c.atMs<through)]));
}
function samePrefix(old:HistoryPrefix,game:GameState,through:number):boolean {
  const current={samples:game.careSamples.filter(s=>game.clock.hatchAtMs+s.hour*3600000<through),
    observations:(game.careObservations??[]).filter(s=>s.atMs<through),commands:game.commandHistory.filter(c=>c.atMs<through)};
  return (["samples","observations","commands"] as const).every(key=>{
    const prior=old[key].filter(e=>e.atMs<through),next=current[key];
    return prior.length===next.length&&prior.every((e,i)=>
      e.deeplyFrozen&&e.value===next[i]||e.serialized===JSON.stringify(next[i]));
  });
}
export function getDailyLivingCacheStats(){return {entries:living.size,limit:DAILY_LIVING_CACHE_LIMIT,
  states:[...living.values()].reduce((n,e)=>n+e.timeline.retainedStateCount(),0),
  maxStates:DAILY_LIVING_CACHE_LIMIT*(DAILY_CHECKPOINT_LIMIT+1),reused,rejected};}
export function clearDailyLivingCache(){living.clear();}
export function createReusedDailyMaterialTimeline(options:Options&{birthKey:string}):DailyMaterialTimeline {
  const {game,program,birthKey}=options;
  if(!game)return createDailyMaterialTimeline(options);
  const origin=JSON.stringify([game.seed,game.mode,game.clock.startedAtMs,game.clock.hatchAtMs]);
  const key=birthKey+"|"+origin,prior=living.get(key);
  let canonical:DailyMaterialState|undefined;
  if(prior&&prior.program===program&&prior.origin===origin&&game.clock.nowMs>=prior.nowMs){
    const candidate=prior.timeline.exportCanonicalState();
    const cutoff=game.clock.hatchAtMs+candidate.completedChecks*86400000;
    if(samePrefix(prior.evidence,game,cutoff)){canonical=candidate;reused++;}else rejected++;
  }
  const timeline=createDailyMaterialTimeline({...options,canonical});
  living.delete(key);living.set(key,{program,origin,timeline,nowMs:game.clock.nowMs,
    evidence:prefix(game,game.clock.hatchAtMs+Math.min(365,Math.floor(Math.max(0,game.clock.nowMs-game.clock.hatchAtMs)/86400000))*86400000,prior?.evidence)});
  while(living.size>DAILY_LIVING_CACHE_LIMIT)living.delete(living.keys().next().value!);
  return timeline;
}
