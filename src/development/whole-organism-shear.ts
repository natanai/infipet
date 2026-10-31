/**
 * Stage-specific coherent whole-organism lattice shear.
 *
 * A single physical deformation simultaneously translates one half-space
 * of ALL original and generated material identities by ONE cardinal cell;
 * the other half-space remains stationary. The half-space is determined by
 * the pre-event living occupied-tier median, never from a target monster
 * silhouette. It applies to every tissue and its attached descendants,
 * including typed eyes/limbs and Body-only animals, plants or fantasy shapes.
 *
 * x' = x + d_x I(cross(c) in moving half), y' analogously.
 * Source IDs, exact pixels, z, pigment, part names, links and every material
 * identity remain unchanged. Candidate requires a strict injection on
 * occupied locations, original cavity protection, coherent source material,
 * all 8-connected tissue components, original attached links, and absence
 * of newly created unrelated tissue contact. Any failure returns null.
 *
 * The independent physical journal rederives the *entire* affine material
 * field from the PRIOR graph, not from a producer-chosen movement subset.
 */
import type {MaterialGraph,MaterialCell} from "./material-graph";
import {anatomicalContinuityFailure} from "./anatomical-continuity";
import {isLatticeConnected} from "./lattice-connectivity";

type Point=Readonly<{x:number;y:number}>;
const keys=(p:Point)=>p.x+","+p.y;
const cardinal:readonly Point[]=[{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}];
export type WholeOrganismShear=Readonly<{
 cells:readonly MaterialCell[];
 relocated:readonly Readonly<{cellId:string;from:Point;to:Point}>[];
}>;
export function proposeWholeOrganismShear(graph:MaterialGraph,
  direction:Point):WholeOrganismShear|null{
 if(!cardinal.some(d=>d.x===direction.x&&d.y===direction.y))
  throw new RangeError("Noncardinal source-owned whole-organism shear");
 if(graph.cells.length<8||graph.cells.length>4096)return null;
 const cross=direction.x!==0?"y":"x";
 const tiers=[...new Set(graph.cells.map(c=>c[cross]))].sort((a,b)=>a-b);
 if(tiers.length<3)return null;
 const cut=tiers[Math.floor((tiers.length-1)/2)];
 const positive=direction.x+direction.y>0;
 const moving=(c:MaterialCell)=>positive?c[cross]>cut:c[cross]<=cut;
 const movable=graph.cells.filter(moving);
 if(movable.length<4||movable.length===graph.cells.length||movable.length>2048)return null;
 const prior=new Map(graph.cells.map(c=>[c.id,c]));
 const voids=new Set(graph.protectedVoids);
 const originalOverlay=new Map<string,Set<string>>();
 for(const c of graph.cells){
  const p=keys(c),v=originalOverlay.get(p)??new Set<string>();
  v.add(c.id);originalOverlay.set(p,v);
 }
 const cells=graph.cells.map(c=>moving(c)?{
  ...c,x:c.x+direction.x,y:c.y+direction.y,
 }:c);
 const destination=new Map<string,Set<string>>();
 for(const c of cells){
  const original=prior.get(c.id)!;
  if(c.x<0||c.x>=64||c.y<0||c.y>=64||
    (moving(original)&&voids.has(keys(c))))return null;
  const p=keys(c),members=destination.get(p)??new Set<string>();
  members.add(c.id);destination.set(p,members);
 }
 for(const ids of destination.values()){
  if(ids.size<=1)continue;
  const [first]=ids;
  const oldPosition=keys(prior.get(first)!);
  if([...ids].some(id=>keys(prior.get(id)!)!==oldPosition))
    return null;
 }
 const now=new Map(cells.map(c=>[c.id,c]));
 for(const link of graph.links){
  const a=now.get(link.fromCellId??""),b=now.get(link.toCellId??"");
  if(!a||!b||(a.x-b.x)**2+(a.y-b.y)**2>8)return null;
 }
 const groups=new Map<string,MaterialCell[]>();
 for(const c of cells){
  const arr=groups.get(c.tissueId)??[];
  arr.push(c);groups.set(c.tissueId,arr);
 }
 for(const arr of groups.values())if(!isLatticeConnected(arr))return null;
 const parents=new Map<string,string>(),related=new Set<string>();
 for(const l of graph.links){
  related.add(l.fromTissueId+"|"+l.toTissueId);
  related.add(l.toTissueId+"|"+l.fromTissueId);
  if(l.kind==="attachment")parents.set(l.fromTissueId,l.toTissueId);
 }
 for(const t of graph.tissues){
  const visited=new Set<string>([t.id]);
  let parent=parents.get(t.id);
  while(parent&&!visited.has(parent)){
   related.add(t.id+"|"+parent);
   related.add(parent+"|"+t.id);
   visited.add(parent);parent=parents.get(parent);
  }
  if(parent)return null;
 }
 const bins=new Map<string,MaterialCell[]>();
 for(const c of cells){
  const arr=bins.get(keys(c))??[];arr.push(c);bins.set(keys(c),arr);
 }
 for(const c of movable){
  const p=now.get(c.id)!;
  for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)
   for(const other of bins.get((p.x+dx)+","+(p.y+dy))??[]){
    if(other.id===c.id||other.tissueId===c.tissueId||
     related.has(c.tissueId+"|"+other.tissueId))continue;
    const was=prior.get(other.id)!;
    if(Math.max(Math.abs(c.x-was.x),Math.abs(c.y-was.y))>1)
     return null;
   }
 }
 if(anatomicalContinuityFailure(graph.sourceCells,cells,{
  links:graph.links,protectedVoids:graph.protectedVoids}))return null;
 return {cells,relocated:movable.map(c=>({
  cellId:c.id,from:{x:c.x,y:c.y},
  to:{x:c.x+direction.x,y:c.y+direction.y},
 }))};
}
