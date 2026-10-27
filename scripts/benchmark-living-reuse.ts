/**
 * Paired real App-equivalent backend lifecycle benchmark (NOT a correctness
 * oracle). Invoke: pnpm exec tsx scripts/benchmark-living-reuse.ts
 *
 * Both paths build real createSimulation() with the same GameState and
 * identical renderer/biology; the independent baseline opts out ONLY of
 * transferable checkpoint reuse. No simulated hours are omitted, and
 * recording performance.now() cannot alter physical chronology.
 */
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { cpus,platform,arch } from "node:os";
import { createSimulation } from "../src/simulation";
import { createGame, advanceGame, commandGame, HOUR,
  deriveCareTimeline, deriveDevelopmentContext } from "../src/gameplay";
import { getLivingTimelineCacheStats } from "../src/integration/living-timeline";
import type { PetPart } from "../src/simulation/model";

const start=1_800_000_000_000;
type Shape="sparse"|"complex"|"dense";
function drawing(shape:Shape):PetPart[]{
  const pixels=Array.from({length:32},(_,y)=>Array.from({length:32},(_,x)=>{
    if(shape==="dense")return !(x>=12&&x<=19&&y>=12&&y<=19);
    if(shape==="complex")return x===0||y===0||x===31||y===31||
      (x>=12&&x<=19&&y>=12&&y<=19)||(x+y)%7===0||(x-y+64)%11===0;
    return (x===16&&y>=8&&y<=26)||
      (y===16&&x>=8&&x<=24)||(y===10&&x>=12&&x<=20);
  })).flatMap((row,y)=>row.flatMap((v,x)=>v?[{x,y,color:"#92a6bb"}]:[]));
  return [{id:"ink",kind:"body",name:"Source",parentId:null,
    position:{x:0,y:0},pixels}];
}
const output=(value:unknown)=>process.stdout.write(JSON.stringify(value)+"\n");
output({kind:"env",node:process.version,platform:platform(),arch:arch(),
  cpu:cpus()[0]?.model??"unknown",runner:process.env.RUNNER_NAME??"local",
  sourceSize:32,worldSize:64,chronologicalHorizonHours:3,
  iterationsPerShape:8});
const MB=1048576;
for(const shape of ["sparse","complex","dense"] as const){
  const seed="benchmark/live-reuse/"+shape,source=drawing(shape);
  const create=(game:ReturnType<typeof createGame>,useReuse:boolean)=>
    createSimulation(source,seed,"infant",{
      careGame:game,needTimeline:deriveCareTimeline(game),
      liveContext:deriveDevelopmentContext(game),
      reuseLivingMaterial:useReuse,
    });
  let game=advanceGame(createGame(seed,"infant",start),start+2*HOUR,"active");
  const warm=create(game,true);
  warm.frameAt(2/24,{time:0,action:"idle"});
  const results:{coldMs:number;reuseMs:number;compileColdMs:number;
    compileReuseMs:number;reconstructs:number;imports:number}[]=[];
  for(let i=1;i<=8;i++){
    game=advanceGame(game,start+2*HOUR+i*1000,"active");
    const age=(game.clock.nowMs-game.clock.startedAtMs)/(24*HOUR);
    const run=(reuse:boolean)=>{
      const startCompile=performance.now();
      const sim=create(game,reuse);
      const compileMs=performance.now()-startCompile;
      const frame=sim.frameAt(age,{time:0,action:"idle"});
      return {ms:performance.now()-startCompile,compileMs,
        frame,stats:sim.getMaterialRuntimeStats!()};
    };
    // Alternate order to reduce one-sided JIT/GC bias.
    const first=i%2===0 ? run(true):run(false);
    const second=i%2===0 ? run(false):run(true);
    const faster=i%2===0?first:second;
    const independent=i%2===0?second:first;
    assert.deepEqual(faster.frame.pixels,independent.frame.pixels);
    assert.equal(independent.stats.imported,0);
    assert.ok(faster.stats.imported>0);
    results.push({coldMs:independent.ms,reuseMs:faster.ms,
      compileColdMs:independent.compileMs,
      compileReuseMs:faster.compileMs,
      reconstructs:independent.stats.cold,
      imports:faster.stats.imported});
  }
  const sorted=(key:keyof typeof results[number])=>
    results.map(x=>x[key]).sort((a,b)=>a-b);
  const median=(key:keyof typeof results[number])=>{
    const s=sorted(key);return +((s[3]+s[4])/2).toFixed(3);
  };
  const memory=process.memoryUsage();
  output({kind:"paired",shape,inkCells:source[0].pixels.length,n:results.length,
    coldMedianMs:median("coldMs"),reuseMedianMs:median("reuseMs"),
    speedup:+(median("coldMs")/median("reuseMs")).toFixed(2),
    coldCompilationMedianMs:median("compileColdMs"),
    reuseCompilationMedianMs:median("compileReuseMs"),
    coldReconstructionCount:results.reduce((n,r)=>n+r.reconstructs,0),
    importedCanonicalStates:results.reduce((n,r)=>n+r.imports,0),
    coldRangeMs:[sorted("coldMs")[0],sorted("coldMs").at(-1)],
    reuseRangeMs:[sorted("reuseMs")[0],sorted("reuseMs").at(-1)],
    rssMiB:+(memory.rss/MB).toFixed(2),heapMiB:+(memory.heapUsed/MB).toFixed(2),
    cache:getLivingTimelineCacheStats()});
}
