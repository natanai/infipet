import test from 'node:test';
import assert from 'node:assert/strict';
import {mechanicalCapabilities,mechanicalRegions,compileLifetimeRemodeling,type MechanicalCapability,type MechanicalRegion} from '../src/development/lifetime-remodeling';
import type {MaterialCell,MaterialGraph,MaterialTissue} from '../src/development/material-graph';
import {compileMaterialDevelopment} from '../src/development/operators';
import {createDailyMaterialState,applyDailyMaterialStep,verifyDailyMaterialInventory,type DailyCareWindowV1} from '../src/development/daily-step';
import {reconstructDailyPhysicalState} from '../src/development/spatial-inventory';
import {materialInputs,drawing} from './alg-development-fixtures';
import {expressedRepatterningFields,type RepatterningField} from '../src/development/developmental-repatterning';
const compare=(a:string,b:string)=>a<b?-1:a>b?1:0;
const near=(a:{x:number;y:number},b:{x:number;y:number})=>Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y))<=1;
const clamp=(x:number)=>Math.max(0,Math.min(1,x));
const clone=<T>(v:T):T=>JSON.parse(JSON.stringify(v));
function components(cells:readonly MaterialCell[]):MaterialCell[][]{
 // Independent all-pairs disjoint-set graph; no lattice bins or producer helper.
 const roots=cells.map((_,i)=>i);
 const root=(i:number):number=>{while(roots[i]!==i)i=roots[i];return i;};
 for(let i=0;i<cells.length;i++)for(let j=0;j<i;j++)if(near(cells[i],cells[j]))roots[root(i)]=root(j);
 const groups=new Map<number,MaterialCell[]>();
 cells.forEach((c,i)=>{const k=root(i),g=groups.get(k)??[];g.push(c);groups.set(k,g);});
 return [...groups.values()].map(g=>g.sort((a,b)=>compare(a.id,b.id))).sort((a,b)=>compare(a[0].id,b[0].id));
}
function oracle(g:MaterialGraph,hinges:ReadonlyMap<string,string>){
 const caps:MechanicalCapability[]=[],regions:MechanicalRegion[]=[];
 for(const t of g.tissues){
  const group=g.cells.filter(c=>c.tissueId===t.id);if(!group.length)continue;
  const stiffness=clamp(t.rigidity),mobility=1-stiffness,hingeId=hinges.get(t.id)??null;
  const hinge=group.find(c=>c.id===hingeId),isHinge=!!hinge&&components(group.filter(c=>c.id!==hingeId)).length!==1;
  const remaining=group.filter(c=>!isHinge||c.id!==hingeId);
  for(const [i,cells] of components(remaining).entries())regions.push({id:t.id+'/region/'+i,tissueId:t.id,
   cellIds:cells.map(c=>c.id),sourceCellIds:[...new Set(cells.flatMap(c=>c.sourceIds))].sort(compare),
   hingeCellId:isHinge?hingeId:null,rigidity:stiffness});
  if(group.length>=3&&components(group).length===1){
   if(isHinge)caps.push({id:t.id+'/joint',kind:'joint',tissueId:t.id,
    cellIds:group.filter(c=>c.id===hingeId||near(c,hinge!)).map(c=>c.id).sort(compare),stiffness,mobility});
   if(stiffness>0)caps.push({id:t.id+'/support',kind:'support',tissueId:t.id,cellIds:group.map(c=>c.id).sort(compare),stiffness,mobility});
   if(stiffness<1)caps.push({id:t.id+'/flexible',kind:'flexible-span',tissueId:t.id,cellIds:group.map(c=>c.id).sort(compare),stiffness,mobility});
   for(const c of group)if(group.filter(other=>other.id!==c.id&&near(c,other)).length===1)
    caps.push({id:c.id+'/effector',kind:'effector',tissueId:t.id,cellIds:[c.id],stiffness,mobility});
  }
 }
 for(const l of g.links){
  const a=g.cells.find(c=>c.id===l.fromCellId),b=g.cells.find(c=>c.id===l.toCellId);
  if(!a||!b||(a.x-b.x)**2+(a.y-b.y)**2>2)continue;
  const t=g.tissues.find(t=>t.id===l.fromTissueId),stiffness=clamp(t?.rigidity??0);
  caps.push({id:l.id+'/mechanical',kind:l.kind==='attachment'&&t?.relationship==='joint'?'joint':'attachment',
   tissueId:l.fromTissueId,cellIds:[l.fromCellId!,l.toCellId!],stiffness,mobility:1-stiffness});
 }
 return {caps:caps.sort((a,b)=>compare(a.id,b.id)),regions:regions.sort((a,b)=>compare(a.id,b.id))};
}
function graph(points:readonly {x:number;y:number}[],rigidity=.4):MaterialGraph{
 const cells:MaterialCell[]=points.map((p,i)=>({id:'cell/'+i,tissueId:'t',...p,color:'#123456',
  provenance:'authored',sourceIds:['cell/'+i],parentCellIds:[],operationId:null}));
 const tissues:MaterialTissue[]=[{id:'t',sourcePartId:'ink',parentId:null,relationship:'root',
  sourceCellIds:cells.map(c=>c.id),growthSiteIds:[],rigidity},
  {id:'empty',sourcePartId:'ink',parentId:null,relationship:'floating',sourceCellIds:[],growthSiteIds:[],rigidity:0}];
 return {version:1,sourceFingerprint:'mechanical-oracle',sourceCells:cells,cells,tissues,sites:[],links:[],protectedVoids:[],events:[]};
}
function check(g:MaterialGraph,hinges:ReadonlyMap<string,string>=new Map()){
 const expected=oracle(g,hinges);
 assert.deepEqual(mechanicalCapabilities(g,hinges),expected.caps);
 assert.deepEqual(mechanicalRegions(g,hinges),expected.regions);
 const reverse={...g,cells:[...g.cells].reverse(),tissues:[...g.tissues].reverse()};
 assert.deepEqual(mechanicalCapabilities(reverse,hinges),expected.caps);
 assert.deepEqual(mechanicalRegions(reverse,hinges),expected.regions);
}
test('[PERF-003/A1] indexed geometry exactly equals all-pairs mechanics on every local occupancy, world edge, overlay and hinge',()=>{
 for(const [x,y] of [[0,0],[61,0],[0,61],[61,61]])for(let mask=0;mask<512;mask++){
  const points=Array.from({length:9},(_,i)=>({x:x+i%3,y:y+Math.floor(i/3)})).filter((_,i)=>mask&(1<<i));
  check(graph(points));
 }
 for(const rigidity of [0,.4,1]){
  const line=graph(Array.from({length:9},(_,x)=>({x,y:32})),rigidity);
  check(line,new Map([['t','cell/4']]));check(line,new Map([['t','nonexistent']]));
  check(graph([{x:0,y:0},{x:0,y:0},{x:1,y:0},{x:2,y:0}],rigidity));
  check(graph([{x:63,y:0},{x:0,y:1},{x:1,y:1}],rigidity));
 }
 check(graph([{x:.25,y:.5},{x:1.25,y:.5},{x:1.5,y:1.5}]));
 const linked=graph([{x:1,y:1},{x:2,y:1},{x:3,y:1},{x:4,y:1},{x:5,y:1},{x:6,y:1}]);
 const second:MaterialTissue={...linked.tissues[0],id:'other',sourcePartId:'other-ink',parentId:'t',relationship:'joint',sourceCellIds:['cell/3','cell/4','cell/5']};
 const pairCells=linked.cells.map((c,i)=>i>=3?{...c,tissueId:'other'}:c);
 const pair={...linked,cells:pairCells,sourceCells:pairCells,tissues:[
  {...linked.tissues[0],sourceCellIds:['cell/0','cell/1','cell/2']},linked.tissues[1],second],links:[
  {id:'contact',kind:'attachment' as const,fromTissueId:'other',toTissueId:'t',fromCellId:'cell/3',toCellId:'cell/2'}]};
 check(pair);
 const mosaic=graph(Array.from({length:1024},(_,i)=>({x:i%32,y:Math.floor(i/32)})));
 const mosaicCells=mosaic.cells.map((c,i)=>({...c,tissueId:'region/'+i}));
 check({...mosaic,cells:mosaicCells,sourceCells:mosaicCells,tissues:mosaicCells.map(c=>({
  ...mosaic.tissues[0],id:c.tissueId,sourceCellIds:[c.id],sourcePartId:'ink/'+Number(c.id.split('/')[1])%15}))});
});
const DAY=86400000,TIME=1800000123456;
function window(k:number):DailyCareWindowV1{return {version:1,hatchAtMs:TIME,checkIndex:k,
 startMs:TIME+(k-1)*DAY,endMs:TIME+k*DAY,forcing:{nutrition:.9,rest:.8,security:.8,activity:.7,threat:0,observedFraction:1},
 acceptedCommands:0,rejectedCommands:0,observations:0,activeMs:DAY,absentMs:0,unknownMs:0,unknown:[],provenanceDigest:'indices/'+k};}
function witness(){
 const {atlas,genome}=materialInputs(drawing(['#####','#####','#####','#####']),'INDEXED-MECHANICAL-LIFE');
 const program=compileMaterialDevelopment(atlas,genome),remodel=compileLifetimeRemodeling(program,genome);
 const auth={material:program.operators,remodeling:remodel.operations};
 let state=createDailyMaterialState(program,TIME),mid=state;
 for(let k=1;k<=365;k++){state=applyDailyMaterialStep(program,genome,state,window(k),remodel);if(k===90)mid=state;}
 return {state,mid,program,genome,remodel,auth};
}
test('[PERF-003/A2] private immutable proofs cannot brand shallow-frozen or mutable restored histories',()=>{
 const {state,mid,program,genome,auth}=witness();
 const complete=reconstructDailyPhysicalState(clone(state.graph),TIME,365,program.source,auth);
 const incremental=reconstructDailyPhysicalState(state.graph,TIME,365,program.source,auth,mid.graph);
 assert.deepEqual(incremental,complete);incremental.cells.clear();incremental.links.clear();
 assert.deepEqual(reconstructDailyPhysicalState(state.graph,TIME,365,program.source,auth,mid.graph),complete);
 const shallow=Object.freeze(clone(state.graph));
 verifyDailyMaterialInventory(shallow,TIME,365,program.source,auth);
 (shallow.cells[0] as {x:number}).x++;
 assert.throws(()=>verifyDailyMaterialInventory(shallow,TIME,365,program.source,auth));
 const altered=Object.freeze(clone(state.graph));
 verifyDailyMaterialInventory(altered,TIME,365,program.source,auth);
 (altered.events[0] as {checkIndex:number}).checkIndex=366;
 assert.throws(()=>verifyDailyMaterialInventory(altered,TIME,365,program.source,auth));
 const fields=expressedRepatterningFields(state.graph,program.signals.channels,genome.seed,'cache-contract');
 const reference=clone([...fields]);
 (fields as Map<string,RepatterningField>).clear();
 assert.deepEqual([...expressedRepatterningFields(state.graph,program.signals.channels,genome.seed,'cache-contract')],reference,
  'callers cannot clear a private source-field cache');
 const owner=program.source.tissues.find(t=>t.sourceCellIds.includes(program.source.sourceCells[0].id))!.id;
 const field=expressedRepatterningFields(state.graph,program.signals.channels,genome.seed,'cache-contract').get(owner)!;
 assert.ok(Object.isFrozen(field)&&Object.isFrozen(field.center)&&Object.isFrozen(field.axis));
 const unsafe=clone(state.graph);Object.freeze(unsafe.sourceCells);
 const before=expressedRepatterningFields(unsafe,program.signals.channels,genome.seed,'cache-contract').get(owner)!;
 (unsafe.sourceCells[0] as {x:number}).x++;
 const after=expressedRepatterningFields(unsafe,program.signals.channels,genome.seed,'cache-contract').get(owner)!;
 assert.notDeepEqual(after.center,before.center,'a shallow-frozen source array cannot cache mutable birth positions');
 const vectors=clone(state.graph);for(const c of vectors.sourceCells)Object.freeze(c);Object.freeze(vectors.sourceCells);
 const original=expressedRepatterningFields(vectors,program.signals.channels,genome.seed,'cache-contract').get(owner)!;
 (vectors.tissues.find(t=>t.id===owner)!.sourceCellIds as string[]).pop();
 assert.notDeepEqual(expressedRepatterningFields(vectors,program.signals.channels,genome.seed,'cache-contract').get(owner),original,
  'mutable source-ID vectors never acquire cache credentials');
 const changed={...program.signals.channels,growth:{...program.signals.channels.growth,expansion:.123456}};
 assert.notDeepEqual(expressedRepatterningFields(state.graph,changed,genome.seed,'cache-contract').get(owner),field,
  'effective field channels are part of the cache key');
});
test('[PERF-003/A3] 365-check continuation from unbranded JSON has the full exact canonical state and unchanged mathematical mechanics',()=>{
 const {state,mid,program,genome,remodel,auth}=witness();let resumed=clone(mid);
 for(let k=91;k<=365;k++)resumed=applyDailyMaterialStep(program,genome,resumed,window(k),remodel);
 assert.deepEqual(resumed,state);assert.equal(state.completedChecks,365);assert.equal(state.checks.length,365);
 const final=reconstructDailyPhysicalState(clone(state.graph),TIME,365,program.source,auth);
 assert.deepEqual(final.cells,new Map(state.graph.cells.map(c=>[c.id,c])));
 check(state.graph);assert.deepEqual(state.graph.sourceCells,program.source.sourceCells);
});
