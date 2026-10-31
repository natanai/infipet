/**
 * Material-only articulation for a PLAYER'S UNLABELED connected drawing.
 *
 * Birth material determines a permanent source-defined hinge and distal
 * source ID. The present LIVING tissue must still have the corresponding
 * articulation (including any chronologically grown cells). One entire
 * connected component may rotate exactly 90° around the unchanged hinge.
 * No authored part kind is inferred or created. No sprite target exists.
 *
 * Input: physical prior graph, source tissue, permanent hinge & distal IDs,
 * and a 1|-1 turn. Output: precisely conserved identities at new lattice
 * sites or null. Attached other tissues are intentionally NOT moved by this
 * operator. Such anatomy uses the separate verified joint/subtree operators.
 * The independent inventory calculates the component and transform again.
 */
import type {MaterialCell,MaterialGraph} from "./material-graph";
import {anatomicalContinuityFailure} from "./anatomical-continuity";
import {isLatticeConnected} from "./lattice-connectivity";
type Point=Readonly<{x:number;y:number}>;
const key=(p:Point)=>p.x+","+p.y;
const cmp=(a:string,b:string)=>a<b?-1:a>b?1:0;
const within=(p:Point)=>Number.isSafeInteger(p.x)&&Number.isSafeInteger(p.y)&&
 p.x>=0&&p.x<64&&p.y>=0&&p.y<64;
const adjacent=(a:Point,b:Point)=>Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y))<=1;
function components(cells:readonly MaterialCell[]):MaterialCell[][]{
 const pending=new Map(cells.map(c=>[c.id,c])),all:MaterialCell[][]=[];
 while(pending.size){
  const first=[...pending.values()].sort((a,b)=>cmp(a.id,b.id))[0];
  const group=[first];pending.delete(first.id);
  for(let i=0;i<group.length;i++)for(const other of [...pending.values()])
   if(adjacent(group[i],other)){pending.delete(other.id);group.push(other);}
  all.push(group.sort((a,b)=>cmp(a.id,b.id)));
 }
 return all;
}
export type SourceLobe=Readonly<{hingeId:string;distalId:string;size:number}>;
export function sourceLobeHinges(graph:MaterialGraph,tissueId:string):
 readonly SourceLobe[]{
 const cells=graph.sourceCells.filter(c=>c.tissueId===tissueId);
 // Original material alone, not later mass and not a semantic part label.
 if(cells.length<6||cells.length>256||!isLatticeConnected(cells))return [];
 const results:SourceLobe[]=[];
 for(const hinge of cells){
  const groups=components(cells.filter(c=>c.id!==hinge.id));
  if(groups.length<2)continue;
  const large=groups.filter(g=>g.length>=2);
  if(large.length<2)continue;
  for(const segment of large){
   // A genuine subordinate lobe must leave an independently substantial
   // stationary host rather than rotating practically the whole drawing.
   if(segment.length>Math.floor((cells.length-1)*0.48))continue;
   results.push({hingeId:hinge.id,
    distalId:segment[0].id,size:segment.length});
  }
 }
 return results.sort((a,b)=>b.size-a.size||
  cmp(a.hingeId,b.hingeId)||cmp(a.distalId,b.distalId));
}
export type LobeTurn=Readonly<{
 cells:readonly MaterialCell[];
 relocated:readonly Readonly<{cellId:string;from:Point;to:Point}>[];
}>;
export function proposeSourceLobeTurn(graph:MaterialGraph,tissueId:string,
 hingeId:string,distalId:string,sign:1|-1):LobeTurn|null{
 if(!tissueId||!hingeId||!distalId||(sign!==1&&sign!==-1))
  throw new RangeError("Invalid permanent source lobe articulation");
 const original=graph.sourceCells;
 if(!original.some(c=>c.id===hingeId&&c.tissueId===tissueId)||
  !original.some(c=>c.id===distalId&&c.tissueId===tissueId))return null;
 // Multi-tissue authorial and generated attachments have their own exact
 // couplings and are not silently pulled through an internal hinge.
 if(graph.links.some(l=>l.toTissueId===tissueId&&
  l.fromTissueId!==tissueId))return null;
 const own=graph.cells.filter(c=>c.tissueId===tissueId);
 const hinge=own.find(c=>c.id===hingeId);
 if(!hinge||!own.some(c=>c.id===distalId)||own.length<6)return null;
 const groups=components(own.filter(c=>c.id!==hingeId));
 if(groups.length<2)return null;
 const component=groups.find(g=>g.some(c=>c.id===distalId));
 if(!component||component.length<2||
  own.length-component.length-1<2||
  component.length>Math.floor((own.length-1)*0.48))return null;
 const moving=new Set(component.map(c=>c.id));
 const old=new Map(graph.cells.map(c=>[c.id,c]));
 const cells=graph.cells.map(c=>{
  if(!moving.has(c.id))return c;
  const dx=c.x-hinge.x,dy=c.y-hinge.y;
  return {...c,x:hinge.x-sign*dy,y:hinge.y+sign*dx};
 });
 const occupancy=new Map<string,MaterialCell[]>();
 for(const cell of cells){
  const before=old.get(cell.id)!;
  if(!within(cell)||moving.has(cell.id)&&
    graph.protectedVoids.includes(key(cell)))return null;
  const at=occupancy.get(key(cell))??[];
  if(at.some(other=>{
   const a=old.get(other.id)!;
   return a.x!==before.x||a.y!==before.y;
  }))return null;
  at.push(cell);occupancy.set(key(cell),at);
 }
 for(const tissue of graph.tissues){
  const g=cells.filter(c=>c.tissueId===tissue.id);
  if(g.length&&!isLatticeConnected(g))return null;
 }
 const byId=new Map(cells.map(c=>[c.id,c]));
 for(const link of graph.links){
  const a=byId.get(link.fromCellId??""),b=byId.get(link.toCellId??"");
  if(!a||!b||(a.x-b.x)**2+(a.y-b.y)**2>8)return null;
 }
 const relocated=component.flatMap(c=>{
  const after=byId.get(c.id)!;
  return after.x!==c.x||after.y!==c.y?
   [{cellId:c.id,from:{x:c.x,y:c.y},to:{x:after.x,y:after.y}}]:[];
 });
 if(!relocated.length)return null;
 if(anatomicalContinuityFailure(graph.sourceCells,cells,{
  links:graph.links,protectedVoids:graph.protectedVoids}))return null;
 return {cells,relocated};
}
