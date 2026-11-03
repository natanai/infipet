import test from "node:test";
import assert from "node:assert/strict";
import {drawing} from "./alg-development-fixtures";
import {createSimulation} from "../src/simulation";
import type {PreviewCareInputs} from "../src/integration/daily-runtime";
function family(){
 const body={...drawing(["######","######","######","######","######"],"body")[0],id:"body",name:"body",parentId:null};
 const head={...drawing(["###","###","###"],"head")[0],id:"head",name:"head",parentId:body.id,position:{x:6,y:1}};
 const eye={...drawing(["#"],"eye")[0],id:"eye",name:"eye",parentId:head.id,position:{x:7,y:2}};
 return [body,head,eye];
}
const checkpoints=[0,12,60,140,245,345,365] as const;
const inputs:readonly PreviewCareInputs[]=[
 {kind:"synthetic-needs-lab-v1",nutrition:0.92,timeline:[]},
 {kind:"synthetic-needs-lab-v1",nutrition:0.28,timeline:[
  {needId:"rest",tick:0,fulfillment:0.25},
  {needId:"security",tick:0,fulfillment:0.3},
  {needId:"physical-fitness",tick:0,fulfillment:0.2},
 ]},
];
test("independently measure real authored head-centroid trajectory with its eyes across all five life stages",{
 skip:process.env.HEAD_TRAJECTORY_COHORT!=="1",
},()=>{
 const evidence:unknown[]=[];
 for(const seed of ["8E8L8WRZ","8W8E8LRZ","8A8E8LBRZ"])for(const care of inputs){
  const sim=createSimulation(family(),seed,"infant",{
   previewCare:care,reuseLivingMaterial:false,
  });
  const states=checkpoints.map(day=>sim.materialStateAt(day).graph);
  const source=states[0].sourceCells;
  const headIds=new Set(source.filter(c=>c.sourceKind==="head").map(c=>c.id));
  const eyeIds=new Set(source.filter(c=>c.sourceKind==="eye").map(c=>c.id));
  const centroid=(cells:readonly {id:string;x:number;y:number}[],
   ids:ReadonlySet<string>)=>{
   const kept=cells.filter(c=>ids.has(c.id));
   return kept.length?{x:kept.reduce((n,c)=>n+c.x,0)/kept.length,
    y:kept.reduce((n,c)=>n+c.y,0)/kept.length,
    n:kept.length}:null;
  };
  const head=states.map(g=>centroid(g.cells,headIds));
  const eye=states.map(g=>centroid(g.cells,eyeIds));
  const events=states.at(-1)!.events.filter(e=>e.kind==="reposition"&&
   e.physical?.operation.id.startsWith("head-migration/"));
  const byEpoch=checkpoints.map((day,i)=>({
   day,head:head[i],eye:eye[i],
   headDisplacement:head[i]&&head[0]?
    Math.hypot(head[i]!.x-head[0]!.x,head[i]!.y-head[0]!.y):null,
   acceptedHeadMovements:events.filter(e=>(e.checkIndex??0)<=day).length,
  }));
  evidence.push({seed,nutrition:care.nutrition,byEpoch,events:events.length,
   maxSourceHeadTransport:Math.max(...byEpoch.map(x=>x.headDisplacement??0)),
   carriedEyeEvents:events.filter(e=>e.physical!.relocations.some(m=>
    eyeIds.has(m.cellId))).length,
   retainedEye:!!eye.at(-1),
  });
 }
 console.info("ORIGINAL_HEAD_TRAJECTORY",JSON.stringify(evidence));
 assert.equal(evidence.length,6);
 assert.ok(evidence.some(x=>(x as {events:number}).events>0),
  "the new mechanism must actually execute in living organisms");
});
