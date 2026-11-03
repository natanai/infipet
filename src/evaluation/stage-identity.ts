/**
 * Independent five-stage structural contrast evaluator (experimental).
 * Inputs: two already-verified physical material graphs from a single pet.
 * Outputs: translation- and uniform-scale-normalized silhouette difference,
 * persistent source-pair reorganization and real reparenting of OLD tissues.
 *
 * This module NEVER imports the growth/remodeling producer and NEVER paints
 * pixels. A new branch, mass gain, species-like label or rigid display pose
 * alone cannot pass. It is a mathematical oracle, not an adult-shape target.
 */
import type {MaterialGraph,MaterialCell} from "../development/material-graph";

const key=(x:number,y:number)=>x+","+y;
const normalized=(cells:readonly MaterialCell[]):ReadonlySet<string>=>{
 const coords=new Map<string,Readonly<{x:number;y:number}>>();
 for(const c of cells)coords.set(key(c.x,c.y),{x:c.x,y:c.y});
 const points=[...coords.values()];
 if(!points.length)return new Set();
 const mx=points.reduce((sum,p)=>sum+p.x,0)/points.length;
 const my=points.reduce((sum,p)=>sum+p.y,0)/points.length;
 const radius=Math.sqrt(points.length/Math.PI);
 // Physical coordinates stay 64x64; only this independent measurement
 // projects onto a deterministic canonical 32x32 comparison lattice.
 const projected=new Set<string>();
 for(const p of points){
  const x=Math.round(15.5+2*(p.x-mx)/radius);
  const y=Math.round(15.5+2*(p.y-my)/radius);
  if(x>=0&&y>=0&&x<32&&y<32)projected.add(key(x,y));
 }
 return projected;
};
function median(values:readonly number[]):number{
 if(!values.length)return NaN;
 const sorted=values.slice().sort((a,b)=>a-b),half=Math.floor(sorted.length/2);
 return sorted.length%2?sorted[half]:(sorted[half-1]+sorted[half])/2;
}
/** Translation, quarter-turn and uniform scale cannot change this metric. */
function sourcePairReorganization(before:MaterialGraph,after:MaterialGraph){
 const old=new Map(before.cells.map(c=>[c.id,c]));
 const now=new Map(after.cells.map(c=>[c.id,c]));
 const candidates=before.sourceCells.filter(c=>old.has(c.id)&&now.has(c.id))
  .map(c=>c.id).sort();
 const stride=Math.max(1,Math.ceil(candidates.length/48));
 const selected=candidates.filter((_,i)=>i%stride===0).slice(0,48);
 if(selected.length<3)return {fraction:0,pairs:0,resolved:false};
 const pairs:Readonly<{before:number;after:number}>[]=[];
 for(let i=0;i<selected.length;i++)for(let j=0;j<i;j++){
  const a=old.get(selected[i])!,b=old.get(selected[j])!;
  const c=now.get(selected[i])!,d=now.get(selected[j])!;
  const first=Math.hypot(a.x-b.x,a.y-b.y);
  const last=Math.hypot(c.x-d.x,c.y-d.y);
  if(first>0&&last>0)pairs.push({before:first,after:last});
 }
 const m0=median(pairs.map(p=>p.before));
 const m1=median(pairs.map(p=>p.after));
 if(!Number.isFinite(m0)||!Number.isFinite(m1)||m0<=0||m1<=0)
  return {fraction:0,pairs:pairs.length,resolved:false};
 const changed=pairs.filter(p=>Math.abs(p.before/m0-p.after/m1)>=0.1).length;
 return {fraction:changed/pairs.length,pairs:pairs.length,resolved:true};
}
export type StageIdentityContrast=Readonly<{
 normalizedSilhouetteDifference:number;
 originalSourcePairReorganization:number;
 comparedSourcePairs:number;
 preexistingReparenting:boolean;
 eligible:boolean;
 substantiallyDifferent:boolean;
}>;
export function measureStageIdentity(before:MaterialGraph,after:MaterialGraph):
 StageIdentityContrast{
 if(!before.cells.length||!after.cells.length)
  return {normalizedSilhouetteDifference:0,originalSourcePairReorganization:0,
   comparedSourcePairs:0,preexistingReparenting:false,eligible:false,
   substantiallyDifferent:false};
 const a=normalized(before.cells),b=normalized(after.cells);
 let intersection=0;
 for(const k of a)if(b.has(k))intersection++;
 const union=a.size+b.size-intersection;
 const shape=union?1-intersection/union:0;
 const existing=new Map(before.tissues.map(t=>[t.id,t.parentId]));
 const reparented=after.tissues.some(t=>
  existing.has(t.id)&&existing.get(t.id)!==t.parentId);
 const pair=sourcePairReorganization(before,after);
 const eligible=(pair.resolved||reparented)&&union>0;
 return {normalizedSilhouetteDifference:shape,
  originalSourcePairReorganization:pair.fraction,
  comparedSourcePairs:pair.pairs,
  preexistingReparenting:reparented,eligible,
  substantiallyDifferent:eligible&&shape>=0.18&&
   (pair.fraction>=0.10||reparented)};
}
