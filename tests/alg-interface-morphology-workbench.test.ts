import test from "node:test";
import assert from "node:assert/strict";
import {compileMaterialDevelopment} from "../src/development/operators";
import {createSimulation} from "../src/simulation";
import {materialInputs,fixtures} from "./alg-development-fixtures";
import {
 DEFAULT_MORPH_TUNING,MORPH_KINDS,morphologyShapeMetrics,
 tuneMaterialProgram,tuningIsDefault,
} from "../src/interface/morphology-tuning";

test("all eight inherited material operator families have independent bounded preview controls",()=>{
 const {atlas,genome}=materialInputs(fixtures.blob,"MORPH-WORKBENCH");
 const birth=compileMaterialDevelopment(atlas,genome);
 assert.equal(MORPH_KINDS.length,8);
 assert.deepEqual(new Set(MORPH_KINDS),new Set([
  "elongate","expand","branch","bud","fuse","resorb","remodel","reinforce"]));
 assert.equal(tuningIsDefault(DEFAULT_MORPH_TUNING),true);
 assert.strictEqual(tuneMaterialProgram(birth,DEFAULT_MORPH_TUNING),birth);
 const baseline=JSON.stringify(birth);
 for(const kind of MORPH_KINDS){
  const muted={...DEFAULT_MORPH_TUNING,[kind]:0};
  const amplified={...DEFAULT_MORPH_TUNING,[kind]:2};
  assert.equal(tuningIsDefault(muted),false);
  const a=tuneMaterialProgram(birth,muted),b=tuneMaterialProgram(birth,amplified);
  assert.notEqual(a.fingerprint,b.fingerprint);
  assert.deepEqual(a.source,birth.source);
  assert.equal(a.genomeFingerprint,birth.genomeFingerprint);
  assert.equal(b.genomeFingerprint,birth.genomeFingerprint);
  assert.ok(a.operators.every(o=>o.kind!==kind||o.strength===0));
  for(let i=0;i<b.operators.length;i++){
   const old=birth.operators[i],now=b.operators[i];
   assert.equal(now.kind,old.kind);
   assert.equal(now.id,old.id);
   assert.equal(now.tissueId,old.tissueId);
   assert.equal(now.strength,old.kind===kind?Math.min(1,2*old.strength):old.strength);
   if(old.strength===0)assert.equal(now.strength,0,"preview cannot invent zero genetic capacity");
  }
 }
 for(const invalid of [NaN,Infinity,-0.1,2.1])
  assert.throws(()=>tuneMaterialProgram(birth,{...DEFAULT_MORPH_TUNING,expand:invalid}),/0..200/);
 assert.equal(JSON.stringify(birth),baseline,"tuning may never mutate the permanent program");
});
test("physical measurement distinguishes hollow, compact and line-only material, independent of visible colors",()=>{
 const cells=(points:readonly [number,number][])=>points.map(([x,y],i)=>({
  id:"src/"+i,tissueId:"body",x,y,color:"#FFFFFF",
  provenance:"authored" as const,sourceIds:["src/"+i],
  parentCellIds:[],operationId:null,
 }));
 const make=(points:readonly [number,number][])=>{
  const source=cells(points);return {
   version:1 as const,sourceFingerprint:"test",sourceCells:source,cells:source,
   tissues:[],sites:[],links:[],protectedVoids:[],events:[],
  };
 };
 const square=make(Array.from({length:25},(_,i)=>[10+i%5,10+Math.floor(i/5)] as [number,number]));
 const line=make(Array.from({length:25},(_,i)=>[10+i,10] as [number,number]));
 const a=morphologyShapeMetrics(square),b=morphologyShapeMetrics(line);
 assert.equal(a.cells,25);assert.equal(a.width,5);assert.equal(a.height,5);
 assert.equal(a.internalCells,9);assert.equal(a.solidity,1);
 assert.equal(b.cells,25);assert.equal(b.internalCells,0);assert.equal(b.thinFraction,1);
 assert.equal(b.width,25);assert.equal(b.height,1);
 assert.ok(a.thinFraction<b.thinFraction);
 const painted={...square,cells:square.cells.map(c=>({...c,color:"#FF2B1C"}))};
 assert.deepEqual(morphologyShapeMetrics(painted),a,"pigment cannot qualify as morphology");
});
test("preview-only operator strength changes cannot change real simulation or create extra daily checks",()=>{
 const baseline=createSimulation(fixtures.blob,"LAB-REPLAY","infant");
 const tuned=createSimulation(fixtures.blob,"LAB-REPLAY","infant",{
  verifyMaterialProgram:program=>({program:tuneMaterialProgram(program,
    {...DEFAULT_MORPH_TUNING,elongate:0,expand:2})}),
 });
 const born=baseline.materialStateAt(0).graph;
 assert.deepEqual(tuned.materialStateAt(0).graph,born,"exact source ink is unchanged");
 const day=7;
 const snapshot=tuned.materialStateAt(day);
 assert.equal(snapshot.completedChecks,day);
 assert.deepEqual(tuned.materialStateAt(day),tuned.materialStateAt(day),
  "repeated developer queries are deterministic and do not award checks");
 assert.deepEqual(tuned.materialStateAt(366).graph,tuned.materialStateAt(365).graph);
 assert.deepEqual(baseline.materialStateAt(0).graph,born,
  "preview cannot mutate a separately compiled default organism");
 const again=createSimulation(fixtures.blob,"LAB-REPLAY","infant",{
  verifyMaterialProgram:program=>({program:tuneMaterialProgram(program,
    {...DEFAULT_MORPH_TUNING,elongate:0,expand:2})}),
 });
 assert.deepEqual(again.materialStateAt(day).graph,snapshot.graph);
});
