/** Reproducible PERF-001 measurements of the SHIPPED daily engine. No images,
 * device emulation or claims about native-phone hardware. */
import {performance} from "node:perf_hooks";
import {createSimulation,type PetPart} from "../src/simulation";
import {createGame,advanceGame,commandGame,deriveCareTimeline,deriveDevelopmentContext,
  HOUR,DAY,type GameState,type GameCommand} from "../src/gameplay";
import {clearDailyLivingCache,getDailyLivingCacheStats} from "../src/integration/daily-runtime";
export const BENCHMARK_START=Date.UTC(2026,9,27,12,17,23,456);
export const benchmarkShapes:Record<string,PetPart[]>={
  sparse:ink((x,y)=>(x===16&&y>4&&y<28)||(y===16&&x>4&&x<28)),
  unusual:ink((x,y)=>x===0||y===0||x===31||y===31||(x+y)%7===0),
  dense:ink(()=>true),
  mosaic:Array.from({length:15},(_,kind)=>({id:"brush/"+kind,kind:(["body","head","arm","hand","leg","foot","eye","mouth","ear","tail","wing","horn","egg","hair","decoration"] as const)[kind],name:"Player mark "+kind,parentId:null,position:{x:0,y:0},pixels:Array.from({length:1024},(_,i)=>({x:i%32,y:Math.floor(i/32),color:"#597b42"})).filter(p=>(p.x+3*p.y)%15===kind)})),
};
function ink(test:(x:number,y:number)=>boolean):PetPart[]{return [{id:"arbitrary-ink",kind:"body",name:"Player drawing",parentId:null,position:{x:0,y:0},pixels:Array.from({length:1024},(_,i)=>({x:i%32,y:Math.floor(i/32),color:"#597b42"})).filter(p=>test(p.x,p.y))}];}
export function maintainedLife(seed:string,days=366):Map<number,GameState>{
  let game=createGame(seed,"infant",BENCHMARK_START);const lives=new Map<number,GameState>([[0,game]]);
  const command=(c:GameCommand)=>{game=commandGame(game,c,game.clock.nowMs,"perf/"+(game.commandSequence??game.commandHistory.length));};
  for(let hour=1;hour<=days*24;hour++){
    game=advanceGame(game,BENCHMARK_START+hour*HOUR);
    if(game.dead)throw new Error("Real benchmark care failed at "+hour);
    if(game.sleeping){if(game.lightsOn)command({type:"lights",on:false});}
    else {
      if(game.attention.discipline)command({type:"discipline"});
      for(const [meter,food] of [["hunger","meal"],["happiness","snack"],["strength","protein"]] as const)
        while(game.meters[meter]<4)command({type:"feed",food});
      if(game.waste)command({type:"clean"});
      while(game.health.sickness||game.health.injury)command({type:"medicine"});
    }
    if([2,23,24,7*24,90*24,364*24,365*24,366*24,400*24,days*24].includes(hour))lives.set(hour,game);
  }
  return lives;
}
export function playerSimulation(source:PetPart[],game:GameState,cold=false,checkpoint?:unknown){return createSimulation(source,game.seed,game.mode,{
  careGame:game,liveContext:deriveDevelopmentContext(game),
  reuseLivingMaterial:!cold,anatomicalCheckpoint:checkpoint});}
export function latency(values:number[]){const sorted=[...values].sort((a,b)=>a-b);return {medianMs:sorted[Math.floor(sorted.length/2)],p95Ms:sorted[Math.ceil(sorted.length*0.95)-1],maxMs:sorted.at(-1)!};}
export function measureTicks(source:PetPart[],initial:GameState,count=24,commands=false){
  let game=initial;const values:number[]=[];let physicalSteps=0;
  // Warm-up is deliberately outside timed samples; each paired cold oracle
  // below is a completely separate from-birth evaluation, never this cache.
  let sim=playerSimulation(source,game);sim.frameAt((game.clock.nowMs-BENCHMARK_START)/DAY);
  for(let tick=0;tick<count;tick++){
    const start=performance.now();
    game=advanceGame(game,game.clock.nowMs+1000);
    if(commands)game=commandGame(game,tick%2?{type:"choose",choice:"left"}:{type:"clean"},game.clock.nowMs,"tick/"+tick);
    sim=playerSimulation(source,game);sim.frameAt((game.clock.nowMs-BENCHMARK_START)/DAY,{time:tick/10});
    values.push(performance.now()-start);physicalSteps+=sim.getMaterialRuntimeStats!().steps;
  }
  return {game,simulation:sim,latency:latency(values),physicalSteps};
}
export async function runDailyBenchmark(){
  console.log(JSON.stringify({kind:"environment",runtime:process.version,platform:process.platform,
    architecture:process.arch,hardwareClaim:"Linux Node reference only; no native-phone qualification"}));
  const seed="DAILY-PERFORMANCE",lives=maintainedLife(seed);
  for(const [shape,source] of Object.entries(benchmarkShapes)){
    clearDailyLivingCache();
    for(const hour of [0,2,23,24,7*24,90*24,364*24,365*24,366*24]){
      const game=lives.get(hour)!;const begin=performance.now();
      const sim=playerSimulation(source,game),state=sim.materialStateAt(hour/24);
      const checkpointMs=performance.now()-begin;
      const ticks=measureTicks(source,game,24,hour===24);
      const coldStart=performance.now(),cold=playerSimulation(source,ticks.game,true);
      const reference=cold.materialStateAt((ticks.game.clock.nowMs-BENCHMARK_START)/DAY);
      const coldMs=performance.now()-coldStart;
      if(JSON.stringify(reference)!==JSON.stringify(ticks.simulation.materialStateAt((ticks.game.clock.nowMs-BENCHMARK_START)/DAY)))throw new Error("Paired cold reference differs");
      console.log(JSON.stringify({kind:"measure",shape,hour,checkpointMs,coldMs,...ticks.latency,
        physicalSteps:ticks.physicalSteps,cells:state.graph.cells.length,events:state.graph.events.length,
        stateBytes:Buffer.byteLength(JSON.stringify(state)),cache:getDailyLivingCacheStats()}));
    }
    const mature=playerSimulation(source,lives.get(366*24)!,true);mature.materialStateAt(365);
    const checkpoint=mature.exportAnatomicalCheckpoint();
    const start=performance.now(),reopened=playerSimulation(source,lives.get(366*24)!,true,checkpoint);
    reopened.materialStateAt(366);
    console.log(JSON.stringify({kind:"saved-reopen",shape,ms:performance.now()-start,stats:reopened.getMaterialRuntimeStats!(),
      checkpointBytes:Buffer.byteLength(JSON.stringify(checkpoint)),rssMiB:process.memoryUsage().rss/1048576}));
  }
}
if(process.argv[1]?.endsWith("daily-benchmark.ts"))void runDailyBenchmark().catch(e=>{console.error(e);process.exitCode=1;});
