import test from "node:test";
import assert from "node:assert/strict";
import {drawing,materialInputs} from "./alg-development-fixtures";
import {compileMaterialDevelopment} from "../src/development/operators";
import {compileLifetimeRemodeling} from "../src/development/lifetime-remodeling";
import {proposeAttachedMigration} from "../src/development/coordinated-metamorphosis";
import {applyRemodelingProposal,remodelingProposalsBetween,
 EMPTY_REMODELING_CHRONOLOGY} from "../src/development/remodel-transactions";
import {verifyDailyMaterialInventory} from "../src/development/daily-step";
import type {MaterialGraph} from "../src/development/material-graph";
import {createSimulation} from "../src/simulation";
const HATCH=1_701_102_300_000,DAY=86_400_000;
function playerDrawnHead(){
 const core={...drawing(["######","######","######","######","######"],"body")[0],
  id:"authored/core",name:"Body",parentId:null};
 const head={...drawing(["###","###","###"],"head")[0],
  id:"authored/head",name:"Head",parentId:core.id,position:{x:6,y:1}};
 const eye={...drawing(["#"],"eye")[0],
  id:"authored/eye",name:"Eye",parentId:head.id,position:{x:7,y:2}};
 return [core,head,eye];
}
test("a selected head carries its original eye and can migrate along the authored body",()=>{
 const {atlas,genome}=materialInputs(playerDrawnHead(),"8E8L8WRZ");
 const program=compileMaterialDevelopment(atlas,genome),birth=program.source;
 const head=birth.tissues.find(t=>birth.sourceCells.some(c=>
  c.tissueId===t.id&&c.sourceKind==="head"))!;
 const eye=birth.tissues.find(t=>birth.sourceCells.some(c=>
  c.tissueId===t.id&&c.sourceKind==="eye"))!;
 assert.ok(head&&eye);
 assert.ok(birth.links.some(l=>l.kind==="attachment"&&
  l.fromTissueId===eye.id&&l.toTissueId===head.id),
  "the real authored eye must have a material attachment to the real head");
 assert.ok(birth.links.some(l=>l.kind==="attachment"&&l.fromTissueId===head.id));
 const axes=[{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}] as const;
 const legal=axes.map(axis=>({axis,proposal:proposeAttachedMigration(birth,head.id,axis)}))
  .filter(x=>x.proposal);
 assert.ok(legal.length>0,"at least one legal head-with-eye movement must exist");
 const {axis,proposal}=legal[0],p=proposal!;
 const old=new Map(birth.cells.map(c=>[c.id,c]));
 const movedIds=new Set(p.relocated.map(x=>x.cellId));
 assert.equal(p.cells.length,birth.cells.length);
 assert.deepEqual(new Set(p.cells.map(c=>c.id)),new Set(birth.cells.map(c=>c.id)));
 assert.ok([...movedIds].some(id=>old.get(id)?.tissueId===head.id));
 assert.ok([...movedIds].some(id=>old.get(id)?.tissueId===eye.id),
  "head migration MUST transport its separately-authored eye");
 assert.ok(![...movedIds].some(id=>old.get(id)?.sourceKind==="body"));
 for(const m of p.relocated){
  assert.equal(m.to.x-m.from.x,axis.x);
  assert.equal(m.to.y-m.from.y,axis.y);
  const current=p.cells.find(c=>c.id===m.cellId)!;
  assert.deepEqual(current.sourceIds,old.get(m.cellId)!.sourceIds);
  assert.equal(current.color,old.get(m.cellId)!.color);
  assert.equal(current.tissueId,old.get(m.cellId)!.tissueId);
 }
 const joint=p.links!.find(l=>l.kind==="attachment"&&l.fromTissueId===head.id)!;
 assert.ok(joint?.toCellId,"the head still has an original, real body anchor");
 assert.deepEqual(p,proposeAttachedMigration(birth,head.id,axis));
});
test("a real per-genome developmental plan gives explicitly drawn heads physical migration windows",()=>{
 const {atlas,genome}=materialInputs(playerDrawnHead(),"8E8L8WRZ");
 const program=compileMaterialDevelopment(atlas,genome);
 const head=program.source.tissues.find(t=>program.source.sourceCells.some(c=>
  c.tissueId===t.id&&c.sourceKind==="head"))!;
 const plan=compileLifetimeRemodeling(program,genome);
 const moving=plan.operations.filter(o=>o.kind==="reposition"&&o.tissueId===head.id);
 assert.ok(moving.length>=1,"authored heads cannot be omitted from life-stage movement");
 assert.ok(moving.some(o=>o.id.startsWith("head-migration/")));
 assert.ok(plan.operations.length<=64);
 assert.deepEqual(plan,compileLifetimeRemodeling(program,genome));
});
test("real chronological head migration and its eye independently replay, missing descendant is rejected",()=>{
 const {atlas,genome}=materialInputs(playerDrawnHead(),"8E8L8WRZ");
 const program=compileMaterialDevelopment(atlas,genome),birth=program.source;
 const head=birth.tissues.find(t=>birth.sourceCells.some(c=>
  c.tissueId===t.id&&c.sourceKind==="head"))!;
 const axes=[{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}];
 const axis=axes.find(a=>proposeAttachedMigration(birth,head.id,a))!;
 assert.ok(axis);
 const op={id:"chronological/real-head-motion",kind:"reposition" as const,
  tissueId:head.id,direction:axis,atHour:0,durationHours:12,units:12,strength:1};
 const plan=compileLifetimeRemodeling(program,genome,[op]);
 const proposals=remodelingProposalsBetween(plan,0,12);
 let accepted:ReturnType<typeof applyRemodelingProposal>|undefined;
 for(const p of proposals){
  const result=applyRemodelingProposal(birth,plan,p,EMPTY_REMODELING_CHRONOLOGY,
   Math.ceil(p.atHour));
  if(result.attempt.status==="accepted"){accepted=result;break;}
 }
 assert.ok(accepted,"an authorized real head migration must commit");
 const k=Math.ceil(accepted.graph.events[0].atHour);
 const events=accepted.graph.events.map(e=>({
  ...e,atHour:24*k,atMs:HATCH+k*DAY,checkIndex:k,
  careDigest:"head-migration/test",genomeFingerprint:program.genomeFingerprint,
  physical:{...e.physical!,relocations:e.physical!.relocations.map(m=>({
   ...m,atMs:HATCH+k*DAY,checkIndex:k,
  }))},
 }));
 const graph:MaterialGraph={...accepted.graph,events};
 verifyDailyMaterialInventory(graph,HATCH,k,birth,{
  material:program.operators,remodeling:plan.operations,
 });
 const damaged={...graph,events:events.map(e=>({...e,physical:{
  ...e.physical!,relocations:e.physical!.relocations.filter(m=>
   birth.cells.find(c=>c.id===m.cellId)?.sourceKind!=="eye"),
 }}))};
 assert.throws(()=>verifyDailyMaterialInventory(damaged,HATCH,k,birth,{
  material:program.operators,remodeling:plan.operations,
 }),/migration|material|relocation|reconstruction|physical|inventory|attached/i);
});

test("a real care-gated daily pet moves its originally drawn head and eye before bulk suppresses anatomy",()=>{
 const sim=createSimulation(playerDrawnHead(),"8E8L8WRZ","infant",{
  previewCare:{kind:"synthetic-needs-lab-v1",nutrition:0.92,timeline:[]},
  reuseLivingMaterial:false,
 });
 const birth=sim.materialStateAt(0).graph,day12=sim.materialStateAt(12).graph;
 const originals=new Map(birth.cells.map(c=>[c.id,c]));
 const head=birth.sourceCells.filter(c=>c.sourceKind==="head");
 const eyes=birth.sourceCells.filter(c=>c.sourceKind==="eye");
 assert.ok(head.length>=3&&eyes.length>=1);
 const moved=(ids:readonly string[])=>ids.filter(id=>{
  const a=originals.get(id)!;
  const b=day12.cells.find(c=>c.id===id);
  return !!b&&(a.x!==b.x||a.y!==b.y);
 }).length;
 const events=day12.events.filter(e=>e.kind==="reposition"&&
  e.physical?.operation.id.startsWith("head-migration/"));
 assert.ok(events.length>=1,
  "a real creature must COMMIT physical head movement in its life, not merely compile unused tickets");
 assert.ok(moved(head.map(c=>c.id))>=1);
 assert.ok(moved(eyes.map(c=>c.id))>=1,
  "real attached facial ink must follow its moving head");
 assert.deepEqual(day12.sourceCells,birth.sourceCells);
 for(const e of events)assert.equal(e.createdCellIds.length+e.removedCellIds.length,0);
});
