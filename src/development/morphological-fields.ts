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
 *
 * Daily regional tensor mode additionally requires >=2 neighboring cells
 * once a region has >=3 cells. Rotate (p-c) into permanent unit axis (u,v),
 * L=width+height, a=stretch in [1/16,16], P=(u/(L*sqrt(a)))^2+
 * (v/(L/sqrt(a)))^2. U=(n-1)/4 - j*P + .25*|u or v|/(L+1),
 * j=1 for thickening, 2 for surface, 3 for axial surface fields. The last
 * directional term now weighs 2.4 (formerly 0.25) for genuine whole-region\n * proportional growth rather than repeated generic filling. Same bounded chaotic
 * coherence breaks ties. No selected field creates material by itself.
 * Once a physical repatterning wave expresses, U additionally subtracts
 * 4*E(p) for that source-owned developmental potential. Growth therefore
 * follows the expressed field rather than refilling a retired body plan.
 * Already BRUSH-SELECTED or physically gene-differentiated tissue can add
 * -0.28*specializationRank to its physical site score, so even later whole-
 * body phases cannot indiscriminately stretch eyes into limb-like stalks.
 * This never relabels source material or bypasses the mechanical gate.
 */
import type {Point,PartKind} from "../simulation/model";
import {createSpecializationRank} from "./specialization-front";
import type {MaterialCell} from "./material-graph";
import {CHAOS_MODULUS,type ChaosState} from "./chaos";
import {repatterningPotential,type RepatterningField} from "./developmental-repatterning";

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
 * Allometric expression mass=A+min(384,ceil(A*(4+8e+4m)/(1+(A/128)^2))).
 * Bounded by A+384, exact and deterministic at floating IEEE754 precision.
 * Area inertia acts on a 128-cell regional scale. Broad unlabeled ink must
 * have actual transverse capacity too; dividing by a 64-cell scale previously
 * suppressed it merely because it was authored as one continuous region.
 * Existing global budget and occupancy can still reject every deposit. */
export function morphologicalVolumeCapacity(
 authoredArea:number,expansion:number,membrane:number,
):number{
 if(!Number.isSafeInteger(authoredArea)||authoredArea<1||authoredArea>4096||
    !Number.isFinite(expansion)||expansion<0||expansion>1||
    !Number.isFinite(membrane)||membrane<0||membrane>1)
   throw new RangeError("Invalid allometric material budget inputs");
 const inertia=1+(authoredArea/128)**2;
 return authoredArea+Math.min(384,
   Math.ceil(authoredArea*(4+8*expansion+4*membrane)/inertia));
}

export function rankMorphologicalField(
 live:readonly MaterialCell[],tissueId:string,mode:MorphologicalField,
 orbit:ChaosState,limit=24,
 tensor?:Readonly<{axis:Readonly<Point>;stretch:number}>,
  developmentalField?:RepatterningField,
  anatomicalKind?:Readonly<{kind:PartKind;direction:Readonly<Point>}>,
):readonly MorphologicalProposal[]{
 if(!Number.isSafeInteger(limit)||limit<1||limit>64)
   throw new RangeError("Field proposal cap must be within 1..64");
 validOrbit(orbit);
 if(tensor&&(![tensor.axis.x,tensor.axis.y,tensor.stretch].every(Number.isFinite)||
    Math.abs(Math.hypot(tensor.axis.x,tensor.axis.y)-1)>1e-8||
    tensor.stretch<1/16||tensor.stretch>16))
  throw new RangeError("Invalid regional field tensor");
 if(!["thicken","width","height","surface"].includes(mode))
   throw new RangeError("Unknown morphological field");
 const cells=live.filter(c=>c.tissueId===tissueId);
 if(!cells.length||cells.length>4096)return [];
 const specialized=anatomicalKind?createSpecializationRank(
   anatomicalKind.kind,cells,anatomicalKind.direction):null;
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
   if((mode==="thicken"||tensor&&cells.length>=3)&&n<2)continue;
   const u=tensor?dx*tensor.axis.x+dy*tensor.axis.y:dx,
    v=tensor?-dx*tensor.axis.y+dy*tensor.axis.x:dy;
   // A quadratic material-pressure field fills supported fronts before
   // pursuing their distant tips. Anisotropy persists for the individual
   // region instead of washing out as width/height are resampled each day.
   const stretch=tensor?.stretch??1;
   const pressure=(u/((width+height)*Math.sqrt(stretch)))**2+
    (v/((width+height)/Math.sqrt(stretch)))**2;
   const score=tensor?
      (n-1)/4-pressure*(mode==="thicken"?1:
       mode==="surface"?2:3)+
      // Allometric selection must compete with neighbor-thickening.
      // The old 0.25 factor was too weak to distribute material away
      // from the centroid, so repeatedly reinforced the same body outline.
      // These are legal PHYSICAL frontier choices, never display warps.
      (mode==="width"?2.4*Math.abs(u)/(width+height+1):
       mode==="height"?2.4*Math.abs(v)/(width+height+1):0):mode==="thicken"?
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
     score:score+coherence-
       (developmentalField?4*repatterningPotential({x,y},developmentalField):0)-
       (specialized?0.28*specialized({x,y}):0),
     neighboringMaterial:n});
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
