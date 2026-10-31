import test from "node:test";
import assert from "node:assert/strict";
import {
 DEVELOPMENT_STAGES,STAGE_BOUNDARY_CHECKS,STAGE_REPRESENTATIVE_CHECKS,
 STAGE_TRANSITION_HALF_WIDTH,STAGE_PRESSURE_WEIGHTS,
 stageAtCheck,stageAtElapsedDays,developmentalStageIndex,transitionPressure,
} from "../src/development/stage-contract";
import {FINAL_ANATOMICAL_CHECK} from "../src/development/daily-contract";
import {developmentalAllometry} from "../src/development/regional-regulation";
import {compileGenome} from "../src/simulation/genome";
import {createSimulation} from "../src/simulation";
import {STARTER_PRESETS} from "../src/presets";

test("[STAGE-001/A1] every single check has exactly one fixed development stage",()=>{
 const expected=["egg","infant","teen","adult","elder"] as const;
 assert.deepEqual(DEVELOPMENT_STAGES.map(x=>x.stage),expected);
 assert.deepEqual(STAGE_BOUNDARY_CHECKS,[21,81,171,281]);
 assert.deepEqual(STAGE_REPRESENTATIVE_CHECKS,[10,60,140,245,345]);
 let cursor=0;
 for(const [i,epoch] of DEVELOPMENT_STAGES.entries()){
  assert.equal(epoch.startCheck,cursor);
  assert.ok(epoch.endCheck>=epoch.startCheck);
  assert.ok(epoch.representativeCheck>=epoch.startCheck&&
    epoch.representativeCheck<=epoch.endCheck);
  cursor=epoch.endCheck+1;
  for(let k=epoch.startCheck;k<=epoch.endCheck;k++){
   assert.equal(stageAtCheck(k),expected[i]);
   assert.equal(developmentalStageIndex(k),i);
   assert.equal(DEVELOPMENT_STAGES.filter(s=>k>=s.startCheck&&k<=s.endCheck).length,1);
  }
 }
 assert.equal(cursor,FINAL_ANATOMICAL_CHECK+1);
 for(const invalid of [-1,365.5,Infinity,-Infinity,NaN]){
  assert.throws(()=>stageAtCheck(invalid),RangeError);
 }
 assert.equal(stageAtElapsedDays(365.9),"elder");
 assert.equal(stageAtElapsedDays(500),"elder");
 assert.throws(()=>stageAtElapsedDays(-1),RangeError);
});
test("[STAGE-001/A2] only existing 365-day clock is used; no source replacement or elder after maturity",()=>{
 const sample=STARTER_PRESETS.find(p=>p.id==="fork")!;
 const sim=createSimulation(sample.parts,sample.seed,"infant",{
  previewCare:{kind:"synthetic-needs-lab-v1",nutrition:0.92,timeline:[]},
  reuseLivingMaterial:false,
 });
 const source=sim.materialStateAt(0).graph;
 assert.deepEqual(sim.milestones.map(m=>m.stage),DEVELOPMENT_STAGES.map(s=>s.stage));
 assert.deepEqual(sim.milestones.map(m=>m.age),
  DEVELOPMENT_STAGES.map(s=>sim.hatchAt+s.startCheck));
 assert.deepEqual(source.cells,source.sourceCells,
  "the exact authored birth material is unchanged by stage labeling");
 assert.equal(sim.frameAt(0).stage,"egg");
 for(const boundary of STAGE_BOUNDARY_CHECKS){
  assert.equal(sim.frameAt(boundary-0.00001).stage,stageAtCheck(boundary-1));
  assert.equal(sim.frameAt(boundary).stage,stageAtCheck(boundary));
 }
 assert.equal(sim.frameAt(345).stage,"elder");
 assert.equal(sim.frameAt(366).stage,"elder");
 assert.deepEqual(sim.materialStateAt(366).graph,sim.materialStateAt(365).graph);
 assert.deepEqual(sim.materialStateAt(365).graph.sourceCells,source.sourceCells);
});
test("[STAGE-001/A3] deterministic stage selection cannot depend on future queries",()=>{
 const sample=STARTER_PRESETS.find(p=>p.id==="dot")!;
 const make=()=>createSimulation(sample.parts,sample.seed,"infant",{
  previewCare:{kind:"synthetic-needs-lab-v1",nutrition:0.92,timeline:[]},
  reuseLivingMaterial:false,
 });
 const a=make(),b=make();
 for(const check of [365,281,170,80,20,0,21,81,171,345]){
  assert.equal(a.frameAt(check).stage,b.frameAt(check).stage);
 }
 for(const check of [0,20,21,80,81,170,171,280,281,345,365]){
  assert.equal(a.frameAt(check).stage,stageAtCheck(check));
 }
});
test("stage-boundary pulse is bounded, symmetric and never edits time",()=>{
 assert.equal(STAGE_TRANSITION_HALF_WIDTH,12);
 const centers=new Set<number>(STAGE_BOUNDARY_CHECKS);
 for(let check=0;check<=365;check++){
  const p=transitionPressure(check);
  assert.ok(Number.isFinite(p)&&p>=0&&p<=1);
  const expected=Math.max(0,...STAGE_BOUNDARY_CHECKS.map(b=>
   1-Math.abs(check-b)/STAGE_TRANSITION_HALF_WIDTH));
  assert.ok(Math.abs(p-expected)<1e-12);
  if(centers.has(check))assert.equal(p,1);
 }
 for(const profile of Object.values(STAGE_PRESSURE_WEIGHTS))
  for(const v of Object.values(profile))assert.ok(v>=0&&v<=1);
});
test("source-based five-epoch allometry changes only at physical stage boundaries",()=>{
 const signals=compileGenome("8E8L8WBRZ").genotype.channels;
 const care={rest:0.7,activity:0.4,security:0.6};
 const identity="immutable-ink|seed",tissue="owned-body";
 const prior=developmentalAllometry(identity,tissue,20,signals,care);
 const following=developmentalAllometry(identity,tissue,21,signals,care);
 const repeat=developmentalAllometry(identity,tissue,21,signals,care);
 assert.deepEqual(following,repeat);
 assert.ok(Number.isFinite(prior.stretch)&&prior.stretch>=0.125&&prior.stretch<=8);
 assert.ok(Number.isFinite(following.stretch)&&following.stretch>=0.125&&following.stretch<=8);
 // Direction is seed-and-stage-determined, not an inferred target organ.
 assert.ok(prior.axis.x!==following.axis.x||prior.axis.y!==following.axis.y);
 const a=developmentalAllometry(identity,tissue,345,signals,care);
 assert.ok(Math.abs(Math.hypot(a.axis.x,a.axis.y)-1)<1e-12);
});
