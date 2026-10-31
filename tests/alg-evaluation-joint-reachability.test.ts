/**
 * Diagnostic only; not an aesthetic golden-sprite test. Measures whether real
 * source-authored attachments can execute the exact same mass-conserving
 * quarter-turn at different ages in the production physical graph.
 *
 * No hardcoded adult result is accepted as correct. Counts and failures
 * locate the mathematical bottleneck before changing operators or gates.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {STARTER_PRESETS} from "../src/presets";
import {createSimulation} from "../src/simulation";
import {proposeArticulatedTurn} from "../src/development/coordinated-metamorphosis";

test("report physical articulated-organ feasibility across actual lifespan",()=>{
 const report:unknown[]=[];
 const ages=[0,7,21,29,45,125,235] as const;
 let candidates=0;
 for(const preset of STARTER_PRESETS.filter(p=>
  ["fork","tripod","kite","mushroom","drop"].includes(p.id))){
  for(const seed of [preset.seed,"8E8L8WBRZ"]){
   const sim=createSimulation(preset.parts,seed,"infant",{
    previewCare:{kind:"synthetic-needs-lab-v1",nutrition:0.92,timeline:[]},
    reuseLivingMaterial:false,
   });
   const states=ages.map(day=>sim.materialStateAt(day).graph);
   const birth=states[0];
   const organs=birth.links.filter(l=>l.kind==="attachment"&&l.fromCellId)
    .flatMap(l=>{
     const source=birth.sourceCells.find(c=>c.id===l.fromCellId);
     return source&&["head","arm","leg","wing","tail"].includes(source.sourceKind??"")?
      [{tissueId:l.fromTissueId,kind:source.sourceKind}]:[];
    });
   candidates+=organs.length;
   for(const organ of organs){
    const outcomes=states.map((graph,i)=>({
     day:ages[i],positive:!!proposeArticulatedTurn(graph,organ.tissueId,1),
     negative:!!proposeArticulatedTurn(graph,organ.tissueId,-1),
     cells:graph.cells.filter(c=>c.tissueId===organ.tissueId).length,
    }));
    report.push({preset:preset.id,seed,tissueId:organ.tissueId,
     kind:organ.kind,outcomes});
   }
  }
 }
 assert.ok(candidates>=4,"cohort must include genuinely joint-attached original organs");
 console.info("JOINT_REACHABILITY_REPORT",JSON.stringify({
  organs:candidates,report,
  totals:ages.map((day,index)=>({
   day,accepted:(report as {outcomes:{positive:boolean;negative:boolean}[]}[])
    .reduce((n,r)=>n+Number(r.outcomes[index].positive)+
      Number(r.outcomes[index].negative),0),
   trials:report.length*2,
  })),
 }));
});
