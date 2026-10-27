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
import { createGame,advanceGame,commandGame,HOUR } from "../src/gameplay";
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
