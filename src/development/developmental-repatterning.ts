/**
 * MORPH-006: physical developmental turnover, shared by all authored ink.
 *
 * A potential ranks boundary material, never a target silhouette. For source
 * area A, r=sqrt(A/pi), source centroid c and a permanent seeded axis,
 * u,v are rotated (p-c)/r. E=u²/a+a(v-b)²-h*cos(f*u+phase)*exp(-v²/2).
 * a=2^[3(l-e)+2(qx-.5)], b=3(2*qy-1), h=2*branching,
 * f=pi*(1+2*segmentation), phase=2*pi*qy. These are declared game laws.
 * Area homeostasis M=floor(A*(.15+2e)*(.25+1.5qx)); no retained-ink quota.
 * Opportunity expression=sqrt(.7*plasticity+.3*expansion). Zero capability
 * stays zero; positive capability gets opportunities before saturation.
 *
 * Each opportunity proposes <=64 boundary resorptions / energy-decreasing
 * transports. Actual care scales this finite budget. Transport follows <=64
 * eight-neighbour edges through PRE-transaction tissue; it creates no cells.
 * Local connectivity, occupancy, source ancestry, site and joint evidence
 * remain compulsory. A leaf region may retire completely; its immutable
 * source and tissue identity remain archived. No operation is silently
 * replaced by a different growth operator when spatially blocked.
 * Cardinal component count cannot increase. Transports decrease
 * E(to)-E(from)+.25*deltaPerimeter, keeping surface tension in competition.
 *
 * Pure bounded IEEE754 arithmetic, finite lattice [0,63]^2. The fixed seed
 * initializes an exact torus phase, independently per source region and wave.
 * No species rules, starter-specific branches, destination masks, wall time
 * or rendering. IDs identify source ownership and deterministic orbit keys.
 */
import type {DevelopmentalChannels} from "../genetics";
import type {MaterialCell,MaterialGraph,MaterialLink,MaterialSite,MaterialTissue} from "./material-graph";
import {CHAOS_MODULUS,seedChaos,stepChaos,type ChaosState} from "./chaos";
import {isLatticeConnected} from "./lattice-connectivity";

type Point=Readonly<{x:number;y:number}>;
const key=(p:Point)=>p.x+","+p.y;
const inside=(p:Point)=>Number.isInteger(p.x)&&Number.isInteger(p.y)&&p.x>=0&&p.y>=0&&p.x<64&&p.y<64;
const steps=Array.from({length:9},(_,i)=>({x:i%3-1,y:Math.floor(i/3)-1})).filter(p=>p.x||p.y);
const sq=(a:Point,b:Point)=>(a.x-b.x)**2+(a.y-b.y)**2;
const order=(a:string,b:string)=>a<b?-1:a>b?1:0;
function tissueGroups(cells:readonly MaterialCell[]):Map<string,MaterialCell[]>{
 const groups=new Map<string,MaterialCell[]>();
 for(const c of cells){const group=groups.get(c.tissueId)??[];group.push(c);groups.set(c.tissueId,group);}
 return groups;
}
function positionIndex(cells:readonly MaterialCell[]):Map<string,MaterialCell[]>{
 const positions=new Map<string,MaterialCell[]>();
 for(const c of cells){const list=positions.get(key(c))??[];list.push(c);positions.set(key(c),list);}
 return positions;
}
function unlinkedContact(p:Point,tid:string,linked:ReadonlySet<string>,positions:ReadonlyMap<string,readonly MaterialCell[]>):boolean{
 for(let y=-1;y<=1;y++)for(let x=-1;x<=1;x++)
  if((positions.get((p.x+x)+","+(p.y+y))??[]).some(c=>c.tissueId!==tid&&!linked.has(c.tissueId)))return true;
 return false;
}
function fourComponents(cells:readonly Point[]):number{
 if(!cells.length)return 0;
 if(cells.length===1){if(!inside(cells[0]))throw new RangeError("Cardinal contacts require bounded material");return 1;}
 const own=new Uint8Array(4096),queue=new Uint16Array(4096);let components=0;
 for(const c of cells){if(!inside(c))throw new RangeError("Cardinal contacts require bounded material");own[c.y*64+c.x]=1;}
 for(const c of cells){
  const first=c.y*64+c.x;if(own[first]!==1)continue;components++;
  queue[0]=first;own[first]=2;let tail=1;
  for(let head=0;head<tail;head++){
   const k=queue[head],x=k%64,y=Math.floor(k/64);
   for(const next of [x>0?k-1:-1,x<63?k+1:-1,y>0?k-64:-1,y<63?k+64:-1])
    if(next>=0&&own[next]===1){own[next]=2;queue[tail++]=next;}
  }
 }
 return components;
}
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
 const qx=orbit.x/(CHAOS_MODULUS-1),qy=orbit.y/(CHAOS_MODULUS-1),angle=2*Math.PI*qy;
 return {center:{x:source.reduce((n,p)=>n+p.x,0)/source.length,
  y:source.reduce((n,p)=>n+p.y,0)/source.length},radius:Math.sqrt(source.length/Math.PI),
  axis:{x:Math.cos(angle),y:Math.sin(angle)},
  stretch:2**(3*(c.growth.elongation-c.growth.expansion)+2*(qx-.5)),
  offset:3*(2*qy-1),modulation:2*c.branching.initiation,
  frequency:Math.PI*(1+2*c.segmentation.repetition),phase:angle,
  capacity:Math.floor(source.length*(.15+2*c.growth.expansion)*(.25+1.5*qx))};
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
 return new Map(graph.tissues.flatMap(t=>{
  const cached=phase?.get(t.sourceCellIds)?.get(t.id);if(cached)return [[t.id,cached] as const];
  const ink=t.sourceCellIds.map(id=>source.get(id)).filter((c):c is MaterialCell=>!!c);
  if(!ink.length)return [];
  const orbit=stepChaos(seedChaos([seed,graph.sourceFingerprint,t.id,waveId].join("|")));
  const field=developmentalRepatterningField(ink,channels,orbit);
  if(phase&&Object.isFrozen(t.sourceCellIds)){
   Object.freeze(field.center);Object.freeze(field.axis);Object.freeze(field);
   const byId=phase.get(t.sourceCellIds)??new Map<string,RepatterningField>();
   byId.set(t.id,field);phase.set(t.sourceCellIds,byId);
  }
  return [[t.id,field] as const];
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
function route(own:ReadonlySet<string>,from:Point,to:Point):readonly Point[]|null{
 const queue:Point[]=[{x:from.x,y:from.y}],previous=new Map<string,Point|null>([[key(from),null]]);
 for(let i=0;i<queue.length;i++)for(const d of steps){
  const p={x:queue[i].x+d.x,y:queue[i].y+d.y},k=key(p);
  if(!inside(p)||previous.has(k)||(!own.has(k)&&k!==key(to)))continue;
  previous.set(k,queue[i]);
  if(k===key(to)){
   const path:Point[]=[p];let parent:Point|null=queue[i];
   while(parent){path.push(parent);parent=previous.get(key(parent))??null;}
   path.reverse();return path.length<=65?path:null;
  }
  queue.push(p);
 }
 return null;
}
function resolveLinks(cells:readonly MaterialCell[],links:readonly MaterialLink[],retired:string|null):readonly MaterialLink[]|null{
 if(!links.length)return links;
 const active=new Map(cells.map(c=>[c.id,c])),byPosition=new Map<string,MaterialCell[]>();
 for(const c of cells){const list=byPosition.get(key(c))??[];list.push(c);byPosition.set(key(c),list);}
 const result:MaterialLink[]=[];
 for(const link of links){
  if(retired&&(link.fromTissueId===retired||link.toTissueId===retired))continue;
  const a=link.fromCellId?active.get(link.fromCellId):undefined,b=link.toCellId?active.get(link.toCellId):undefined;
  if(a&&b&&sq(a,b)<=8){result.push(link);continue;}
  // Endpoint turnover keeps the SAME physical tissue relationship. No new
  // parent, distant joint or unrecorded attachment is introduced.
  let chosen:{a:MaterialCell;b:MaterialCell;cost:number}|undefined;
  for(const c of cells)if(c.tissueId===link.fromTissueId)
   for(let y=-2;y<=2;y++)for(let x=-2;x<=2;x++)
    for(const other of byPosition.get((c.x+x)+","+(c.y+y))??[])
     if(other.tissueId===link.toTissueId&&sq(c,other)<=8){
      const cost=sq(c,other)+(a?sq(c,a):0)+(b?sq(other,b):0);
      if(!chosen||cost<chosen.cost||cost===chosen.cost&&order(c.id+other.id,chosen.a.id+chosen.b.id)<0)
       chosen={a:c,b:other,cost};
     }
  if(!chosen)return null;
  result.push({...link,fromCellId:chosen.a.id,toCellId:chosen.b.id});
 }
 return result;
}
export type RepatterningProposal=Readonly<{
 cells:readonly MaterialCell[];sites:readonly MaterialSite[];
 tissues:readonly MaterialTissue[];links:readonly MaterialLink[];
 protectedVoids:readonly string[];removedCells:readonly MaterialCell[];
 routes:ReadonlyMap<string,readonly Point[]>;
}>;
export function proposeDevelopmentalRepatterning(graph:MaterialGraph,channels:DevelopmentalChannels,
 seed:string,waveId:string,unit:number,budget:number):RepatterningProposal|null{
 if(!seed||!waveId||!Number.isSafeInteger(unit)||unit<1||unit>12||
  !Number.isSafeInteger(budget)||budget<0||budget>64)
  throw new RangeError("Invalid developmental repatterning budget");
 if(budget===0)return null;
 const source=new Map(graph.sourceCells.map(c=>[c.id,c])),voids=new Set(graph.protectedVoids);
 let cells=[...graph.cells],sites=[...graph.sites],links=[...graph.links],tissues=[...graph.tissues];
 const removedCells:MaterialCell[]=[],routes=new Map<string,readonly Point[]>();
 const siteReplacements=new Set<string>();
 const occupied=new Set(cells.map(key));
 const groups=tissueGroups(cells),beforePositions=positionIndex(cells),positions=new Map(beforePositions);
 const children=new Map<string,number>();
 for(const t of tissues)if(t.parentId)children.set(t.parentId,(children.get(t.parentId)??0)+1);
 const fields=expressedRepatterningFields(graph,channels,seed,waveId);
 const contexts=graph.tissues.flatMap(t=>{
  const group=groups.get(t.id)??[];
  const ink=t.sourceCellIds.map(id=>source.get(id)).filter((c):c is MaterialCell=>!!c);
  if(!group.length||!ink.length)return [];
  // Keep polarity coherent within a developmental wave. Later waves have
  // independently birth-seeded phases; a unit never rerolls the genotype.
  const field=fields.get(t.id)!,own=new Set(group.map(key));
  const linked=new Set(graph.links.flatMap(l=>l.fromTissueId===t.id?[l.toTissueId]:l.toTissueId===t.id?[l.fromTissueId]:[]));
  const candidates=new Map<string,Point>();
  for(const c of group)for(const d of steps){
   const p={x:c.x+d.x,y:c.y+d.y};
   if(inside(p)&&!occupied.has(key(p))&&!voids.has(key(p))&&
    !unlinkedContact(p,t.id,linked,beforePositions))candidates.set(key(p),p);
  }
  const targets=[...candidates.values()].filter(p=>{
   const n=steps.filter(d=>own.has((p.x+d.x)+","+(p.y+d.y)));
   return group.length<3?n.length>0:n.length>=2&&n.some(d=>d.x===0||d.y===0);
  }).sort((a,b)=>repatterningPotential(a,field)-repatterningPotential(b,field)||a.y-b.y||a.x-b.x).slice(0,16);
  return [{tissue:t,field,own,targets,group,
   donors:group.filter(c=>steps.some(d=>!own.has((c.x+d.x)+","+(c.y+d.y))))
    .sort((a,b)=>repatterningPotential(b,field)-repatterningPotential(a,field)||order(a.id,b.id))}];
 });
 // Hamilton-like interleaving gives small and large source regions access;
 // neither a face label nor number of birth tips determines eligibility.
 const proposals=contexts.flatMap(c=>c.donors.slice(0,64).map((donor,index)=>({c,donor,
  priority:(index+1)/Math.sqrt(c.group.length)})))
  .sort((a,b)=>a.priority-b.priority||order(a.donor.id,b.donor.id));
 for(const {c,donor} of proposals){
  if(removedCells.length+routes.size>=budget)break;
  const group=groups.get(c.tissue.id)??[];
  const old=group.find(p=>p.id===donor.id);if(!old)continue;
  const components=fourComponents(group);
  const canRetire=group.length===1&&!(children.get(c.tissue.id)??0);
  const resorb=!siteReplacements.has(donor.id)&&group.length>c.field.capacity&&
   (group.length>1||canRetire)&&cells.length>1;
  let next:MaterialCell[]|undefined,nextGroup:MaterialCell[]|undefined,path:readonly Point[]|null=null;
  if(resorb){
   const remaining=group.filter(p=>p.id!==donor.id);
   if(remaining.length&&(!isLatticeConnected(remaining)||fourComponents(remaining)>components))continue;
   next=cells.filter(p=>p.id!==donor.id);nextGroup=remaining;
  }else{
   const fromEnergy=repatterningPotential(donor,c.field);
   const own=new Set(group.map(key));
   const linked=new Set(links.flatMap(l=>l.fromTissueId===c.tissue.id?[l.toTissueId]:l.toTissueId===c.tissue.id?[l.fromTissueId]:[]));
   for(const target of c.targets){
    // Surface tension discourages ragged one-cell spokes: for a mass
    // transfer use the exact exposed-face change, including adjacent swaps.
    if(occupied.has(key(target))||repatterningPotential(target,c.field)-fromEnergy+
      .25*transferPerimeterChange(donor,target,own)>=-1e-9||
      unlinkedContact(target,c.tissue.id,linked,positions))continue;
    const transport=route(c.own,donor,target);if(!transport)continue;
    const proposed=group.map(p=>p.id===donor.id?{...p,...target}:p);
    if(!isLatticeConnected(proposed)||fourComponents(proposed)>components)continue;
    next=cells.map(p=>p.id===donor.id?{...p,...target}:p);nextGroup=proposed;path=transport;break;
   }
  }
  if(!next)continue;
  const retired=nextGroup!.length?null:c.tissue.id;
  const nextLinks=resolveLinks(next,links,retired);if(!nextLinks)continue;
  let nextSites=sites,replacementRoot:string|undefined;
  if(resorb){
   const replacement=nextGroup!.filter(p=>!routes.has(p.id)&&
    Math.max(Math.abs(p.x-donor.x),Math.abs(p.y-donor.y))<=1)
    .sort((a,b)=>sq(a,donor)-sq(b,donor)||order(a.id,b.id))[0];
   const replacesSite=sites.some(s=>s.rootCellId===donor.id);
   if(replacesSite&&!replacement&&!retired)continue;
   if(replacesSite&&replacement)replacementRoot=replacement.id;
   nextSites=sites.flatMap(s=>s.rootCellId!==donor.id?[s]:replacement?[{...s,rootCellId:replacement.id}]:[]);
  }
  cells=next;links=[...nextLinks];sites=nextSites;
  groups.set(c.tissue.id,nextGroup!);
  const oldPosition=positions.get(key(donor))!.filter(p=>p.id!==donor.id);
  if(oldPosition.length)positions.set(key(donor),oldPosition);else positions.delete(key(donor));
  if(path){const moved=nextGroup!.find(p=>p.id===donor.id)!,k=key(moved);positions.set(k,[...(positions.get(k)??[]),moved]);}
  // The successor is registered exactly when the old apex is consumed.
  // This is the same protected-ID set as rescanning every historic site,
  // with no quadratic all-sites comparison after each material unit.
  if(replacementRoot)siteReplacements.add(replacementRoot);
  const remainingAtOld=positions.has(key(donor));
  if(!remainingAtOld)occupied.delete(key(donor));
  if(path){routes.set(donor.id,path.map(p=>({...p,...(donor.z===undefined?{}:{z:donor.z})})));occupied.add(key(path.at(-1)!));}
  else removedCells.push(donor);
  if(retired){
   const parent=tissues.find(t=>t.id===retired)!.parentId;
   if(parent)children.set(parent,children.get(parent)!-1);
   tissues=tissues.map(t=>t.id===retired?{...t,parentId:null,relationship:"floating",growthSiteIds:[]}:t);
  }
 }
 if(!removedCells.length&&!routes.size)return null;
 return {cells,sites,tissues,links,removedCells,routes,
  protectedVoids:openedProtectedVoids(graph,cells)};
}
