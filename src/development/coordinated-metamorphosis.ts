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
 const candidates=group.flatMap(c=>{
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
 const free=3072-graph.cells.filter(c=>c.provenance==="generated").length;
 const chosen=candidates.slice(0,Math.max(0,Math.min(limit,free)));
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
