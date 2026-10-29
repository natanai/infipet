import test from 'node:test';
import assert from 'node:assert/strict';
import {developmentalRepatterningField,repatterningPotential,repatterningExpression,transferPerimeterChange,proposeDevelopmentalRepatterning,openedProtectedVoids} from '../src/development/developmental-repatterning';
import {materialInputs,drawing} from './alg-development-fixtures';
import {compileMaterialDevelopment} from '../src/development/operators';
import {compileLifetimeRemodeling} from '../src/development/lifetime-remodeling';
import {createDailyMaterialState,applyDailyMaterialStep,verifyDailyMaterialInventory,type DailyCareWindowV1} from '../src/development/daily-step';
import {reconstructDailyPhysicalState} from '../src/development/spatial-inventory';
import {STARTER_PRESETS} from '../src/presets';
import {createSimulation,flattenAnatomy,type PetPart} from '../src/simulation';
import type {MaterialGraph} from '../src/development/material-graph';
import {measurePhysical,sourcePairChange} from '../src/evaluation/morphology';
import {verifyAnatomicalContinuity,verifyCoordinatedStrain} from '../src/development/anatomical-audit';
import {morphologySources} from '../src/evaluation/morphology-cohort';
import {stepChaos} from '../src/development/chaos';

const DAY=86400000,TIME=1800000123456;
const clone=<T>(v:T):T=>JSON.parse(JSON.stringify(v));
const key=(p:{x:number;y:number})=>p.x+','+p.y;
const care={kind:'synthetic-needs-lab-v1' as const,nutrition:.9,timeline:[]};
function window(k:number,amount=1):DailyCareWindowV1{return {version:1,hatchAtMs:TIME,checkIndex:k,
 startMs:TIME+(k-1)*DAY,endMs:TIME+k*DAY,forcing:{nutrition:amount,rest:amount,security:amount,
 activity:amount,threat:0,observedFraction:amount},acceptedCommands:0,rejectedCommands:0,observations:0,
 activeMs:DAY,absentMs:0,unknownMs:0,unknown:[],provenanceDigest:'repattern/'+k+'/'+amount};}
function evidence(birth:MaterialGraph,adult:MaterialGraph){
 const live=new Map(adult.cells.map(c=>[c.id,c])),occupied=new Set(adult.cells.map(key));
 const original=new Set(birth.cells.map(key));
 return {altered:birth.sourceCells.filter(c=>!live.has(c.id)||key(live.get(c.id)!)!==key(c)).length/birth.sourceCells.length,
  vacated:[...original].filter(k=>!occupied.has(k)).length/original.size,
  area:occupied.size/original.size,
  retired:birth.tissues.filter(t=>!adult.cells.some(c=>c.tissueId===t.id)).length};
}
function life(parts:PetPart[],seed:string){
 const sim=createSimulation(parts,seed,'infant',{previewCare:care,reuseLivingMaterial:false});
 const states=[0,60,120,220,365].map(k=>sim.materialStateAt(k));
 const birth=states[0].graph,adult=states.at(-1)!.graph;
 const proof=reconstructDailyPhysicalState(clone(adult),0,365,birth);
 assert.deepEqual(proof.cells,new Map(adult.cells.map(c=>[c.id,c])));
 assert.deepEqual(birth.sourceCells,adult.sourceCells);
 assert.equal(states.at(-1)!.checks.length,365);
 assert.strictEqual(sim.materialStateAt(365.99).graph,adult);
 assert.strictEqual(sim.materialStateAt(900).graph,adult);
 return {sim,states,birth,adult,metrics:evidence(birth,adult)};
}

test('[MORPH-006/A1] independent potential, finite work and coordinated material transport',()=>{
 for(const p of [0,.25,.5,1])for(const e of [0,.25,.5,1])
  assert.equal(repatterningExpression(p,e),Math.sqrt(7*p/10+3*e/10));
 const input=materialInputs(drawing(['###','###','###']),'REPATTERN-LAWS');
 const channels={...input.genome.genotype.channels,growth:{rate:.5,elongation:.5,expansion:.5},
  branching:{initiation:.5,divergence:.5},segmentation:{repetition:.5,boundaries:.5}};
 const f=developmentalRepatterningField([{x:0,y:0},{x:1,y:0},{x:0,y:1},{x:1,y:1}],channels,{x:0,y:0});
 assert.deepEqual(f.center,{x:.5,y:.5});assert.equal(f.radius,2/Math.sqrt(Math.PI));
 assert.ok(Math.abs(f.axis.x-Math.cos(Math.PI/6))<1e-12);assert.ok(Math.abs(f.axis.y+.5)<1e-12);
 assert.equal(f.stretch,.5);assert.equal(f.offset,0);
 assert.equal(f.modulation,1);assert.equal(f.frequency,2*Math.PI);assert.equal(f.capacity,4);
 assert.equal(repatterningPotential(f.center,f),-1);
 const p={x:1.5,y:.5},u=Math.sqrt(Math.PI)/2*Math.cos(Math.PI/6),v=Math.sqrt(Math.PI)/4;
 assert.ok(Math.abs(repatterningPotential(p,f)-(2*u*u+.5*v*v-Math.cos(2*Math.PI*u)*Math.exp(-v*v/2)))<1e-12);
 const birth=compileMaterialDevelopment(input.atlas,input.genome).source,unchanged=JSON.stringify(birth);
 const cardinalPerimeter=(cells:readonly {x:number;y:number}[])=>4*cells.length-
  2*cells.reduce((n,a,i)=>n+cells.slice(i+1).filter(b=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y)===1).length,0);
 const occupied=new Set(birth.cells.map(key));
 for(const from of birth.cells)for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){
  const to={x:from.x+dx,y:from.y+dy};if(occupied.has(key(to))||to.x<0||to.y<0||to.x>=64||to.y>=64)continue;
  const after=[...birth.cells.filter(c=>c.id!==from.id),to];
  assert.equal(transferPerimeterChange(from,to,occupied),cardinalPerimeter(after)-cardinalPerimeter(birth.cells));
 }
 assert.equal(proposeDevelopmentalRepatterning(birth,channels,input.genome.seed,'law',1,0),null);
 const next=proposeDevelopmentalRepatterning(birth,channels,input.genome.seed,'law',1,8);
 assert.ok(next);assert.equal(JSON.stringify(birth),unchanged);
 assert.ok(next.createdCells.length<=8);
 assert.equal(next.cells.length,birth.cells.length+next.createdCells.length-next.removedCells.length,'exact real seam mass');
 verifyAnatomicalContinuity(birth.sourceCells,next.cells);
 const after=new Map(next.cells.map(c=>[c.id,c]));
 assert.ok(birth.cells.some(c=>key(after.get(c.id)!)!==key(c)),'original material physically moves');
 for(const cell of next.createdCells){const parent=birth.cells.find(c=>c.id===cell.parentCellIds[0])!;
  assert.ok(parent);assert.equal(key(parent),key(cell));assert.deepEqual(cell.sourceIds,parent.sourceIds);}
 assert.deepEqual(proposeDevelopmentalRepatterning(birth,channels,input.genome.seed,'law',1,8),next);
 assert.throws(()=>proposeDevelopmentalRepatterning(birth,channels,input.genome.seed,'law',1,65));
 assert.throws(()=>developmentalRepatterningField([],channels,{x:0,y:0}));
 const point=materialInputs(drawing(['#']),'SINGLE-POINT-REMODELING');
 const pointProgram=compileMaterialDevelopment(point.atlas,point.genome);
 assert.equal(compileLifetimeRemodeling(pointProgram,point.genome).operations
  .filter(op=>op.kind==='repattern').length,3,'one-pixel drawings are eligible for the same shared program');
});

test('[MORPH-006/A2] all shipped starters and unlabeled equivalents reorganize original anatomy with continuous parts',()=>{
 const unchanged=JSON.stringify(STARTER_PRESETS),report=[];let renewals=0;
 for(const p of STARTER_PRESETS){
  const unlabeled:PetPart[]=[{id:'freehand',kind:'decoration',name:'Player ink',parentId:null,
   position:{x:0,y:0},pixels:flattenAnatomy(p.parts)}];
  for(const [kind,parts] of [['starter',p.parts],['unlabeled',unlabeled]] as const){
   const result=life(parts,p.seed),m=result.metrics;
   renewals+=result.states.at(-1)!.iterative.changes.filter(c=>c.kind==='renewed').length;
   // Bulk outside unchanged ink and rigid whole-body translation cannot
   // change distances between original source identities. Empty birth
   // coordinates alone would instead reward erasing meaningful features.
   assert.ok(m.altered>=.25,p.id+' '+kind+': >=25% original cells moved or retired');
   assert.ok(sourcePairChange(result.birth,result.adult)>=.15,p.id+' '+kind+': source proportions physically change');
   verifyAnatomicalContinuity(result.birth.sourceCells,result.adult.cells,result.adult);
   assert.ok(result.adult.events.some(e=>e.kind==='repattern'&&e.physical?.strain));
   const frame=result.sim.frameAt(365,{time:0,action:'idle'});
   assert.deepEqual(new Set(frame.pixels.map(key)),new Set(result.adult.cells.map(key)));
   assert.ok(frame.pixels.every(p=>p.materialCellId&&result.adult.cells.some(c=>c.id===p.materialCellId)));
   report.push({id:p.id,kind,...m,aspect:measurePhysical(result.adult).aspect-measurePhysical(result.birth).aspect});
   console.info('REPATTERN_STARTER',JSON.stringify(report.at(-1)));
  }
 }
 assert.equal(JSON.stringify(STARTER_PRESETS),unchanged);
 assert.equal(report.length,24);assert.ok(renewals>0,'real material site succession keeps growth active across the fixed cohort');
 assert.ok(report.some(r=>r.area>1),'growth algorithms remain active');
 assert.ok(report.every(r=>r.retired===0),'drawn parts do not disappear');
 assert.ok(report.filter(r=>Math.abs(r.aspect)>=.15).length>=8);
});

test('[MORPH-006/A3] unfamiliar source-dependent seed and care trajectories remain causal and allow zero-resource nulls',()=>{
 // One independently generated source from each of the six geometric
 // construction rules, chosen before observing their developmental output.
 const sources=morphologySources().slice(0,6);let seedSensitive=0,careSensitive=0;
 const signature=(g:MaterialGraph)=>[...new Set(g.cells.map(key))].sort().join(';');
 for(const source of sources){
  const a=createSimulation(source.parts,'UNFAMILIAR-REMODELING-A','infant',{previewCare:care,reuseLivingMaterial:false});
  const b=createSimulation(source.parts,'UNFAMILIAR-REMODELING-B','infant',{previewCare:care,reuseLivingMaterial:false});
  const c=createSimulation(source.parts,'UNFAMILIAR-REMODELING-A','infant',{previewCare:{...care,timeline:[
   {needId:'rest',tick:90*24,fulfillment:.15},{needId:'security',tick:90*24,fulfillment:.15}]},reuseLivingMaterial:false});
  for(const day of [0,30,90])assert.deepEqual(a.materialStateAt(day),c.materialStateAt(day));
  // Care can change actual growth timing while adequate later material
  // converges under the same fixed potential. Compare the complete physical
  // trajectory, not only its terminal silhouette. Every daily stage is read.
  let careTrajectoryChanged=false;
  for(let day=91;day<=365;day++)if(signature(a.materialStateAt(day).graph)!==signature(c.materialStateAt(day).graph))
   careTrajectoryChanged=true;
  const adult=a.materialStateAt(365).graph;
  if(signature(adult)!==signature(b.materialStateAt(365).graph))seedSensitive++;
  if(careTrajectoryChanged)careSensitive++;
  assert.deepEqual(reconstructDailyPhysicalState(clone(adult),0,365,a.materialStateAt(0).graph).cells,
   new Map(adult.cells.map(c=>[c.id,c])));
 }
 assert.ok(seedSensitive>=4,'physical occupied sites, not seed metadata, must differ');
 assert.ok(careSensitive>=4,'daily physical occupied sites, not care receipts, must differ across trajectories');
 const {atlas,genome}=materialInputs(drawing(['###','###','###']),'REPATTERN-NULL');
 const program=compileMaterialDevelopment(atlas,genome);let state=createDailyMaterialState(program,TIME);
 for(let k=1;k<=365;k++)state=applyDailyMaterialStep(program,genome,state,window(k,0));
 assert.equal(state.graph.events.length,0);assert.deepEqual(state.graph.cells,program.source.cells);
 assert.equal(state.checks.length,365);
});

test('[MORPH-006/A4] exact replay and independent negative witnesses for source, transport, cavity and time',()=>{
 const {atlas,genome}=materialInputs(drawing(['#####','#...#','#...#','#...#','#####']),'REPATTERN-CAVITY');
 const program=compileMaterialDevelopment(atlas,genome),remodel=compileLifetimeRemodeling(program,genome),auth={material:program.operators,remodeling:remodel.operations};
 let state=createDailyMaterialState(program,TIME),mid=state,renewals=0;
 for(let k=1;k<=365;k++){
  const prior=state;state=applyDailyMaterialStep(program,genome,state,window(k),remodel);if(k===90)mid=state;
  for(const change of state.iterative.changes.slice(prior.iterative.changes.length).filter(c=>c.kind==='renewed')){
   renewals++;assert.equal(change.atHour,k);
   const old=prior.iterative.sites.find(s=>s.id===change.siteId)!,next=state.iterative.sites.find(s=>s.id===change.siteId)!;
   assert.equal(next.activationHour,old.activationHour);
   assert.deepEqual(next.orbit,stepChaos(old.orbit),'apical turnover does not reroll the orbit');
   assert.ok(next.extensions>=old.extensions&&next.forks>=old.forks&&next.lateralCells>=old.lateralCells);
  }
 }
 // The fixed full cohort supplies positive succession witnesses. This cavity
 // individual may legitimately have none; every actual renewal is checked above.
 const graph=state.graph,proof=reconstructDailyPhysicalState(clone(graph),TIME,365,program.source,auth);
 assert.deepEqual(proof.cells,new Map(graph.cells.map(c=>[c.id,c])));
 const resumed=applyDailyMaterialStep(program,genome,clone(mid),window(91),remodel);
 const direct=applyDailyMaterialStep(program,genome,mid,window(91),remodel);assert.deepEqual(resumed,direct);
 assert.throws(()=>applyDailyMaterialStep(program,genome,state,window(365),remodel));
 assert.ok(graph.events.some(e=>e.kind==='repattern'));
 const moves=graph.events.flatMap(e=>e.kind==='repattern'?(e.physical?.relocations??[]):[]);
 assert.ok(moves.length);
 const transported=graph.events.find(e=>e.kind==='repattern'&&e.physical?.strain)!;
 assert.ok(transported);
 const malformed={...graph,events:graph.events.map(e=>e!==transported?e:{...e,physical:{...e.physical!,
  relocations:e.physical!.relocations.map((m,i)=>i?m:{...m,to:{...m.to,x:63,y:63}})}})};
 assert.throws(()=>verifyDailyMaterialInventory(malformed,TIME,365,program.source,auth));
 for(const forged of [
  {...graph,cells:graph.cells.map((c,i)=>i?c:{...c,x:c.x+1})},
  {...graph,protectedVoids:['1,1']},
  {...graph,sourceCells:graph.sourceCells.map((c,i)=>i?c:{...c,x:c.x+1})},
  {...graph,events:graph.events.map((e,i)=>i?e:{...e,checkIndex:366})},
  {...graph,links:[...graph.links,{id:'forged-joint',kind:'attachment' as const,
   fromTissueId:graph.cells[0].tissueId,toTissueId:graph.cells[0].tissueId,
   fromCellId:graph.cells[0].id,toCellId:graph.cells[0].id}]},
 ])assert.throws(()=>verifyDailyMaterialInventory(forged,TIME,365,program.source,auth));
 const opened=graph.events.find(e=>e.physical?.protectedVoids);
 assert.ok(opened,'coordinated strain physically transforms the authored cavity');
 assert.notDeepEqual(opened.physical!.protectedVoids!.after,opened.physical!.protectedVoids!.before);
 const wrong={...graph,events:graph.events.map(e=>e!==opened?e:{...e,physical:{...e.physical!,
  protectedVoids:{...e.physical!.protectedVoids!,after:opened.physical!.protectedVoids!.before}}})};
 assert.throws(()=>verifyDailyMaterialInventory(wrong,TIME,365,program.source,auth));
 assert.deepEqual(openedProtectedVoids(program.source,program.source.cells),program.source.protectedVoids);
});
