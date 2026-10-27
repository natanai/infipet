import assert from "node:assert/strict";
import test from "node:test";
import { performance } from "node:perf_hooks";
import { createSimulation, getBlueprintCacheStats } from "../src/simulation";
import { HOUR, advanceGame, commandGame, createGame,
  deriveCareTimeline, deriveDevelopmentContext } from "../src/gameplay";
import { createUnifiedMaterialTimeline, UNIFIED_CHECKPOINT_LIMIT } from "../src/integration/unified-runtime";
import type { MaterialDevelopmentProgram } from "../src/development";
import type { InheritedGenome } from "../src/simulation/genome";
import type { PetPart } from "../src/simulation/model";
const seed="perf-evidence-test-v1", startedAt=1_800_000_000_000;
const source:PetPart[]=[{
  id:"authored",name:"whatever",kind:"body",parentId:null,
  position:{x:0,y:0},
  pixels:[...Array(5)].flatMap((_,y)=>[...Array(5)].map((_,x)=>({
    x:12+x,y:12+y,color:"#123456",
  }))),
}];
test("[PERF-001 preparation] observational timing does not perturb chaotic program, pose or event order",()=>{
  let program:MaterialDevelopmentProgram|undefined;
  let genome:InheritedGenome|undefined;
  const before = getBlueprintCacheStats();
  const sim=createSimulation(source,seed,"infant",{verifyMaterialProgram(p,g){
    program=p;genome=g;return {program:p};
  }});
  const birthFingerprint=sim.program.materialProgramFingerprint;
  const t0=performance.now();
  const first=sim.frameAt(2,{time:1,action:"move"});
  const elapsed=performance.now()-t0;
  assert.ok(Number.isFinite(elapsed)&&elapsed>=0);
  const second=createSimulation(source,seed,"infant");
  assert.deepEqual(first,second.frameAt(2,{time:1,action:"move"}));
  assert.equal(sim.program.materialProgramFingerprint,birthFingerprint);
  assert.equal(second.program.materialProgramFingerprint,birthFingerprint);
  assert.ok(getBlueprintCacheStats().size<=8);
  assert.ok(getBlueprintCacheStats().compilations-before.compilations<=1);
  assert.ok(program&&genome);
  const time=createUnifiedMaterialTimeline({program:program!,genome:genome!});
  const at36=time.at(36);
  assert.deepEqual(at36,time.replay(36),"checkpointed and uncached states must match exactly");
  assert.equal(at36.graph.sourceFingerprint,program!.source.sourceFingerprint);
  assert.deepEqual(at36.graph.sourceCells,program!.source.sourceCells);
  assert.deepEqual(time.at(24),time.replay(24),"reverse seek must not use future graph");
  assert.ok(time.checkpointCount()<=UNIFIED_CHECKPOINT_LIMIT);
  assert.ok(at36.graph.events.every(event=>event.atHour<=36));
  const limits=sim.getRenderCacheStats?.();
  if(limits){
    assert.ok(limits.pixels<=limits.pixelLimit);
    assert.ok(limits.entries<=limits.entryLimit);
  }
});
test("[PERF-001 preparation] ordinary GameState clock ticks recreate an equivalent live simulation",()=>{
  const game=createGame(seed,"infant",startedAt);
  const hour1=advanceGame(game,startedAt+HOUR,"active");
  const committed=commandGame(hour1,{type:"feed",food:"meal"},
    startedAt+HOUR+1000,"accepted/feed");
  const tick=advanceGame(committed,startedAt+HOUR+2000,"active");
  assert.equal(committed.commandHistory.length,tick.commandHistory.length,
    "physiological clock tick is not a new care command");
  assert.notEqual(committed,tick,"App game dependency changes on a normal clock advance");
  assert.deepEqual(deriveCareTimeline(committed),deriveCareTimeline(tick),
    "no hourly sampled care changed in this one-second step");
  const build=(s:typeof game)=>createSimulation(source,seed,"infant",{
    needTimeline:deriveCareTimeline(s),
    liveContext:deriveDevelopmentContext(s),careGame:s,
  });
  const before=build(committed),after=build(tick);
  assert.notEqual(before,after,"App memo recreation makes distinct per-instance caches");
  assert.deepEqual(before.genome,after.genome);
  assert.deepEqual(before.program.materialProgramFingerprint,after.program.materialProgramFingerprint);
  // Exact same historical hour, same material event graph, same rendered anatomy.
  assert.deepEqual(before.frameAt(0.5/24,{time:0,action:"idle"}),
    after.frameAt(0.5/24,{time:0,action:"idle"}));
  const earlier=build(hour1);
  assert.deepEqual(earlier.genome,before.genome);
  const futureCare=build(committed);
  assert.deepEqual(earlier.frameAt(0.5/24,{time:1,action:"idle"}).pixels,
    futureCare.frameAt(0.5/24,{time:1,action:"idle"}).pixels,
    "a new command cannot revise earlier displayed anatomy");
});
