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
import { getLivingTimelineCacheStats, getLivingTimelinePhaseStats } from "../src/integration/living-timeline";
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
  ordinaryIterationsPerShape:32,advancedAges:[24,96,720]});
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
    compileReuseMs:number;reconstructs:number;imports:number;
    evidenceMs:number;remodelingMs:number;prefixMs:number;
    transferMs:number;timelineMs:number}[]=[];
  for(let i=1;i<=32;i++){
    game=advanceGame(game,start+2*HOUR+i*1000,"active");
    const age=(game.clock.nowMs-game.clock.startedAtMs)/(24*HOUR);
    const run=(reuse:boolean)=>{
      const startCompile=performance.now();
      const sim=create(game,reuse);
      const compileMs=performance.now()-startCompile;
      const stats=sim.getMaterialRuntimeStats!();
      const phases=reuse&&stats.imported>0?getLivingTimelinePhaseStats():null;
      const frame=sim.frameAt(age,{time:0,action:"idle"});
      return {ms:performance.now()-startCompile,compileMs,
        phases,frame,stats};
    };
    // Alternate order to reduce one-sided JIT/GC bias.
    const first=i%2===0 ? run(true):run(false);
    const second=i%2===0 ? run(false):run(true);
    const faster=i%2===0?first:second;
    const independent=i%2===0?second:first;
    assert.deepEqual(faster.frame.pixels,independent.frame.pixels);
    assert.equal(independent.stats.imported,0);
    assert.equal(faster.stats.imported,0,
      "young-life fast policy intentionally bypasses cache import");
    // A frame may not request any material operation at this particular
    // developmental pose. Zero cold evaluations is legitimate; exact frame
    // equality and zero transferred snapshots are the meaningful oracles.
    results.push({coldMs:independent.ms,reuseMs:faster.ms,
      compileColdMs:independent.compileMs,
      compileReuseMs:faster.compileMs,
      reconstructs:independent.stats.cold,
      imports:faster.stats.imported,
      evidenceMs:faster.phases?.evidenceMs??0,
      remodelingMs:faster.phases?.remodelingMs??0,
      prefixMs:faster.phases?.prefixMs??0,
      transferMs:faster.phases?.transferMs??0,
      timelineMs:faster.phases?.timelineMs??0});
  }
  const sorted=(key:keyof typeof results[number])=>
    results.map(x=>x[key]).sort((a,b)=>a-b);
  const median=(key:keyof typeof results[number])=>{
    const s=sorted(key);return +((s[Math.floor((s.length-1)/2)]+
      s[Math.floor(s.length/2)])/2).toFixed(3);
  };
  const memory=process.memoryUsage();
  output({kind:"paired",shape,inkCells:source[0].pixels.length,n:results.length,
    coldMedianMs:median("coldMs"),reuseMedianMs:median("reuseMs"),
    speedup:+(median("coldMs")/median("reuseMs")).toFixed(2),
    coldCompilationMedianMs:median("compileColdMs"),
    reuseCompilationMedianMs:median("compileReuseMs"),
    cachePhasesMedianMs:{
      evidence:median("evidenceMs"),remodeling:median("remodelingMs"),
      prefix:median("prefixMs"),transfer:median("transferMs"),
      timeline:median("timelineMs"),
    },
    coldReconstructionCount:results.reduce((n,r)=>n+r.reconstructs,0),
    importedCanonicalStates:results.reduce((n,r)=>n+r.imports,0),
    lowCostBypassedEvaluations:results.filter(r=>r.imports===0).length,
    coldRangeMs:[sorted("coldMs")[0],sorted("coldMs").at(-1)],
    reuseRangeMs:[sorted("reuseMs")[0],sorted("reuseMs").at(-1)],
    coldEmpiricalP95Ms:+sorted("coldMs")[Math.ceil(results.length*.95)-1].toFixed(3),
    reuseEmpiricalP95Ms:+sorted("reuseMs")[Math.ceil(results.length*.95)-1].toFixed(3),
    rssMiB:+(memory.rss/MB).toFixed(2),heapMiB:+(memory.heapUsed/MB).toFixed(2),
    cache:getLivingTimelineCacheStats()});
}

/**
 * A second real native saved-life scenario: the pet returns after 96 hours
 * away. The native game preserves an absent pet's return grace, so the pet is
 * still alive. This is intentionally labelled "absence return", NOT routine
 * healthy care or a claimed generic mobile benchmark.
 */
for(const shape of ["sparse","complex","dense"] as const){
  const seed="benchmark/life-after-absence/"+shape,source=drawing(shape);
  const create=(game:ReturnType<typeof createGame>,reuse:boolean)=>
    createSimulation(source,seed,"infant",{
      careGame:game,needTimeline:deriveCareTimeline(game),
      liveContext:deriveDevelopmentContext(game),reuseLivingMaterial:reuse,
    });
  let game=advanceGame(createGame(seed,"infant",start),start+96*HOUR,"absent");
  assert.equal(game.dead,false,"native absent return must preserve living-pet grace");
  const original=create(game,true);
  original.frameAt(96/24,{time:0,action:"idle"});
  const paired:{cold:number;warm:number;imports:number;fromBirth:number}[]=[];
  for(let i=1;i<=32;i++){
    game=advanceGame(game,start+96*HOUR+i*1000,"active");
    assert.equal(game.dead,false);
    const age=(game.clock.nowMs-game.clock.startedAtMs)/(24*HOUR);
    const measure=(reuse:boolean)=>{
      const t=performance.now();
      const sim=create(game,reuse);
      const frame=sim.frameAt(age,{time:0,action:"idle"});
      return {ms:performance.now()-t,frame,stats:sim.getMaterialRuntimeStats!()};
    };
    const run1=i%2===0?measure(true):measure(false);
    const run2=i%2===0?measure(false):measure(true);
    const reused=i%2===0?run1:run2,cold=i%2===0?run2:run1;
    assert.deepEqual(reused.frame.pixels,cold.frame.pixels);
    assert.ok(reused.stats.imported>0);
    assert.equal(reused.stats.cold,0);
    assert.ok(cold.stats.cold>0);
    paired.push({cold:cold.ms,warm:reused.ms,
      imports:reused.stats.imported,fromBirth:cold.stats.cold});
  }
  const values=(key:"cold"|"warm")=>paired.map(p=>p[key]).sort((a,b)=>a-b);
  const a=values("cold"),v=values("warm");
  const mid=a.length/2;
  const baseline=(a[mid-1]+a[mid])/2,optimized=(v[mid-1]+v[mid])/2;
  output({kind:"paired-absence-return",shape,horizonHours:96,
    n:paired.length,inkCells:source[0].pixels.length,
    coldMedianMs:+baseline.toFixed(3),reuseMedianMs:+optimized.toFixed(3),
    speedup:+(baseline/optimized).toFixed(3),
    coldRangeMs:[a[0],a.at(-1)],reuseRangeMs:[v[0],v.at(-1)],
    coldEmpiricalP95Ms:+a[Math.ceil(a.length*.95)-1].toFixed(3),
    reuseEmpiricalP95Ms:+v[Math.ceil(v.length*.95)-1].toFixed(3),
    coldReconstructionCount:paired.reduce((n,p)=>n+p.fromBirth,0),
    importedCanonicalStates:paired.reduce((n,p)=>n+p.imports,0),
    cache:getLivingTimelineCacheStats()});
}

/**
 * Additional ordinary life ages. A game at 720 hours is within its native
 * saved historical horizon and in absent-return grace, not a fabricated
 * living event beyond native lifespan. Cold 8192h retrospective (without
 * pretending native game lives 8192h) remains in profile-runtime.ts.
 */
for(const hour of [24,720] as const)for(const shape of ["sparse","complex","dense"] as const){
  const rounds=hour===720?8:32;
  const seed="benchmark/age/"+hour+"/"+shape,source=drawing(shape);
  const make=(game:ReturnType<typeof createGame>,reuse:boolean)=>
    createSimulation(source,seed,"infant",{
      careGame:game,needTimeline:deriveCareTimeline(game),
      liveContext:deriveDevelopmentContext(game),reuseLivingMaterial:reuse,
    });
  let game=advanceGame(createGame(seed,"infant",start),start+hour*HOUR,"absent");
  if(game.dead){
    output({kind:"unsupported-native-lifetime",hour,shape,reason:"GameState no longer living"});
    continue;
  }
  const first=make(game,true);
  first.frameAt(hour/24,{time:0,action:"idle"});
  const before:number[]=[],after:number[]=[];
  let imported=0,cold=0;
  for(let i=1;i<=rounds;i++){
    game=advanceGame(game,start+hour*HOUR+i*1000,"active");
    if(game.dead)break;
    const age=(game.clock.nowMs-game.clock.startedAtMs)/(24*HOUR);
    const sample=(reuse:boolean)=>{
      const t=performance.now();
      const sim=make(game,reuse);
      const frame=sim.frameAt(age,{time:0,action:"idle"});
      return {ms:performance.now()-t,frame,stats:sim.getMaterialRuntimeStats!()};
    };
    const firstRun=i%2?sample(false):sample(true);
    const lastRun=i%2?sample(true):sample(false);
    const cached=i%2?lastRun:firstRun,reference=i%2?firstRun:lastRun;
    assert.deepEqual(cached.frame.pixels,reference.frame.pixels);
    assert.ok(cached.stats.imported>0);
    assert.ok(reference.stats.cold>0);
    before.push(reference.ms);after.push(cached.ms);
    imported+=cached.stats.imported;cold+=reference.stats.cold;
  }
  const sort=(a:number[])=>[...a].sort((x,y)=>x-y);
  const u=sort(before),v=sort(after),n=u.length;
  if(n===0)continue;
  const med=(a:number[])=>+(n%2?a[(n-1)/2]:(a[n/2-1]+a[n/2])/2).toFixed(3);
  output({kind:"paired-age",hour,shape,inkCells:source[0].pixels.length,
    n,medianColdMs:med(u),medianReuseMs:med(v),
    empiricalP95ColdMs:+u[Math.ceil(n*.95)-1].toFixed(3),
    empiricalP95ReuseMs:+v[Math.ceil(n*.95)-1].toFixed(3),
    minMaxColdMs:[+u[0].toFixed(3),+u[u.length-1].toFixed(3)],
    minMaxReuseMs:[+v[0].toFixed(3),+v[v.length-1].toFixed(3)],
    coldReconstructionCount:cold,importedCanonicalStates:imported,
    note:n<20?"insufficient trials for a meaningful p95":"empirical Linux Node trial p95; not device p95"});
}

/** Compare actual accepted / rejected / training commits and fractional care. */
for(const scenario of [
  {label:"accepted-feeding",command:{type:"feed",food:"snack"} as const},
  {label:"rejected-command",command:{type:"choose",choice:"high"} as const},
  {label:"training",command:{type:"start-game",game:"training"} as const},
  {label:"fractional-feeding",command:{type:"feed",food:"meal"} as const},
]){
  const cold:number[]=[],warm:number[]=[],commands:number[]=[];
  let rejected=0,accepted=0;
  for(let n=0;n<16;n++){
    const seed="benchmark/care-commit/"+scenario.label+"/"+n;
    const source=drawing(n%2?"dense":"complex");
    const create=(game:ReturnType<typeof createGame>,reuse:boolean)=>
      createSimulation(source,seed,"infant",{
        careGame:game,needTimeline:deriveCareTimeline(game),
        liveContext:deriveDevelopmentContext(game),reuseLivingMaterial:reuse,
      });
    const base=advanceGame(createGame(seed,"infant",start),
      start+6*HOUR,"active");
    create(base,true).frameAt(6/24,{time:0,action:"idle"});
    const at=start+6*HOUR+(scenario.label==="fractional-feeding"?123457:1000);
    const commandStart=performance.now();
    const after=commandGame(base,scenario.command,at,
      "benchmark/care-"+scenario.label);
    commands.push(performance.now()-commandStart);
    if(after.commandHistory.at(-1)?.accepted)accepted++;else rejected++;
    const age=(after.clock.nowMs-after.clock.startedAtMs)/(24*HOUR);
    const sample=(reuse:boolean)=>{
      const t=performance.now();
      const sim=create(after,reuse);
      const frame=sim.frameAt(age,{time:0,action:"idle"});
      return {ms:performance.now()-t,frame,stats:sim.getMaterialRuntimeStats!()};
    };
    const a=n%2===0?sample(true):sample(false);
    const b=n%2===0?sample(false):sample(true);
    const reused=n%2===0?a:b,reference=n%2===0?b:a;
    assert.deepEqual(reused.frame.pixels,reference.frame.pixels);
    assert.ok(reused.stats.imported>0);
    assert.ok(reference.stats.cold>0);
    cold.push(reference.ms);warm.push(reused.ms);
  }
  const summary=(samples:number[])=>{
    const s=[...samples].sort((a,b)=>a-b);
    return {medianMs:+((s[7]+s[8])/2).toFixed(3),
      empiricalP95Ms:+s[Math.ceil(s.length*.95)-1].toFixed(3),
      rangeMs:[+s[0].toFixed(3),+s[s.length-1].toFixed(3)]};
  };
  output({kind:"paired-care-command",scenario:scenario.label,n:16,
    accepted,rejected,commandExecution:summary(commands),
    fromBirth:summary(cold),reused:summary(warm),
    note:"Linux Node 16 independent seeds; p95 is sample order statistic, not device latency"});
}
