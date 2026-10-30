/**
 * MORPH-004: source-owned regional front displacement.
 *
 * This moves existing identities one lattice unit and deposits a daughter
 * material cell into each vacated position. Every relocation/deposition is
 * checked by the independent daily physical auditor. Bare one-pixel stalks
 * do not qualify as supported tissue fronts.
 *
 * Input: prior graph, source tissue, permanent unit direction, operation ID.
 * Output: <=16 atomic replacements and one-unit relocations, or null.
 * Same inputs always give the same proposal; there is no sprite target.
 */
import type {MaterialCell,MaterialGraph} from "./material-graph";
export type RegionFrontProposal=Readonly<{
 cells:readonly MaterialCell[];
 createdCells:readonly MaterialCell[];
 relocated:readonly Readonly<{cellId:string;from:Readonly<{x:number;y:number}>;to:Readonly<{x:number;y:number}>}>[];
}>;
const key=(p:{x:number;y:number})=>p.x+","+p.y;
const inside=(x:number,y:number)=>Number.isInteger(x)&&Number.isInteger(y)&&x>=0&&y>=0&&x<64&&y<64;
const directions=[[1,0],[-1,0],[0,1],[0,-1]] as const;
export function proposeCoherentReshape(graph:MaterialGraph,tissueId:string,
 direction:Readonly<{x:number;y:number}>,operationId:string,limit=16):RegionFrontProposal|null{
 if(!operationId||!tissueId||!Number.isSafeInteger(limit)||limit<1||limit>16||
  !directions.some(([x,y])=>direction.x===x&&direction.y===y))
  throw new RangeError("Invalid region-front operation contract");
 const source=graph.sourceCells.filter(c=>c.tissueId===tissueId);
 const group=graph.cells.filter(c=>c.tissueId===tissueId);
 if(source.length<4||group.length<4)return null;
 const occupied=new Set(graph.cells.map(key));
 const positions=new Set(group.map(key)),originalPositions=new Set(source.map(key));
 const d=direction,p={x:-d.y,y:d.x};
 const distanceFromAuthored=(c:MaterialCell):number=>{
  if(originalPositions.has(key(c)))return 0;
  for(let radius=1;radius<=8;radius++){
   for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){
    if(Math.max(Math.abs(dx),Math.abs(dy))!==radius)continue;
    if(originalPositions.has((c.x+dx)+","+(c.y+dy)))return radius;
   }
  }
  return 9;
 };
 const linked=new Set(graph.links.flatMap(l=>l.fromTissueId===tissueId?
   [l.toTissueId]:l.toTissueId===tissueId?[l.fromTissueId]:[]));
 const voids=new Set(graph.protectedVoids);
 const foreign=new Set<string>();
 for(const other of graph.cells)if(other.tissueId!==tissueId&&!linked.has(other.tissueId))
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)
   foreign.add((other.x+dx)+","+(other.y+dy));
 const center={x:source.reduce((n,c)=>n+c.x,0)/source.length,
  y:source.reduce((n,c)=>n+c.y,0)/source.length};
 const multiplicity=new Map<string,number>();
 for(const cell of graph.cells)multiplicity.set(key(cell),(multiplicity.get(key(cell))??0)+1);
 const candidates=group.flatMap(c=>{
  // A daughter cannot replace just one layer of overlapping authored ink.
  // That would overlap another surviving identity at the vacated position.
  if(multiplicity.get(key(c))!==1)return [];
  const target={x:c.x+d.x,y:c.y+d.y};
  if(!inside(target.x,target.y)||occupied.has(key(target))||voids.has(key(target))||foreign.has(key(target)))return [];
  const inner=positions.has((c.x-d.x)+","+(c.y-d.y));
  const lateral=positions.has((c.x+p.x)+","+(c.y+p.y))||
                positions.has((c.x-p.x)+","+(c.y-p.y));
  if(!inner||!lateral)return [];
  const sourceDistance=distanceFromAuthored(c);
  if(sourceDistance>8)return [];
  let support=0;
  for(let y=-1;y<=1;y++)for(let x=-1;x<=1;x++)
    if((x!==0||y!==0)&&positions.has((c.x+x)+","+(c.y+y)))support++;
  if(support<3)return [];
  return [{cell:c,target,sourceDistance,support,
    radial:(c.x-center.x)*d.x+(c.y-center.y)*d.y,
    lateralDistance:Math.abs((c.x-center.x)*p.x+(c.y-center.y)*p.y)}];
 }).sort((a,b)=>a.sourceDistance-b.sourceDistance||
   a.lateralDistance-b.lateralDistance||b.support-a.support||
   b.radial-a.radial||(a.cell.id<b.cell.id?-1:a.cell.id>b.cell.id?1:0));
 // A source-scaled, permanently bounded regional material budget is
 // independent of tip-growth spending and prevents the chronicle from being
 // saturated with hundreds of ever-widening front transactions.
 const previous=graph.events.filter(e=>e.kind==="reshape"&&
   e.physical?.operation.tissueId===tissueId)
   .reduce((n,e)=>n+e.createdCellIds.length,0);
 const capacity=Math.min(96,Math.ceil(source.length*5));
 const free=3072-graph.cells.filter(c=>c.provenance==="generated").length;
 const chosen=candidates.slice(0,Math.max(0,Math.min(limit,free,capacity-previous)));
 if(!chosen.length)return null;
 const displaced=new Map(chosen.map(o=>[o.cell.id,o.target]));
 const createdCells=chosen.map((o,i):MaterialCell=>({
  id:operationId+"/regional-cell/"+i+"/"+encodeURIComponent(o.cell.id),
  tissueId,x:o.cell.x,y:o.cell.y,color:o.cell.color,
  ...(o.cell.z===undefined?{}:{z:o.cell.z}),
  provenance:"generated",sourceIds:[...o.cell.sourceIds],
  parentCellIds:[o.cell.id],operationId,
 }));
 return {cells:[...graph.cells.map(c=>displaced.has(c.id)?{...c,...displaced.get(c.id)!}:c),
   ...createdCells],createdCells,relocated:chosen.map(o=>({
    cellId:o.cell.id,from:{x:o.cell.x,y:o.cell.y},to:o.target,
   }))};
}


/**
 * Rigid quarter-turn of a REAL attached source tissue about its existing
 * attachment endpoint. Unlike a sprite rotation, these are lasting material
 * coordinates, with no new cells, removed cells, or invented organs.
 *
 * Input: the live source-owned graph, a currently attached tissue and a
 * permanently selected direction (1 = clockwise, -1 = anticlockwise).
 * Output: one simultaneous, exactly invertible quarter-turn, or null if
 * occupancy, protected cavities, source continuity or joints would break.
 * The independent journal auditor rederives the full rotation from the
 * pre-event attachment and verifies every surviving material identity.
 */
import {anatomicalContinuityFailure} from "./anatomical-continuity";
export type ArticulatedTurn=Readonly<{
 cells:readonly MaterialCell[];
 pivot:Readonly<{x:number;y:number}>;
 relocated:readonly Readonly<{cellId:string;from:Readonly<{x:number;y:number}>;to:Readonly<{x:number;y:number}>}>[];
}>;
export function proposeArticulatedTurn(graph:MaterialGraph,tissueId:string,
 sign:1|-1):ArticulatedTurn|null{
 if(!tissueId||sign!==1&&sign!==-1)
  throw new RangeError("Invalid source-owned articulated turn");
 const joint=[...graph.links].filter(l=>l.kind==="attachment"&&
   l.fromTissueId===tissueId&&l.fromCellId).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0)[0];
 if(!joint)return null;
 const pivotCell=graph.cells.find(c=>c.id===joint.fromCellId&&c.tissueId===tissueId);
 if(!pivotCell)return null;
 const group=graph.cells.filter(c=>c.tissueId===tissueId);
 if(group.length<2)return null;
 const pivot={x:pivotCell.x,y:pivotCell.y};
 const moving=new Map(group.map(c=>{
  const x=pivot.x-sign*(c.y-pivot.y),y=pivot.y+sign*(c.x-pivot.x);
  return [c.id,{x,y}] as const;
 }));
 const former=new Set(group.map(key));
 const latter=new Set([...moving.values()].map(key));
 // Rotationally symmetric silhouettes are not a meaningful stage change.
 if(former.size===latter.size&&[...former].every(k=>latter.has(k)))return null;
 const foreign=graph.cells.filter(c=>c.tissueId!==tissueId);
 const other=new Set(foreign.map(key));
 const linked=new Set(graph.links.flatMap(l=>l.fromTissueId===tissueId?
   [l.toTissueId]:l.toTissueId===tissueId?[l.fromTissueId]:[]));
 const forbidden=new Set(graph.protectedVoids);
 if([...moving.values()].some(p=>!inside(p.x,p.y)||other.has(key(p))||
   forbidden.has(key(p))||foreign.some(c=>!linked.has(c.tissueId)&&
     Math.max(Math.abs(c.x-p.x),Math.abs(c.y-p.y))<=1)))
  return null;
 const cells=graph.cells.map(c=>{
  const p=moving.get(c.id);return p?{...c,x:p.x,y:p.y}:c;
 });
 if(anatomicalContinuityFailure(graph.sourceCells,cells,{
   links:graph.links,protectedVoids:graph.protectedVoids}))return null;
 const byId=new Map(cells.map(c=>[c.id,c]));
 if(graph.links.some(l=>{
  const a=byId.get(l.fromCellId??""),b=byId.get(l.toCellId??"");
  return !a||!b||(a.x-b.x)**2+(a.y-b.y)**2>8;
 }))return null;
 return {cells,pivot,relocated:group.flatMap(c=>{
  const p=moving.get(c.id)!;
  return c.x===p.x&&c.y===p.y?[]:[{
   cellId:c.id,from:{x:c.x,y:c.y},to:{x:p.x,y:p.y},
  }];
 })};
}


/**
 * A conservation-first regional metamorphosis primitive. An outer half-sheet
 * moves by ONE lattice edge, retaining EVERY cell and source identity.
 * Unlike a front reshape it never fills the vacated coordinates, and unlike
 * a one-cell redistribution the full genetically selected band participates.
 *
 * Direction selects both the shift axis and the opposite-side organizer:
 * (+x) moves the upper half, (-x) moves the lower half,
 * (+y) moves the left half, (-y) moves the right half.
 * Let cross=y for horizontal shifts and x for vertical shifts. From
 * sorted unique live cross-coordinates U, cut=U[floor((|U|-1)/2)].
 * Move all members with cross<=cut for positive direction or >cut for
 * negative direction; each shifts by exactly unit vector (dx,dy), while
 * every other identity retains its coordinate. The physical world is 64²
 * integer sites, with at most 4096 moving cells, and exact zero creation,
 * deletion, color mutation, genome mutation, or source ancestry change.
 * Source material remains eligible when growth changes the available shape.
 * Failed geometry/cavity/link/feature constraints produce a genuine null.
 */
export type RegionalSlip=Readonly<{
 cells:readonly MaterialCell[];
 relocated:readonly Readonly<{cellId:string;from:Readonly<{x:number;y:number}>;to:Readonly<{x:number;y:number}>}>[];
}>;
export function proposeRegionalSlip(graph:MaterialGraph,tissueId:string,
 direction:Readonly<{x:number;y:number}>):RegionalSlip|null{
 if(!tissueId||!directions.some(([x,y])=>direction.x===x&&direction.y===y))
  throw new RangeError("Invalid physical regional slip");
 const own=graph.cells.filter(c=>c.tissueId===tissueId);
 if(own.length<4)return null;
 const horizontal=direction.y===0;
 const cross=horizontal?"y":"x";
 const unique=[...new Set(own.map(c=>c[cross]))].sort((a,b)=>a-b);
 if(unique.length<2)return null;
 const median=unique[Math.floor((unique.length-1)/2)];
 const upper=horizontal?direction.x>0:direction.y>0;
 const selected=own.filter(c=>upper?c[cross]<=median:c[cross]>median);
 if(!selected.length||selected.length===own.length)return null;
 const selectedIds=new Set(selected.map(c=>c.id));
 const unmoved=new Set(graph.cells.filter(c=>!selectedIds.has(c.id)).map(key));
 const voids=new Set(graph.protectedVoids);
 const destinations=selected.map(c=>({cell:c,p:{x:c.x+direction.x,y:c.y+direction.y}}));
 if(destinations.some(({p})=>!inside(p.x,p.y)||unmoved.has(key(p))||voids.has(key(p))))
  return null;
 const after=graph.cells.map(c=>selectedIds.has(c.id)?
  {...c,x:c.x+direction.x,y:c.y+direction.y}:c);
 const positions=new Map(after.map(c=>[c.id,c]));
 if(graph.links.some(l=>{
  const a=positions.get(l.fromCellId??""),b=positions.get(l.toCellId??"");
  return !a||!b||(a.x-b.x)**2+(a.y-b.y)**2>8;
 }))return null;
 const linked=new Map(graph.tissues.map(t=>[t.id,new Set<string>([t.id])]));
 for(const l of graph.links){
  linked.get(l.fromTissueId)?.add(l.toTissueId);
  linked.get(l.toTissueId)?.add(l.fromTissueId);
 }
 const foreignByPos=new Map<string,MaterialCell[]>();
 for(const c of after)if(c.tissueId!==tissueId){
  const k=key(c),prior=foreignByPos.get(k)??[];
  prior.push(c);foreignByPos.set(k,prior);
 }
 for(const c of after)if(selectedIds.has(c.id))
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)
   if((foreignByPos.get((c.x+dx)+","+(c.y+dy))??[]).some(o=>
     !linked.get(tissueId)?.has(o.tissueId)))return null;
 if(anatomicalContinuityFailure(graph.sourceCells,after,{
   links:graph.links,protectedVoids:graph.protectedVoids}))return null;
 // Connectivity is checked again by the independent transaction auditor.
 const occupied=new Set(after.filter(c=>c.tissueId===tissueId).map(key));
 const visited=new Set<string>(),queue:{x:number;y:number}[]=[after.find(c=>c.tissueId===tissueId)!];
 visited.add(key(queue[0]));
 for(let i=0;i<queue.length;i++)for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
  if(!dx&&!dy)continue;
  const k=(queue[i].x+dx)+","+(queue[i].y+dy);
  if(occupied.has(k)&&!visited.has(k)){
   visited.add(k);queue.push({x:queue[i].x+dx,y:queue[i].y+dy});
  }
 }
 if(visited.size!==occupied.size)return null;
 return {cells:after,relocated:destinations.map(({cell,p})=>({
  cellId:cell.id,from:{x:cell.x,y:cell.y},to:p,
 }))};
}


/**
 * Conservative multi-region bending, distinct from both front dilation and
 * whole-organ rotation. Its opposite perimeter bands translate in opposite
 * directions, while the intermediate source-owned bridge stays in place.
 *
 * Let U be the ascending unique integer coordinates along the axis normal
 * to direction D. The outer thirds are U[0..floor((N-1)/3)] and
 * U[ceil(2*(N-1)/3)..N-1]. Each top-band cell moves +D, each bottom-band
 * cell -D, and all middle-band cells remain. All cells persist unchanged in
 * identity, tissue, color, ancestry and mass. No inferred part names.
 * Invariants: N>=3, intact links, legal integer 64² positions, maintained
 * source feature contact, intact voids, exactly 8-connected live tissue.
 * Bounded by at most 4096 cell moves and deterministic for a given graph.
 */
export function proposeRegionalBend(graph:MaterialGraph,tissueId:string,
 direction:Readonly<{x:number;y:number}>):RegionalSlip|null{
 if(!tissueId||!directions.some(([x,y])=>direction.x===x&&direction.y===y))
  throw new RangeError("Invalid physical regional bend");
 const own=graph.cells.filter(c=>c.tissueId===tissueId);
 if(own.length<4)return null;
 const cross=direction.y===0?"y":"x";
 const tiers=[...new Set(own.map(c=>c[cross]))].sort((a,b)=>a-b);
 if(tiers.length<3)return null;
 const low=tiers[Math.floor((tiers.length-1)/3)],
  high=tiers[Math.ceil(2*(tiers.length-1)/3)];
 if(low>=high)return null;
 const movement=new Map<string,{x:number;y:number}>();
 for(const c of own){
  const sign=c[cross]<=low?1:c[cross]>=high?-1:0;
  if(sign)movement.set(c.id,{x:c.x+sign*direction.x,y:c.y+sign*direction.y});
 }
 if(movement.size<2)return null;
 const others=graph.cells.filter(c=>!movement.has(c.id));
 const occupiedOther=new Set(others.map(key));
 const protectedVoids=new Set(graph.protectedVoids);
 if([...movement.values()].some(p=>!inside(p.x,p.y)||
    occupiedOther.has(key(p))||protectedVoids.has(key(p))))return null;
 const after=graph.cells.map(c=>movement.has(c.id)?{...c,...movement.get(c.id)!}:c);
 const newOwn=after.filter(c=>c.tissueId===tissueId);
 const changed=new Set(newOwn.map(key)),before=new Set(own.map(key));
 if(changed.size===before.size&&[...changed].every(k=>before.has(k)))
  return null;
 // A symmetric bend cannot silently replace a user's protected opening.
 const lookup=new Map(after.map(c=>[c.id,c]));
 if(graph.links.some(l=>{
  const a=lookup.get(l.fromCellId??""),b=lookup.get(l.toCellId??"");
  return !a||!b||(a.x-b.x)**2+(a.y-b.y)**2>8;
 }))return null;
 const linked=new Set(graph.links.flatMap(l=>l.fromTissueId===tissueId?
  [l.toTissueId]:l.toTissueId===tissueId?[l.fromTissueId]:[]));
 const foreign=new Map<string,MaterialCell[]>();
 for(const c of after)if(c.tissueId!==tissueId){
  const list=foreign.get(key(c))??[];list.push(c);foreign.set(key(c),list);
 }
 for(const c of newOwn)if(movement.has(c.id))
  for(let y=-1;y<=1;y++)for(let x=-1;x<=1;x++)
   if((foreign.get((c.x+x)+","+(c.y+y))??[]).some(o=>
     !linked.has(o.tissueId)))return null;
 if(anatomicalContinuityFailure(graph.sourceCells,after,{
    links:graph.links,protectedVoids:graph.protectedVoids}))return null;
 const visited=new Set<string>(),queue:{x:number;y:number}[]=[newOwn[0]];
 visited.add(key(queue[0]));
 for(let i=0;i<queue.length;i++)for(let dy=-1;dy<=1;dy++)
  for(let dx=-1;dx<=1;dx++){
   if(!dx&&!dy)continue;
   const p=(queue[i].x+dx)+","+(queue[i].y+dy);
   if(changed.has(p)&&!visited.has(p)){
    visited.add(p);queue.push({x:queue[i].x+dx,y:queue[i].y+dy});
   }
  }
 if(visited.size!==changed.size)return null;
 return {cells:after,relocated:own.flatMap(c=>{
  const p=movement.get(c.id);
  return p?[{cellId:c.id,from:{x:c.x,y:c.y},to:p}]:[];
 })};
}
