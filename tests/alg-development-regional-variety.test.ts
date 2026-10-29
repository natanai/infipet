import test from "node:test";
import assert from "node:assert/strict";
import {STARTER_PRESETS} from "../src/presets";
import {createSimulation,flattenAnatomy,type PetPart} from "../src/simulation";
import {regionalGrowthDemand,regionalGrowthTensor,selectRegionalGrammar} from "../src/development/regional-regulation";
import {morphologicalVolumeCapacity} from "../src/development/morphological-fields";
import {CHAOS_MODULUS} from "../src/development/chaos";
import {compileMaterialDevelopment,createDailyMaterialState,applyDailyMaterialStep,
 verifyDailyMaterialInventory,type DailyCareWindowV1,type MaterialGraph} from "../src/development";
import {compileLifetimeRemodeling} from "../src/development/lifetime-remodeling";
import {reconstructDailyPhysicalState} from "../src/development/spatial-inventory";
import {morphologySources} from "../src/evaluation/morphology-cohort";
import {measurePhysical,measureChange} from "../src/evaluation/morphology";
import {morphologyDelta} from "../scripts/morphology-metrics";
import {maintainedLife,playerSimulation} from "../scripts/daily-benchmark";
import {checkpointDigest} from "../src/integration/checkpoint-integrity";
import type {PreviewCareInputs} from "../src/integration/daily-runtime";
import {materialInputs,drawing} from "./alg-development-fixtures";

const TIME=1_800_000_123_456,DAY=86_400_000;
const checkpoints=[0,1,7,30,90,180,270,365] as const;
const clone=<T>(v:T):T=>JSON.parse(JSON.stringify(v));
const window=(k:number,care=1):DailyCareWindowV1=>({version:1,hatchAtMs:TIME,
 checkIndex:k,startMs:TIME+(k-1)*DAY,endMs:TIME+k*DAY,
 forcing:{nutrition:care,rest:care,security:care,activity:care,threat:0,observedFraction:care},
 acceptedCommands:0,rejectedCommands:0,observations:0,activeMs:DAY,absentMs:0,
 unknownMs:0,unknown:[],provenanceDigest:"regional-test/"+k+"/"+care});
const abundant:PreviewCareInputs={kind:"synthetic-needs-lab-v1",nutrition:.9,timeline:[]};
const strategies:readonly PreviewCareInputs[]=[abundant,
 {kind:"synthetic-needs-lab-v1",nutrition:.25,timeline:[
  {needId:"rest",tick:0,fulfillment:.3},
  {needId:"security",tick:0,fulfillment:.25},
  {needId:"physical-fitness",tick:0,fulfillment:.2}]},
 {kind:"synthetic-needs-lab-v1",nutrition:.9,timeline:[
  {needId:"rest",tick:90*24,fulfillment:.2},
  {needId:"security",tick:90*24,fulfillment:.2},
  {needId:"rest",tick:180*24,fulfillment:.9},
  {needId:"security",tick:180*24,fulfillment:.9},
  {needId:"physical-fitness",tick:270*24,fulfillment:.1}]},
];
const signature=(g:MaterialGraph)=>[...new Set(g.cells.map(c=>c.x+","+c.y))].sort().join(";");
function physicalProof(g:MaterialGraph,birth:MaterialGraph){
 // JSON cloning deliberately removes object-identity proof credentials.
 // The oracle reconstructs EVERY event from immutable birth, with no access
 // to regional ranking, resource allocator or transaction producer.
 const copy=clone(g);
 const proof=reconstructDailyPhysicalState(copy,0,365,birth);
 assert.deepEqual(new Map(copy.cells.map(c=>[c.id,c])),proof.cells);
 assert.deepEqual(copy.sourceCells,birth.sourceCells);
 assert.ok(copy.events.every(e=>e.checkIndex!>=1&&e.checkIndex!<=365&&
  e.atHour===24*e.checkIndex!&&e.atMs===DAY*e.checkIndex!));
}
function lifetime(parts:PetPart[],seed:string,previewCare=abundant){
 const sim=createSimulation(parts,seed,"infant",{previewCare,reuseLivingMaterial:false});
 const states=checkpoints.map(day=>sim.materialStateAt(day));
 const graphs=states.map(s=>s.graph),birth=graphs[0],adult=graphs.at(-1)!;
 assert.equal(states.at(-1)!.checks.length,365);
 assert.equal(states.at(-1)!.completedChecks,365);
 assert.strictEqual(sim.materialStateAt(365.99).graph,adult);
 assert.strictEqual(sim.materialStateAt(900).graph,adult,"maturity cannot reset growth");
 assert.deepEqual(adult.sourceCells,birth.sourceCells);
 for(const row of states.at(-1)!.iterative.ledger){
  assert.equal(row.spent+row.unspent,row.available);
  assert.equal(row.bySite.reduce((n,s)=>n+s.allocated,0)+row.unassigned,row.available);
  assert.equal(row.bySite.reduce((n,s)=>n+s.spent,0),row.spent);
  assert.ok(row.available>=0&&row.available<=4);
 }
 physicalProof(adult,birth);
 return {sim,graphs,birth,adult,delta:measureChange(birth,adult),
  before:measurePhysical(birth),after:measurePhysical(adult)};
}

test("[MORPH-005/A1] exact allometry, regional competition and nonzero operator rates have independent numerical oracles",()=>{
 const {genome}=materialInputs(drawing(["###","###","###"]),"REGIONAL-LAWS");
 const c={...genome.genotype.channels,
  growth:{rate:.5,elongation:.5,expansion:.5},support:{rigidity:.5,membrane:.5},
  branching:{initiation:.5,divergence:.5}};
 // A^.65/[S*(1+N/C)^2]; splitting a region into sites must not multiply it.
 const one=regionalGrowthDemand(16,32,1,64);
 assert.equal(one,16**.65/2.25);
 assert.ok(Math.abs(3*regionalGrowthDemand(16,32,3,64)-one)<1e-12);
 assert.ok(regionalGrowthDemand(16,64,1,64)>0);
 assert.ok(regionalGrowthDemand(16,64,1,64)<one);
 for(const a of [1,9,64,128,256,512,1024]){
  const expected=a+Math.min(384,Math.ceil(a*10/(1+a*a/16384)));
  assert.equal(morphologicalVolumeCapacity(a,.5,.5),expected);
 }
 assert.ok(morphologicalVolumeCapacity(256,.5,.5)>=512,
  "a continuous freehand region must retain substantial volumetric potential");
 const care={rest:1,activity:1,security:1};
 // Rates are surface 1.5, branch .5, axial .5; thresholds .6 and .8.
 assert.equal(selectRegionalGrammar(c,{x:0,y:0},care,true),"surface");
 assert.equal(selectRegionalGrammar(c,{x:Math.floor(.7*CHAOS_MODULUS),y:0},care,true),"branch");
 assert.equal(selectRegionalGrammar(c,{x:Math.floor(.9*CHAOS_MODULUS),y:0},care,true),"axial");
 assert.equal(selectRegionalGrammar(c,{x:Math.floor(.7*CHAOS_MODULUS),y:0},care,false),"surface");
 const zero={...c,growth:{rate:0,elongation:0,expansion:0},branching:{initiation:0,divergence:0}};
 assert.equal(selectRegionalGrammar(zero,{x:0,y:0},care,true),null);
 const tensor=regionalGrowthTensor(c,{x:0,y:0});
 assert.deepEqual(tensor,{axis:{x:1,y:0},stretch:.5});
 for(const x of [0,CHAOS_MODULUS-1])for(const y of [0,CHAOS_MODULUS-1]){
  const t=regionalGrowthTensor(c,{x,y});
  assert.ok(t.stretch>=1/16&&t.stretch<=16);
  assert.ok(Math.abs(Math.hypot(t.axis.x,t.axis.y)-1)<1e-12);
 }
 assert.throws(()=>regionalGrowthDemand(0,2,1,9));
 assert.throws(()=>selectRegionalGrammar(c,{x:CHAOS_MODULUS,y:0},care,true));
 assert.throws(()=>regionalGrowthTensor(c,{x:NaN,y:0}));
});

test("[MORPH-005/A2] all 12 shipped starters and their unlabeled freehand equivalents develop substantial broad physical anatomy",()=>{
 assert.equal(STARTER_PRESETS.length,12);
 const unchanged=JSON.stringify(STARTER_PRESETS);
 const report=[];
 for(const preset of STARTER_PRESETS){
  const freehand:PetPart[]=[{id:"player-ink",kind:"decoration",name:"Unlabeled drawing",
   parentId:null,position:{x:0,y:0},pixels:flattenAnatomy(preset.parts)}];
  for(const [kind,parts] of [["starter",preset.parts],["freehand",freehand]] as const){
   const result=lifetime(parts,preset.seed),{before,after,delta,birth,adult}=result;
   // Declared before qualification: these are physical effect sizes, not a
   // resemblance score or a fitted target silhouette. All must pass together.
   // Coordinated deformation must change distances within original ink.
   // Added bulk and whole-body translation score zero. Original coordinates
   // need not become empty when real seam material develops between them.
   const occupied=new Set(adult.cells.map(c=>c.x+","+c.y));
   const vacated=new Set(birth.cells.map(c=>c.x+","+c.y));
   for(const p of occupied)vacated.delete(p);
   const broad=after.occupiedArea/before.occupiedArea>=1.75&&
    delta.broadFraction>=.35&&delta.terminalFraction<=.4;
   const remodeled=(delta.sourceRelocated+delta.sourceResorbed)/birth.sourceCells.length>=.25&&
    delta.sourcePairChange>=.15;
   assert.ok(broad||remodeled,preset.id+" "+kind+": substantial broad growth or real anatomical turnover");
   assert.ok(delta.structuralChange>=.4,preset.id+" "+kind+": substantial birth-relative change");
   assert.ok(delta.sourceRelocated>0||delta.sourceResorbed>0||delta.topologyChanged,
    "growth must include material remodeling or topological specialization");
   const frame=result.sim.frameAt(365,{time:0,action:"idle"});
   assert.deepEqual(new Set(frame.pixels.map(p=>p.x+","+p.y)),
    new Set(adult.cells.map(c=>c.x+","+c.y)),
    "the ordinary player renderer must display the actual complete mature morphology");
   const owned=new Set(adult.cells.map(c=>c.id));
   assert.ok(frame.pixels.every(p=>p.materialCellId&&owned.has(p.materialCellId)),
    "displayed anatomy must have physical ownership, without a visual growth substitute");
   const shape=morphologyDelta(birth.cells,adult.cells,birth,adult);
   report.push({id:preset.id,input:kind,areaRatio:after.occupiedArea/before.occupiedArea,
    broadFraction:delta.broadFraction,terminalFraction:delta.terminalFraction,
    structuralChange:delta.structuralChange,aspectChange:after.aspect-before.aspect,
    regionalShift:shape.regionFractionL1,sourceMoved:delta.sourceRelocated,
    newTissues:delta.newTissues,sourceResorbed:delta.sourceResorbed});
   console.info("REGIONAL_STARTER",JSON.stringify(report.at(-1)));
  }
 }
 assert.equal(JSON.stringify(STARTER_PRESETS),unchanged,"neither ink nor fixed seeds may be edited to pass");
 assert.equal(report.length,24);
 assert.ok(report.filter(r=>Math.abs(r.aspectChange)>=.15).length>=6);
 assert.ok(report.filter(r=>r.regionalShift>=.25).length>=12);
 assert.ok(report.filter(r=>r.newTissues>0).length>=6);
});

test("[MORPH-005/A3] 30 unfamiliar drawings by three seeds by three chronological care strategies retain broad structural and causal variety",()=>{
 const sources=morphologySources();
 assert.equal(sources.length,30);
 assert.equal(new Set(sources.map(s=>s.parts.flatMap(p=>p.pixels.map(c=>c.x+","+c.y)).sort().join(";"))).size,30);
 const summary={lives:0,broad:0,expressive:0,nulls:0,seedSensitive:0,careSensitive:0,
  topology:0,proportions:0,remodeled:0,thickened:0,regional:0};
 for(const source of sources){
  const lives=[];
  for(const seed of ["REGIONAL-UNFAMILIAR-A","REGIONAL-UNFAMILIAR-B","REGIONAL-UNFAMILIAR-C"]){
   const variants=[],prefixes:MaterialGraph[][]=[];
   for(const strategy of strategies){
    const life=lifetime(source.parts,seed,strategy),d=life.delta;
    summary.lives++;
    if(d.created===0&&d.relocated===0&&d.removed===0)summary.nulls++;
    const broad=d.broadFraction>=.35&&d.terminalFraction<=.4&&d.structuralChange>=.4;
    if(broad)summary.broad++;
    const old=new Set(life.birth.cells.map(c=>c.x+","+c.y)),now=new Set(life.adult.cells.map(c=>c.x+","+c.y));
    const vacated=[...old].filter(p=>!now.has(p)).length/old.size;
    if(broad||d.sourcePairChange>=.15&&(d.sourceRelocated+d.sourceResorbed)/life.birth.sourceCells.length>=.25)
      summary.expressive++;
    if(d.topologyChanged)summary.topology++;
    if(Math.abs(life.after.aspect-life.before.aspect)>=.15)summary.proportions++;
    if(d.sourceRelocated>0||d.sourceResorbed>0)summary.remodeled++;
    if(life.after.thickness.mean>life.before.thickness.mean)summary.thickened++;
    if(morphologyDelta(life.birth.cells,life.adult.cells).regionFractionL1>=.25)summary.regional++;
    variants.push(life.graphs.map(signature));
    prefixes.push(life.graphs);
   }
   for(let i=0;i<=checkpoints.indexOf(90);i++)
    assert.deepEqual(prefixes[0][i],prefixes[2][i],
      "care starting at day 90 cannot change any earlier physical state, including the day-90 boundary");
   lives.push(variants);
  }
  if(JSON.stringify(lives[0][0])!==JSON.stringify(lives[1][0]))summary.seedSensitive++;
  if(JSON.stringify(lives[0][0])!==JSON.stringify(lives[0][1]))summary.careSensitive++;
  console.info("REGIONAL_UNFAMILIAR",source.id,JSON.stringify(summary));
 }
 assert.equal(summary.lives,270);
 assert.ok(summary.expressive>=summary.lives*.6,"broad growth or non-additive anatomy must be frequent across independent inputs");
 assert.ok(summary.broad>=24,"positive volumetric growth remains a demonstrated capability");
 assert.ok(summary.seedSensitive>=24&&summary.careSensitive>=24);
 assert.ok(summary.topology>=12&&summary.proportions>=24&&summary.remodeled>=24&&summary.thickened>=48);
 assert.ok(summary.regional>=48,"independent spatial allocation must change beyond a common overall scale");
 console.info("REGIONAL_COHORT",JSON.stringify(summary));
});

test("[MORPH-005/A4] repeatable reshape, source cavity overlays, causal nulls and verified-prefix reconstruction preserve all physical constraints",()=>{
 const {atlas,genome}=materialInputs(drawing(["###","###","###"]),"RESHAPE-CHRONO");
 const program=compileMaterialDevelopment(atlas,genome),tid=program.source.tissues[0].id;
 const remodeling=compileLifetimeRemodeling(program,genome,[{
  id:"repeatable-region",kind:"reshape",tissueId:tid,direction:{x:1,y:0},
  atHour:0,durationHours:12,units:12,strength:1,
 }]);
 const authorization={material:program.operators,remodeling:remodeling.operations};
 let state=createDailyMaterialState(program,TIME),mid=state,zero=state;
 for(let k=1;k<=12;k++){
  const before=JSON.stringify(state);
  const next=applyDailyMaterialStep(program,genome,state,window(k),remodeling);
  assert.equal(JSON.stringify(state),before,"future care must leave the prior frame immutable");
  assert.deepEqual(applyDailyMaterialStep(program,genome,state,window(k),remodeling),next);
  state=next;
  zero=applyDailyMaterialStep(program,genome,zero,window(k,0),remodeling);
  if(k===6)mid=state;
 }
 const shapes=state.graph.events.filter(e=>e.kind==="reshape");
 assert.ok(shapes.length>=2,"distinct daily units may reshape the same parents without reusing identities");
 const made=shapes.flatMap(e=>e.createdCellIds);
 assert.equal(new Set(made).size,made.length);
 assert.equal(zero.graph.events.length,0);
 assert.deepEqual(zero.graph.cells,program.source.cells);
 const complete=reconstructDailyPhysicalState(clone(state.graph),TIME,12,program.source,authorization);
 const resumed=reconstructDailyPhysicalState(state.graph,TIME,12,program.source,authorization,mid.graph);
 assert.deepEqual(resumed,complete,"incremental audit must equal complete independent replay");
 resumed.cells.clear();resumed.sites.clear();
 assert.deepEqual(reconstructDailyPhysicalState(state.graph,TIME,12,program.source,authorization,mid.graph),complete,
  "returned proof maps cannot corrupt the private verified prefix");
 for(const forged of [
  {...state.graph,cells:state.graph.cells.map((c,i)=>i?c:{...c,x:c.x+1})},
  {...state.graph,events:state.graph.events.slice(1)},
  {...state.graph,events:state.graph.events.map((e,i)=>i?e:{...e,checkIndex:13})},
  {...state.graph,events:state.graph.events.map((e,i)=>i?e:{...e,physical:{...e.physical!,relocations:[]}})},
 ])assert.throws(()=>verifyDailyMaterialInventory(forged,TIME,12,program.source,authorization,mid.graph));
 assert.throws(()=>applyDailyMaterialStep(program,genome,state,window(12),remodeling));
 // Source-authored ink may occupy a hole in ANOTHER region at birth; only
 // that exact stationary identity is allowed there, never generated matter.
 const ring=drawing(["#####","#...#","#...#","#...#","#####"]);
 ring.push({...drawing(["#"])[0],id:"inner-authored-mark",position:{x:2,y:2}});
 const r=materialInputs(ring,"CAVITY-OVERLAY"),p=compileMaterialDevelopment(r.atlas,r.genome);
 const outer=p.source.tissues.find(t=>t.sourceCellIds.length>=16)!;
 const rp=compileLifetimeRemodeling(p,r.genome,[{id:"cavity-safe-reinforcement",kind:"reinforce",
  tissueId:outer.id,atHour:0,durationHours:12,units:12,strength:1}]);
 let rs=createDailyMaterialState(p,TIME);
 for(let k=1;k<=12;k++)rs=applyDailyMaterialStep(p,r.genome,rs,window(k),rp);
 assert.ok(rs.graph.events.some(e=>e.kind==="reinforce"),"birth overlay must not veto all lawful remodeling");
 assert.ok(!rs.remodeling.attempts.some(a=>a.reason==="existing-protected-void"));
 verifyDailyMaterialInventory(rs.graph,TIME,12,p.source,{material:p.operators,remodeling:rp.operations});
 for(const e of rs.graph.events)for(const c of e.createdCells??[])
  assert.ok(!p.source.protectedVoids.includes(c.x+","+c.y));
});

test("[MORPH-005/A4] real saved-life recorded care reaches the same production operators and exact replay",()=>{
 const lives=maintainedLife("REGIONAL-RECORDED-CARE",366),game=lives.get(366*24)!;
 const parts=drawing(["#######","#######","#######","#######","#######"]);
 const sim=playerSimulation(parts,game,true),birth=sim.materialStateAt(0).graph,
  state=sim.materialStateAt(365);
 assert.equal(state.completedChecks,365);
 assert.ok(measureChange(birth,state.graph).structuralChange>=.4,
  "recorded care must produce actual anatomy change; it need not increase mass");
 assert.ok(state.graph.events.some(e=>e.kind==="expand"));
 assert.ok(state.graph.events.every(e=>e.careDigest&&!e.careDigest.startsWith("preview-lab/")));
 assert.ok(game.commandHistory.some(c=>c.accepted));
 assert.deepEqual(playerSimulation(parts,game,true).materialStateAt(365),state);
 const restored=playerSimulation(parts,game,true,clone(sim.exportAnatomicalCheckpoint()));
 assert.deepEqual(restored.materialStateAt(366),state);
 assert.equal(restored.getMaterialRuntimeStats!().steps,0);
 const stale=clone(sim.exportAnatomicalCheckpoint())!;
 (stale.state as unknown as {algorithmVersion:string}).algorithmVersion="superseded-growth-rules";
 (stale as unknown as {stateDigest:string}).stateDigest=checkpointDigest(JSON.stringify(stale.state));
 const reconstructed=playerSimulation(parts,game,true,stale);
 assert.deepEqual(reconstructed.materialStateAt(365),state,
  "rehashed stale rule-version caches must reconstruct exact anatomy from original source and history");
 assert.equal(reconstructed.getMaterialRuntimeStats!().steps,365);
 assert.deepEqual(reconstructed.genome,sim.genome,"cache invalidation cannot reroll permanent genetic potential");
});
