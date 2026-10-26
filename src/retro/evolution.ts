import { drawingPixels } from "../drawing";
import type { LiveDevelopmentContext } from "../lineage/types";
import type { PetPart, Pixel, SourceMode } from "../simulation/model";
import { RETRO_PRESETS } from "./index";

/** Explicit, opt-in original-device reference checkpoints (not care emulation). */
export const RETRO_EVOLUTION_VERSION = "retro-ink-milestones-v1";
export type RetroRoute = Readonly<{
  seed: string;
  sourceId: string;
  path: readonly string[];
  startIndex: number;
}>;
const presetsById = new Map(RETRO_PRESETS.map(p => [p.referenceId, p]));
const presetsBySeed = new Map(RETRO_PRESETS.map(p => [p.seed, p]));
const WIDTH = 32, CELLS = WIDTH * WIDTH;

function signature(parts: readonly PetPart[]): string {
  return drawingPixels([...parts])
    .map(p => p.x + "," + p.y + "," + p.color.toUpperCase())
    .sort().join(";");
}
const exactInk = new Map(RETRO_PRESETS.map(p => [p.seed, signature(p.parts)]));

/** Both seed AND entire visible 32x32 bitmap must match; arbitrary drawings remain free. */
export function resolveRetroRoute(parts: readonly PetPart[], seed: string, mode: SourceMode): RetroRoute | null {
  const preset = presetsBySeed.get(seed);
  if (mode !== "infant" || !preset || signature(parts) !== exactInk.get(seed)) return null;
  return { seed, sourceId: preset.referenceId, path: preset.path, startIndex: preset.startIndex };
}
type Raster = { ink: Uint8Array; signedDistance: Float32Array; pixels: Pixel[] };
const rasters = new Map<string, Raster>();

/** Deterministic 8-neighbour chamfer distance transform. */
function distance(ink: Uint8Array, target: number) {
  const result = new Float32Array(CELLS);
  for(let i=0;i<CELLS;i++) result[i]=ink[i] === target ? 0 : 1000;
  const scan=(x:number,y:number,dx:number,dy:number,w:number)=>{
    const xx=x+dx, yy=y+dy;
    if(xx<0||yy<0||xx>=WIDTH||yy>=WIDTH) return;
    const at=y*WIDTH+x;
    result[at]=Math.min(result[at], result[yy*WIDTH+xx]+w);
  };
  for(let y=0;y<WIDTH;y++)for(let x=0;x<WIDTH;x++){
    scan(x,y,-1,0,1);scan(x,y,0,-1,1);
    scan(x,y,-1,-1,Math.SQRT2);scan(x,y,1,-1,Math.SQRT2);
  }
  for(let y=WIDTH-1;y>=0;y--)for(let x=WIDTH-1;x>=0;x--){
    scan(x,y,1,0,1);scan(x,y,0,1,1);
    scan(x,y,1,1,Math.SQRT2);scan(x,y,-1,1,Math.SQRT2);
  }
  return result;
}
function raster(id:string):Raster {
  const cached=rasters.get(id);
  if(cached)return cached;
  const preset=presetsById.get(id);
  if(!preset)throw new Error("Unknown retro sprite: "+id);
  const ink=new Uint8Array(CELLS);
  for(const p of drawingPixels(preset.parts)) ink[p.y*WIDTH+p.x]=1;
  const toInk=distance(ink,1),toEmpty=distance(ink,0);
  const signedDistance=new Float32Array(CELLS),pixels:Pixel[]=[];
  for(let i=0;i<CELLS;i++){
    signedDistance[i]=ink[i]?toEmpty[i]:-toInk[i];
    if(ink[i])pixels.push({x:(i%WIDTH)+16,y:Math.floor(i/WIDTH)+16,color:"#FFFFFF"});
  }
  const result={ink,signedDistance,pixels};
  rasters.set(id,result);
  return result;
}

/** Lab progression or Infipet live stage commitments, not original hardware timings. */
export function retroAt(route:RetroRoute,ageSinceHatch:number,liveContext?:LiveDevelopmentContext){
  const stages=liveContext
    ? [0,...liveContext.stageEndHours].map(h=>h/24)
    : [0,30,75,120,180];
  const points=route.path.slice(route.startIndex).map((id,i)=>({
    id,at:stages[route.startIndex+i]-stages[route.startIndex]
  }));
  const age=Math.max(0,Number.isFinite(ageSinceHatch)?ageSinceHatch:0);
  let i=0;
  while(i<points.length-1&&age>=points[i+1].at)i++;
  const current=points[i],next=points[i+1];
  const progress=next?Math.max(0,Math.min(1,(age-current.at)/Math.max(0.001,next.at-current.at))):0;
  return {
    seed:route.seed,path:route.path,currentId:current.id,
    currentName:presetsById.get(current.id)!.name,
    nextId:next?.id,nextName:next?presetsById.get(next.id)!.name:undefined,
    nextAtDays:next?.at,progress
  };
}
/** Continuous growth between exact stored 32x32 silhouettes at each boundary. */
export function retroPixelsAt(route:RetroRoute,ageSinceHatch:number,liveContext?:LiveDevelopmentContext){
  const state=retroAt(route,ageSinceHatch,liveContext);
  const from=raster(state.currentId);
  if(!state.nextId||state.progress<=0)return {pixels:from.pixels.map(p=>({...p})),state};
  const to=raster(state.nextId),pixels:Pixel[]=[];
  for(let i=0;i<CELLS;i++)
    if(from.signedDistance[i]*(1-state.progress)+to.signedDistance[i]*state.progress>0)
      pixels.push({x:i%WIDTH+16,y:Math.floor(i/WIDTH)+16,color:"#FFFFFF"});
  return {pixels,state};
}
