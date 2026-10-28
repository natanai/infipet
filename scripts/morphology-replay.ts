/**
 * MORPH-001 per-revision replay worker. COPY THIS FILE unchanged into an
 * isolated git worktree to import THAT revision's real src/simulation engine.
 * No legacy source files need installing in the current app or ordinary CI.
 */
import {createSimulation} from "../src/simulation";
import {morphologyCohort} from "./morphology-cohort";
import {morphologyDelta,morphologyMetrics,type PhysicalWitness} from "./morphology-metrics";
import {createGame,advanceGame,commandGame,DAY,HOUR} from "../src/gameplay";
import type {NeedKeyframe} from "../src/needs";

const version=process.argv.find(v=>v.startsWith("--revision="))?.split("=")[1]??"unknown";
const mode=process.argv.find(v=>v.startsWith("--clock="))?.split("=")[1]??"historical";
const fast=process.argv.includes("--quick");
const seeds=fast?["MORPH-A","MORPH-B"]:["MORPH-A","MORPH-B","MORPH-C"];
const careProfiles=["ambient","supported","deprived"] as const;
const cases=morphologyCohort();
const start=12*HOUR;
const needTimeline=(care:string):NeedKeyframe[]=>care==="ambient"?[]:
  (["rest","security","safety"] as const).map(needId=>({
    needId,tick:0,fulfillment:care==="supported"?1:0.08,
  }));
function careGame(seed:string,profile:string,horizon:number){
  if(mode==="expressive")return undefined; // this earlier API did not consume careGame
  let game=createGame(seed,"infant",start);
  const endDay=Math.min(horizon,365);
  if(profile==="supported"){
    // Real deterministic commands, not a made-up synthetic care intensity.
    // Include a reproducible, modest schedule until the actual engine ends life.
    for(let day=1;day<=Math.min(28,endDay);day++){
      const t=start+day*DAY;
      try {
        game=advanceGame(game,t);
        game=commandGame(game,{type:"feed",food:"meal"},t,"morphology-care-"+day);
      } catch { break; } // record that the engine could not accept more commands
    }
  }
  try {return advanceGame(game,start+endDay*DAY);} catch {return game;}
}
const output:{
  revision:string;clock:string;shapes:number;seeds:readonly string[];careProfiles:readonly string[];
  records:unknown[];
}={revision:version,clock:mode,shapes:cases.length,seeds,careProfiles,records:[]};
for(const item of cases)for(const seed of seeds)for(const care of careProfiles){
  const actualSeed=seed+"|"+item.id;
  const limit=mode==="daily"?365:240;
  const times=mode==="daily"?[0,91,182,273,365]:[0,30,75,120,240];
  const game=careGame(actualSeed,care,limit);
  const options={
    needTimeline:needTimeline(care),
    ...(game?{careGame:game}:{}),
    reuseLivingMaterial:false,
  };
  const simulation=createSimulation(item.source,actualSeed,"infant",options);
  const frames=[] as Array<ReturnType<typeof morphologyMetrics> & {
    actualAge:number;normalizedProgress:number;atHour:number;
    delta:ReturnType<typeof morphologyDelta>|null
  }>;
  const birth=simulation.frameAt(0,{action:"idle",time:0});
  const materialStateAt=(simulation as unknown as {materialStateAt?: (age:number)=>{graph:PhysicalWitness}}).materialStateAt;
  const birthGraph:PhysicalWitness|undefined=mode==="daily"&&typeof materialStateAt==="function"
    ?materialStateAt(0).graph:undefined;
  for(const requested of times){
    const frame=simulation.frameAt(requested,{action:"idle",time:0});
    // Only the production daily engine is an authoritative physical timeline.
    const graph:PhysicalWitness|undefined=mode==="daily"&&typeof materialStateAt==="function"
      ? materialStateAt(requested).graph : undefined;
    frames.push({
      ...morphologyMetrics(frame.pixels,graph,birthGraph),
      actualAge:frame.age,atHour:frame.age*24,
      normalizedProgress:requested/limit,
      delta:requested===0?null:morphologyDelta(birth.pixels,frame.pixels,birthGraph,graph),
    });
  }
  output.records.push({sourceId:item.id,sourceFamily:item.family,
    characteristics:item.characteristics,seed,care,
    startAge:0,lastRequestedAge:times.at(-1),actualLastAge:frames.at(-1)!.actualAge,
    clockUnit:"elapsed days",nativeDevelopmentClock:mode,
    recordedCareSupported:mode!=="expressive",
    originalCellCount:item.source[0].pixels.length,frames});
}
process.stdout.write(JSON.stringify(output)+"\n");
