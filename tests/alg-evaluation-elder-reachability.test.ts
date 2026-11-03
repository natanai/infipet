/** Mathematically bounded mature-geometry diagnostic, not a pass claim.
 * Inspect exactly the same real physical graphs at ages 281/330/345.
 * Discover whether an alternate permanent stage direction is physically
 * admissible before considering any new operator or weaker safety gate.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {STARTER_PRESETS} from "../src/presets";
import {morphologySources} from "../src/evaluation/morphology-cohort";
import {createSimulation} from "../src/simulation";
import {proposeRegionalSlip,proposeRegionalBend} from "../src/development/coordinated-metamorphosis";
import {proposeTissueReflow} from "../src/development/tissue-reflow";
import type {PreviewCareInputs} from "../src/integration/daily-runtime";
const dirs=[{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}] as const;
test("measure original-material reconfiguration feasibility of mature high-care and low-care pets",{
 skip:process.env.MATURE_GEOMETRY_DIAGNOSTIC!=="1",
},()=>{
 const unfamiliar=morphologySources();
 const sources=[
  ...STARTER_PRESETS.filter(p=>["dot","ribbon","fork","tripod"].includes(p.id))
    .map(p=>({id:"starter/"+p.id,parts:p.parts})),
  ...[0,3,7,11,16,20,24,29].map(i=>({
   id:"unknown/"+unfamiliar[i].id,parts:unfamiliar[i].parts,
  })),
 ];
 const inputs:readonly PreviewCareInputs[]=[
  {kind:"synthetic-needs-lab-v1",nutrition:0.92,timeline:[]},
  {kind:"synthetic-needs-lab-v1",nutrition:0.28,timeline:[
    {needId:"rest",tick:0,fulfillment:0.25},
    {needId:"security",tick:0,fulfillment:0.3},
    {needId:"physical-fitness",tick:0,fulfillment:0.2},
  ]},
 ];
 const ages=[281,330,345] as const;
 const aggregate:Record<string,{
  n:number,anySlip:number,anyBend:number,anyReflow:number,
  allBlocked:number,allFamiliesBlocked:number,
  meanCells:number,meanSourceCells:number}>={};
 const samples:unknown[]=[];
 for(const source of sources)for(const seed of ["8E8L8WRZ","8W8E8LRZ"])
  for(const care of inputs){
   const sim=createSimulation(source.parts,seed,"infant",{
    previewCare:care,reuseLivingMaterial:false,
   });
   for(const age of ages){
    const graph=sim.materialStateAt(age).graph;
    const tid=graph.tissues[0]?.id;
    if(!tid)continue;
    const slippage=dirs.map(d=>!!proposeRegionalSlip(graph,tid,d));
    const bending=dirs.map(d=>!!proposeRegionalBend(graph,tid,d));
    const reflow=dirs.map(d=>!!proposeTissueReflow(graph,tid,d));
    const key=age+"/"+care.nutrition;
    const counts=aggregate[key]??={n:0,anySlip:0,anyBend:0,
      anyReflow:0,allBlocked:0,allFamiliesBlocked:0,
      meanCells:0,meanSourceCells:0};
    counts.n++;counts.anySlip+=Number(slippage.some(Boolean));
    counts.anyBend+=Number(bending.some(Boolean));
    counts.anyReflow+=Number(reflow.some(Boolean));
    counts.allFamiliesBlocked+=Number(![...slippage,...bending,...reflow].some(Boolean));
    counts.allBlocked+=Number(![...slippage,...bending].some(Boolean));
    counts.meanCells+=graph.cells.length;counts.meanSourceCells+=graph.sourceCells.length;
    samples.push({id:source.id,seed,age,care:care.nutrition,
      slippage,bending,reflow,cellCount:graph.cells.length});
   }
  }
 for(const row of Object.values(aggregate)){
  row.meanCells/=row.n;row.meanSourceCells/=row.n;
 }
 console.info("MATURE_GEOMETRY_REACHABILITY",JSON.stringify({aggregate,samples}));
 assert.equal(sources.length,12);
 assert.equal(samples.length,12*2*2*ages.length);
});
