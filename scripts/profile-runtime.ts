/**
 * PERF-001 preparatory, opt-in wall-clock benchmark of the real living runtime.
 * Run: NODE_OPTIONS="--expose-gc --max-old-space-size=1536" pnpm exec tsx scripts/profile-runtime.ts
 *
 * No clocks, seeds, operation order, renderer or care histories are modified
 * by measurement. Values are run-specific; JSONL goes only to stdout.
 * Do not use timings as correctness oracles or as a CI pass threshold.
 */
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { cpus, totalmem, freemem, platform, arch } from "node:os";
import { readFileSync } from "node:fs";
import { createSimulation, getBlueprintCacheStats } from "../src/simulation";
import { compileMaterialDevelopment } from "../src/development";
import { createUnifiedMaterialTimeline } from "../src/integration/unified-runtime";
import { compileRuntimeCareMaterial, compileRuntimeBiology } from "../src/integration";
import { createEnvironmentalHistory, createCareOperatorChronology } from "../src/environment";
import { HOUR, advanceGame, commandGame, createGame,
  deriveCareTimeline, deriveDevelopmentContext, validateGameState } from "../src/gameplay";
import { compileSources } from "../src/simulation/material";
import { describeSource, type SourceAtlas } from "../src/simulation/source-atlas";
import { LINEAGE_RECIPE_VERSION, PROTOTYPE_REVISION,
  encodePet, decodePet, type PetDocument } from "../src/pet-format";
import { NEEDS_CATALOG_VERSION, NEEDS_RULES_VERSION } from "../src/needs";
import type { PetPart, PetSimulation } from "../src/simulation/model";
import type { MaterialDevelopmentProgram } from "../src/development";
import type { InheritedGenome } from "../src/simulation/genome";

const MB = 1024 * 1024;
const seedPrefix = "profile-runtime-v1";
const startedAt = 1_800_000_000_000;
const outline = (x:number,y:number) =>
  x===0||y===0||x===31||y===31 || (x>=12&&x<=19&&y>=12&&y<=19);
const shapes = {
  sparse: Array.from({length:32},(_,y) => Array.from({length:32},(_,x) =>
    ((x===16&&y>=8&&y<=26)||(y===16&&x>=8&&x<=24)||(y===10&&x>=12&&x<=20))
      ? "#" : ".").join("")),
  complex: Array.from({length:32},(_,y) => Array.from({length:32},(_,x) =>
    (outline(x,y)|| (x+y)%7===0 || (x-y+64)%11===0) ? "#" : ".").join("")),
  dense: Array.from({length:32},(_,y) => Array.from({length:32},(_,x) =>
    x>=12&&x<=19&&y>=12&&y<=19 ? "." : "#").join("")),
};
type Shape = keyof typeof shapes;
function drawing(shape:Shape):PetPart[] {
  return [{ id:"ink",kind:"body",name:"Unclassified drawing",parentId:null,
    position:{x:0,y:0},pixels:shapes[shape].flatMap((row,y)=>
      [...row].flatMap((v,x)=>v==="#"?[{x,y,color:"#92a6bb"}]:[])) }];
}
const MBround = (n:number) => Math.round(n/MB*100)/100;
const mem = () => {
  const v=process.memoryUsage();
  return {rssMB:MBround(v.rss),heapMB:MBround(v.heapUsed),
    externalMB:MBround(v.external),arrayBuffersMB:MBround(v.arrayBuffers)};
};
let peakRss = 0, peakHeap = 0, samples=0;
const emit = (data:Record<string,unknown>) => process.stdout.write(JSON.stringify(data)+"\n");
function measured<T>(label:string,shape:string,fn:()=>T):T {
  const before=process.memoryUsage(),start=performance.now();
  const result=fn();
  const ms=performance.now()-start,after=process.memoryUsage();
  peakRss=Math.max(peakRss,after.rss,before.rss);
  peakHeap=Math.max(peakHeap,after.heapUsed,before.heapUsed);
  samples++;
  emit({kind:"measure",label,shape,ms:+ms.toFixed(3),
    deltaHeapMB:MBround(after.heapUsed-before.heapUsed),
    deltaRssMB:MBround(after.rss-before.rss),
    ...mem()});
  return result;
}
function memoryLimit() {
  for (const path of ["/sys/fs/cgroup/memory.max","/sys/fs/cgroup/memory/memory.limit_in_bytes"]) {
    try { const s=readFileSync(path,"utf8").trim();
      if(s!=="max"&&Number.isFinite(Number(s)))return MBround(Number(s)); }
    catch { /* non-Linux runner */ }
  }
  return null;
}
const hardware = cpus();
emit({kind:"environment",schema:1,commit:process.env.GITHUB_SHA??null,
  runner:process.env.RUNNER_NAME??null,runnerOS:process.env.RUNNER_OS??null,
  node:process.version, v8:process.versions.v8,platform:platform(),arch:arch(),
  logicalCpuCount:hardware.length,cpu:hardware[0]?.model??null,
  totalPhysicalRamMB:MBround(totalmem()),freePhysicalRamMB:MBround(freemem()),
  cgroupMemoryLimitMB:memoryLimit(),heapLimitOption:process.env.NODE_OPTIONS??null,
  scenarios:["sparse","complex","dense"],seedPrefix,
  hours:[0,24,720,8192],checkpointLimit:16,environment:"Node native; not browser UI"});
let denseProgram:MaterialDevelopmentProgram|undefined;
let denseGenome:InheritedGenome|undefined;
let denseSim:PetSimulation|undefined;
for(const shape of Object.keys(shapes) as Shape[]){
  const seed=seedPrefix+"/"+shape, source=drawing(shape);
  emit({kind:"input",shape,seed,inkCells:source[0].pixels.length,
    sourceSize:[32,32],renderWorld:[64,64],chronologicalMax:8192});
  // No attempt to reset global engine caches; unique source/seed is a cold key.
  const before=getBlueprintCacheStats();
  let captured:MaterialDevelopmentProgram|undefined;
  let genotype:InheritedGenome|undefined;
  const sim=measured("compile.actual-simulation.cold-key",shape,()=>createSimulation(
    source,seed,"infant",{verifyMaterialProgram(program,genome){
      captured=program; genotype=genome;
      return {program};
    }}));
  assert.equal(getBlueprintCacheStats().compilations-before.compilations,1,
    "the cold key must compile one genuine blueprint");
  assert.ok(captured&&genotype);
  const program=captured as MaterialDevelopmentProgram,genome=genotype as InheritedGenome;
  measured("compile.material-program.unhinted",shape,()=>compileMaterialDevelopment(
    sim.program.sourceAtlas as SourceAtlas,genome));
  measured("compile.unified-timeline",shape,()=>createUnifiedMaterialTimeline({program,genome}));
  // Real render frames: all authoritative operations and material raster/pose.
  for(const hour of [0,24,720,8192]){
    const frame=measured("frame.first."+hour+"h",shape,()=>sim.frameAt(hour/24,{time:0,action:"idle"}));
    assert.ok(frame.pixels.length>0);
    assert.ok(Math.abs(frame.developmentalAge-hour/24)<1e-8);
    emit({kind:"frame",shape,hour,pixels:frame.pixels.length,
      parts:frame.parts.length,generatedParts:frame.parts.filter(p=>p.role==="material-growth").length,
      cache:sim.getRenderCacheStats?.()});
  }
  for(const pose of [1,2,3]){
    const frame=measured("frame.pose.8192h."+pose,shape,()=>sim.frameAt(8192/24,{time:pose,action:"move"}));
    assert.ok(frame.parts.length>0);
  }
  const timeline=measured("timeline.compile.uncared",shape,()=>createUnifiedMaterialTimeline({program,genome}));
  const at720=measured("timeline.first.720h",shape,()=>timeline.at(720));
  const at8192=measured("timeline.from-checkpoint.8192h",shape,()=>timeline.at(8192));
  assert.equal(at8192.atHour,8192);
  const repeats=measured("timeline.warm.8192h",shape,()=>timeline.at(8192));
  assert.deepEqual(repeats,at8192,"cached and replayed states must be bitwise-structurally equal");
  const reverse=measured("timeline.reverse.720h",shape,()=>timeline.at(720));
  assert.deepEqual(reverse,at720);
  const replay=measured("timeline.independent-replay.720h",shape,()=>timeline.replay(720));
  assert.deepEqual(replay,at720);
  emit({kind:"timeline",shape,checkpointCount:timeline.checkpointCount(),
    materialEvents:at8192.graph.events.length,liveCells:at8192.graph.cells.length,
    sourceCells:at8192.graph.sourceCells.length});
  assert.ok(timeline.checkpointCount()<=16);
  const sequential=measured("timeline.sequential.24-through-48h",shape,()=>{
    const sequence=createUnifiedMaterialTimeline({program,genome});
    let latest=sequence.birth();
    for(let hour=24;hour<=48;hour++) latest=sequence.at(hour);
    return {latest,checkpointCount:sequence.checkpointCount()};
  });
  assert.equal(sequential.latest.atHour,48);
  if(shape==="dense"){denseProgram=program;denseGenome=genome;denseSim=sim;}
}
// The exact App dependency life.game invalidates its useMemo every tick.
// Evaluate native 1-hour state, a legitimate accepted command and a
// subsequent normal physiological clock advance without a new command.
const source=drawing("complex"),seed=seedPrefix+"/living";
const initial=createGame(seed,"infant",startedAt);
const hour1=measured("game.advance.native.1h","living",()=>advanceGame(initial,startedAt+HOUR,"active"));
const accepted=measured("game.command.feed.accepted","living",()=>commandGame(
  hour1,{type:"feed",food:"meal"},startedAt+HOUR+1000,"feed-1"));
assert.ok(accepted.commandHistory.some(r=>r.id==="feed-1"&&r.accepted));
const tick=measured("game.clock.tick.no-command","living",()=>advanceGame(
  accepted,startedAt+HOUR+2000,"active"));
assert.equal(tick.commandHistory.length,accepted.commandHistory.length);
const bio=compileRuntimeBiology(describeSource(compileSources(source,42)),denseGenome!);
const history=measured("care.compile-history","living",()=>createEnvironmentalHistory(tick));
measured("care.pressure.1h","living",()=>history.atHour(1));
measured("care.compose-operator-program","living",()=>compileRuntimeCareMaterial(
  describeSource(compileSources(source,42)),denseGenome!,bio,tick));
if(denseProgram) measured("care.build-operator-chronology","living",()=>createCareOperatorChronology(
  denseProgram!,history,denseGenome!.genotype));
const evaluateLife=(game:typeof initial,label:string)=>{
  const sim=measured(label+".compile-new-simulation","living",()=>createSimulation(
    source,seed,"infant",{needTimeline:deriveCareTimeline(game),
      liveContext:deriveDevelopmentContext(game),careGame:game}));
  const age=Math.max(0,(game.clock.nowMs-game.clock.startedAtMs)/86400000);
  const frame=measured(label+".frame-same-save","living",()=>sim.frameAt(age,{time:1,action:"idle"}));
  emit({kind:"life",label,ageHours:age*24,
    commandCount:game.commandHistory.length,careSamples:game.careSamples.length,
    framePixels:frame.pixels.length,frameParts:frame.parts.length,
    cache:sim.getRenderCacheStats?.()});
  return sim;
};
evaluateLife(hour1,"living-before-command");
evaluateLife(accepted,"living-after-command");
evaluateLife(tick,"living-after-ordinary-tick");
for(let i=0;i<3;i++) evaluateLife(tick,"living-repeat-reconstruction-"+i);
// Actual portable save codec, not a surrogate serialization of the game.
const doc:PetDocument={
  version:8,algorithmVersion:7,revision:PROTOTYPE_REVISION,
  mode:"infant",name:"Benchmark pet",seed,parts:source,
  bornAt:startedAt,age:0,needTimeline:deriveCareTimeline(tick),
  groomingTimeline:[],catalogVersion:NEEDS_CATALOG_VERSION,
  needsRulesVersion:NEEDS_RULES_VERSION,
  life:{lineageVersion:LINEAGE_RECIPE_VERSION,parts:source,mode:"infant",seed,
    name:"Benchmark pet",game:tick,groomingTimeline:[]},
};
const bytes=measured("save.encode","living",()=>encodePet(doc));
const restored=measured("save.decode","living",()=>decodePet(bytes));
assert.deepEqual(restored.life?.game,validateGameState(tick));
evaluateLife(restored.life!.game,"living-save-restored");
if(denseProgram&&denseGenome&&denseSim){
  // Explicit retained-memory observation from one real 8192h simulation.
  emit({kind:"retained",scope:"dense-runtime",renderCache:denseSim.getRenderCacheStats?.(),
    sourceCells:denseProgram.source.sourceCells.length,
    memory:mem()});
}
emit({kind:"summary",measurements:samples,peakSampledRssMB:MBround(peakRss),
  peakSampledHeapMB:MBround(peakHeap),finalMemory:mem(),
  note:"Sampled peaks underestimate unobserved transient allocations; timings are runner-specific."});
