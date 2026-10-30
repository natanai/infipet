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
   l.fromTissueId===tissueId&&l.fromCellId).sort((a,b)=>a.id.localeCompare(b.id))[0];
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
