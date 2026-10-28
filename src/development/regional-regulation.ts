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
 * Permanent anisotropy a=2^[3(l-e)+2(qx-.5)], in [1/16,16];
 * direction angle=2*pi*qy. Live source-linked extents set the metric scale.
 * The current exact chaotic orbit controls expression, not this permanent
 * polarity; randomizing the tensor every day would average out allometry.
 */
import type {DevelopmentalChannels} from "../genetics";
import {CHAOS_MODULUS,type ChaosState} from "./chaos";

export const REGIONAL_GROWTH_VERSION="source-developmental-repatterning-v2" as const;
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
