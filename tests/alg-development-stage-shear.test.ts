/**
 * Structural metamorphosis opportunity contract.
 *
 * Every applicable source, including multipart drawings, inherits four
 * physically auditable stage windows. No adult masks, retro favorites,
 * hand-picked seed results or post-hoc silhouette thresholds are involved.
 * A ticket is opportunity only; an actual deformation still requires an
 * accepted care-gated physical transaction in the independent material oracle.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {drawing,materialInputs} from "./alg-development-fixtures";
import {compileMaterialDevelopment} from "../src/development/operators";
import {compileLifetimeRemodeling,REMODEL_LIMITS} from "../src/development/lifetime-remodeling";
import {proposeWholeOrganismShear} from "../src/development/whole-organism-shear";
import {STAGE_BOUNDARY_CHECKS,stageAtCheck} from "../src/development/stage-contract";
import type {PetPart} from "../src/simulation/model";
import type {MaterialGraph} from "../src/development/material-graph";
import {applyRemodelingProposal,remodelingProposalsBetween,
 EMPTY_REMODELING_CHRONOLOGY} from "../src/development/remodel-transactions";
import {verifyDailyMaterialInventory} from "../src/development/daily-step";

const SEED="8E8L8WBRZ";
const axes=[{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}] as const;
const solid=drawing([
 "........","..####..","..####..","..####..","..####..",
 "..####..","..####..","........",
],"body");
const core:PetPart={...drawing(["#####","#####","#####","#####","#####"],"body")[0],
 id:"core",name:"Drawn torso",parentId:null};
const wing:PetPart={...drawing(["###","###"],"wing")[0],
 id:"wing",name:"Drawn appendage",parentId:"core",position:{x:5,y:1}};
function assertStageShears(parts:PetPart[]){
 const {atlas,genome}=materialInputs(parts,SEED);
 const base=compileMaterialDevelopment(atlas,genome);
 const lifetime=compileLifetimeRemodeling(base,genome);
 const candidates=axes.filter(axis=>!!proposeWholeOrganismShear(base.source,axis,"graded"));
 assert.ok(candidates.length>0,"this test source has an admissible birth shear");
 assert.ok(lifetime.operations.length<=REMODEL_LIMITS.maxOperations);
 const shears=lifetime.operations.filter(o=>o.id.startsWith("stage/graded-shear/"));
 assert.equal(shears.length,4,"no later developmental boundary may lose whole-body opportunity");
 for(const [i,boundary] of STAGE_BOUNDARY_CHECKS.entries()){
  const selected=shears.find(o=>o.id==="stage/graded-shear/"+i);
  assert.ok(selected);
  assert.equal(selected.kind,"shear");
  assert.equal(selected.atHour,boundary);
  assert.equal(selected.durationHours,48);
  assert.equal(selected.units,REMODEL_LIMITS.maxUnits);
  assert.ok(selected.strength>0&&selected.strength<=1);
  assert.ok(stageAtCheck(boundary)!=="egg");
  assert.ok(candidates.some(d=>d.x===selected.direction?.x&&d.y===selected.direction?.y),
   "only permanently birth-feasible source axes are inherited");
 }
 assert.deepEqual(compileLifetimeRemodeling(base,genome),lifetime,
  "genetic stage opportunities are independent of query order or later care");
 assert.equal(lifetime.operations.filter(o=>o.id.startsWith("developmental-repattern/")).length,5);
 assert.ok(lifetime.operations.some(o=>o.id==="stage/elder/intercalate"),
  "the 64-ticket budget must still reserve mature conservative tissue reflow");
 return {base,genome};
}
test("solid Body-only source inherits all four material-conserving stage shears",()=>{
 assertStageShears(solid);
});
test("multipart original organs inherit the SAME organism-wide transformation grammar",()=>{
 const {base}=assertStageShears([core,wing]);
 assert.ok(base.source.links.some(l=>l.kind==="attachment"));
 const axis=axes.find(d=>!!proposeWholeOrganismShear(base.source,d,"graded"))!;
 const physical=proposeWholeOrganismShear(base.source,axis,"graded")!;
 assert.equal(physical.cells.length,base.source.cells.length);
 assert.deepEqual(physical.cells.map(c=>c.id),base.source.cells.map(c=>c.id));
 assert.ok(physical.relocated.length>=4);
 const movedIds=new Set(physical.relocated.map(m=>m.cellId));
 assert.ok(physical.relocated.every(m=>m.from.x!==m.to.x||m.from.y!==m.to.y));
 assert.ok([...movedIds].every(id=>base.source.cells.some(c=>c.id===id)));
});
test("a tiny original mark cannot be granted a physically impossible global shear",()=>{
 const {atlas,genome}=materialInputs(drawing(["#"],"body"),SEED);
 const base=compileMaterialDevelopment(atlas,genome);
 const program=compileLifetimeRemodeling(base,genome);
 assert.equal(program.operations.filter(o=>o.id.startsWith("stage/graded-shear/")).length,0);
 assert.ok(program.operations.length<=REMODEL_LIMITS.maxOperations);
});

test("graded shear obeys the original living-median signed field and an independent causal journal",()=>{
 const {atlas,genome}=materialInputs(solid,SEED);
 const compiled=compileMaterialDevelopment(atlas,genome),birth=compiled.source;
 const axis=axes.find(d=>!!proposeWholeOrganismShear(birth,d,"graded"))!;
 assert.ok(axis);
 const physical=proposeWholeOrganismShear(birth,axis,"graded")!;
 const cross=axis.x?"y":"x";
 const tiers=[...new Set(birth.cells.map(c=>c[cross]))].sort((a,b)=>a-b);
 const cut=tiers[Math.floor((tiers.length-1)/2)];
 const indexed=new Map(physical.cells.map(c=>[c.id,c]));
 const moved=new Set(physical.relocated.map(r=>r.cellId));
 let upper=0,lower=0;
 for(const old of birth.cells){
  const factor=Math.sign(old[cross]-cut);
  if(factor>0)upper++;if(factor<0)lower++;
  const current=indexed.get(old.id)!;
  assert.equal(current.x,old.x+axis.x*factor);
  assert.equal(current.y,old.y+axis.y*factor);
  assert.equal(moved.has(old.id),factor!==0);
  assert.equal(current.color,old.color);
  assert.deepEqual(current.sourceIds,old.sourceIds);
 }
 assert.ok(upper>=4&&lower>=4);
 const op={id:"stage/graded-shear/0",kind:"shear" as const,
  tissueId:birth.tissues[0].id,direction:axis,
  atHour:0,durationHours:12,units:12,strength:1};
 const remodeling=compileLifetimeRemodeling(compiled,genome,[op]);
 const proposals=remodelingProposalsBetween(remodeling,0,12);
 const accepted=proposals.map(p=>({p,result:applyRemodelingProposal(birth,remodeling,p,
  EMPTY_REMODELING_CHRONOLOGY,Math.ceil(p.atHour))}))
  .find(v=>v.result.attempt.status==="accepted");
 assert.ok(accepted,"the physical producer must admit at least one true graded source event");
 const check=Math.ceil(accepted.p.atHour),hatch=1_701_102_300_000;
 const events=accepted.result.graph.events.map(e=>({...e,
  atHour:24*check,checkIndex:check,atMs:hatch+check*86_400_000,
  careDigest:"original-graded",genomeFingerprint:compiled.genomeFingerprint,
  physical:{...e.physical!,relocations:e.physical!.relocations.map(m=>({
   ...m,checkIndex:check,atMs:hatch+check*86_400_000,
  }))},
 }));
 const full:MaterialGraph={...accepted.result.graph,events};
 const authorization={material:compiled.operators,remodeling:remodeling.operations};
 verifyDailyMaterialInventory(full,hatch,check,birth,authorization);
 const broken=events.map(e=>({...e,physical:{...e.physical!,
  relocations:e.physical!.relocations.slice(1),
 }}));
 assert.throws(()=>verifyDailyMaterialInventory({...full,events:broken},
  hatch,check,birth,authorization),/shear|relocation|material|inventory|reconstruction/i);
});
