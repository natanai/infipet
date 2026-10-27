/**
 * PERF-001 official focused acceptance preparation.
 *
 * Deterministic properties are independent of wall time and heap noise.
 * Time and RSS below are generously bounded *CI safety budgets*, not
 * browser/mobile interactive performance acceptance. PERF-001 stays TODO
 * until DEV-006 and tighter real-device latency/memory budgets are verified.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { performance } from "node:perf_hooks";
import { createSimulation } from "../src/simulation";
import { compileGenome } from "../src/simulation/genome";
import { compileSources } from "../src/simulation/material";
import { describeSource } from "../src/simulation/source-atlas";
import { compileMaterialDevelopment, materialOperatorChaosRate,
  stepMaterialOperatorChronology } from "../src/development";
import { createUnifiedMaterialTimeline, chaosWeightedCareHours,
  UNIFIED_CHECKPOINT_LIMIT } from "../src/integration/unified-runtime";
import { createEnvironmentalHistory,createCareOperatorChronology } from "../src/environment";
import { createGame,advanceGame,commandGame,HOUR,
  deriveCareTimeline,deriveDevelopmentContext } from "../src/gameplay";
import { getLivingTimelineCacheStats } from "../src/integration/living-timeline";
import type { PetPart } from "../src/simulation/model";
type SourceShape = "sparse"|"complex"|"dense";
const named = (shape:SourceShape): PetPart[] => {
  const pixels = Array.from({length:32},(_,y)=>
    Array.from({length:32},(_,x)=>{
      switch(shape){
        case "sparse":return (x===16&&y>=8&&y<=26) ||
          (y===16&&x>=8&&x<=24)||(y===10&&x>=12&&x<=20);
        case "complex":return x===0||y===0||x===31||y===31||
          (x>=12&&x<=19&&y>=12&&y<=19)||(x+y)%7===0||(x-y+64)%11===0;
        case "dense":return !(x>=12&&x<=19&&y>=12&&y<=19);
      }
    })).flatMap((row,y)=>row.flatMap((filled,x)=>
      filled?[{x,y,color:"#92a6bb"}]:[]));
  return [{id:"ink",name:"Arbitrary authored drawing",kind:"body",
    parentId:null,position:{x:0,y:0},pixels}];
};
const start=1_800_000_000_000;
const programFor=(shape:SourceShape, seed:string)=>{
  const source=named(shape),genome=compileGenome(seed,"infant"),
    atlas=describeSource(compileSources(source,12345));
  const program=compileMaterialDevelopment(atlas,genome);
  return {source,genome,program};
};
const independentWeighted = (
  op:ReturnType<typeof programFor>["program"]["operators"][number],
  from:number,to:number,
) => {
  let weighted=0;
  for(let n=Math.floor(from);n<Math.ceil(to);n++){
    const left=Math.max(from,n,op.atHour),right=Math.min(to,n+1,
      op.atHour+op.durationHours);
    if(right>left)weighted+=(right-left)*materialOperatorChaosRate(op,n);
  }
  return weighted;
};
test("[PERF-001/A1] bounded numerical cohort and exact chronological cache/replay without visual approval",()=>{
  for(const shape of ["sparse","complex","dense"] as const){
    const {source,program,genome}=programFor(shape,"perf/causal/"+shape);
    assert.ok(source[0].pixels.length<=1024);
    assert.equal(program.source.sourceCells.length,source[0].pixels.length);
    const timeline=createUnifiedMaterialTimeline({program,genome});
    const early=timeline.at(6.75),forward=timeline.at(24.25);
    const back=timeline.at(6.75),fractional=timeline.at(12.5);
    assert.deepEqual(early,timeline.replay(6.75));
    assert.deepEqual(forward,timeline.replay(24.25));
    assert.deepEqual(back,early);
    assert.deepEqual(fractional,timeline.replay(12.5));
    assert.ok(timeline.checkpointCount()<=UNIFIED_CHECKPOINT_LIMIT);
    assert.deepEqual(fractional.graph.sourceCells,program.source.sourceCells);
    assert.ok(fractional.graph.events.every(e=>e.atHour<=12.5));
    for(const op of program.operators){
      for(const [a,b] of [[0,Math.min(32,op.atHour)],
        [Math.max(0,op.atHour-0.25),Math.min(8192,op.atHour+1.25)],
        [Math.max(0,op.atHour+op.durationHours),8192]] as const){
        if(b<a)continue;
        const observed=chaosWeightedCareHours(op,a,b,null);
        const expected=independentWeighted(op,a,b);
        assert.ok(Math.abs(observed-expected)<1e-10,
          "permanent fractional chaos integral must match an independent hour partition");
      }
    }
    // Real renderer (no screenshot/snapshot approval), birth source and
    // deterministic pose should not change due to profiling.
    const sim=createSimulation(source,"perf/causal/"+shape,"infant");
    const born=sim.frameAt(0,{time:0,action:"idle"});
    assert.deepEqual(born.pixels,source[0].pixels.map(p=>({
      ...p,x:p.x+16,y:p.y+16,
    })));
    assert.deepEqual(sim.frameAt(1,{time:2,action:"idle"}).pixels,
      createSimulation(source,"perf/causal/"+shape,"infant")
        .frameAt(1,{time:2,action:"idle"}).pixels);
  }
});
test("[PERF-001/A1] append-only future care cannot rewrite cached history, event ordering, source or genotype",()=>{
  const {program,genome}=programFor("complex","perf/recorded-care");
  const before=createGame("perf/recorded-care","infant",start);
  const hour1=advanceGame(before,start+HOUR,"active");
  const changed=commandGame(hour1,{type:"feed",food:"meal"},start+HOUR+1800000,
    "care/fractional-1");
  const later=advanceGame(changed,start+2*HOUR,"active");
  const construct=(game:typeof before)=>{
    const history=createEnvironmentalHistory(game);
    const care=createCareOperatorChronology(program,history,genome.genotype);
    return createUnifiedMaterialTimeline({program,genome,care,history});
  };
  const b=construct(hour1),c=construct(later);
  const prior=b.at(0.75);
  assert.deepEqual(prior,c.at(0.75));
  assert.deepEqual(c.at(1.5),c.replay(1.5));
  assert.deepEqual(c.at(2),c.replay(2));
  assert.deepEqual(c.at(0.75),prior);
  assert.deepEqual(c.at(2).graph.sourceCells,program.source.sourceCells);
  assert.ok(c.at(2).graph.events.every(event=>event.atHour<=2));
  assert.equal(c.at(2).iterative.nextHour,2);
  assert.deepEqual(genome,compileGenome("perf/recorded-care","infant"));
});
test("[PERF-001/A2] 32x32 worst-case dense chronology has bounded space/time and exact replay",()=>{
  const seed="perf/dense/8192";
  const {program,genome}=programFor("dense",seed);
  const sourceIds=new Set(program.source.sourceCells.map(c=>c.id));
  const timeline=createUnifiedMaterialTimeline({program,genome});
  const startMs=performance.now();
  const terminal=timeline.at(8192);
  const elapsed=performance.now()-startMs;
  assert.equal(terminal.atHour,8192,"never truncate or simulate fewer hours");
  assert.equal(terminal.iterative.nextHour,8192);
  assert.deepEqual(terminal.graph.sourceCells,program.source.sourceCells);
  assert.ok(terminal.graph.cells.length<=4096);
  assert.ok(terminal.graph.cells.every(c=>c.sourceIds.every(id=>sourceIds.has(id))));
  assert.ok(terminal.graph.events.every(e=>e.atHour<=8192));
  const expectedLive=program.source.cells.length+
    terminal.graph.events.reduce((sum,event)=>
      sum+event.createdCellIds.length-event.removedCellIds.length,0);
  assert.equal(terminal.graph.cells.length,expectedLive,
    "source inventory must be conserved across accepted physical additions and removals");
  assert.ok(timeline.checkpointCount()<=UNIFIED_CHECKPOINT_LIMIT);
  // Full-duration independent replay tests the exact original material,
  // operation decisions, fractional event IDs and development ledgers.
  assert.deepEqual(terminal,timeline.replay(8192),
    "full-lifetime cached anatomy must be identical to uncached replay");
  const finalOperatorHour=Math.ceil(Math.max(0,...program.operators.map(op=>
    op.atHour+op.durationHours)));
  if(finalOperatorHour<8192){
    const settled=timeline.at(finalOperatorHour);
    assert.ok(settled.material.records.every(record=>record.settled),
      "all permanent operator decisions must settle at the end of their supports");
    const nextHour=finalOperatorHour+1;
    const reference=stepMaterialOperatorChronology(
      settled.graph,program,settled.material,{
        fromHour:settled.material.nextHour,toHour:nextHour,
        expressions:settled.material.records.map(record=>({
          operatorId:record.operatorId,cumulative:record.cumulative,
        })),
      });
    const optimized=timeline.at(nextHour);
    assert.deepEqual(optimized.material,reference.state,
      "post-settlement fast path must equal the original full validator/transaction");
    assert.deepEqual(optimized.material.decisions,settled.material.decisions);
  }
  const prior=timeline.at(720);
  assert.deepEqual(prior,timeline.replay(720));
  assert.deepEqual(timeline.at(8192),terminal);
  const heap=process.memoryUsage();
  const rssMiB=heap.rss/1048576,heapMiB=heap.heapUsed/1048576;
  const metrics={kind:"PERF-001/A2",schema:1,shape:"dense",inkCells:960,
    requestedHour:8192,elapsedMs:Math.round(elapsed*100)/100,
    rssMiB:Math.round(rssMiB*100)/100,heapMiB:Math.round(heapMiB*100)/100,
    checkpoints:timeline.checkpointCount(),liveCells:terminal.graph.cells.length,
    events:terminal.graph.events.length};
  process.stdout.write(JSON.stringify(metrics)+"\n");
  // Loose runaway safeguards on shared runners; NOT mobile or UI budgets.
  assert.ok(elapsed<120_000,"exceeded hard 120s CI timeout safety budget");
  assert.ok(rssMiB<768,"exceeded conservative 768 MiB CI RSS safety budget");
});

test("[PERF-001/A1] ordinary living 1-second ticks reuse full chronological identity without cold material replay",()=>{
  for(const shape of ["sparse","complex","dense"] as const){
    const source=named(shape),seed="perf/living/tick/"+shape;
    const create=(game:ReturnType<typeof createGame>,forceCold=false)=>
      createSimulation(source,seed,"infant",{
        needTimeline:deriveCareTimeline(game),
        liveContext:deriveDevelopmentContext(game),careGame:game,
        ...(forceCold?{verifyMaterialProgram:(program:ReturnType<typeof programFor>["program"])=>({program})}:{}),
      });
    let game=advanceGame(createGame(seed,"infant",start),start+2*HOUR,"active");
    let sim=create(game);
    const hour=()=> (game.clock.nowMs-game.clock.startedAtMs)/HOUR;
    sim.frameAt(hour()/24,{time:0,action:"idle"});
    let transfers=0;
    for(let i=1;i<=6;i++){
      game=advanceGame(game,start+2*HOUR+i*1000,"active");
      sim=create(game);
      const fresh=create(game,true);
      const biologicalAge=hour()/24;
      const resumed=sim.frameAt(biologicalAge,{time:0,action:"idle"});
      const independent=fresh.frameAt(biologicalAge,{time:0,action:"idle"});
      assert.deepEqual(resumed.pixels,independent.pixels);
      assert.deepEqual(resumed.parts.map(p=>[p.id,p.pixels]),
        independent.parts.map(p=>[p.id,p.pixels]));
      assert.deepEqual(resumed.wellbeing,independent.wellbeing);
      const stats=sim.getMaterialRuntimeStats!();
      assert.ok(stats.imported>0,"same saved material prefix must import an integer-hour checkpoint");
      assert.equal(stats.cold,0,"no from-birth material replay on an ordinary tick");
      assert.ok(stats.resumed>0);
      transfers+=stats.imported;
      assert.equal(fresh.getMaterialRuntimeStats!().imported,0);
      assert.ok(getLivingTimelineCacheStats().entries<=getLivingTimelineCacheStats().limit);
    }
    assert.ok(transfers>=6);
  }
});
test("[PERF-001/A1] accepted/refused/fractional/training and hourly samples invalidate only the causal suffix",()=>{
  const source=named("complex"),seed="perf/care-prefix-changes";
  const make=(game:ReturnType<typeof createGame>,uncached=false)=>createSimulation(
    source,seed,"infant",{
      needTimeline:deriveCareTimeline(game),
      liveContext:deriveDevelopmentContext(game),careGame:game,
      ...(uncached?{verifyMaterialProgram:(program:ReturnType<typeof programFor>["program"])=>({program})}:{}),
    });
  const base=advanceGame(createGame(seed,"infant",start),start+2*HOUR,"active");
  let previous=make(base);
  previous.frameAt(2/24,{time:0,action:"idle"});
  const sequence=[
    commandGame(base,{type:"choose",choice:"high"},start+2*HOUR+1400,"refused/choose"),
  ];
  sequence.push(commandGame(sequence.at(-1)!,{type:"feed",food:"meal"},
    start+2*HOUR+1700,"accepted/feed/fractional"));
  sequence.push(commandGame(sequence.at(-1)!,{type:"start-game",game:"training"},
    start+2*HOUR+2100,"accepted/training"));
  sequence.push(advanceGame(sequence.at(-1)!,start+3*HOUR+300,"active"));
  assert.equal(sequence[0].commandHistory.at(-1)?.accepted,false);
  assert.ok(sequence[1].commandHistory.at(-1)?.accepted);
  assert.ok(sequence[2].commandHistory.at(-1)?.accepted);
  assert.ok(sequence[3].careSamples.length>base.careSamples.length);
  for(const game of sequence){
    const cached=make(game),independent=make(game,true);
    const age=(game.clock.nowMs-game.clock.startedAtMs)/(24*HOUR);
    const a=cached.frameAt(age,{time:1,action:"idle"});
    const b=independent.frameAt(age,{time:1,action:"idle"});
    assert.deepEqual(a.pixels,b.pixels);
    assert.deepEqual(a.parts.map(p=>[p.id,p.pixels]),b.parts.map(p=>[p.id,p.pixels]));
    assert.deepEqual(a.wellbeing,b.wellbeing);
    assert.deepEqual(cached.developmentAt(age).commitments,
      independent.developmentAt(age).commitments);
    assert.ok(cached.getMaterialRuntimeStats!().imported>0,
      "old completed chronology before appended fractional care is valid");
    // Reverse history cannot inherit future geometry.
    assert.deepEqual(cached.frameAt(1/24,{time:0,action:"idle"}).pixels,
      independent.frameAt(1/24,{time:0,action:"idle"}).pixels);
  }
});
test("[PERF-001/A1] retroactive edits, source/seed swaps, restoration and cache budget",()=>{
  const source=named("sparse"),seed="perf/invalidation/seed";
  const make=(sourceArg:PetPart[],s:string,game:ReturnType<typeof createGame>)=>
    createSimulation(sourceArg,s,"infant",{
      careGame:game,needTimeline:deriveCareTimeline(game),
      liveContext:deriveDevelopmentContext(game),
    });
  const past=advanceGame(createGame(seed,"infant",start),start+3*HOUR,"active");
  let old=make(source,seed,past);old.frameAt(3/24);
  const restored=JSON.parse(JSON.stringify(past)) as typeof past;
  const fromSave=make(source,seed,restored);
  fromSave.frameAt(3/24);
  assert.ok(fromSave.getMaterialRuntimeStats!().imported>0);
  const altered=JSON.parse(JSON.stringify(past)) as typeof past;
  altered.careSamples[0].values[0]=altered.careSamples[0].values[0]===0?1:0;
  const rejectedBefore=getLivingTimelineCacheStats().rejections;
  const changed=make(source,seed,altered);
  changed.frameAt(3/24);
  assert.equal(changed.getMaterialRuntimeStats!().imported,0);
  assert.ok(getLivingTimelineCacheStats().rejections>rejectedBefore);
  const modifiedSource=source.map(p=>({...p,pixels:[...p.pixels,
    {x:31,y:31,color:"#92a6bb"}]}));
  const differentInk=make(modifiedSource,seed,past);
  differentInk.frameAt(3/24);
  assert.equal(differentInk.getMaterialRuntimeStats!().imported,0);
  const differentSeed="perf/invalidation/other-seed";
  const differentPet=make(source,differentSeed,
    advanceGame(createGame(differentSeed,"infant",start),start+3*HOUR,"active"));
  differentPet.frameAt(3/24);
  assert.equal(differentPet.getMaterialRuntimeStats!().imported,0);
  assert.ok(getLivingTimelineCacheStats().entries<=3);
  const after=make(source,seed,past);
  after.frameAt(3/24);
  // Old history may have been evicted, but no future or different pet can
  // retroactively mutate its original graph/frame.
  assert.deepEqual(old.frameAt(3/24).pixels,after.frameAt(3/24).pixels);
});
