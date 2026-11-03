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
 const candidates=axes.filter(axis=>!!proposeWholeOrganismShear(base.source,axis));
 assert.ok(candidates.length>0,"this test source has an admissible birth shear");
 assert.ok(lifetime.operations.length<=REMODEL_LIMITS.maxOperations);
 const shears=lifetime.operations.filter(o=>o.id.startsWith("stage/structural-shear/"));
 assert.equal(shears.length,4,"no later developmental boundary may lose whole-body opportunity");
 for(const [i,boundary] of STAGE_BOUNDARY_CHECKS.entries()){
  const selected=shears.find(o=>o.id==="stage/structural-shear/"+i);
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
 const axis=axes.find(d=>!!proposeWholeOrganismShear(base.source,d))!;
 const physical=proposeWholeOrganismShear(base.source,axis)!;
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
 assert.equal(program.operations.filter(o=>o.id.startsWith("stage/structural-shear/")).length,0);
 assert.ok(program.operations.length<=REMODEL_LIMITS.maxOperations);
});
