import test from "node:test";
import assert from "node:assert/strict";
import {proposeCoherentReshape} from "../src/development/coordinated-metamorphosis";
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
  const events=state.graph.events.filter(e=>e.kind==="reshape");
  const moved=events.reduce((n,e)=>n+(e.physical?.relocations.length??0),0);
  outcomes.push({seed,events:events.length,moved,
   newCells:events.reduce((n,e)=>n+e.createdCellIds.length,0)});
  verifyDailyMaterialInventory(state.graph,TIME,90,program.source,
   {material:program.operators,remodeling:defaultProgram.operations});
 }
 console.info("MORPH-004 actual 90-day source-owned regional witnesses",
  JSON.stringify(outcomes));
 assert.ok(outcomes.some(o=>o.events>0&&o.moved>=2&&o.moved===o.newCells),
   "default daily biology must exhibit real bulk movement in a source/genotype-eligible witness");
});
