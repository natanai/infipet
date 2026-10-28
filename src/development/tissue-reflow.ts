/**
 * Source-conserving tissue reflow (MORPH-004).
 *
 * Moves ONE existing cell identity from a weakly supported boundary to a
 * different, well-supported boundary. Its old coordinate becomes EMPTY:
 * S_after=(S_before\\{from}) U {to}; |S_after|=|S_before|.
 * A complete 8-neighbour path must pass through pre-existing live material of
 * the SAME tissue (except for its final empty site). This is biological
 * intercalation/redistribution, not an instantaneous render warp.
 *
 * Inputs: a committed physical graph, a permanently inherited cardinal axis.
 * Output: a deterministic finite transaction proposal or null.
 * Complexity: O(N + 32*24*8) per accepted/rejected candidate; bounded 64x64.
 * No target species, invented pigment, new physical cell or time reads.
 */
import type {MaterialCell,MaterialGraph} from "./material-graph";
type Point=Readonly<{x:number;y:number;z?:number}>;
export type TissueReflow=Readonly<{
  cells:readonly MaterialCell[];
  relocated:Readonly<{cellId:string;from:Point;to:Point;path:readonly Point[]}>;
}>;
const pos=(p:Point)=>p.x+","+p.y;
const valid=(p:Point)=>Number.isInteger(p.x)&&Number.isInteger(p.y)&&p.x>=0&&p.x<64&&p.y>=0&&p.y<64;
const dirs:readonly Point[]=[{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}];
const near=(a:Point,b:Point)=>Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y))===1;
const steps=dirs.concat([{x:1,y:1},{x:1,y:-1},{x:-1,y:1},{x:-1,y:-1}]);
function connected(cells:readonly MaterialCell[]):boolean{
 if(!cells.length)return false;
 const lookup=new Set(cells.map(pos)),seen=new Set([pos(cells[0])]),q:Point[]=[cells[0]];
 for(let i=0;i<q.length;i++)for(const d of steps){
  const p={x:q[i].x+d.x,y:q[i].y+d.y},key=pos(p);
  if(lookup.has(key)&&!seen.has(key)){seen.add(key);q.push(p);}
 }
 return seen.size===lookup.size;
}
function route(tissue:ReadonlySet<string>,from:Point,to:Point):Point[]|null{
 const q:Point[]=[from],prev=new Map<string,string|null>([[pos(from),null]]);
 const end=pos(to);
 for(let i=0;i<q.length;i++){
  if(i>=4096)break;
  const p=q[i];
  for(const d of steps){
   const n={x:p.x+d.x,y:p.y+d.y},k=pos(n);
   if(prev.has(k)||!(tissue.has(k)||k===end))continue;
   prev.set(k,pos(p));
   if(k===end){
    const rev:Point[]=[to];let cur:string|null=pos(p);
    while(cur!==null){const [x,y]=cur.split(",").map(Number);rev.push({x,y});cur=prev.get(cur)??null;}
    rev.reverse();return rev.length<=25?rev:null;
   }
   q.push(n);
  }
 }
 return null;
}
export function proposeTissueReflow(graph:MaterialGraph,tissueId:string,
 direction:Point):TissueReflow|null{
 if(!tissueId||!dirs.some(d=>d.x===direction.x&&d.y===direction.y))
  throw new RangeError("Invalid tissue reflow axis");
 const group=graph.cells.filter(c=>c.tissueId===tissueId);
 const source=graph.sourceCells.filter(c=>c.tissueId===tissueId);
 if(group.length<9||source.length<9)return null;
 const occupied=new Set(graph.cells.map(pos)),own=new Set(group.map(pos));
 const anchored=new Set(graph.sites.filter(s=>s.tissueId===tissueId).map(s=>s.rootCellId));
 for(const l of graph.links){if(l.fromCellId)anchored.add(l.fromCellId);if(l.toCellId)anchored.add(l.toCellId);}
 const linked=new Set(graph.links.flatMap(l=>l.fromTissueId===tissueId?[l.toTissueId]:l.toTissueId===tissueId?[l.fromTissueId]:[]));
 const blocked=new Set(graph.protectedVoids),foreign=new Set<string>();
 for(const c of graph.cells)if(c.tissueId!==tissueId&&!linked.has(c.tissueId))
  for(const d of [...steps,{x:0,y:0}])foreign.add((c.x+d.x)+","+(c.y+d.y));
 const dot=(p:Point)=>p.x*direction.x+p.y*direction.y;
 const lateral=(p:Point)=>p.x*(-direction.y)+p.y*direction.x;
 const at=(x:number,y:number)=>own.has(x+","+y);
 // Donors must be exposed on the receding side and must not carry an
 // attachment or growth-site identity. The 8-connected source cannot tear.
 // Select the receding ORTHOGONAL flank: transferring mass from height
 // to width (or vice versa) changes whole-tissue aspect, not just position.
 const donorAxis={x:-direction.y,y:direction.x};
 // Preserve source identity through complete provenance, rather than a
 // quota of stationary coordinates. Reflow conserves every live identity;
 // the independent journal additionally proves its exact physical route.
 const authored=new Set(graph.sourceCells.map(c=>c.id));
 if(group.some(c=>!c.sourceIds.length||c.sourceIds.some(id=>!authored.has(id))))return null;
 const donors=group.filter(c=>!anchored.has(c.id)&&
  !at(c.x-donorAxis.x,c.y-donorAxis.y)&&
  group.length>1&&connected(group.filter(other=>other.id!==c.id)))
  .sort((a,b)=>lateral(a)-lateral(b)||dot(a)-dot(b)||
    (a.id<b.id?-1:a.id>b.id?1:0)).slice(0,24);
 if(!donors.length)return null;
 const possibilities=new Map<string,Point>();
 for(const c of group)for(const d of steps){
  const target={x:c.x+d.x,y:c.y+d.y},k=pos(target);
  if(valid(target)&&!occupied.has(k)&&!blocked.has(k)&&!foreign.has(k))
   possibilities.set(k,target);
 }
 const targets=[...possibilities.values()].filter(p=>{
  let support=0,orthogonal=0;
  for(const d of steps)if(own.has((p.x+d.x)+","+(p.y+d.y))){
   support++;if(d.x===0||d.y===0)orthogonal++;
  }
  return support>=2&&orthogonal>=1;
 }).sort((a,b)=>dot(b)-dot(a)||Math.abs(lateral(a))-Math.abs(lateral(b))||
   a.y-b.y||a.x-b.x).slice(0,32);
 for(const from of donors)for(const to of targets){
  if(dot(to)-dot(from)<2)continue; // Distinguish reflow from a local tip.
  const path=route(own,from,to);
  if(!path)continue;
  const cells=graph.cells.map(c=>c.id===from.id?{...c,x:to.x,y:to.y}:c);
  if(!connected(cells.filter(c=>c.tissueId===tissueId)))continue;
  const byId=new Map(cells.map(c=>[c.id,c]));
  if(graph.links.some(l=>{
   const a=l.fromCellId?byId.get(l.fromCellId):undefined;
   const b=l.toCellId?byId.get(l.toCellId):undefined;
   return !a||!b||(a.x-b.x)**2+(a.y-b.y)**2>8;
  }))continue;
  return {cells,relocated:{cellId:from.id,
   from:{x:from.x,y:from.y,...(from.z===undefined?{}:{z:from.z})},
   to:{...to,...(from.z===undefined?{}:{z:from.z})},
   path:path.map(p=>({...p,...(from.z===undefined?{}:{z:from.z})}))}};
 }
 return null;
}
