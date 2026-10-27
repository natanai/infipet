/**
 * EVAL-003: bounded, deterministic individual seed + recorded-care search.
 *
 * Actual commandGame/advanceGame produce every physiological sample, accepted
 * and rejected command receipt, and irreversible stage commitment. Historical
 * target pixels are NEVER passed to creation/replay; they are used only by the
 * predeclared EVAL-002 evaluator AFTER a candidate's life has been simulated.
 *
 * Daily limits: <=4 candidates; <=8760 chronological hours; <=8 requested stages;
 * <=65536 attempted commands; <=4096 authored cells (enforced by EVAL-002).
 * Search seed is explicit; candidate index order is i=floor(index/strategyN),
 * j=index%strategyN, giving seed-major enumeration. Stable ties choose lower
 * enumeration index. All times are safe integer milliseconds. No RNG or clock.
 *
 * Witness digest is an accidental/tampering integrity checksum, NOT a digital
 * signature or external confirmation of historical-device behavior.
 */
import { createHash } from "node:crypto";
import {
  createGame, advanceGame, commandGame, deriveCareTimeline,
  deriveDevelopmentContext, validateGameState, validateGameCommand,
  GAME_RULES, GAME_RULES_VERSION, HOUR,
  type GameCommand, type GameState, type CommandRecord,
} from "../src/gameplay";
import { createEnvironmentalHistory } from "../src/environment";
import type { PetPart } from "../src/simulation/model";
import {
  buildProductionTrajectoryWitness, type ProductionWitness,
} from "./alg-evaluation-production-witness";
import {
  evaluateTrajectory, EVALUATION_LIMITS, TRAJECTORY_GATE,
  type ReferenceMilestone, type TrajectoryEvaluation,
} from "./alg-evaluation-trajectory-metrics";

export const WITNESS_VERSION="infipet-recorded-care-witness-v1" as const;
export const SEARCH_LIMITS=Object.freeze({
  maxCandidates:4,maxHours:365*24,maxStages:8,maxCommands:65536,
  maxSourceCells:4096,
});
export type RecordedStep=Readonly<
  | {kind:"advance";atMs:number;presence:"active"|"absent"}
  | {kind:"command";atMs:number;id:string;command:GameCommand}
>;
export type StrategyId="observe"|"meals"|"maintain"|"fractional";
export type RecordedCareWitness=Readonly<{
  version:typeof WITNESS_VERSION;
  rulesVersion:typeof GAME_RULES_VERSION;
  rulesId:typeof GAME_RULES.id;
  simulationMode:"infant";
  searchSeed:string;enumerationIndex:number;strategy:StrategyId;
  permanentSeed:string;birthAtMs:number;utcOffsetMinutes:number;
  source:readonly PetPart[];stages:readonly number[];
  chronologicalSteps:readonly RecordedStep[];
  care:Readonly<{
    commandHistory:readonly CommandRecord[];
    careSamples:Readonly<GameState["careSamples"]>;
    stageCommitments:Readonly<GameState["stageCommitments"]>;
    context:ReturnType<typeof deriveDevelopmentContext>;
    needTimeline:ReturnType<typeof deriveCareTimeline>;
    environment:Readonly<{maxHour:number;commands:ReturnType<typeof createEnvironmentalHistory>["commands"];
      samples:ReturnType<typeof createEnvironmentalHistory>["samples"]}>;
    gameStateSha256:string;
  }>;
  identity:Readonly<{
    genome:string;program:string;source:string;
  }>;
  stagesSha256:readonly Readonly<{
    atHour:number;materialSha256:string;pixelsSha256:string;
    projectionSha256:string;
  }>[];
  digest:string;
}>;
export type CandidateSpecification=Readonly<{
  searchSeed:string;index:number;permanentSeed:string;strategy:StrategyId;
}>;
export type SearchCandidate=Readonly<{
  specification:CandidateSpecification;
  witness:RecordedCareWitness;
  result:TrajectoryEvaluation;
  physicallyVerifiedStages:number;
  failureReasons:readonly string[];
}>;
export type SearchReport=Readonly<{
  version:"infipet-witness-search-v1";
  searchSeed:string;budget:number;examined:number;
  searchStatus:"verified-numerical-candidate"|"unresolved";
  exhausted:boolean;requestedStages:readonly number[];
  best:SearchCandidate|null;
  candidates:readonly Readonly<{
    seed:string;strategy:StrategyId;
    status:TrajectoryEvaluation["status"];
    aggregate:number|null;weakest:number|null;
    verifiedStages:number;
  }>[];
  reason:string;
  incompleteCandidates:readonly Readonly<{seed:string;strategy:StrategyId;reason:string}>[];
}>;
const digest=(value:unknown)=>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const own=<T>(value:T):T=>JSON.parse(JSON.stringify(value)) as T;
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
function assert(condition:unknown,message:string):asserts condition{
  if(!condition)throw new TypeError("EVAL-003 witness rejected: "+message);
}
function boundStages(stages:readonly number[]){
  assert(stages.length>=2&&stages.length<=SEARCH_LIMITS.maxStages,
    "need 2..8 milestone hours");
  assert(stages.every((h,i)=>Number.isFinite(h)&&h>=0&&
    h<=SEARCH_LIMITS.maxHours&&(i===0||h>stages[i-1])),
    "stages must be distinct increasing finite hours within 365 elapsed days");
  assert(stages.every(h=>Number.isSafeInteger(h*HOUR)),
    "stage millisecond not safely representable");
}
function boundSource(source:readonly PetPart[]){
  assert(source.length>0&&source.length<=256,"invalid source parts");
  const cells=source.reduce((n,p)=>n+p.pixels.length,0);
  assert(cells>0&&cells<=SEARCH_LIMITS.maxSourceCells,"invalid source cell budget");
  assert(source.every(p=>!!p.id&&!!p.kind&&p.pixels.every(c=>
    Number.isSafeInteger(c.x)&&Number.isSafeInteger(c.y))),
    "invalid authored source");
}
export function enumerateCandidates(
  searchSeed:string,seeds:number,strategies:readonly StrategyId[],budget:number,
):readonly CandidateSpecification[]{
  assert(!!searchSeed&&searchSeed.length<=80,"missing search seed");
  assert(Number.isSafeInteger(seeds)&&seeds>=1&&seeds<=SEARCH_LIMITS.maxCandidates,
    "invalid seed count");
  assert(strategies.length>0&&new Set(strategies).size===strategies.length&&
    strategies.every(s=>["observe","meals","maintain","fractional"].includes(s)),
    "invalid ordered strategy set");
  assert(Number.isSafeInteger(budget)&&budget>=1&&budget<=SEARCH_LIMITS.maxCandidates,
    "invalid search budget");
  const full=Array.from({length:seeds*strategies.length},(_,index)=>({
    searchSeed,index,permanentSeed:"eval003/"+searchSeed+"/"+Math.floor(index/strategies.length),
    strategy:strategies[index%strategies.length],
  }));
  return full.slice(0,budget);
}
/** Defined ex ante; no target score, user drawing or organism shape enters here. */
export function strategySteps(
  strategy:StrategyId,birthAtMs:number,terminalHour:number,
):readonly RecordedStep[]{
  assert(Number.isSafeInteger(birthAtMs)&&birthAtMs>=0 &&
    Number.isSafeInteger(birthAtMs+terminalHour*HOUR),"invalid birth clock");
  assert(Number.isFinite(terminalHour)&&terminalHour>0&&
    terminalHour<=SEARCH_LIMITS.maxHours,"strategy horizon out of range");
  const steps:RecordedStep[]=[];
  const schedule=(hour:number,id:string,command:GameCommand)=>{
    if(hour<=terminalHour && hour>0)steps.push({
      kind:"command",atMs:birthAtMs+Math.round(hour*HOUR),id,command,
    });
  };
  if(strategy==="fractional"){
    schedule(0.25,"invalid-choice",{type:"choose",choice:"high"});
    schedule(0.5,"fractional-clean",{type:"clean"});
  }
  if(strategy==="meals"||strategy==="maintain"){
    for(let h=2.5;h<=terminalHour;h+=6){
      schedule(h,"meal/"+h,{type:"feed",food:"meal"});
      if(strategy==="maintain")schedule(h+0.5,"clean/"+h,{type:"clean"});
    }
  }
  const ordered=steps.sort((a,b)=>a.atMs-b.atMs||
    (a.kind==="command"&&b.kind==="command"?a.id.localeCompare(b.id):0));
  assert(ordered.length<=SEARCH_LIMITS.maxCommands,"strategy exceeded command budget");
  return [...ordered,{kind:"advance",atMs:birthAtMs+Math.round(terminalHour*HOUR),
    presence:"active"}];
}
export function executeSteps(
  seed:string,birthAtMs:number,steps:readonly RecordedStep[],utcOffsetMinutes=0,
):GameState{
  assert(steps.length<=SEARCH_LIMITS.maxCommands+SEARCH_LIMITS.maxHours+1,"too many steps");
  assert(Number.isSafeInteger(birthAtMs)&&birthAtMs>=0,"invalid birth timestamp");
  let s=createGame(seed,"infant",birthAtMs,{utcOffsetMinutes});
  const seen=new Set<string>();
  let prev=birthAtMs;
  for(const step of steps){
    assert(Number.isSafeInteger(step.atMs)&&step.atMs>=prev,
      "events must be chronological safe integer milliseconds");
    assert(step.atMs-birthAtMs<=SEARCH_LIMITS.maxHours*HOUR,
      "history extends beyond finite maximum");
    if(step.kind==="command"){
      assert(!!step.id&&!seen.has(step.id),"duplicate command ID");
      seen.add(step.id);validateGameCommand(step.command);
      s=commandGame(s,own(step.command),step.atMs,step.id);
      assert(s.commandHistory.at(-1)?.id===step.id,
        "command receipt not appended");
      assert(s.commandHistory.at(-1)?.atMs===s.clock.nowMs,
        "command timestamp diverged from game clock");
    }else{
      assert(step.kind==="advance"&&["active","absent"].includes(step.presence),
        "unknown advance semantics");
      s=advanceGame(s,step.atMs,step.presence);
    }
    prev=step.atMs;
  }
  validateGameState(s);
  return s;
}
function unsealed(witness:RecordedCareWitness){
  const {digest:_,...fields}=witness;return fields;
}
function stageHashes(sample:ProductionWitness["samples"][number]){
  return {atHour:sample.atHour,
    materialSha256:digest(sample.graph),
    pixelsSha256:digest(sample.pixels),
    projectionSha256:digest(sample.renderWitness??null)};
}
/**
 * Capture from real user input and GameState; no history values are invented.
 * All output snapshots/digests are verification artifacts, not generator input.
 */
export function createRecordedCareWitness(args:Readonly<{
  source:readonly PetPart[];seed:string;birthAtMs:number;
  steps:readonly RecordedStep[];stages:readonly number[];
  searchSeed:string;enumerationIndex:number;strategy:StrategyId;
  utcOffsetMinutes?:number;
}>):Readonly<{witness:RecordedCareWitness;production:ProductionWitness;game:GameState}>{
  boundStages(args.stages);boundSource(args.source);
  const offset=args.utcOffsetMinutes??0;
  const game=executeSteps(args.seed,args.birthAtMs,args.steps,offset);
  const recordedMax=(game.clock.nowMs-game.clock.hatchAtMs)/HOUR;
  assert(recordedMax>=Math.max(...args.stages),
    "insufficient chronological care evidence for required milestone");
  const production=buildProductionTrajectoryWitness(args.source,args.seed,args.stages,
    {careGame:game,renderScope:"composited-screen"});
  const history=createEnvironmentalHistory(game);
  const payload={
    version:WITNESS_VERSION,
    rulesVersion:GAME_RULES_VERSION,rulesId:GAME_RULES.id,
    simulationMode:"infant" as const,
    searchSeed:args.searchSeed,enumerationIndex:args.enumerationIndex,
    strategy:args.strategy,permanentSeed:args.seed,
    birthAtMs:args.birthAtMs,utcOffsetMinutes:offset,
    source:own(args.source),stages:[...args.stages],
    chronologicalSteps:own(args.steps),
    care:{
      commandHistory:own(game.commandHistory),
      careSamples:own(game.careSamples),
      stageCommitments:own(game.stageCommitments),
      context:own(deriveDevelopmentContext(game)),
      needTimeline:own(deriveCareTimeline(game)),
      environment:{
        maxHour:history.maxHour,commands:own(history.commands),
        samples:own(history.samples),
      },
      gameStateSha256:digest(game),
    },
    identity:{genome:production.genomeFingerprint,program:production.programFingerprint,
      source:production.sourceFingerprint},
    stagesSha256:production.samples.map(stageHashes),
  };
  return {witness:{...payload,digest:digest(payload)},production,game};
}
/** Fresh replay: no stored physical state is ever trusted as execution input. */
export function replayRecordedCareWitness(w:RecordedCareWitness):Readonly<{
 production:ProductionWitness;game:GameState;
}>{
  assert(w?.version===WITNESS_VERSION&&w.rulesVersion===GAME_RULES_VERSION &&
    w.rulesId===GAME_RULES.id && w.simulationMode==="infant",
    "unrecognized biology/rules witness version");
  assert(digest(unsealed(w))===w.digest,"envelope digest mismatch");
  const {witness:rebuilt,production,game}=createRecordedCareWitness({
    source:w.source,seed:w.permanentSeed,birthAtMs:w.birthAtMs,
    steps:w.chronologicalSteps,stages:w.stages,
    searchSeed:w.searchSeed,enumerationIndex:w.enumerationIndex,
    strategy:w.strategy,utcOffsetMinutes:w.utcOffsetMinutes,
  });
  assert(same(rebuilt,w),"independently replayed care, stage, and physical hashes mismatch");
  return {production,game};
}
export function selectBestCandidate<T extends Readonly<{
  index:number;status:"pass"|"fail"|"unresolved";
  aggregate:number|null;weakest:number|null;
}>>(items:readonly T[]):T|null{
  // Required full-pass coverage is always preferred to a merely high IoU.
  const rank=(s:T["status"])=>s==="pass"?2:s==="fail"?1:0;
  const sorted=[...items].sort((a,b)=>rank(b.status)-rank(a.status)||
    (b.aggregate??-1)-(a.aggregate??-1)||
    (b.weakest??-1)-(a.weakest??-1)||a.index-b.index);
  return sorted[0]??null;
}
/** Fully bounded ex ante; reference masks consumed ONLY AFTER source replay. */
export function searchRecordedCareWitness(args:Readonly<{
  source:readonly PetPart[];birthAtMs:number;searchSeed:string;
  references:readonly ReferenceMilestone[];
  seeds:number;strategies:readonly StrategyId[];budget:number;
  daily?:boolean;
}>):SearchReport{
  const references=[...args.references].sort((a,b)=>a.atHour-b.atHour);
  const hours=references.map(x=>x.atHour);
  boundStages(hours);boundSource(args.source);
  assert(references.length<=EVALUATION_LIMITS.maxStages,"reference overflow");
  const planned=enumerateCandidates(args.searchSeed,args.seeds,args.strategies,args.budget);
  const evaluated:SearchCandidate[]=[];
  const incomplete:{seed:string;strategy:StrategyId;reason:string}[]=[];
  for(const candidate of planned){
    const steps=args.daily?dailyStrategySteps(candidate.permanentSeed,candidate.strategy,args.birthAtMs,hours.at(-1)!):
      strategySteps(candidate.strategy,args.birthAtMs,hours.at(-1)!);
    let built:ReturnType<typeof createRecordedCareWitness>;
    try{
      built=createRecordedCareWitness({
      source:args.source,seed:candidate.permanentSeed,
      birthAtMs:args.birthAtMs,steps,stages:hours,
      searchSeed:args.searchSeed,enumerationIndex:candidate.index,
      strategy:candidate.strategy,
      });
    }catch(error){
      // A real pet can die before the last checkpoint. This is a genuine
      // insufficient chronological witness, not license to fabricate later
      // care samples or abort the entire bounded population of candidates.
      if(!(error instanceof TypeError)&&!(error instanceof RangeError))
        throw error;
      if(!String(error.message).includes("insufficient chronological care evidence"))
        throw error;
      incomplete.push({seed:candidate.permanentSeed,strategy:candidate.strategy,
        reason:"native life ended before required last milestone"});
      continue;
    }
    // The seed/care candidate is complete BEFORE any reference image is read.
    // The exact same evaluator is used for unrelated controls and retro art.
    const scores=evaluateTrajectory(built.production.samples,references,
      built.production.sourceFingerprint);
    evaluated.push({
      specification:candidate,witness:built.witness,result:scores,
      physicallyVerifiedStages:built.production.counts.genuinelyVerifiedStages,
      failureReasons:[...scores.reasons,...built.production.limitations],
    });
  }
  const selected=selectBestCandidate(evaluated.map((candidate,index)=>({
    index,status:candidate.result.status,
    aggregate:candidate.result.aggregateScore,weakest:candidate.result.weakestStageScore,
  })));
  const best=selected?evaluated[selected.index]:null;
  const allPass=best?.result.status==="pass"&&
    best.result.stages.every(s=>s.status==="pass")&&
    best.physicallyVerifiedStages===hours.length;
  return {
    version:"infipet-witness-search-v1",searchSeed:args.searchSeed,
    budget:args.budget,examined:planned.length,
    searchStatus:allPass?"verified-numerical-candidate":"unresolved",
    exhausted:!allPass&&planned.length===args.budget,
    requestedStages:hours,best,
    // Report in the ORIGINAL seed-major candidate order, including
    // incomplete/dead lives in their original slots. Filtering successful
    // histories and appending failures would silently change search order.
    candidates:planned.map(spec=>{
      const candidate=evaluated.find(c=>c.specification.index===spec.index);
      return candidate?{
        seed:spec.permanentSeed,strategy:spec.strategy,
        status:candidate.result.status,
        aggregate:candidate.result.aggregateScore,
        weakest:candidate.result.weakestStageScore,
        verifiedStages:candidate.physicallyVerifiedStages,
      }:{
        seed:spec.permanentSeed,strategy:spec.strategy,
        status:"unresolved" as const,aggregate:null,weakest:null,
        verifiedStages:0,
      };
    }),
    reason:allPass?"Every stage meets the predeclared numerical gate and material verification":
      "No complete physically verified numerical witness in bounded candidate search; not original-device parity",
    incompleteCandidates:incomplete,
  };
}

/** Daily qualification strategies observe actual physiology before deciding
 * commands. Each resulting script is then executed AGAIN by the witness
 * interpreter. No reference shape, latent channel or desired result is read. */
export function dailyStrategySteps(seed:string,strategy:StrategyId,birthAtMs:number,terminalHour:number):readonly RecordedStep[]{
  if(!Number.isInteger(terminalHour)||terminalHour<24||terminalHour>365*24||terminalHour%24!==0)
    throw new RangeError("Daily witness requires exact daily boundaries");
  if(strategy==="observe")return [{kind:"advance",atMs:birthAtMs+terminalHour*HOUR,presence:"absent"}];
  if(strategy==="fractional")return [
    {kind:"command",atMs:birthAtMs+HOUR/4,id:"rejected-choice",command:{type:"choose",choice:"high"}},
    {kind:"command",atMs:birthAtMs+HOUR/2,id:"fractional-clean",command:{type:"clean"}},
    {kind:"advance",atMs:birthAtMs+terminalHour*HOUR,presence:"absent"}];
  let s=createGame(seed,"infant",birthAtMs);const steps:RecordedStep[]=[];
  const command=(value:GameCommand)=>{
    const step={kind:"command" as const,atMs:s.clock.nowMs,id:"daily/"+s.commandHistory.length,command:value};
    steps.push(step);s=commandGame(s,value,step.atMs,step.id);
  };
  for(let hour=1;hour<=terminalHour&&!s.dead;hour++){
    const atMs=birthAtMs+hour*HOUR;
    steps.push({kind:"advance",atMs,presence:"active"});s=advanceGame(s,atMs);
    if(s.dead)break;
    if(s.sleeping){if(s.lightsOn)command({type:"lights",on:false});continue;}
    if(s.attention.discipline)command({type:"discipline"});
    if(strategy==="maintain"||hour%6===0)
      while(s.meters.hunger<4)command({type:"feed",food:"meal"});
    if(strategy==="maintain"){
      for(const [meter,food] of [["happiness","snack"],["strength","protein"]] as const)
        while(s.meters[meter]<4)command({type:"feed",food});
      if(s.waste)command({type:"clean"});
      while(s.health.sickness||s.health.injury)command({type:"medicine"});
    }
  }
  if(s.commandHistory.length>SEARCH_LIMITS.maxCommands)throw new RangeError("Daily command budget exceeded");
  return steps;
}
/** The current daily qualification entrypoint explicitly rejects historical
 * 1/49/121h anatomical milestones. Those remain research queries only. */
export function searchDailyRecordedCareWitness(args:Parameters<typeof searchRecordedCareWitness>[0]):SearchReport{
  if(args.references.some(r=>!Number.isInteger(r.atHour)||r.atHour<0||r.atHour%24!==0||r.atHour>365*24))
    throw new RangeError("Daily qualification requires real daily milestone timestamps");
  return searchRecordedCareWitness({...args,daily:true});
}
