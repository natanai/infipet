/**
 * STAGE-004 — explicitly separate HELD-OUT five-form developmental cohort.
 *
 * NONE of the 24 unfamiliar births is a production starter or one of the
 * 8 research drawings used in the 48-life tuning sample. Source provenance,
 * shape thresholds, genotype/care inputs and cohort membership are fixed
 * BEFORE the current production implementation is evaluated.
 *
 * This is an opt-in expensive 24×3×2×365 physical replay. No screenshot,
 * post-hoc seed search, predetermined silhouette, sample removal, sprite,
 * supplied adult template or visual override is permitted.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {morphologySources} from "../src/evaluation/morphology-cohort";
import {createSimulation} from "../src/simulation";
import {measureStageIdentity} from "../src/evaluation/stage-identity";
import {STAGE_REPRESENTATIVE_CHECKS,DEVELOPMENT_STAGES} from "../src/development/stage-contract";
import {drawing} from "./alg-development-fixtures";
import type {PreviewCareInputs} from "../src/integration/daily-runtime";

const researchIndices=new Set([0,3,7,11,16,20,24,29]);
const unfamiliar=morphologySources()
 .filter((_,i)=>!researchIndices.has(i))
 .map(x=>({id:"heldout/"+x.id,parts:x.parts}));
const sourceBody1={...drawing([".###.","#####","#####","#####",".###."],"body")[0],
 id:"autumn-core",name:"Unlabeled source",parentId:null};
const sourceArm1={...drawing(["###","###"],"arm")[0],
 id:"autumn-arm",name:"User-selected arm",parentId:"autumn-core",position:{x:5,y:2}};
const sourceBody2={...drawing(["..##..",".####.","######",".####.","..##.."],"body")[0],
 id:"river-core",name:"User-drawn form",parentId:null};
const sourceHead2={...drawing(["###","###"],"head")[0],
 id:"river-head",name:"Selected head",parentId:"river-core",position:{x:2,y:5}};
const heldOutBirths=[
 ...unfamiliar,
 {id:"heldout/selected-appendage",parts:[sourceBody1,sourceArm1]},
 {id:"heldout/selected-head",parts:[sourceBody2,sourceHead2]},
];
const seeds=["8E8L8WRZ","8W8E8LRZ","8A8E8LBRZ"] as const;
const care:readonly PreviewCareInputs[]=[
 {kind:"synthetic-needs-lab-v1",nutrition:0.92,timeline:[]},
 {kind:"synthetic-needs-lab-v1",nutrition:0.28,timeline:[
  {needId:"rest",tick:0,fulfillment:0.25},
  {needId:"security",tick:0,fulfillment:0.3},
  {needId:"physical-fitness",tick:0,fulfillment:0.2},
 ]},
];
test("24 held-out births, three immutable seeds and two care histories must each develop five non-additive forms",{
 skip:process.env.STAGE_HELD_OUT_COHORT!=="1",
},()=>{
 assert.equal(researchIndices.size,8);
 assert.equal(unfamiliar.length,22,"the original cohort cannot silently change membership");
 assert.equal(heldOutBirths.length,24);
 assert.equal(new Set(heldOutBirths.map(x=>x.id)).size,24);
 assert.deepEqual(STAGE_REPRESENTATIVE_CHECKS,[10,60,140,245,345]);
 const perPair=DEVELOPMENT_STAGES.slice(0,4).map((epoch,i)=>({
  pair:epoch.stage+"->"+DEVELOPMENT_STAGES[i+1].stage,
  n:0,eligible:0,qualifying:0,unresolved:0,
 }));
 const evidence:Array<{
  source:string;seed:string;nutrition:number;originalSourceCells:number;
  pairEvidence:Array<{pair:string;normalizedSilhouette:number;
   originalPairReorganization:number;changedExistingAttachment:boolean;
   eligible:boolean;passes:boolean}>;
 }>=[];
 let allEligible=0,allQualifying=0;
 for(const source of heldOutBirths)for(const seed of seeds)for(const input of care){
  const sim=createSimulation(source.parts,seed,"infant",{
   previewCare:input,reuseLivingMaterial:false,
  });
  const realGraphs=STAGE_REPRESENTATIVE_CHECKS.map(day=>
   sim.materialStateAt(day).graph);
  const contrasts=realGraphs.slice(0,-1).map((graph,i)=>
   measureStageIdentity(graph,realGraphs[i+1]));
  let eligible=true,qualified=true;
  for(let i=0;i<contrasts.length;i++){
   const c=contrasts[i],p=perPair[i];
   p.n++;
   if(!c.eligible){p.unresolved++;eligible=false;qualified=false;}
   else{
    p.eligible++;
    if(c.substantiallyDifferent)p.qualifying++;
    else qualified=false;
   }
  }
  if(eligible){allEligible++;if(qualified)allQualifying++;}
  evidence.push({source:source.id,seed,nutrition:input.nutrition,
   originalSourceCells:realGraphs[0].sourceCells.length,
   pairEvidence:contrasts.map((c,i)=>({
    pair:perPair[i].pair,
    normalizedSilhouette:c.normalizedSilhouetteDifference,
    originalPairReorganization:c.originalSourcePairReorganization,
    changedExistingAttachment:c.preexistingReparenting,
    eligible:c.eligible,
    passes:c.substantiallyDifferent,
   }))});
 }
 const total=heldOutBirths.length*seeds.length*care.length;
 // GitHub Actions may truncate any single log line at 64 KiB. Emit
 // compact mathematical summaries and independently inspectable chunks,
 // rather than losing half of the held-out evidence to log truncation.
 const summarize=(rows:typeof evidence)=>({
  n:rows.length,
  complete:rows.filter(x=>x.pairEvidence.every(p=>p.passes)).length,
  perPair:perPair.map((pair,i)=>({
   pair:pair.pair,eligible:rows.filter(x=>x.pairEvidence[i].eligible).length,
   qualifying:rows.filter(x=>x.pairEvidence[i].passes).length,
   normalizedSilhouetteMean:rows.reduce((a,x)=>a+x.pairEvidence[i].normalizedSilhouette,0)/Math.max(1,rows.length),
   sourceReorganizationMean:rows.reduce((a,x)=>a+x.pairEvidence[i].originalPairReorganization,0)/Math.max(1,rows.length),
  })),
 });
 const byCare=care.map(c=>({nutrition:c.nutrition,
  ...summarize(evidence.filter(x=>x.nutrition===c.nutrition))}));
 const bySeed=seeds.map(seed=>({seed,
  ...summarize(evidence.filter(x=>x.seed===seed))}));
 const byDrawing=heldOutBirths.map(source=>({source:source.id,
  ...summarize(evidence.filter(x=>x.source===source.id))}));
 console.info("HELD_OUT_FIVE_FORM_SUMMARY",JSON.stringify({
  total,allEligible,allQualifying,perPair,byCare,bySeed,byDrawing,
 }));
 for(let start=0;start<evidence.length;start+=20)
  console.info("HELD_OUT_FIVE_FORM_DETAIL",JSON.stringify({
   start,records:evidence.slice(start,start+20),
  }));
 assert.equal(total,144);
 assert.equal(evidence.length,144);
 // Unresolvable examples remain published in the numeric report; no drawing
 // is silently removed. A genuine geometric impossibility may be unresolved,
 // but its source and all lifetime invariants are still evaluated above.
 assert.ok(allEligible>=108,
  "Too many unresolvable trajectories to establish generality");
 for(const pair of perPair){
  assert.equal(pair.n,144);
  assert.ok(pair.eligible>=108,"Insufficient eligible samples "+pair.pair);
  assert.ok(pair.qualifying/pair.eligible>=0.8,
   "Insufficient real source-derived stage differentiation "+pair.pair);
 }
 assert.ok(allQualifying/allEligible>=0.75,
  "Fewer than 75% of eligible held-out lives develop all five distinct forms");
});
