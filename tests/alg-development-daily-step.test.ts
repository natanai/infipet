import test from "node:test";
import assert from "node:assert/strict";
import {compileMaterialDevelopment,applyDailyMaterialStep,createDailyMaterialState,
  dailyCheckTime,completedDailyChecks,type DailyCareWindowV1,type MaterialGraph} from "../src/development";
import {materialInputs,fixtures} from "./alg-development-fixtures";
const T=1_800_000_123_456,DAY=86_400_000;
function window(k:number,available=1):DailyCareWindowV1{return {
  version:1,hatchAtMs:T,checkIndex:k,startMs:T+(k-1)*DAY,endMs:T+k*DAY,
  forcing:{nutrition:available,rest:available,security:available,activity:available,threat:0,observedFraction:available},
  acceptedCommands:0,rejectedCommands:0,observations:1,activeMs:DAY,absentMs:0,unknownMs:0,unknown:[],provenanceDigest:"evidence/"+k+"/"+available,
};}
/** Independent set algebra over the archive, including removed generated IDs. */
function inventory(g:MaterialGraph,k:number){
  const active=new Set(g.sourceCells.map(c=>c.id)),ever=new Set(active);
  const ancestry=new Map(g.sourceCells.map(c=>[c.id,new Set([c.id])]));
  for(const e of g.events){
    assert.ok(Number.isInteger(e.checkIndex)&&e.checkIndex!<=k);
    assert.equal(e.atHour,e.checkIndex!*24);assert.equal(e.atMs,T+e.checkIndex!*DAY);
    assert.deepEqual(e.createdCells!.map(c=>c.id),e.createdCellIds);
    for(const c of e.createdCells!){
      assert.equal(ever.has(c.id),false,"a previously removed identity is never reused");
      const inherited=new Set(c.parentCellIds.flatMap(id=>{assert.ok(active.has(id));return [...ancestry.get(id)!];}));
      assert.deepEqual(new Set(c.sourceIds),inherited);
      active.add(c.id);ever.add(c.id);ancestry.set(c.id,inherited);
    }
    for(const id of e.removedCellIds){assert.ok(active.has(id));active.delete(id);}
  }
  assert.deepEqual(new Set(g.cells.map(c=>c.id)),active);
  for(const c of g.cells)assert.deepEqual(new Set(c.sourceIds),ancestry.get(c.id));
}

test("[DEV-007/A1] pure deterministic daily physical transitions preserve exact inventory on unfamiliar ink",()=>{
  for(const [name,parts] of Object.entries({pixel:fixtures.blob.slice(0,1).map(p=>({...p,pixels:p.pixels.slice(0,1)})),
      disconnected:fixtures.disconnected,ring:fixtures.cavity,branch:fixtures.branching,fantasy:fixtures.fantasy})){
    const {atlas,genome}=materialInputs(parts,"DAILY-"+name);
    const program=compileMaterialDevelopment(atlas,genome);
    const original=JSON.stringify(program);
    let s=createDailyMaterialState(program,T);
    const newborn=s;
    const first=applyDailyMaterialStep(program,genome,s,window(1));
    assert.deepEqual(applyDailyMaterialStep(program,genome,s,window(1)),first);
    assert.deepEqual(s,newborn);inventory(first.graph,1);
    s=first;
    for(let k=2;k<=365;k++)s=applyDailyMaterialStep(program,genome,s,window(k));
    inventory(s.graph,365);
    assert.equal(s.completedChecks,365);assert.equal(s.checks.length,365);
    assert.equal(JSON.stringify(program),original);
    assert.deepEqual(s.graph.sourceCells,program.source.sourceCells);
    const no=applyDailyMaterialStep(program,genome,createDailyMaterialState(program,T),window(1,0));
    assert.equal(no.graph,program.source);assert.equal(no.checks[0].nullEffect,true);
    assert.equal(no.iterative.ledger[0].spent,0);
  }
});

test("[DEV-007/A2] exact first/final boundaries, duplicate rejection and no postmaturity transaction",()=>{
  const {atlas,genome}=materialInputs(fixtures.symmetric,"CHECK-IDENTITY");
  const program=compileMaterialDevelopment(atlas,genome);
  let s=createDailyMaterialState(program,T);
  assert.equal(completedDailyChecks(T,T+DAY-1),0);
  assert.equal(completedDailyChecks(T,T+DAY),1);
  assert.equal(completedDailyChecks(T,T+365*DAY),365);
  assert.equal(completedDailyChecks(T,T+2000*DAY),365);
  s=applyDailyMaterialStep(program,genome,s,window(1));
  assert.throws(()=>applyDailyMaterialStep(program,genome,s,window(1)),/Duplicate/);
  assert.throws(()=>applyDailyMaterialStep(program,genome,s,{...window(2),endMs:T+2*DAY-1}),/DailyCare/);
  assert.throws(()=>applyDailyMaterialStep(program,genome,s,{...window(2),checkIndex:2.1}),/clock/);
  for(let k=2;k<=365;k++)s=applyDailyMaterialStep(program,genome,s,window(k,0));
  assert.equal(s.checks[364].atMs,dailyCheckTime(T,365));
  assert.throws(()=>applyDailyMaterialStep(program,genome,s,window(366)),/clock/);
  assert.throws(()=>completedDailyChecks(T,T-1),/backward/);
  assert.throws(()=>dailyCheckTime(Number.MAX_SAFE_INTEGER,365),/clock/);
  assert.ok(s.graph.events.every(e=>e.atHour!<=365*24));
});
