/**
 * Regional expression of the existing daily growth grammar (MORPH-005).
 * These are game-model laws, not empirical biological parameter estimates.
 * No new clock, cells, genome or renderer lives here.
 *
 * Inputs: permanent channels, original/live regional mass, registered site
 * count, immutable regional torus phase and current bounded daily forcing.
 * Outputs: positive competition weight, operator choice and a growth tensor.
 * Number arithmetic is finite IEEE754; torus state is exact integer 0..65520.
 * The caller advances the existing site orbit once per opportunity, including
 * dormant/blocked days. All geometry still goes through its placement auditor.
 *
 * Regional demand w=A^.65/[S*(1+N/C)^2], with S competing sites in this tissue,
 * C the permanent volume capacity. This gives an entire region a share rather
 * than rewarding the number of tips/facial marks it happened to have at birth.
 * All live regions retain strictly positive demand; no operator is disabled.
 *
 * Daily grammar rates: surface=4e(.5+.5m)(.5+.5rest),
 * axial=l(.5+.5activity), branch=b(.5+.5security), normalized to sum one.
 * Zero potential contributes zero rate. A blocked selected surface is a null
 * proposal, never converted to a convenient tendril or fabricated anatomy.
 *
 * Daily allometry uses the five named developmental epochs with bounded
 * region-local aspect in [1/8,8]; chronological rest/activity biases actual
 * expression, not the permanent genome. The available region, not a species
 * template, determines the physically legal next boundary position.
 * The earlier single-tensor primitive remains available to mathematical
 * clients but no longer governs the daily player growth field.
 */
import type {DevelopmentalChannels} from "../genetics";
import {CHAOS_MODULUS,type ChaosState} from "./chaos";
import {hash} from "../simulation/model";
import {developmentalStageIndex,stageAtCheck,transitionPressure,
  STAGE_PRESSURE_WEIGHTS} from "./stage-contract";

export const REGIONAL_GROWTH_VERSION="coherent-drawn-development-v13" as const;
/** A new bud receives the square-root material scale of its birth region,
 * rather than being permanently starved as a one-cell birth drawing. The
 * genome, four-credit competition and all material caps remain unchanged. */
export function regionalSourceScale(own:number,origin:number,generated:boolean):number{
 if(![own,origin].every(v=>Number.isSafeInteger(v)&&v>=1&&v<=4096))throw new RangeError("Invalid regional source scale");
 return generated?Math.max(own,Math.ceil(Math.sqrt(origin))):own;
}
const bounded=(v:number)=>Number.isFinite(v)&&v>=0&&v<=1;
export function regionalGrowthDemand(authored:number,live:number,sites:number,capacity:number):number{
 if(![authored,live,sites,capacity].every(Number.isSafeInteger)||
    authored<1||authored>4096||live<1||live>4096||sites<1||sites>4096||
    capacity<authored||capacity>8192)
  throw new RangeError("Invalid regional growth demand");
 return authored**0.65/(sites*(1+live/capacity)**2);
}
export type RegionalCare=Readonly<{rest:number;activity:number;security:number}>;
export function selectRegionalGrammar(c:DevelopmentalChannels,orbit:ChaosState,
 care:RegionalCare,canBranch:boolean):"surface"|"branch"|"axial"|null{
 const e=c.growth.expansion,l=c.growth.elongation,m=c.support.membrane,
  b=c.branching.initiation;
 if(![e,l,m,b,care.rest,care.activity,care.security].every(bounded)||
  ![orbit.x,orbit.y].every(v=>Number.isSafeInteger(v)&&v>=0&&v<CHAOS_MODULUS))
  throw new RangeError("Invalid regional grammar input");
 const surface=e<0.12?0:4*e*(.5+.5*m)*(.5+.5*care.rest),
  axial=l*(.5+.5*care.activity),branch=canBranch?b*(.5+.5*care.security):0;
 const total=surface+axial+branch;
 if(total===0)return null;
 const u=orbit.x/CHAOS_MODULUS*total;
 return u<surface?"surface":u<surface+branch?"branch":"axial";
}
export function regionalGrowthTensor(c:DevelopmentalChannels,phase:ChaosState){
 if(![c.growth.elongation,c.growth.expansion].every(bounded)||
    ![phase.x,phase.y].every(v=>Number.isSafeInteger(v)&&v>=0&&v<CHAOS_MODULUS))
  throw new RangeError("Invalid regional growth tensor");
 const angle=2*Math.PI*phase.y/(CHAOS_MODULUS-1);
 return {axis:{x:Math.cos(angle),y:Math.sin(angle)},
  stretch:2**(3*(c.growth.elongation-c.growth.expansion)+
    2*(phase.x/(CHAOS_MODULUS-1)-.5))};
}

/**
 * A reproducible developmental allometry FIELD for the already-source-owned
 * regional growth operator. It is not a species/stage template, and never
 * modifies authored material directly. Its axes influence only candidates
 * that the physical lattice/ancestry/void/contact guards can actually place.
 *
 * Inputs: immutable organism identity, actual tissue identity, daily check
 * n in 0..364, fixed birth genetic channels, and chronological bounded
 * rest/activity. Outputs: unit direction and anisotropy in [1/8,8].
 *
 * phase=stageIndex(n) (five named epochs, 0..4). Each tissue/epoch
 * receives one permanent seed-derived u,v in [0,1); angle=2*pi*u.
 * Stage potential controls the amount of existing allometric pressure, not
 * a target form: the log2 aspect bias is
 * clamp([3*(elongation-expansion)+2*(v-.5)+1.5*(activity-rest)]*
 *   stageReorganizationWeight*(1+0.5*boundaryPulse),-3,3).
 * No new genetic entropy, sprite, tissue cell or body-part kind is introduced.
 *
 * Past snapshots cannot change when later care changes; no PRNG draws,
 * species labels, image recognition or new chaotic recurrence are involved.
 */
export function developmentalAllometry(
  identity:string,tissueId:string,check:number,
  c:DevelopmentalChannels,care:RegionalCare,
):Readonly<{axis:Readonly<{x:number;y:number}>;stretch:number}> {
  if(!identity||!tissueId||!Number.isSafeInteger(check)||check<0||check>=365||
     ![care.rest,care.activity,care.security,
       c.growth.elongation,c.growth.expansion].every(bounded))
    throw new RangeError("Invalid developmental allometry inputs");
  const phase=developmentalStageIndex(check);
  const key=identity+"|whole-body-phase|"+tissueId+"|"+phase;
  const u=hash(key+"|axis")/4294967296;
  const v=hash(key+"|aspect")/4294967296;
  const angle=2*Math.PI*u;
  const stage=stageAtCheck(check);
  const weight=STAGE_PRESSURE_WEIGHTS[stage].reorganization*
    (1+0.5*transitionPressure(check));
  const exponent=Math.max(-3,Math.min(3,
    (3*(c.growth.elongation-c.growth.expansion)+2*(v-0.5)+
    1.5*(care.activity-care.rest))*weight));
  return {axis:{x:Math.cos(angle),y:Math.sin(angle)},
    stretch:2**exponent};
}
