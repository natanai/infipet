/** Bounded CLI reproduction probe; does not modify game source or saved pets. */
import { readFile, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { createHash } from "node:crypto";
import { createSimulation } from "../../../../src/simulation";
import { STARTER_PRESETS } from "../../../../src/presets";

async function main() {
  const source = STARTER_PRESETS.find(p=>p.id==="canine-cub")!.parts;
  const seed="3352806301",needTimeline=[{needId:"safety" as const,tick:3650*24,fulfillment:0}];
  const birth=createSimulation(source,seed,"infant",{needTimeline});
  const stroke=birth.groomingStrokeAt(0,{x:25.5,y:38},{x:25.5,y:43});
  const scenarios=[{id:"safety-without-groom",options:{needTimeline}},{id:"safety-one-day0-groom",options:{needTimeline,groomingTimeline:stroke?[{...stroke,id:"far-future/day0"}]:[]}}];
  const output:any={createdAt:new Date().toISOString(),node:process.version,source:"canine-cub",seed,needTimeline,groomingStroke:stroke,limits:{nodeHeapMB:512,engineCapture:false},records:[],failures:[]};
  for(const scenario of scenarios){
    const sim=createSimulation(source,seed,"infant",scenario.options);
    for(const age of [3650,3650.25,1000000,1000000.25]){
      for(const method of ["stateAt","developmentAt","frameAt"] as const){
        const before=process.memoryUsage(),start=performance.now();
        console.log(JSON.stringify({starting:scenario.id,method,age}));
        try{
          const value=method==="frameAt"?sim.frameAt(age,{action:"idle",time:0}):sim[method](age),after=process.memoryUsage();
          const result:any={scenario:scenario.id,method,age,elapsedMs:performance.now()-start,heapBefore:before.heapUsed,heapAfter:after.heapUsed,rss:after.rss,valid:true};
          if(method==="frameAt") {const f=value as ReturnType<typeof sim.frameAt>; result.pixels=f.pixels.length;result.parts=f.parts.length;result.valid=f.pixels.every(p=>Number.isInteger(p.x)&&Number.isInteger(p.y)&&p.x>=0&&p.y>=0&&p.x<64&&p.y<64);result.stage=f.stage;}
          output.records.push(result);console.log(JSON.stringify(result));
        }catch(e){const failure={scenario:scenario.id,method,age,error:e instanceof Error?e.stack:String(e)};output.failures.push(failure);console.log(JSON.stringify(failure));}
      }
    }
    const start=performance.now(),before=process.memoryUsage();
    for(let i=0;i<64;i++)sim.frameAt(3650.25,{action:"move",time:i/20});
    output.records.push({scenario:scenario.id,method:"64 advancing-time move frames",age:3650.25,elapsedMs:performance.now()-start,heapBefore:before.heapUsed,heapAfter:process.memoryUsage().heapUsed,rss:process.memoryUsage().rss,poseCache:sim.getRenderCacheStats?.()});
  }
  const files=["src/simulation/growth.ts","src/simulation/development.ts","src/needs/simulation.ts","src/simulation/grooming.ts","src/components/NeedsLab.tsx","src/components/TimelineSlider.web.tsx","App.tsx"];
  output.sourceHashes=Object.fromEntries(await Promise.all(files.map(async f=>[f,createHash("sha256").update(await readFile(f)).digest("hex")])));
  await writeFile("docs/audits/life-v7/diagnostics/far-future-cli-001.json",JSON.stringify(output,null,2)+"\n",{flag:"wx"});
  console.log(JSON.stringify({complete:true,records:output.records.length,failures:output.failures.length}));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
