import test from "node:test";
import assert from "node:assert/strict";
import {DEVELOPMENT_STAGES,STAGE_BOUNDARY_CHECKS,STAGE_TRANSITION_HALF_WIDTH,
 STAGE_PRESSURE_WEIGHTS,stageAtCheck,transitionPressure} from "../src/development/stage-contract";
import {developmentalAllometry} from "../src/development/regional-regulation";
import {compileGenome} from "../src/simulation/genome";
import {compileMaterialDevelopment} from "../src/development/operators";
import {compileLifetimeRemodeling,REMODEL_LIMITS} from "../src/development/lifetime-remodeling";
import {STARTER_PRESETS} from "../src/presets";
import {compileSources} from "../src/simulation/material";
import {describeSource} from "../src/simulation/source-atlas";

test("[STAGE-002/A1] five permanent stage-specific growth fields are bounded and care-derived only at the evaluated day",()=>{
 const genome=compileGenome("8E8L8WBRZ");
 const identity="original-physical-ink|permanent-readable-seed",tid="body";
 for(const epoch of DEVELOPMENT_STAGES){
  const care={rest:0.6,activity:0.5,security:0.7};
  const k=epoch.representativeCheck;
  const first=developmentalAllometry(identity,tid,k,genome.genotype.channels,care);
  const repeated=developmentalAllometry(identity,tid,k,genome.genotype.channels,care);
  assert.deepEqual(first,repeated,"no stage can reroll latent orientation");
  assert.ok(first.stretch>=0.125&&first.stretch<=8);
  assert.ok(Math.abs(Math.hypot(first.axis.x,first.axis.y)-1)<1e-12);
  const profile=STAGE_PRESSURE_WEIGHTS[epoch.stage];
  assert.ok(Object.values(profile).every(v=>Number.isFinite(v)&&v>=0&&v<=1));
  assert.equal(stageAtCheck(k),epoch.stage);
 }
 for(const b of STAGE_BOUNDARY_CHECKS){
  for(let offset=-STAGE_TRANSITION_HALF_WIDTH;offset<=STAGE_TRANSITION_HALF_WIDTH;offset++){
   const k=b+offset;
   assert.ok(Math.abs(transitionPressure(k)-
     (1-Math.abs(offset)/STAGE_TRANSITION_HALF_WIDTH))<1e-12);
  }
 }
});
test("[STAGE-002/A2] each original genotype gets real non-additive regional opportunities at all FOUR stage boundaries",()=>{
 for(const preset of STARTER_PRESETS){
  const genome=compileGenome(preset.seed);
  const compiled=compileMaterialDevelopment(describeSource(compileSources(preset.parts,0)),genome);
  const first=compileLifetimeRemodeling(compiled,genome);
  assert.ok(first.operations.length<=REMODEL_LIMITS.maxOperations,
    "finite lifetime remodeling schedule cannot exceed existing genetic operation count");
  const intercalations=first.operations.filter(op=>op.kind==="intercalate");
  assert.ok(intercalations.length>=1&&intercalations.length<=3,
    "each source body must receive a late mass-conserving material intercalation window");
  const elder=intercalations.find(op=>op.id==="stage/elder/intercalate");
  assert.ok(elder);
  assert.equal(elder.atHour,STAGE_BOUNDARY_CHECKS[3]-4);
  assert.equal(elder.atHour+elder.durationHours,337);
  assert.equal(elder.units,REMODEL_LIMITS.maxUnits);
  const continuing=intercalations.find(op=>op.id==="stage/elder-late/intercalate");
  if(continuing){
    assert.equal(continuing.atHour,317);
    assert.equal(continuing.atHour+continuing.durationHours,364);
    assert.equal(continuing.kind,"intercalate");
  }
  assert.ok(elder.strength>0&&elder.strength<=1);
  const primary=first.operations.filter(op=>op.id.startsWith("developmental-repattern/"));
  assert.equal(primary.length,DEVELOPMENT_STAGES.length);
  for(const [i,epoch] of DEVELOPMENT_STAGES.entries()){
   const p=primary.find(o=>o.id==="developmental-repattern/"+i);
   assert.ok(p);
   assert.equal(p.atHour,epoch.startCheck);
   assert.equal(p.atHour+p.durationHours,epoch.endCheck+1);
   assert.ok(p.strength>=0&&p.strength<=1);
  }
  const primaryTissue=compiled.source.tissues[0]?.id;
  if(!primaryTissue)continue;
  const ops=first.operations.filter(op=>op.tissueId===primaryTissue &&
    op.id.includes("/shape-stage/"));
  assert.equal(ops.length,STAGE_BOUNDARY_CHECKS.length);
  for(const [i,b] of STAGE_BOUNDARY_CHECKS.entries()){
   const op=ops.find(x=>x.id.endsWith("/shape-stage/"+i));
   assert.ok(op);
   assert.ok(Math.abs(op.atHour-(b-STAGE_TRANSITION_HALF_WIDTH))<=0.125);
   assert.equal(op.durationHours,2*STAGE_TRANSITION_HALF_WIDTH);
   assert.ok(["bend","slip","redistribute"].includes(op.kind));
   assert.ok(op.units>=1&&op.units<=REMODEL_LIMITS.maxUnits);
   assert.ok(op.strength>0&&op.strength<=1);
  }
  assert.deepEqual(first,compileLifetimeRemodeling(compiled,genome),
    "the same immutable genome and birth ink must not select later-stage targets differently");
 }
});
test("[STAGE-002/A3] changing only later-day care does not retroactively change permanent stage parameters",()=>{
 const genome=compileGenome("8A8E8LBRZ"),channels=genome.genotype.channels;
 const identity=genome.fingerprint+"|some original birth source";
 const pastCare={rest:0.72,activity:0.28,security:0.59};
 const p=developmentalAllometry(identity,"named-original-head",81,channels,pastCare);
 const future=developmentalAllometry(identity,"named-original-head",281,channels,
  {rest:0.01,activity:0.99,security:0.01});
 assert.deepEqual(developmentalAllometry(identity,"named-original-head",81,
  channels,pastCare),p);
 assert.ok(future.stretch>=1/8&&future.stretch<=8);
 assert.deepEqual(STAGE_BOUNDARY_CHECKS,[21,81,171,281]);
});
