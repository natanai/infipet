/**
 * Independent source-general physical reachability report; source masks and
 * ordinal samples are NOT production presets or intended adult outcomes.
 * Measures actual mature material graphs, unlike toy square operator tests.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {STARTER_PRESETS} from "../src/presets";
import {morphologySources} from "../src/evaluation/morphology-cohort";
import {createSimulation} from "../src/simulation";
import {proposeDenseIntercalation} from "../src/development/dense-intercalation";
import type {PreviewCareInputs} from "../src/integration/daily-runtime";
const axes=[{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}];
test("report real mature source-owned intercalation feasibility and source material work",{
 skip:process.env.DENSE_INTERCALATION_DIAGNOSTIC!=="1",
},()=>{
 const free=morphologySources();
 const source=[
  ...STARTER_PRESETS.filter(p=>["dot","ribbon","fork","tripod"].includes(p.id))
   .map(p=>({id:"starter/"+p.id,parts:p.parts})),
  ...[0,3,7,11,16,20,24,29].map(i=>({
   id:"unfamiliar/"+free[i].id,parts:free[i].parts,
  })),
 ];
 const care:readonly PreviewCareInputs[]=[
  {kind:"synthetic-needs-lab-v1",nutrition:0.92,timeline:[]},
  {kind:"synthetic-needs-lab-v1",nutrition:0.28,timeline:[
   {needId:"rest",tick:0,fulfillment:0.25},
   {needId:"security",tick:0,fulfillment:0.3},
   {needId:"physical-fitness",tick:0,fulfillment:0.2},
  ]},
 ];
 const aggregate:Record<string,{n:number,any:number,meanMoved:number,
  originalMoved:number,meanMaterial:number}>={};
 const samples:unknown[]=[];
 for(const drawing of source)for(const seed of ["8E8L8WRZ","8W8E8LRZ"])
  for(const input of care){
   const simulation=createSimulation(drawing.parts,seed,"infant",{
    previewCare:input,reuseLivingMaterial:false,
   });
   for(const day of [281,330,345]){
    const graph=simulation.materialStateAt(day).graph;
    const id=graph.tissues[0].id;
    const plans=axes.map(axis=>proposeDenseIntercalation(graph,id,axis));
    const actual=plans.filter((p):p is NonNullable<typeof p>=>!!p);
    const longest=actual.sort((a,b)=>b.relocated.length-a.relocated.length)[0];
    const originalIds=new Set(graph.sourceCells.map(c=>c.id));
    const originalMoved=longest?.relocated.filter(m=>originalIds.has(m.cellId)).length??0;
    const key=day+"/"+input.nutrition;
    const bucket=aggregate[key]??={n:0,any:0,meanMoved:0,
      originalMoved:0,meanMaterial:0};
    bucket.n++;
    bucket.any+=Number(!!longest);
    bucket.meanMoved+=longest?.relocated.length??0;
    bucket.originalMoved+=originalMoved;
    bucket.meanMaterial+=graph.cells.length;
    samples.push({source:drawing.id,seed,care:input.nutrition,
     day,hasLegalIntercalation:!!longest,
     moved:longest?.relocated.length??0,originalMoved,allDirections:plans.map(Boolean)});
   }
  }
 for(const row of Object.values(aggregate)){
  row.meanMoved/=row.n;row.originalMoved/=row.n;row.meanMaterial/=row.n;
 }
 console.info("DENSE_INTERCALATION_REACHABILITY",JSON.stringify({
  aggregate,samples,
 }));
 assert.equal(source.length,12);
 assert.equal(samples.length,144);
});
