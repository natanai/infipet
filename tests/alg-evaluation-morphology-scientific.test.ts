import test from "node:test";
import assert from "node:assert/strict";
import {createSimulation} from "../src/simulation";
import {morphologySources} from "../src/evaluation/morphology-cohort";
import {measurePhysical,measureChange,qualifyPhysicalChange,compareCounterfactuals,
  EXPRESSIVENESS_GATE} from "../src/evaluation/morphology";
import type {PreviewCareInputs} from "../src/integration/daily-runtime";
/**
 * Opt-in scientific cohort: MORPH_SCIENTIFIC=1 pnpm exec tsx --test this-file
 * Four 365-day production trajectories per source, NOT a CI smoke test.
 *
 * MORPH_QUALIFY=1 makes scientifically significant deficiencies fail
 * (intentionally may fail on the present tendril-dominant implementation).
 * Default runs produce a candid diagnostic report without certifying breadth.
 */
const checkpoints=[0,1,7,30,90,180,365] as const;
const strategies:readonly PreviewCareInputs[]=[
  {kind:"synthetic-needs-lab-v1",timeline:[],nutrition:0.85},
  {kind:"synthetic-needs-lab-v1",timeline:[
    {needId:"rest",tick:0,fulfillment:0.25},
    {needId:"physical-fitness",tick:0,fulfillment:0.1},
    {needId:"security",tick:0,fulfillment:0.3},
    {needId:"safety",tick:0,fulfillment:0.2}],nutrition:0.2},
];
test("[MORPH-003/SCIENCE] production 30-source seed/care lifetime cohort, manual only",{
  skip:process.env.MORPH_SCIENTIFIC!=="1",
},()=>{
  const cohort=morphologySources();
  assert.equal(cohort.length,30);
  assert.equal(new Set(cohort.map(s=>s.parts[0].pixels.map(p=>p.x+","+p.y).sort().join(";"))).size,30);
  const report:{source:string;seed:string;care:number;age:number;created:number;
    broadFraction:number;terminalFraction:number;structuralChange:number;
    occupied:number;status:string;proofValid:boolean}[]=[];
  let eligible=0,broad=0,constrained=0,seedSensitivity=0,careSensitivity=0;
  let topology=0,remodeled=0,proportions=0,specialization=0;
  for(const item of cohort){
    const variants=Array.from({length:2},(_,seedIndex)=>
      strategies.map((previewCare,care)=>({
        seed:"MORPH-SCIENCE-"+seedIndex,
        care,
        states:(()=>{
          const sim=createSimulation(item.parts,"MORPH-SCIENCE-"+seedIndex,"infant",
            {previewCare,reuseLivingMaterial:false});
          const states=checkpoints.map(day=>sim.materialStateAt(day).graph);
          assert.deepEqual(sim.materialStateAt(366).graph,states.at(-1),
            "A mature pet may move but cannot physically change after day 365");
          return states;
        })(),
      }))).flat();
    if(item.physicalEligibility==="candidate"){
      eligible++;
      const origin=variants[0].states[0],adult=variants[0].states.at(-1)!;
      const measure=qualifyPhysicalChange(origin,adult,"eligible");
      const delta=measure.change,pre=measurePhysical(origin),post=measurePhysical(adult);
      if(measure.status==="pass")broad++;
      if(delta.topologyChanged)topology++;
      if(delta.sourceRelocated>0||delta.sourceResorbed>0)remodeled++;
      if(Math.abs(post.aspect-pre.aspect)>=0.15)proportions++;
      if(delta.newTissues>0||post.specializedTissues>pre.specializedTissues)specialization++;
    }else constrained++;
    if(compareCounterfactuals(variants[0].states,variants[2].states).divergentChecks)
      seedSensitivity++;
    if(compareCounterfactuals(variants[0].states,variants[1].states).divergentChecks)
      careSensitivity++;
    for(const v of variants)for(const [i,graph] of v.states.entries()){
      const birth=v.states[0],delta=measureChange(birth,graph);
      const assessment=qualifyPhysicalChange(birth,graph,
        item.physicalEligibility==="candidate"?"eligible":"unknown");
      report.push({source:item.id,seed:v.seed,care:v.care,age:checkpoints[i],
        created:delta.created,broadFraction:delta.broadFraction,
        terminalFraction:delta.terminalFraction,structuralChange:delta.structuralChange,
        occupied:measurePhysical(graph).occupiedArea,
        status:assessment.status,proofValid:assessment.proof.valid});
    }
  }
  const aggregate={cohort:cohort.length,seeds:2,careStrategies:strategies.length,
    checkpointDays:checkpoints,eligible,broad,constrained,seedSensitivity,careSensitivity,
    topology,remodeled,proportions,specialization,
    broadRate:eligible?broad/eligible:0,gate:EXPRESSIVENESS_GATE,
    doesNotCertifyCurrentEngine:true,measurements:report};
  console.log("MORPHOLOGY_SCIENTIFIC_REPORT "+JSON.stringify(aggregate));
  if(process.env.MORPH_QUALIFY==="1"){
    assert.ok(eligible>=EXPRESSIVENESS_GATE.minEligibleLives);
    assert.ok(broad>=EXPRESSIVENESS_GATE.minIndependentBreadthExamples&&
      broad/eligible>=EXPRESSIVENESS_GATE.minBreadthRate,
      "Production cohort lacks sufficiently frequent broad structural development");
    assert.ok(topology>=EXPRESSIVENESS_GATE.minTopologicalLives,
      "No independently verified anatomical topology variety");
    assert.ok(remodeled>=EXPRESSIVENESS_GATE.minRemodeledLives,
      "No independently verified authored-material relocation/resorption variety");
    assert.ok(proportions>=EXPRESSIVENESS_GATE.minProportionalLives,
      "No independently verified whole-body proportional variety");
    assert.ok(specialization>=EXPRESSIVENESS_GATE.minSpecializedLives,
      "No independently verified structural specialization variety");
    assert.ok(seedSensitivity>=EXPRESSIVENESS_GATE.minSeedSensitiveSources,
      "Lost controlled seed sensitivity");
    assert.ok(careSensitivity>=EXPRESSIVENESS_GATE.minCareSensitiveSources,
      "Lost controlled care sensitivity");
    assert.ok(report.every(r=>r.proofValid),"Forged or unverifiable material observed");
  }
});
