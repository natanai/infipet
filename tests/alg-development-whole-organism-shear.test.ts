import test from "node:test";
import assert from "node:assert/strict";
import {drawing,materialInputs} from "./alg-development-fixtures";
import {compileMaterialDevelopment} from "../src/development/operators";
import {compileLifetimeRemodeling} from "../src/development/lifetime-remodeling";
import {applyRemodelingProposal,remodelingProposalsBetween,
 EMPTY_REMODELING_CHRONOLOGY} from "../src/development/remodel-transactions";
import {proposeWholeOrganismShear} from "../src/development/whole-organism-shear";
import {verifyDailyMaterialInventory} from "../src/development/daily-step";
import type {MaterialGraph} from "../src/development/material-graph";
import {measureStageIdentity} from "../src/evaluation/stage-identity";

const HATCH=1_701_102_300_000,DAY=86_400_000;
function body(){
 const {atlas,genome}=materialInputs(drawing([
  "........","..####..","..####..","..####..","..####..",
  "..####..","..####..","........",
 ],"body"),"8E8L8WBRZ");
 return {program:compileMaterialDevelopment(atlas,genome),genome};
}
const axes=[{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}] as const;
test("complete physical organism sheath shears dense source without depositing or erasing material",()=>{
 const {program}=body(),prior=program.source,initial=new Map(prior.cells.map(c=>[c.id,c]));
 const options=axes.map(axis=>({axis,proposed:proposeWholeOrganismShear(prior,axis)}))
  .filter(o=>!!o.proposed);
 assert.ok(options.length>=1,"dense 4×6 source has a possible full physical shear");
 const {axis,proposed}=options[0],result=proposed!;
 assert.equal(result.cells.length,prior.cells.length);
 assert.deepEqual(new Set(result.cells.map(c=>c.id)),new Set(prior.cells.map(c=>c.id)));
 const next=new Map(result.cells.map(c=>[c.id,c]));
 assert.ok(result.relocated.length>=4);
 for(const movement of result.relocated){
  const a=initial.get(movement.cellId)!,b=next.get(movement.cellId)!;
  assert.equal(b.x-a.x,axis.x);
  assert.equal(b.y-a.y,axis.y);
  assert.deepEqual(b.sourceIds,a.sourceIds);
  assert.equal(b.tissueId,a.tissueId);
  assert.equal(b.color,a.color);
  assert.equal(b.provenance,a.provenance);
 }
 assert.ok(measureStageIdentity(prior,{...prior,cells:result.cells}).originalSourcePairReorganization>0);
 assert.deepEqual(proposeWholeOrganismShear(prior,axis),result);
 assert.throws(()=>proposeWholeOrganismShear(prior,{x:1,y:1}),/Noncardinal/);
});
test("whole-organism morphological shear includes every attached source tissue, not just the torso",()=>{
 const core={...drawing(["#####","#####","#####","#####","#####"],"body")[0],
  id:"core",name:"Authored body",parentId:null};
 const wing={...drawing(["###","###"],"wing")[0],id:"wing",
  name:"Authored wing",parentId:"core",position:{x:5,y:1}};
 const {atlas,genome}=materialInputs([core,wing],"8E8L8WBRZ");
 const prior=compileMaterialDevelopment(atlas,genome).source;
 assert.ok(prior.links.some(l=>l.kind==="attachment"));
 const candidates=axes.map(axis=>proposeWholeOrganismShear(prior,axis)).filter(Boolean);
 assert.ok(candidates.length>=1,"actual jointed authored organism must admit at least one whole-body shear");
 for(const proposal of candidates){
  const before=new Map(prior.cells.map(c=>[c.id,c]));
  for(const m of proposal!.relocated){
   const old=before.get(m.cellId)!;
   assert.equal(proposal!.cells.find(c=>c.id===m.cellId)!.sourcePartId,old.sourcePartId);
   assert.deepEqual(proposal!.cells.find(c=>c.id===m.cellId)!.sourceIds,old.sourceIds);
  }
  const oldTissues=new Map(prior.tissues.map(t=>[t.id,t]));
  assert.deepEqual(proposal!.cells.map(c=>c.tissueId),prior.cells.map(c=>c.tissueId));
  assert.equal(oldTissues.size,prior.tissues.length);
 }
});
test("actual remodeling journal independently rejects partial and fraudulent whole-organism shear",()=>{
 const {program,genome}=body(),prior=program.source;
 const axis=axes.find(axis=>proposeWholeOrganismShear(prior,axis));
 assert.ok(axis);
 const op={id:"source/whole-body-shear",kind:"shear" as const,
  tissueId:prior.tissues[0].id,direction:axis,
  atHour:0,durationHours:12,units:12,strength:1};
 const remodeling=compileLifetimeRemodeling(program,genome,[op]);
 const due=remodelingProposalsBetween(remodeling,0,12);
 assert.ok(due.length>0);
 const accepted=due.map(p=>({p,result:applyRemodelingProposal(prior,remodeling,p,
  EMPTY_REMODELING_CHRONOLOGY,Math.ceil(p.atHour))}))
  .find(x=>x.result.attempt.status==="accepted");
 assert.ok(accepted,"production transaction must express original source-owned shear");
 const check=Math.ceil(accepted.p.atHour);
 const events=accepted.result.graph.events.map(e=>({
  ...e,atHour:24*check,atMs:HATCH+DAY*check,checkIndex:check,
  genomeFingerprint:program.genomeFingerprint,careDigest:"care/shear",
  physical:{...e.physical!,relocations:e.physical!.relocations.map(m=>({
   ...m,atMs:HATCH+DAY*check,checkIndex:check,
  }))},
 }));
 const full:MaterialGraph={...accepted.result.graph,events};
 verifyDailyMaterialInventory(full,HATCH,check,prior,{
  material:program.operators,remodeling:remodeling.operations,
 });
 const forged=events.map(e=>({...e,physical:{
  ...e.physical!,relocations:e.physical!.relocations.slice(1),
 }}));
 assert.throws(()=>verifyDailyMaterialInventory({...full,events:forged},
  HATCH,check,prior,{material:program.operators,remodeling:remodeling.operations}),
  /shear|relocation|material|inventory|reconstruction/i);
});
