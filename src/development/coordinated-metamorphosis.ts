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
export type RegionalSlip=Readonly<{
 cells:readonly MaterialCell[];
 relocated:readonly Readonly<{cellId:string;from:Readonly<{x:number;y:number}>;to:Readonly<{x:number;y:number}>}>[];
}>;
export type ArticulatedTurn=RegionalSlip&Readonly<{
 pivot:Readonly<{x:number;y:number}>;
}>;
type LatticePoint=Readonly<{x:number;y:number}>;
type QuarterTurn=Readonly<{pivot:LatticePoint;sign:1|-1}>;
const compareIds=(a:string,b:string)=>a<b?-1:a>b?1:0;

/**
 * One atomic, physically committed, attachment-coupled deformation.
 *
 * Inputs: the live prior graph, one actual parent tissue, a proposed root
 * material map and an optional fixed 90-degree turn about a real joint.
 * Outputs: a COMPLETE physical cell graph and every changed identity, or
 * null if any descendant, void, overlap, joint or original feature would fail.
 *
 * For a regional morph, a child follows the displacement of its parent
 * ATTACHMENT CELL, not the parent's centroid. Recurse through all attachment
 * descendants. A rigid turn instead applies exactly the same integer
 * isometry to every descendant. Source IDs/tissue IDs/pigment are immutable.
 * An existing overlay may persist only if both original cells overlapped.
 * The independent auditor does NOT call this function.
 */
function completeAttachedTransformation(
 graph:MaterialGraph,tissueId:string,root:ReadonlyMap<string,LatticePoint>,
 rotation?:QuarterTurn,
):RegionalSlip|null{
 const original=new Map(graph.cells.map(c=>[c.id,c]));
 const changed=new Map<string,LatticePoint>(root);
 const queue=[tissueId],visited=new Set<string>(queue);
 for(let head=0;head<queue.length;head++){
  const parent=queue[head];
  const edges=graph.links.filter(l=>l.kind==="attachment"&&l.toTissueId===parent)
   .sort((a,b)=>compareIds(a.id,b.id));
  for(const link of edges){
   if(visited.has(link.fromTissueId)||!link.toCellId||!link.fromCellId)
    return null;
   const parentCell=original.get(link.toCellId);
   const childAnchor=original.get(link.fromCellId);
   if(!parentCell||!childAnchor||parentCell.tissueId!==parent||
      childAnchor.tissueId!==link.fromTissueId)return null;
   visited.add(link.fromTissueId);queue.push(link.fromTissueId);
   const after=changed.get(parentCell.id)??parentCell;
   const dx=after.x-parentCell.x,dy=after.y-parentCell.y;
   for(const child of graph.cells)if(child.tissueId===link.fromTissueId){
    const point=rotation?{
      x:rotation.pivot.x-rotation.sign*(child.y-rotation.pivot.y),
      y:rotation.pivot.y+rotation.sign*(child.x-rotation.pivot.x),
    }:{x:child.x+dx,y:child.y+dy};
    if(point.x!==child.x||point.y!==child.y)
     changed.set(child.id,point);
   }
  }
 }
 const cells=graph.cells.map(c=>{
  const p=changed.get(c.id);
  return p?{...c,x:p.x,y:p.y}:c;
 });
 const shifts=cells.filter(c=>{
  const was=original.get(c.id)!;
  return was.x!==c.x||was.y!==c.y;
 });
 if(!shifts.length)return null;
 const prohibited=new Set(graph.protectedVoids);
 const occupants=new Map<string,MaterialCell[]>();
 for(const cell of cells){
  const was=original.get(cell.id)!;
  if(!inside(cell.x,cell.y)||(
    (was.x!==cell.x||was.y!==cell.y)&&prohibited.has(key(cell))))return null;
  const slot=occupants.get(key(cell))??[];
  // Original authored overlays may move together, never multiply.
  if(slot.some(other=>{
   const older=original.get(other.id)!;
   return older.x!==was.x||older.y!==was.y;
  }))return null;
  slot.push(cell);occupants.set(key(cell),slot);
 }
 const byId=new Map(cells.map(c=>[c.id,c]));
 for(const link of graph.links){
  const a=byId.get(link.fromCellId??""),b=byId.get(link.toCellId??"");
  if(!a||!b||(a.x-b.x)**2+(a.y-b.y)**2>8)return null;
 }
 const relations=new Set<string>();
 const parents=new Map<string,string>();
 for(const link of graph.links){
  relations.add(link.fromTissueId+"|"+link.toTissueId);
  relations.add(link.toTissueId+"|"+link.fromTissueId);
  if(link.kind==="attachment")parents.set(link.fromTissueId,link.toTissueId);
 }
 // Adjacent surface contact with a REAL ancestor is permitted without
 // inventing a new fusion joint. Unrelated tissues still cannot start
 // touching as a consequence of this operator. The independent auditor
 // rederives this from the pre-event tissue hierarchy separately.
 for(const tissue of graph.tissues){
  const visited=new Set<string>([tissue.id]);
  let current=parents.get(tissue.id);
  while(current&&!visited.has(current)){
   relations.add(tissue.id+"|"+current);
   relations.add(current+"|"+tissue.id);
   visited.add(current);current=parents.get(current);
  }
  if(current)return null;
 }
 for(const moved of shifts){
  const old=original.get(moved.id)!;
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)
   for(const other of occupants.get((moved.x+dx)+","+(moved.y+dy))??[]){
    if(other.id===moved.id||other.tissueId===moved.tissueId||
      relations.has(moved.tissueId+"|"+other.tissueId))continue;
    const former=original.get(other.id)!;
    if(Math.max(Math.abs(old.x-former.x),Math.abs(old.y-former.y))>1)
     return null;
   }
 }
 // All tissues must remain 8-connected, including unchanged subregions.
 for(const tissue of graph.tissues){
  const group=cells.filter(c=>c.tissueId===tissue.id);
  if(!group.length)continue;
  const occupied=new Set(group.map(key)),seen=new Set<string>();
  const first=group[0],walk:LatticePoint[]=[{x:first.x,y:first.y}];
  seen.add(key(first));
  for(let i=0;i<walk.length;i++)for(let dy=-1;dy<=1;dy++)
   for(let dx=-1;dx<=1;dx++){
    if(!dx&&!dy)continue;
    const p={x:walk[i].x+dx,y:walk[i].y+dy},k=key(p);
    if(occupied.has(k)&&!seen.has(k)){seen.add(k);walk.push(p);}
   }
  if(seen.size!==occupied.size)return null;
 }
 if(anatomicalContinuityFailure(graph.sourceCells,cells,{
  links:graph.links,protectedVoids:graph.protectedVoids}))return null;
 return {cells,relocated:graph.cells.flatMap(c=>{
  const p=changed.get(c.id);
  return p&&(p.x!==c.x||p.y!==c.y)?
   [{cellId:c.id,from:{x:c.x,y:c.y},to:{x:p.x,y:p.y}}]:[];
 })};
}

/** A source-owned attached organ and its complete child hierarchy turn about
 * the same real joint; no copied pixels, pose sprites or temporary offspring. */
export function proposeArticulatedTurn(graph:MaterialGraph,tissueId:string,
 sign:1|-1):ArticulatedTurn|null{
 if(!tissueId||(sign!==1&&sign!==-1))
  throw new RangeError("Invalid source-owned articulated turn");
 const joint=graph.links.filter(l=>l.kind==="attachment"&&
   l.fromTissueId===tissueId&&l.fromCellId)
   .sort((a,b)=>compareIds(a.id,b.id))[0];
 if(!joint)return null;
 const pivotCell=graph.cells.find(c=>c.id===joint.fromCellId&&c.tissueId===tissueId);
 if(!pivotCell)return null;
 const pivot={x:pivotCell.x,y:pivotCell.y};
 const root=new Map(graph.cells.filter(c=>c.tissueId===tissueId).map(c=>
  [c.id,{x:pivot.x-sign*(c.y-pivot.y),
    y:pivot.y+sign*(c.x-pivot.x)}] as const));
 if(root.size<2)return null;
 const proposed=completeAttachedTransformation(graph,tissueId,root,{pivot,sign});
 return proposed?{...proposed,pivot}:null;
}

/** Physically shift one source-defined median half-sheet while carrying each
 * attached descendant through the displacement of its own live anchor. */
export function proposeRegionalSlip(graph:MaterialGraph,tissueId:string,
 direction:Readonly<{x:number;y:number}>):RegionalSlip|null{
 if(!tissueId||!directions.some(([x,y])=>direction.x===x&&direction.y===y))
  throw new RangeError("Invalid physical regional slip");
 const own=graph.cells.filter(c=>c.tissueId===tissueId);
 if(own.length<4)return null;
 const cross=direction.y===0?"y":"x";
 const levels=[...new Set(own.map(c=>c[cross]))].sort((a,b)=>a-b);
 if(levels.length<2)return null;
 const cut=levels[Math.floor((levels.length-1)/2)];
 const positive=direction.y===0?direction.x>0:direction.y>0;
 const band=own.filter(c=>positive?c[cross]<=cut:c[cross]>cut);
 if(!band.length||band.length===own.length)return null;
 const root=new Map(band.map(c=>[c.id,{
  x:c.x+direction.x,y:c.y+direction.y,
 }] as const));
 return completeAttachedTransformation(graph,tissueId,root);
}

/** Opposite perimeter thirds countertranslate around an unchanged central
 * source bridge. Child structures follow their individual anchor motion. */
export function proposeRegionalBend(graph:MaterialGraph,tissueId:string,
 direction:Readonly<{x:number;y:number}>):RegionalSlip|null{
 if(!tissueId||!directions.some(([x,y])=>direction.x===x&&direction.y===y))
  throw new RangeError("Invalid physical regional bend");
 const own=graph.cells.filter(c=>c.tissueId===tissueId);
 if(own.length<4)return null;
 const cross=direction.y===0?"y":"x";
 const levels=[...new Set(own.map(c=>c[cross]))].sort((a,b)=>a-b);
 if(levels.length<3)return null;
 const low=levels[Math.floor((levels.length-1)/3)];
 const high=levels[Math.ceil(2*(levels.length-1)/3)];
 if(low>=high)return null;
 const root=new Map<string,LatticePoint>();
 for(const c of own){
  const sign=c[cross]<=low?1:c[cross]>=high?-1:0;
  if(sign)root.set(c.id,{x:c.x+sign*direction.x,y:c.y+sign*direction.y});
 }
 return root.size>=2?completeAttachedTransformation(graph,tissueId,root):null;
}
