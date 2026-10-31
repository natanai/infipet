import test from "node:test";
import assert from "node:assert/strict";
import {drawing,materialInputs} from "./alg-development-fixtures";
import {compileMaterialDevelopment} from "../src/development/operators";
import {compileLifetimeRemodeling} from "../src/development/lifetime-remodeling";
import {sourceLobeHinges,proposeSourceLobeTurn} from "../src/development/source-lobe-turn";
import {applyRemodelingProposal,remodelingProposalsBetween,
 EMPTY_REMODELING_CHRONOLOGY} from "../src/development/remodel-transactions";
import {verifyDailyMaterialInventory} from "../src/development/daily-step";
import type {MaterialGraph} from "../src/development/material-graph";
import {createSimulation} from "../src/simulation";
const HATCH=1_701_102_300_000,DAY=86_400_000;
function unlabelledDrawing(){
 // One uninterrupted brushstroke, no manually selected head or appendage.
 // Two distinct material lobes are joined by actual source cut vertices.
 return drawing([
  "...###...",
  "...###...",
  "....#....",
  "....#....",
  "...###...",
  "...###...",
 ],"body");
}
test("unknown Body-only shape has a real source cut vertex and source-owned quarter turn",()=>{
 const {atlas,genome}=materialInputs(unlabelledDrawing(),"8E8L8WRZ");
 const birth=compileMaterialDevelopment(atlas,genome).source;
 assert.equal(birth.tissues.length,1);
 const tissue=birth.tissues[0];
 const candidates=sourceLobeHinges(birth,tissue.id);
 assert.ok(candidates.length>0);
 const possible=candidates.flatMap(h=>[1,-1].flatMap(sign=>{
  const moved=proposeSourceLobeTurn(birth,tissue.id,h.hingeId,h.distalId,sign as 1|-1);
  return moved?[{h,sign,moved}]:[];
 }));
 assert.ok(possible.length>0,
  "an authored connected protrusion must be able to physically articulate");
 const {h,sign,moved}=possible[0];
 assert.equal(moved.cells.length,birth.cells.length);
 assert.deepEqual(new Set(moved.cells.map(c=>c.id)),new Set(birth.cells.map(c=>c.id)));
 assert.ok(moved.relocated.length>=2);
 const source=new Map(birth.cells.map(c=>[c.id,c]));
 const pivot=source.get(h.hingeId)!;
 for(const change of moved.relocated){
  const old=source.get(change.cellId)!;
  assert.equal(change.to.x,pivot.x-sign*(old.y-pivot.y));
  assert.equal(change.to.y,pivot.y+sign*(old.x-pivot.x));
  const material=moved.cells.find(c=>c.id===change.cellId)!;
  assert.equal(material.color,old.color);
  assert.deepEqual(material.sourceIds,old.sourceIds);
  assert.equal(material.provenance,old.provenance);
 }
 assert.deepEqual(moved,proposeSourceLobeTurn(birth,tissue.id,h.hingeId,h.distalId,sign as 1|-1));
});
test("source-owned whole lobe turn is an authorized physically replayable chronological material transaction",()=>{
 const {atlas,genome}=materialInputs(unlabelledDrawing(),"8E8L8WRZ");
 const program=compileMaterialDevelopment(atlas,genome),birth=program.source;
 const tissue=birth.tissues[0];
 const candidate=sourceLobeHinges(birth,tissue.id).flatMap(h=>
  [1,-1].flatMap(sign=>proposeSourceLobeTurn(birth,tissue.id,h.hingeId,h.distalId,sign as 1|-1)?
   [{h,sign}]:[]))[0];
 assert.ok(candidate);
 const op={id:"single-source-lobe-turn",kind:"lobe-turn" as const,
  tissueId:tissue.id,sourceSiteId:JSON.stringify([candidate.h.hingeId,candidate.h.distalId]),
  direction:{x:candidate.sign,y:0},atHour:0,durationHours:12,units:12,strength:1};
 const plan=compileLifetimeRemodeling(program,genome,[op]);
 const due=remodelingProposalsBetween(plan,0,12);
 let done:ReturnType<typeof applyRemodelingProposal>|undefined;
 const failures:string[]=[];
 for(const p of due){
  const result=applyRemodelingProposal(birth,plan,p,EMPTY_REMODELING_CHRONOLOGY,
   Math.ceil(p.atHour));
  failures.push(result.attempt.reason??result.attempt.status);
  if(result.attempt.status==="accepted"){done=result;break;}
 }
 console.info("LOBE_OPERATOR_DEBUG",JSON.stringify({due:due.length,failures,
  candidate,genetics:plan.signals.channels.segmentation}));
 assert.ok(done,"genetically authorized original lobe must move as real cells");
 const k=Math.ceil(done.graph.events[0].atHour);
 const events=done.graph.events.map(e=>({
  ...e,atHour:24*k,atMs:HATCH+DAY*k,checkIndex:k,
  careDigest:"body/lobe/audit",genomeFingerprint:program.genomeFingerprint,
  physical:{...e.physical!,relocations:e.physical!.relocations.map(m=>({
   ...m,atMs:HATCH+DAY*k,checkIndex:k,
  }))},
 }));
 const valid:MaterialGraph={...done.graph,events};
 verifyDailyMaterialInventory(valid,HATCH,k,birth,{
  material:program.operators,remodeling:plan.operations,
 });
 const forged:MaterialGraph={...valid,events:events.map(e=>({
  ...e,physical:{...e.physical!,relocations:e.physical!.relocations.slice(1)},
 }))};
 assert.throws(()=>verifyDailyMaterialInventory(forged,HATCH,k,birth,{
  material:program.operators,remodeling:plan.operations,
 }),/lobe|material|relocation|physical|journal|inventory/i);
});
test("body-only genetic development programs retain a seed-chosen source lobe potential",()=>{
 const {atlas,genome}=materialInputs(unlabelledDrawing(),"8E8L8WRZ");
 const base=compileMaterialDevelopment(atlas,genome);
 const plan=compileLifetimeRemodeling(base,genome);
 const entries=plan.operations.filter(op=>op.kind==="lobe-turn");
 assert.ok(entries.length>=1,"an authored lobe is not merely a suggested sprite");
 assert.ok(entries.every(op=>op.sourceSiteId&&op.direction&&op.tissueId===base.source.tissues[0].id));
 assert.equal(new Set(entries.map(op=>op.id)).size,entries.length);
 assert.ok(plan.operations.length<=64);
 assert.deepEqual(plan,compileLifetimeRemodeling(base,genome));
});
test("normal 365-check pet life actually expresses some source-owned unlabeled lobe migration",()=>{
 const source=unlabelledDrawing();
 const sim=createSimulation(source,"8E8L8WRZ","infant",{
  previewCare:{kind:"synthetic-needs-lab-v1",nutrition:0.92,timeline:[]},
  reuseLivingMaterial:false,
 });
 const birth=sim.materialStateAt(0).graph;
 const day12=sim.materialStateAt(12).graph;
 const actual=day12.events.filter(e=>e.kind==="lobe-turn");
 console.info("UNLABELED_LOBE_EARLY",JSON.stringify({
  events:actual.length,relocations:actual.map(e=>e.physical?.relocations.length),
  sourceCount:birth.cells.length,now:day12.cells.length,
  attempts:day12.remodeling?.attempts?.filter(a=>a.id.includes("source-lobe/")),
 }));
 assert.ok(actual.length>=1,
  "production life must move original unlabeled source material");
 assert.ok(actual.every(e=>!e.createdCellIds.length&&!e.removedCellIds.length));
});
