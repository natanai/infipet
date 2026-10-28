import test from "node:test";
import assert from "node:assert/strict";
import {proposeCoherentReshape} from "../src/development/coordinated-metamorphosis";
import {proposeTissueReflow} from "../src/development/tissue-reflow";
import {STARTER_PRESETS} from "../src/presets";
import {createSimulation} from "../src/simulation";
import type {MaterialCell} from "../src/development/material-graph";
import {compileMaterialDevelopment} from "../src/development/operators";
import {compileLifetimeRemodeling} from "../src/development/lifetime-remodeling";
import {applyRemodelingProposal,remodelingProposalsBetween,
 EMPTY_REMODELING_CHRONOLOGY} from "../src/development/remodel-transactions";
import {applyDailyMaterialStep,createDailyMaterialState,
 verifyDailyMaterialInventory} from "../src/development/daily-step";
import type {DailyCareWindowV1} from "../src/development/daily-contract";
import {materialInputs,drawing} from "./alg-development-fixtures";

const TIME=1_700_102_300_000,DAY=86_400_000;
function window(k:number,care:number):DailyCareWindowV1{return {
 version:1,hatchAtMs:TIME,checkIndex:k,
 startMs:TIME+(k-1)*DAY,endMs:TIME+k*DAY,
 forcing:{nutrition:care,rest:care,security:care,activity:care,
  threat:0,observedFraction:care},
 acceptedCommands:0,rejectedCommands:0,observations:0,activeMs:DAY,
 absentMs:0,unknownMs:0,unknown:[],provenanceDigest:"morph04/"+care+"/"+k,
};}
const b=(cells:readonly {x:number;y:number}[])=>({
 w:Math.max(...cells.map(c=>c.x))-Math.min(...cells.map(c=>c.x))+1,
 h:Math.max(...cells.map(c=>c.y))-Math.min(...cells.map(c=>c.y))+1,
});
test("[MORPH-004/A1] finite front displacement changes broad original body proportions, never a thin stalk",()=>{
 const dense=materialInputs(drawing([".....",".###.",".###.",".###.","....."]),"RESHAPE-PURE");
 const graph=compileMaterialDevelopment(dense.atlas,dense.genome).source;
 const tid=graph.tissues.find(t=>graph.sourceCells.filter(c=>c.tissueId===t.id).length>=9)!.id;
 const before=b(graph.cells);
 const p=proposeCoherentReshape(graph,tid,{x:1,y:0},"reshape/physical");
 assert.ok(p);
 assert.ok(p.relocated.length>=2,"coherent source has multi-cell front, not tip");
 assert.equal(p.createdCells.length,p.relocated.length);
 assert.equal(p.cells.length,graph.cells.length+p.createdCells.length);
 assert.equal(b(p.cells).w,before.w+1);
 assert.equal(b(p.cells).h,before.h);
 const old=new Map(graph.cells.map(c=>[c.id,c]));
 for(const m of p.relocated){
  const origin=old.get(m.cellId)!;
  assert.equal(m.from.x,origin.x);assert.equal(m.from.y,origin.y);
  assert.equal(m.to.x,m.from.x+1);assert.equal(m.to.y,m.from.y);
  const daughter:MaterialCell|undefined=p.createdCells.find(c=>c.parentCellIds.length===1&&
    c.parentCellIds[0]===m.cellId)!;
  assert.ok(daughter);
  assert.deepEqual({x:daughter.x,y:daughter.y},m.from);
  assert.deepEqual(daughter.sourceIds,origin.sourceIds);
 }
 const tip=materialInputs(drawing(["########"]),"RESHAPE-TIP");
 const tipGraph=compileMaterialDevelopment(tip.atlas,tip.genome).source;
 assert.equal(proposeCoherentReshape(tipGraph,tipGraph.tissues[0].id,
   {x:1,y:0},"reshape/thin"),null);
 assert.throws(()=>proposeCoherentReshape(graph,tid,{x:2,y:0},"invalid"),/region-front/);
 assert.deepEqual(p,proposeCoherentReshape(graph,tid,{x:1,y:0},"reshape/physical"));
});
test("[MORPH-004/A2] one earned reshaping proposal atomically journals genuine source relocation",()=>{
 const {atlas,genome}=materialInputs(drawing([".....",".###.",".###.",".###.","....."]),"RESHAPE-CHRONO");
 const program=compileMaterialDevelopment(atlas,genome);
 const tid=program.source.tissues.find(t=>program.source.sourceCells.filter(c=>c.tissueId===t.id).length>=9)!.id;
 const operation={id:"chronological-reshape",kind:"reshape" as const,tissueId:tid,
  direction:{x:1,y:0},atHour:0,durationHours:12,units:12,strength:1};
 const remodeling=compileLifetimeRemodeling(program,genome,[operation]);
 const due=remodelingProposalsBetween(remodeling,0,12);
 assert.ok(due.length>0,"genetic front expression in this deterministic witness");
 const first=due[0];
 const atomic=applyRemodelingProposal(program.source,remodeling,first,
   EMPTY_REMODELING_CHRONOLOGY,Math.ceil(first.atHour));
 assert.equal(atomic.attempt.status,"accepted",atomic.attempt.reason??"unknown rejection");
 assert.ok(atomic.transition&&atomic.transition.relocated.length>=2);
 assert.equal(atomic.transition.createdCellIds.length,atomic.transition.relocated.length);
 assert.ok(atomic.graph.events.at(-1)?.physical?.relocations.length);
 assert.deepEqual(program.source.cells,compileMaterialDevelopment(atlas,genome).source.cells);
});
test("[MORPH-004/A3] full production daily replay admits documented redistribution while zero care vetoes it",()=>{
 const {atlas,genome}=materialInputs(drawing([".....",".###.",".###.",".###.","....."]),"RESHAPE-CHRONO");
 const program=compileMaterialDevelopment(atlas,genome);
 const tid=program.source.tissues.find(t=>program.source.sourceCells.filter(c=>c.tissueId===t.id).length>=9)!.id;
 const remodeling=compileLifetimeRemodeling(program,genome,[{
  id:"daily-reshape",kind:"reshape",tissueId:tid,
  direction:{x:1,y:0},atHour:0,durationHours:12,units:12,strength:1,
 }]);
 let high=createDailyMaterialState(program,TIME),low=createDailyMaterialState(program,TIME);
 for(let k=1;k<=12;k++){
  high=applyDailyMaterialStep(program,genome,high,window(k,1),remodeling);
  low=applyDailyMaterialStep(program,genome,low,window(k,0),remodeling);
 }
 const r=high.graph.events.filter(e=>e.kind==="reshape");
 assert.ok(r.length>0,"real daily engine must execute regional front not just field/tip growth");
 assert.ok(r.some(e=>(e.physical?.relocations.length??0)>=2));
 assert.equal(low.graph.events.filter(e=>e.kind==="reshape").length,0);
 assert.deepEqual(high.graph.sourceCells,program.source.sourceCells);
 verifyDailyMaterialInventory(high.graph,TIME,12,program.source,
  {material:program.operators,remodeling:remodeling.operations});
 const mutation={...high.graph,events:high.graph.events.map(e=>
   e.kind==="reshape"?{...e,physical:{...e.physical!,relocations:[]}}:e)};
 assert.throws(()=>verifyDailyMaterialInventory(mutation,TIME,12,program.source,
   {material:program.operators,remodeling:remodeling.operations}));
 const changed={...high.graph,cells:high.graph.cells.map((c,i)=>i===0?{...c,x:c.x+1}:c)};
 assert.throws(()=>verifyDailyMaterialInventory(changed,TIME,12,program.source,
   {material:program.operators,remodeling:remodeling.operations}));
});

test("[MORPH-004/A4] real compiled lifetime includes coherent non-tip remodeling without target silhouettes",()=>{
 const source=drawing([".....",".###.",".###.",".###.","....."]);
 const outcomes: {seed:string;events:number;moved:number;newCells:number}[]=[];
 for(const seed of ["morph-alpha","morph-beta","morph-gamma"]){
  const {atlas,genome}=materialInputs(source,seed);
  const program=compileMaterialDevelopment(atlas,genome);
  const defaultProgram=compileLifetimeRemodeling(program,genome);
  assert.ok(defaultProgram.operations.some(op=>op.kind==="reshape"),
    "regional program is part of the default lifetime");
  let state=createDailyMaterialState(program,TIME);
  for(let k=1;k<=90;k++)
   state=applyDailyMaterialStep(program,genome,state,window(k,1),defaultProgram);
  const events=state.graph.events.filter(e=>["reshape","redistribute"].includes(e.kind));
  const moved=events.reduce((n,e)=>n+(e.physical?.relocations.length??0),0);
  outcomes.push({seed,events:events.length,moved,
   newCells:events.reduce((n,e)=>n+e.createdCellIds.length,0)});
  verifyDailyMaterialInventory(state.graph,TIME,90,program.source,
   {material:program.operators,remodeling:defaultProgram.operations});
 }
 console.info("MORPH-004 actual 90-day source-owned regional witnesses",
  JSON.stringify(outcomes));
 assert.ok(outcomes.some(o=>o.events>0&&o.moved>=1),
   "default daily biology must exhibit actual source-owned regional movement");
});

test("[MORPH-004/A4] independently derived source-area inertia bounds dense region opportunities",()=>{
 const areas=[9,64,256,1024];
 for(const area of areas){
  const side=Math.sqrt(area);
  const {atlas,genome}=materialInputs(drawing(
    Array.from({length:side},()=>"#".repeat(side))),"AREA-INERTIA-"+area);
  const program=compileMaterialDevelopment(atlas,genome);
  const ops=compileLifetimeRemodeling(program,genome).operations
    .filter(op=>op.kind==="reshape");
  assert.ok(ops.length>0);
  const expected=Math.min(1,8/Math.sqrt(area));
  for(const op of ops)
   assert.equal(op.strength,expected,
    "physical source area, not creature label or target silhouette, governs volume inertia");
 }
});

test("[MORPH-004/REFLOW] original physical material migrates, actually vacating its old occupied position",()=>{
 const {atlas,genome}=materialInputs(drawing([".....",".###.",".###.",".###.","....."]),"REFLOW-PURE");
 const birth=compileMaterialDevelopment(atlas,genome).source;
 const tissue=birth.tissues.find(t=>birth.cells.filter(c=>c.tissueId===t.id).length>=9)!;
 const result=proposeTissueReflow(birth,tissue.id,{x:1,y:0});
 assert.ok(result,"a supported small body must allow at least one real mass transfer");
 const m=result.relocated;
 const original=birth.cells.find(c=>c.id===m.cellId)!;
 assert.deepEqual(m.from,{x:original.x,y:original.y});
 const at=(cells:readonly {x:number;y:number}[])=>new Set(cells.map(c=>c.x+","+c.y));
 const before=at(birth.cells),after=at(result.cells);
 assert.ok(before.has(m.from.x+","+m.from.y));
 assert.ok(!after.has(m.from.x+","+m.from.y),"material must VACATE its old coordinate");
 assert.ok(!before.has(m.to.x+","+m.to.y));
 assert.ok(after.has(m.to.x+","+m.to.y));
 assert.equal(after.size,before.size,"mass transfer creates no new cells");
 assert.ok(b(result.cells).w>b(birth.cells).w,
  "a physically transferred flank cell can change whole-body aspect ratio");
 assert.equal(result.cells.length,birth.cells.length);
 assert.ok(m.path.length>=3&&m.path.length<=25);
 assert.ok(m.path.slice(1,-1).every(p=>before.has(p.x+","+p.y)),
  "migration must traverse real prior tissue, never empty-space teleportation");
 const moved=result.cells.find(c=>c.id===m.cellId)!;
 assert.deepEqual(moved.sourceIds,original.sourceIds);
 assert.equal(moved.color,original.color);
 assert.deepEqual(result,proposeTissueReflow(birth,tissue.id,{x:1,y:0}),
  "permanent source and direction determine exact reproducible result");
 assert.throws(()=>proposeTissueReflow(birth,tissue.id,{x:2,y:0}),/axis/);
});
test("[MORPH-004/REFLOW] chronological transaction proves source relocation route, rejects forged path",()=>{
 const {atlas,genome}=materialInputs(drawing([".....",".###.",".###.",".###.","....."]),"REFLOW-LEDGER");
 const program=compileMaterialDevelopment(atlas,genome);
 const tissue=program.source.tissues.find(t=>program.source.cells.filter(c=>c.tissueId===t.id).length>=9)!;
 const op={id:"path-bounded-reflow",kind:"redistribute" as const,tissueId:tissue.id,
   direction:{x:1,y:0},atHour:0,durationHours:12,units:12,strength:1};
 const remodeling=compileLifetimeRemodeling(program,genome,[op]);
 const due=remodelingProposalsBetween(remodeling,0,12);
 assert.ok(due.length>0);
 let accepted:ReturnType<typeof applyRemodelingProposal>|null=null;
 for(const proposal of due){
  const candidate=applyRemodelingProposal(program.source,remodeling,proposal,
    EMPTY_REMODELING_CHRONOLOGY,Math.ceil(proposal.atHour));
  if(candidate.attempt.status==="accepted"){accepted=candidate;break;}
 }
 assert.ok(accepted,"reflow should reach a legitimate deterministic stage");
 const e=accepted.graph.events.at(-1)!;
 assert.equal(e.kind,"redistribute");
 assert.equal(e.createdCellIds.length,0);
 assert.equal(e.removedCellIds.length,0);
 assert.equal(e.physical?.relocations.length,1);
 const path=e.physical!.relocations[0].path!;
 assert.ok(path.length>=3);
 const k=Math.ceil(e.atHour);
 // Reuse the production daily contract so the independent auditor checks
 // opportunity, ancestry, path, and exact before/after coordinate inventory.
 const auditGraph={...accepted.graph,events:accepted.graph.events.map(x=>({
  ...x,atHour:k*24,atMs:TIME+k*DAY,checkIndex:k,careDigest:"ref",
  genomeFingerprint:program.genomeFingerprint,
  physical:{...x.physical!,relocations:x.physical!.relocations.map(m=>({
    ...m,checkIndex:k,atMs:TIME+k*DAY,
  }))},
 }))};
 verifyDailyMaterialInventory(auditGraph,TIME,k,program.source,
   {material:program.operators,remodeling:remodeling.operations});
 const bad={...auditGraph,events:auditGraph.events.map(x=>({
  ...x,physical:{...x.physical,relocations:x.physical.relocations.map(m=>({
   ...m,path:[m.from,m.to],
  }))},
 }))};
 assert.throws(()=>verifyDailyMaterialInventory(bad,TIME,k,program.source,
   {material:program.operators,remodeling:remodeling.operations}),
   /route|reflow|migration/i);
});

test("[MORPH-004/PLAYER] actual published starter seed shows auditable reflow and chronological continuity",()=>{
 const preset=STARTER_PRESETS.find(p=>p.id==="pippo")!;
 const sim=createSimulation(preset.parts,preset.seed,"infant",{
   previewCare:{kind:"synthetic-needs-lab-v1",nutrition:0.9,timeline:[]},
   reuseLivingMaterial:false,
 });
 const stages=[0,75,180,365].map(day=>({day,graph:sim.materialStateAt(day).graph}));
 const source=stages[0].graph.sourceCells;
 const final=stages.at(-1)!.graph;
 assert.deepEqual(final.sourceCells,source,
   "the authored organism and its source ancestry cannot change");
 const reflow=final.events.filter(e=>e.kind==="redistribute");
 const moved=reflow.flatMap(e=>e.physical?.relocations??[]);
 const vacated=new Set(moved.map(m=>m.from.x+","+m.from.y));
 const filled=new Set(moved.map(m=>m.to.x+","+m.to.y));
 console.info("MORPH-004 published starter mass transport",
   JSON.stringify({events:reflow.length,moved:moved.length,
     vacated:vacated.size,occupiedNew:filled.size,
     checks:stages.map(s=>s.day),cells:stages.map(s=>s.graph.cells.length)}));
 assert.ok(reflow.length>0,
   "seeded public starter should have actual material migration, not only linear growth");
 assert.ok(moved.length>0&&moved.every(m=>(m.path?.length??0)>=3));
 assert.ok(stages.every((s,i)=>i===0||
   s.graph.events.length>=stages[i-1].graph.events.length),
   "new daily events never remove previous history");
 const originalIds=new Set(source.map(c=>c.id));
 assert.ok(final.cells.some(c=>originalIds.has(c.id)),
   "retain real permanent authored material through maturity");
});
