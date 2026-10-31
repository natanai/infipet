import test from "node:test";
import assert from "node:assert/strict";
import {materialInputs,drawing} from "./alg-development-fixtures";
import {compileMaterialDevelopment} from "../src/development/operators";
import {proposeDenseIntercalation} from "../src/development/dense-intercalation";
import {journalMaterialEvent} from "../src/development/material-journal";
import {verifyDailyMaterialInventory} from "../src/development/daily-step";
import {measureStageIdentity} from "../src/evaluation/stage-identity";

const HATCH=1_701_102_300_000,DAY=86_400_000;
const source=()=>compileMaterialDevelopment(materialInputs(drawing([
 "........",
 ".######.",
 ".######.",
 ".######.",
 ".######.",
 ".######.",
 ".######.",
 "........",
],"body"),"8E8L8WRZ").atlas,
 materialInputs(drawing([
 "........",
 ".######.",
 ".######.",
 ".######.",
 ".######.",
 ".######.",
 ".######.",
 "........",
],"body"),"8E8L8WRZ").genome).source;

test("physical dense intercalation reshapes a source-authored body with local cell motion and unchanged mass",()=>{
 const prior=source(),tid=prior.tissues[0].id;
 const evidence=[{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}]
  .map(d=>proposeDenseIntercalation(prior,tid,d))
  .filter((x):x is NonNullable<typeof x>=>!!x);
 assert.ok(evidence.length>=1,"source 6×6 must admit multiple occupied-cell transports");
 const proposal=evidence[0];
 assert.equal(proposal.cells.length,prior.cells.length);
 assert.deepEqual(new Set(proposal.cells.map(c=>c.id)),
  new Set(prior.cells.map(c=>c.id)));
 assert.ok(proposal.relocated.length>=3&&proposal.relocated.length<=64);
 const old=new Map(prior.cells.map(c=>[c.id,c]));
 const after=new Map(proposal.cells.map(c=>[c.id,c]));
 const initial=new Set(prior.cells.map(c=>c.x+","+c.y));
 const current=new Set(proposal.cells.map(c=>c.x+","+c.y));
 assert.ok([...initial].some(k=>!current.has(k)));
 assert.ok([...current].some(k=>!initial.has(k)));
 for(const move of proposal.relocated){
  assert.equal(Math.max(Math.abs(move.to.x-move.from.x),
   Math.abs(move.to.y-move.from.y)),1);
  const a=old.get(move.cellId)!,b=after.get(move.cellId)!;
  assert.equal(a.x,move.from.x);assert.equal(a.y,move.from.y);
  assert.equal(b.x,move.to.x);assert.equal(b.y,move.to.y);
  assert.deepEqual(a.sourceIds,b.sourceIds);
  assert.equal(a.provenance,b.provenance);
  assert.equal(a.color,b.color);
 }
 assert.deepEqual(proposeDenseIntercalation(prior,tid,{x:1,y:0}),
  proposeDenseIntercalation(prior,tid,{x:1,y:0}),
  "operator is deterministic for player source and fixed geometry");
 assert.throws(()=>proposeDenseIntercalation(prior,tid,{x:2,y:0}),
  /dense intercalation/);
 const actual={...prior,cells:proposal.cells};
 const contrast=measureStageIdentity(prior,actual);
 assert.ok(contrast.originalSourcePairReorganization>0,
  "movement must affect original source-cell relations, not just a new tip");
});
test("independent material replay requires every vacancy-chain identity",()=>{
 const prior=source(),tid=prior.tissues[0].id;
 const directions=[{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}];
 const candidate=directions.map(direction=>({
  direction,proposal:proposeDenseIntercalation(prior,tid,direction),
 })).find(x=>x.proposal);
 assert.ok(candidate?.proposal);
 const operation={id:"source/physical/vacancy",kind:"intercalate" as const,
  tissueId:tid,direction:candidate.direction,
  atHour:0,durationHours:12,units:12,strength:1};
 const event={id:operation.id+"/unit/1",kind:"intercalate",
  atHour:24,atMs:HATCH+DAY,checkIndex:1,
  sourceCellIds:prior.sourceCells.map(c=>c.id),createdCellIds:[],
  removedCellIds:[],careDigest:"care/numerical/1",
  genomeFingerprint:"source/original"};
 const produced={...prior,cells:candidate.proposal.cells};
 const base=journalMaterialEvent(prior,produced,event,"remodeling",operation);
 const withClock={...base,physical:{...base.physical!,
  relocations:base.physical!.relocations.map(m=>({
   ...m,checkIndex:1,atMs:HATCH+DAY,
  }))}};
 const live={...produced,events:[withClock]};
 verifyDailyMaterialInventory(live,HATCH,1,prior);
 const incomplete={...live,events:[{...withClock,physical:{
  ...withClock.physical!,
  relocations:withClock.physical!.relocations.slice(1),
 }}]};
 assert.throws(()=>verifyDailyMaterialInventory(incomplete,HATCH,1,prior),
  /intercalation|material|chain|relocation|reconstruction|physical|inventory/i);
 const forged=base.physical!.relocations.map((m,i)=>i===0?
  {...m,to:{x:m.to.x+2,y:m.to.y}}:m);
 const falseEvent={...withClock,physical:{...withClock.physical!,relocations:
  forged.map(m=>({...m,checkIndex:1,atMs:HATCH+DAY}))}};
 assert.throws(()=>verifyDailyMaterialInventory({...live,events:[falseEvent]},
  HATCH,1,prior),/intercalation|material|chain|relocation|physical|inventory/i);
});
