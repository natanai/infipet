#!/usr/bin/env node
/**
 * MORPH-001 opt-in, isolated real-engine comparison.
 * Usage: node scripts/morphology-compare.mjs --out=/tmp/infipet-morphology.json
 * Optional --quick (2 seeds) instead of the default 3 seeds.
 *
 * Requires git with access to pinned commits and the CURRENT checkout's
 * installed tsx dependencies. Does not modify production source/CI workflow,
 * install historical packages, or check in bulk benchmark output.
 */
import {execFileSync} from "node:child_process";
import {mkdtempSync,mkdirSync,cpSync,symlinkSync,rmSync,writeFileSync,realpathSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const sourceRevision=Object.freeze({
  expressive:"1469fc4d8f8f98be21a7c13ac602ce69ed9a67a7",
  historical:"3111b1666317d491e7c09c3087c41a5ef3b59685",
  daily:"9e00248518b6bc857454038405967562a25df263",
});
const tmp=mkdtempSync(join(tmpdir(),"infipet-morph-"));
const outArg=process.argv.find(v=>v.startsWith("--out="));
const quick=process.argv.includes("--quick");
const run=(bin,args,cwd=root)=>execFileSync(bin,args,{cwd,encoding:"utf8",maxBuffer:40*1024*1024,stdio:["ignore","pipe","pipe"]});
const mean=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:0;
const med=a=>a.length?[...a].sort((x,y)=>x-y)[Math.floor(a.length/2)]:null;
const round=n=>n===null?null:Math.round(n*1e6)/1e6;
const properties=["occupiedArea","width","height","aspectRatio","perimeter","compactness",
  "components","cavities","thinFraction","thinEndpoints","thinJunctionPixels",
  "materialIdentityCoverage"] ;
function summarize(data){
  const records=data.records;
  if(data.shapes!==30||new Set(records.map(x=>x.sourceId)).size!==30)
    throw Error("Missing independent cohort drawings");
  const times=[0,.25,.5,.75,1];
  const milestones=times.map((progress,i)=>{
    const frames=records.map(r=>r.frames[i]);
    return {progress,actualElapsedDays:frames[0].actualAge,
      ...Object.fromEntries(properties.map(p=>[p,round(mean(frames.map(f=>f[p])))])),
      thicknessMedian:round(med(frames.map(f=>f.localThickness.median))),
      medianAreaRatio:round(med(frames.map(f=>f.delta?.areaRatio).filter(v=>v!==null&&v!==undefined))),
      meanRegionRebalance:round(mean(frames.map(f=>f.delta?.regionFractionL1??0))),
      meanShapeDisplacement:round(mean(frames.map(f=>f.delta?.centerDisplacement??0))),
      actualMaterialCreated:round(mean(frames.map(f=>f.physical?.generated??0))),
      actualMaterialRelocated:round(mean(frames.map(f=>f.physical?.movedOriginals??0))),
      validPhysicalWitnesses:frames.filter(f=>f.physical!==null).length,
      nullPhysicalWitnesses:frames.filter(f=>f.physical===null).length,
    };
  });
  let structuralSeedDifferences=0,careDependentDifferences=0;
  const final=new Map(records.map(r=>[r.sourceId+"|"+r.seed+"|"+r.care,r.frames.at(-1)]));
  const shapeKey=x=>JSON.stringify([x.occupiedArea,x.width,x.height,x.components,x.cavities,
    x.localThickness.median,x.thinEndpoints,x.regionFractions]);
  for(const c of new Set(records.map(r=>r.sourceId))){
    for(const care of data.careProfiles){
      if(new Set(data.seeds.map(seed=>shapeKey(final.get(c+"|"+seed+"|"+care)))).size>1)
        structuralSeedDifferences++;
    }
    for(const seed of data.seeds){
      if(new Set(data.careProfiles.map(care=>shapeKey(final.get(c+"|"+seed+"|"+care)))).size>1)
        careDependentDifferences++;
    }
  }
  const categories=[...new Set(records.map(r=>r.sourceFamily))];
  const familyMetrics=Object.fromEntries(categories.map(family=>{
    const frames=records.filter(r=>r.sourceFamily===family).map(r=>r.frames.at(-1));
    return [family,{
      areaRatioMedian:round(med(frames.map(f=>f.delta?.areaRatio).filter(v=>v!==null&&v!==undefined))),
      meanThicknessChange:round(mean(frames.map(f=>f.delta?.medianThicknessChange??0))),
      meanRegionRebalance:round(mean(frames.map(f=>f.delta?.regionFractionL1??0))),
      meanBranchingChange:round(mean(frames.map(f=>f.delta?.branchingProminenceChange??0))),
      meanCavityChange:round(mean(frames.map(f=>f.delta?.cavityChange??0))),
      physicalGeneratedMean:round(mean(frames.map(f=>f.physical?.generated??0))),
    }];
  }));
  return {revision:data.revision,clock:data.clock,
    shapeCount:data.shapes,seedCount:data.seeds.length,careProfiles:data.careProfiles,
    observations:records.length*5,
    clockNote:"Compare normalized progress only; native elapsed ages are NOT equivalent.",
    structuralSeedDifferences,careDependentDifferences,milestones,families:familyMetrics};
}
try{
  const report={schema:"infipet-morphology-compare-v1",
    immutableRevisions:sourceRevision,cohort:"morphology-authored-ink-30-v1",
    metricMethod:"scripts/morphology-metrics.ts independent four-connected lattice oracle",
    warnings:[
      "Historical composited pixels are observations, NOT independently audited physical matter.",
      "The early expressive renderer does not accept recorded careGame events; need timelines remain controlled separately.",
      "The hybrid historical renderer can have some physical events, but its visible structural projection is not equivalent to its material graph.",
      "The daily renderer's native clock is 365 elapsed 24-hour checks, not historical morphological days.",
      "An unchanged individual is valid; system-wide morphology variety requires separate MORPH-003 qualification."
    ],results:[]};
  const loader=realpathSync(join(root,"node_modules"));
  const tsx=join(root,"node_modules",".bin","tsx");
  for(const [mode,ref] of Object.entries(sourceRevision)){
    try{run("git",["cat-file","-e",ref+"^{commit}"]);}
    catch{run("git",["fetch","--no-tags","--depth=1","origin",ref]);}
    const worktree=join(tmp,mode);mkdirSync(worktree,{recursive:true});
    run("git",["worktree","add","--detach","--force",worktree,ref]);
    symlinkSync(loader,join(worktree,"node_modules"),"dir");
    for(const name of ["morphology-cohort.ts","morphology-metrics.ts","morphology-replay.ts"])
      cpSync(join(root,"scripts",name),join(worktree,"scripts",name));
    const args=["scripts/morphology-replay.ts","--revision="+ref,"--clock="+mode,...(quick?["--quick"]:[])];
    const data=JSON.parse(run(tsx,args,worktree));
    report.results.push(summarize(data));
  }
  report.comparison={
    normalizedProgress:[0,.25,.5,.75,1],
    expressivenessIsNotPhysicalCorrectness:true,
    deterministicCohort:true,
    historicalAndDailyAgeInterchangeable:false,
  };
  const json=JSON.stringify(report,null,2)+"\n";
  if(outArg){const path=resolve(outArg.slice(6));writeFileSync(path,json);process.stdout.write(path+"\n");}
  else process.stdout.write(json);
}finally{
  for(const mode of Object.keys(sourceRevision)){
    try{run("git",["worktree","remove","--force",join(tmp,mode)]);}catch{}
  }
  rmSync(tmp,{recursive:true,force:true});
}
