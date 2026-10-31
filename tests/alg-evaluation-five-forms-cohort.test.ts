/**
 * Source-general FIVE distinct forms diagnostic. Not the final ≥144-trajectory
 * held-out acceptance set. Deliberately fails if our current implementation
 * merely adds bulk between stages; never lowers preregistered thresholds.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {STARTER_PRESETS} from "../src/presets";
import {morphologySources} from "../src/evaluation/morphology-cohort";
import {measureStageIdentity} from "../src/evaluation/stage-identity";
import {STAGE_REPRESENTATIVE_CHECKS,DEVELOPMENT_STAGES} from "../src/development/stage-contract";
import {createSimulation} from "../src/simulation";
import type {PreviewCareInputs} from "../src/integration/daily-runtime";

const care:readonly PreviewCareInputs[]=[
 {kind:"synthetic-needs-lab-v1",nutrition:0.92,timeline:[]},
 {kind:"synthetic-needs-lab-v1",nutrition:0.28,timeline:[
  {needId:"rest",tick:0,fulfillment:0.25},
  {needId:"security",tick:0,fulfillment:0.3},
  {needId:"physical-fitness",tick:0,fulfillment:0.2},
 ]},
];
test("all five named stages acquire distinct physical body plans, not just growth",{
 skip:process.env.FIVE_FORM_STAGE_COHORT!=="1",
},()=>{
 const freehand=morphologySources();
 const sources=[
  ...STARTER_PRESETS.filter(x=>["dot","ribbon","fork","tripod"].includes(x.id))
    .map(x=>({id:"starter/"+x.id,parts:x.parts})),
  ...[0,3,7,11,16,20,24,29].map(i=>({
   id:"unfamiliar/"+freehand[i].id,parts:freehand[i].parts,
  })),
 ];
 assert.equal(sources.length,12);
 const summaries=DEVELOPMENT_STAGES.slice(0,4).map((stage,i)=>({
  pair:stage.stage+"->"+DEVELOPMENT_STAGES[i+1].stage,
  qualifying:0,eligible:0,unresolved:0,
 }));
 const sampleReport:unknown[]=[];
 let allFour=0,eligibleAll=0;
 for(const sample of sources)for(const seed of ["8E8L8WRZ","8W8E8LRZ"])
  for(const input of care){
   const sim=createSimulation(sample.parts,seed,"infant",{
    previewCare:input,reuseLivingMaterial:false,
   });
   const graphs=STAGE_REPRESENTATIVE_CHECKS.map(day=>
    sim.materialStateAt(day).graph);
   const pairs=graphs.slice(0,-1).map((g,i)=>measureStageIdentity(g,graphs[i+1]));
   let complete=true,allEligible=true;
   for(const [i,p] of pairs.entries()){
    const sum=summaries[i];
    if(!p.eligible){sum.unresolved++;allEligible=false;complete=false;}
    else{
     sum.eligible++;
     if(p.substantiallyDifferent)sum.qualifying++;
     else complete=false;
    }
   }
   if(allEligible){
    eligibleAll++;
    if(complete)allFour++;
   }
   sampleReport.push({id:sample.id,seed,care:input.nutrition,
    stages:pairs.map((p,i)=>({name:summaries[i].pair,
     shape:p.normalizedSilhouetteDifference,
     existing:p.originalSourcePairReorganization,
     parent:p.preexistingReparenting,eligible:p.eligible,
     qualifies:p.substantiallyDifferent}))});
  }
 const total=sources.length*2*care.length;
 console.info("FIVE_FORM_STAGE_REPORT",JSON.stringify({
  trajectoryCount:total,allFour,eligibleAll,summaries,sampleReport,
 }));
 assert.equal(total,48);
 for(const summary of summaries){
  assert.ok(summary.eligible>=32,"Insufficient eligible stage comparisons");
  assert.ok(summary.qualifying/summary.eligible>=0.8,
   "Insufficient genuine source-derived transformation in "+summary.pair);
 }
 assert.ok(allFour/Math.max(1,eligibleAll)>=0.75,
  "Insufficient complete five-form life trajectories");
});
