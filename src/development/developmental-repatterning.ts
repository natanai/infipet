/**
 * Shared developmental expression and physical repatterning. MORPH-007
 * replaces independent region dissolution with coordinated lattice strain.
 * Its explicit cell movements and real seam daughters preserve the source
 * neighborhood, while the source-owned smooth field guides ordinary growth.
 * Field offset is zero: it cannot independently drag a small mark away from
 * its neighbors. The live centroid follows actual, audited deformation.
 * All clocks, fixed genomes, resource gates, other operators and audits apply.
 * For A source cells, r=sqrt(A/pi), centered covariance (xx,xy,yy),
 * angle=.5 atan2(2xy,xx-yy)+(qy-.5)pi/3; a=2^[3(l-e)+2(qx-.5)].
 * E(p)=u²/a+a*v²-2b*cos(pi*(1+2s)*u+2pi*qy)*exp(-v²/2),
 * with u,v rotated (p-c)/r; c and r follow live tissue after expression.
 * Bounded finite IEEE754, existing exact integer torus phases and 64² world.
 */
import type {DevelopmentalChannels} from "../genetics";
import type {MaterialCell,MaterialGraph,MaterialLink,MaterialSite,MaterialTissue} from "./material-graph";
import {CHAOS_MODULUS,seedChaos,stepChaos,type ChaosState} from "./chaos";
import {sourceStrain,proposeDevelopmentalStrain,type DevelopmentalStrain} from "./developmental-strain";

type Point=Readonly<{x:number;y:number}>;
const key=(p:Point)=>p.x+","+p.y;
const inside=(p:Point)=>Number.isInteger(p.x)&&Number.isInteger(p.y)&&p.x>=0&&p.y>=0&&p.x<64&&p.y<64;
export type RepatterningField=Readonly<{
 center:Point;radius:number;axis:Point;stretch:number;offset:number;
 modulation:number;frequency:number;phase:number;capacity:number;
}>;
export function repatterningExpression(plasticity:number,expansion:number):number{
 if([plasticity,expansion].some(v=>!Number.isFinite(v)||v<0||v>1))
  throw new RangeError("Invalid developmental repatterning expression");
 return Math.sqrt(.7*plasticity+.3*expansion);
}
/** Exact change in exposed cardinal faces for one occupied -> empty transfer.
 * If donor and recipient are cardinal neighbours, their former shared edge
 * must be corrected once; both contact counts use the BEFORE occupancy. */
export function transferPerimeterChange(from:Point,to:Point,own:ReadonlySet<string>):number{
 const contacts=(p:Point)=>[{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}]
  .filter(d=>own.has((p.x+d.x)+","+(p.y+d.y))).length;
 return 2*(contacts(from)-contacts(to)+Number(Math.abs(from.x-to.x)+Math.abs(from.y-to.y)===1));
}
export function developmentalRepatterningField(source:readonly Point[],c:DevelopmentalChannels,
 orbit:ChaosState):RepatterningField{
 const values=[c.growth.elongation,c.growth.expansion,c.branching.initiation,c.segmentation.repetition];
 if(!source.length||source.length>4096||source.some(p=>!inside(p))||
  values.some(v=>!Number.isFinite(v)||v<0||v>1)||
  [orbit.x,orbit.y].some(v=>!Number.isSafeInteger(v)||v<0||v>=CHAOS_MODULUS))
  throw new RangeError("Invalid developmental repatterning field");
 const qx=orbit.x/(CHAOS_MODULUS-1),qy=orbit.y/(CHAOS_MODULUS-1);
 const center={x:source.reduce((n,p)=>n+p.x,0)/source.length,y:source.reduce((n,p)=>n+p.y,0)/source.length};
 const xx=source.reduce((n,p)=>n+(p.x-center.x)**2,0),yy=source.reduce((n,p)=>n+(p.y-center.y)**2,0),
  xy=source.reduce((n,p)=>n+(p.x-center.x)*(p.y-center.y),0);
 const angle=.5*Math.atan2(2*xy,xx-yy)+(qy-.5)*Math.PI/3;
 return {center,radius:Math.sqrt(source.length/Math.PI),
  axis:{x:Math.cos(angle),y:Math.sin(angle)},
  stretch:2**(3*(c.growth.elongation-c.growth.expansion)+2*(qx-.5)),
  offset:0,modulation:2*c.branching.initiation,
  frequency:Math.PI*(1+2*c.segmentation.repetition),phase:2*Math.PI*qy,
  capacity:Math.max(source.length,Math.floor(source.length*(1+2*c.growth.expansion)*(.5+qx)))};
}
export function repatterningPotential(p:Point,f:RepatterningField):number{
 const x=(p.x-f.center.x)/f.radius,y=(p.y-f.center.y)/f.radius;
 const u=x*f.axis.x+y*f.axis.y,v=-x*f.axis.y+y*f.axis.x;
 return u*u/f.stretch+f.stretch*(v-f.offset)**2-
  f.modulation*Math.cos(f.frequency*u+f.phase)*Math.exp(-v*v/2);
}
type SourceFieldCache={source:ReadonlyMap<string,MaterialCell>;
 phases:Map<string,WeakMap<readonly string[],Map<string,RepatterningField>>>};
const sourceFieldCaches=new WeakMap<readonly MaterialCell[],SourceFieldCache>();
export function expressedRepatterningFields(graph:MaterialGraph,channels:DevelopmentalChannels,
 seed:string,waveId:string):ReadonlyMap<string,RepatterningField>{
 // These fields depend on IMMUTABLE BIRTH positions, not live geometry or
 // care. Reuse only frozen source cells and frozen source-ID vectors. A JSON
 // restore or a shallow-frozen array with mutable cells is recomputed.
 let cache=sourceFieldCaches.get(graph.sourceCells);
 if(!cache&&Object.isFrozen(graph.sourceCells)&&graph.sourceCells.every(c=>Object.isFrozen(c))){
  cache={source:new Map(graph.sourceCells.map(c=>[c.id,c])),phases:new Map()};
  sourceFieldCaches.set(graph.sourceCells,cache);
 }
 const values=[channels.growth.elongation,channels.growth.expansion,channels.branching.initiation,channels.segmentation.repetition];
 const phaseKey=JSON.stringify([seed,graph.sourceFingerprint,waveId,values,values.map(v=>Object.is(v,-0))]);
 let phase=cache?.phases.get(phaseKey);
 if(cache&&!phase){
  phase=new WeakMap();cache.phases.set(phaseKey,phase);
  while(cache.phases.size>12)cache.phases.delete(cache.phases.keys().next().value!);
 }
 const source=cache?.source??new Map(graph.sourceCells.map(c=>[c.id,c]));
 const groups=new Map<string,MaterialCell[]>();
 for(const cell of graph.cells){const group=groups.get(cell.tissueId)??[];group.push(cell);groups.set(cell.tissueId,group);}
 const liveField=(f:RepatterningField,id:string):RepatterningField=>{
  const cells=groups.get(id);const result=!cells?.length?{...f,center:{...f.center},axis:{...f.axis}}:{...f,axis:{...f.axis},
   center:{x:cells.reduce((n,p)=>n+p.x,0)/cells.length,y:cells.reduce((n,p)=>n+p.y,0)/cells.length},
   radius:Math.sqrt(cells.length/Math.PI)};
  Object.freeze(result.center);Object.freeze(result.axis);return Object.freeze(result);
 };
 return new Map(graph.tissues.flatMap(t=>{
  const cached=phase?.get(t.sourceCellIds)?.get(t.id);if(cached)return [[t.id,liveField(cached,t.id)] as const];
  const ink=t.sourceCellIds.map(id=>source.get(id)).filter((c):c is MaterialCell=>!!c);
  if(!ink.length)return [];
  const orbit=stepChaos(seedChaos([seed,graph.sourceFingerprint,t.id,waveId].join("|")));
  const field=developmentalRepatterningField(ink,channels,orbit);
  if(phase&&Object.isFrozen(t.sourceCellIds)){
   Object.freeze(field.center);Object.freeze(field.axis);Object.freeze(field);
   const byId=phase.get(t.sourceCellIds)??new Map<string,RepatterningField>();
   byId.set(t.id,field);phase.set(t.sourceCellIds,byId);
  }
  return [[t.id,liveField(field,t.id)] as const];
 }));
}
/** Existing voids cease being protected only after physical surgery opens
 * them to the exterior. Ordinary growth never gets permission to fill one. */
export function openedProtectedVoids(graph:MaterialGraph,cells:readonly MaterialCell[]):readonly string[]{
 if(!graph.protectedVoids.length)return graph.protectedVoids;
 const occupied=new Set(cells.map(key)),outside=new Set<string>(),queue:Point[]=[];
 const add=(p:Point)=>{const k=key(p);if(inside(p)&&!occupied.has(k)&&!outside.has(k)){outside.add(k);queue.push(p);}};
 for(let i=0;i<64;i++){add({x:i,y:0});add({x:i,y:63});add({x:0,y:i});add({x:63,y:i});}
 for(let i=0;i<queue.length;i++)for(const d of [{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}])
  add({x:queue[i].x+d.x,y:queue[i].y+d.y});
 return graph.protectedVoids.filter(k=>!outside.has(k));
}
export type RepatterningProposal=Readonly<{
 cells:readonly MaterialCell[];sites:readonly MaterialSite[];
 tissues:readonly MaterialTissue[];links:readonly MaterialLink[];
 protectedVoids:readonly string[];removedCells:readonly MaterialCell[];
 createdCells:readonly MaterialCell[];strain:DevelopmentalStrain;
 routes:ReadonlyMap<string,readonly Point[]>;
}>;
export function proposeDevelopmentalRepatterning(graph:MaterialGraph,channels:DevelopmentalChannels,
 seed:string,waveId:string,unit:number,budget:number):RepatterningProposal|null{
 if(!seed||!waveId||!Number.isSafeInteger(unit)||unit<1||unit>12||
  !Number.isSafeInteger(budget)||budget<0||budget>64)
  throw new RangeError("Invalid developmental repatterning budget");
 if(!budget||!graph.cells.length)return null;
 const strain=sourceStrain(graph,channels,seed,waveId,unit);
 const proposed=proposeDevelopmentalStrain(graph,strain,waveId+"/unit/"+unit,budget);
 return proposed?{...proposed,sites:graph.sites,tissues:graph.tissues,removedCells:[],routes:new Map()}:null;
}
