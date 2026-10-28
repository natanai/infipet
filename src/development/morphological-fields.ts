/**
 * MORPH-002: source-rooted physical growth fields, not a second renderer.
 *
 * Physical input is the current live lattice material and an ACTIVE tissue.
 * A field ranks one-cell material transactions; the caller independently
 * checks geometry/attachment/negative-space and journals the real operation.
 *
 * This adapts the older somatic/regional ideas of width:height, surface area,
 * and mass distribution into CAUSAL deposit proposals, never a target shape.
 *
 * Mathematical contract, for a tissue with N>0 live cells and centroid c:
 *   width=max(x)-min(x)+1, height=max(y)-min(y)+1,
 *   n(p)=|{a in tissue : ||p-a||_inf=1}|;
 *   thickening: U=(n(p)-1)/7 - ||p-c||_2/(2*world);
 *   width:     U=|p_x-c_x|/(width/2+1) - |p_y-c_y|/(height+1);
 *   height:    U=|p_y-c_y|/(height/2+1) - |p_x-c_x|/(width+1);
 *   surface:   U=(n(p)-1)/3 + 0.2*||p-c||_2/(max(width,height)+1);
 *   U+=0.10*(p-c) dot u(theta)/(max(width,height)+1)
 * where theta=2*pi*orbit.x/(p-1), p=65521 (exact recurrent integer).
 *
 * This is NOT a probability of producing a creature archetype. All fields
 * compete for ACTUAL adjacent source material; site- and seed-specific chaos
 * breaks ties without changing source identity.
 *
 * Complexity O(8N) candidate proposals, bounded by 64x64 world and existing
 * <=3072 added-cell rule. Exactly ONE output proposal per spent credit.
 */
import type {Point} from "../simulation/model";
import type {MaterialCell} from "./material-graph";
import {CHAOS_MODULUS,type ChaosState} from "./chaos";

export type MorphologicalField="thicken"|"width"|"height"|"surface";
export type MorphologicalProposal=Readonly<{
  parentId:string;
  destination:Readonly<Point>;
  mode:MorphologicalField;
  score:number;
  neighboringMaterial:number;
}>;

const world=64, key=(x:number,y:number)=>x+","+y;
const neighbors=[[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]] as const;
const signed=(a:number,b:number)=>a-b;
function validOrbit(orbit:ChaosState):void{
  if(!Number.isSafeInteger(orbit.x)||!Number.isSafeInteger(orbit.y)||
     orbit.x<0||orbit.y<0||orbit.x>=CHAOS_MODULUS||orbit.y>=CHAOS_MODULUS)
    throw new RangeError("Invalid permanent material-field chaos state");
}
/**
 * Per-credit family selection is a deterministic competition of inherited
 * developmental capacities and real chaos, NOT a stage/species lookup.
 * A null result is legitimate when expansion potential is below threshold.
 *
 * u=orbit.y/(p-1); w=[(1-m)*e,m*e,e*(.5+.5m),e];
 * mode chosen by cumulative normalized weights; no unbounded rejection loop.
 * Caller separately decides whether to allocate a credit to this system.
 */
export function chooseMorphologicalField(
 expansion:number,membrane:number,orbit:ChaosState,
):MorphologicalField|null{
 validOrbit(orbit);
 if(!Number.isFinite(expansion)||expansion<0||expansion>1||
    !Number.isFinite(membrane)||membrane<0||membrane>1)
   throw new RangeError("Invalid genetic material-field potential");
 if(expansion<0.12)return null;
 const weights=[expansion*(1-membrane),expansion*(.3+.7*membrane),
   expansion*(.3+.7*(1-membrane)),expansion*(.25+.75*membrane)];
 const total=weights.reduce((a,b)=>a+b,0);
 let target=(orbit.y/(CHAOS_MODULUS-1))*total;
 const modes:MorphologicalField[]=["thicken","width","height","surface"];
 for(let i=0;i<modes.length;i++){
   // Half-open nonzero-weight intervals: a zero-potential mode cannot win
   // solely because chaos lands exactly on a cumulative weight boundary.
   if(weights[i]<=0)continue;
   if(target<weights[i])return modes[i];
   target-=weights[i];
 }
 return modes[3];
}
/** Source-rooted whole-tissue carrying capacity; no species outcome.
 * A=permanent original source IDs in the current tissue (safe positive int).
 * Allometric expression mass=A+min(192,ceil(A*(4+8e+4m)/(1+(A/64)^2))).
 * Bounded by A+192, exact and deterministic at floating IEEE754 precision.
 * Existing global budget and occupancy can still reject every deposit. */
export function morphologicalVolumeCapacity(
 authoredArea:number,expansion:number,membrane:number,
):number{
 if(!Number.isSafeInteger(authoredArea)||authoredArea<1||authoredArea>4096||
    !Number.isFinite(expansion)||expansion<0||expansion>1||
    !Number.isFinite(membrane)||membrane<0||membrane>1)
   throw new RangeError("Invalid allometric material budget inputs");
 const inertia=1+(authoredArea/64)**2;
 return authoredArea+Math.min(192,
   Math.ceil(authoredArea*(4+8*expansion+4*membrane)/inertia));
}

export function rankMorphologicalField(
 live:readonly MaterialCell[],tissueId:string,mode:MorphologicalField,
 orbit:ChaosState,limit=24,
):readonly MorphologicalProposal[]{
 if(!Number.isSafeInteger(limit)||limit<1||limit>64)
   throw new RangeError("Field proposal cap must be within 1..64");
 validOrbit(orbit);
 if(!["thicken","width","height","surface"].includes(mode))
   throw new RangeError("Unknown morphological field");
 const cells=live.filter(c=>c.tissueId===tissueId);
 if(!cells.length||cells.length>4096)return [];
 const occupied=new Set(live.map(c=>key(c.x,c.y)));
 const minX=Math.min(...cells.map(c=>c.x)),maxX=Math.max(...cells.map(c=>c.x)),
   minY=Math.min(...cells.map(c=>c.y)),maxY=Math.max(...cells.map(c=>c.y));
 const width=maxX-minX+1,height=maxY-minY+1;
 const cx=cells.reduce((s,c)=>s+c.x,0)/cells.length,
   cy=cells.reduce((s,c)=>s+c.y,0)/cells.length;
 const theta=2*Math.PI*orbit.x/(CHAOS_MODULUS-1);
 const uv={x:Math.cos(theta),y:Math.sin(theta)};
 const parentByCandidate=new Map<string,{x:number;y:number;parents:MaterialCell[]}>();
 for(const c of cells)for(const [dx,dy] of neighbors){
   const x=c.x+dx,y=c.y+dy,k=key(x,y);
   if(x<0||y<0||x>=world||y>=world||occupied.has(k))continue;
   const candidate=parentByCandidate.get(k);
   if(candidate)candidate.parents.push(c);
   else parentByCandidate.set(k,{x,y,parents:[c]});
 }
 const candidates:MorphologicalProposal[]=[];
 for(const {x,y,parents} of parentByCandidate.values()){
   const dx=x-cx,dy=y-cy,n=parents.length;
   // Thickening specifically fills intra-tissue concavities, never a new tip.
   if(mode==="thicken"&&n<2)continue;
   const score=mode==="thicken"?
      (n-1)/7-Math.hypot(dx,dy)/(2*world):
     mode==="width"?
      Math.abs(dx)/(width/2+1)-Math.abs(dy)/(height+1):
     mode==="height"?
      Math.abs(dy)/(height/2+1)-Math.abs(dx)/(width+1):
      (n-1)/3+0.2*Math.hypot(dx,dy)/(Math.max(width,height)+1);
   const coherence=0.1*(dx*uv.x+dy*uv.y)/(Math.max(width,height)+1);
   const chosen=[...parents].sort((a,b)=>
     (a.id<b.id?-1:a.id>b.id?1:0))[0];
   candidates.push({parentId:chosen.id,destination:{x,y},mode,
     score:score+coherence,neighboringMaterial:n});
 }
 candidates.sort((a,b)=>b.score-a.score||
   b.neighboringMaterial-a.neighboringMaterial||
   a.destination.y-b.destination.y||a.destination.x-b.destination.x||
   (a.parentId<b.parentId?-1:a.parentId>b.parentId?1:0));
 return candidates.slice(0,limit);
}
export function proposeMorphologicalField(
 live:readonly MaterialCell[],tissueId:string,mode:MorphologicalField,
 orbit:ChaosState,
):MorphologicalProposal|null{
 return rankMorphologicalField(live,tissueId,mode,orbit,1)[0]??null;
}
