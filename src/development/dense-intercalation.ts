/**
 * Conservative lattice intercalation for mature, densely packed anatomy.
 *
 * Every occupied point along one connected tissue route advances into the
 * next point. The final cell enters a vacant, supported perimeter point and
 * the first cell's site becomes empty. Unlike single-cell long-distance
 * reflow, EVERY material identity moves no farther than one 8-neighbor
 * lattice step in one chronological event. No cells are added/deleted, and
 * no shape, species, hardcoded target, or semantic part is inferred.
 *
 * The independently written spatial-inventory auditor reconstructs the
 * directed transport chain from ORIGINAL cell identity + moved positions,
 * checks each consecutive edge and rejects broken, extra or forged moves.
 */
import type {MaterialCell,MaterialGraph} from "./material-graph";
import {isLatticeConnected} from "./lattice-connectivity";
import {anatomicalContinuityFailure} from "./anatomical-continuity";
type Point=Readonly<{x:number;y:number}>;
export type DenseIntercalation=Readonly<{
 cells:readonly MaterialCell[];
 relocated:readonly Readonly<{cellId:string;from:Point;to:Point}>[];
}>;
const key=(p:Point)=>p.x+","+p.y;
const inside=(p:Point)=>Number.isSafeInteger(p.x)&&Number.isSafeInteger(p.y)&&
 p.x>=0&&p.x<64&&p.y>=0&&p.y<64;
const dirs:readonly Point[]=[
 {x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1},
 {x:1,y:1},{x:-1,y:-1},{x:1,y:-1},{x:-1,y:1},
];
const axes=dirs.slice(0,4);
const near=(a:Point,b:Point)=>Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y))===1;
const lexical=(a:string,b:string)=>a<b?-1:a>b?1:0;

function connectedPath(available:ReadonlyMap<string,MaterialCell>,
 from:MaterialCell,to:Point):readonly Point[]|null{
 const queue:Point[]=[{x:from.x,y:from.y}];
 const parent=new Map<string,string|null>([[key(from),null]]);
 const end=key(to);
 for(let i=0;i<queue.length&&i<4096;i++){
  const p=queue[i];
  for(const d of dirs){
   const next={x:p.x+d.x,y:p.y+d.y},k=key(next);
   if(parent.has(k)||k!==end&&!available.has(k))continue;
   parent.set(k,key(p));
   if(k===end){
    const backwards:Point[]=[next];
    let current:string|null=key(p);
    while(current!==null){
     const [x,y]=current.split(",").map(Number);
     backwards.push({x,y});current=parent.get(current)??null;
    }
    backwards.reverse();
    return backwards.length>=4&&backwards.length<=65?backwards:null;
   }
   queue.push(next);
  }
 }
 return null;
}

export function proposeDenseIntercalation(graph:MaterialGraph,tissueId:string,
 direction:Point):DenseIntercalation|null{
 if(!tissueId||!axes.some(d=>d.x===direction.x&&d.y===direction.y))
  throw new RangeError("Invalid source-owned dense intercalation axis");
 const group=graph.cells.filter(c=>c.tissueId===tissueId);
 const source=graph.sourceCells.filter(c=>c.tissueId===tissueId);
 if(group.length<9||source.length<4)return null;
 const bins=new Map<string,MaterialCell[]>();
 for(const c of graph.cells){
  const slot=bins.get(key(c))??[];
  slot.push(c);bins.set(key(c),slot);
 }
 const anchored=new Set<string>();
 for(const s of graph.sites)anchored.add(s.rootCellId);
 for(const l of graph.links){
  if(l.fromCellId)anchored.add(l.fromCellId);
  if(l.toCellId)anchored.add(l.toCellId);
 }
 const movable=new Map<string,MaterialCell>();
 for(const c of group)if(!anchored.has(c.id)&&bins.get(key(c))?.length===1)
  movable.set(key(c),c);
 if(movable.size<4)return null;
 const own=new Set(group.map(key));
 const occupied=new Set(graph.cells.map(key));
 const protectedVoids=new Set(graph.protectedVoids);
 const linked=new Set<string>();
 for(const l of graph.links){
  linked.add(l.fromTissueId+"|"+l.toTissueId);
  linked.add(l.toTissueId+"|"+l.fromTissueId);
 }
 const dot=(p:Point)=>p.x*direction.x+p.y*direction.y;
 const lateral=(p:Point)=>p.x*(-direction.y)+p.y*direction.x;
 const donorSide={x:-direction.x,y:-direction.y};
 const donors=[...movable.values()].filter(c=>{
  if(own.has((c.x+donorSide.x)+","+(c.y+donorSide.y)))return false;
  return dirs.filter(d=>own.has((c.x+d.x)+","+(c.y+d.y))).length>=2;
 }).sort((a,b)=>dot(a)-dot(b)||lateral(a)-lateral(b)||lexical(a.id,b.id)).slice(0,16);
 if(!donors.length)return null;
 const targetCandidates=new Map<string,Point>();
 for(const c of movable.values())for(const step of dirs){
  const t={x:c.x+step.x,y:c.y+step.y},id=key(t);
  if(!inside(t)||occupied.has(id)||protectedVoids.has(id))continue;
  const supported=dirs.filter(d=>own.has((t.x+d.x)+","+(t.y+d.y)));
  if(supported.length<2||!supported.some(d=>d.x===0||d.y===0))continue;
  const foreign=graph.cells.some(other=>other.tissueId!==tissueId&&
   Math.max(Math.abs(other.x-t.x),Math.abs(other.y-t.y))<=1&&
   !linked.has(tissueId+"|"+other.tissueId));
  if(!foreign)targetCandidates.set(id,t);
 }
 const targets=[...targetCandidates.values()].sort((a,b)=>
  dot(b)-dot(a)||Math.abs(lateral(a))-Math.abs(lateral(b))||
  a.y-b.y||a.x-b.x).slice(0,24);
 for(const from of donors)for(const to of targets){
  if(dot(to)-dot(from)<3)continue;
  const path=connectedPath(movable,from,to);
  if(!path)continue;
  const moved=new Map<string,Point>();
  for(let i=0;i<path.length-1;i++){
   const c=movable.get(key(path[i]));
   if(!c||!near(path[i],path[i+1])){moved.clear();break;}
   moved.set(c.id,path[i+1]);
  }
  if(moved.size!==path.length-1)continue;
  const cells=graph.cells.map(c=>{
   const p=moved.get(c.id);
   return p?{...c,x:p.x,y:p.y}:c;
  });
  if(!isLatticeConnected(cells.filter(c=>c.tissueId===tissueId)))continue;
  if(anatomicalContinuityFailure(graph.sourceCells,cells,{
   links:graph.links,protectedVoids:graph.protectedVoids}))continue;
  const newPositions=new Set(cells.map(key));
  if(newPositions.has(key(from))||!newPositions.has(key(to)))continue;
  const relocated=graph.cells.flatMap(c=>{
   const p=moved.get(c.id);
   return p?[{cellId:c.id,from:{x:c.x,y:c.y},to:p}]:[];
  });
  return {cells,relocated};
 }
 return null;
}
