/**
 * Developer-only diagnostic adjustments to the EXISTING material operator
 * program. Never persisted, never used in the actual player's saved life.
 * A factor can amplify only an operator already permitted by the immutable
 * genotype: strength=0 remains 0; no new site, kind, seed or source is minted.
 *
 * This is deliberately narrower than the full engine: iterative branching,
 * movement, material field choice and future operator families are monitored,
 * not falsely advertised as controllable by these eight sliders.
 */
import type {MaterialDevelopmentProgram,MaterialOperatorKind} from "../development/operators";
import type {MaterialGraph} from "../development/material-graph";
export const MORPH_KINDS=[
 "elongate","expand","branch","bud","fuse","resorb","remodel","reinforce",
] as const satisfies readonly MaterialOperatorKind[];
export type MorphologyTuning=Record<MaterialOperatorKind,number>;
export const DEFAULT_MORPH_TUNING:Readonly<MorphologyTuning>=Object.freeze(
 Object.fromEntries(MORPH_KINDS.map(k=>[k,1])) as MorphologyTuning,
);
export const MORPH_OPERATOR_HELP:Readonly<Record<MaterialOperatorKind,string>>={
 elongate:"Terminal extension of an existing structure",
 expand:"Surface deposition and broader material growth",
 branch:"Creation of supported branching tissues",
 bud:"New source-rooted protrusions",
 fuse:"Physical connections between compatible tissues",
 resorb:"Removal of eligible existing matter",
 remodel:"Coherent physical redistribution or relocation",
 reinforce:"Structural support and rigidity",
};
export function tuningIsDefault(tuning:Readonly<MorphologyTuning>):boolean{
 return MORPH_KINDS.every(k=>tuning[k]===1);
}
export function tuneMaterialProgram(
 original:MaterialDevelopmentProgram,tuning:Readonly<MorphologyTuning>,
):MaterialDevelopmentProgram{
 for(const kind of MORPH_KINDS){
  const value=tuning[kind];
  if(!Number.isFinite(value)||value<0||value>2)
   throw new RangeError("Experimental operator expression must be 0..200%");
 }
 if(tuningIsDefault(tuning))return original;
 const operators=original.operators.map(op=>({
  ...op,strength:Math.min(1,Math.max(0,op.strength*tuning[op.kind])),
 }));
 // The immutable original blueprint and source-owned genotype fingerprint
 // remain exactly intact; the lab program has a distinct stable cache identity.
 const identity=MORPH_KINDS.map(k=>k+":"+tuning[k].toFixed(3)).join("|");
 return {...original,operators,
  fingerprint:original.fingerprint+"|lab-express-v1|"+identity};
}
export type MorphologyShapeMetrics=Readonly<{
 cells:number;created:number;removed:number;relocated:number;
 width:number;height:number;area:number;solidity:number;
 internalCells:number;thinCells:number;thinFraction:number;
 tissues:number;links:number;
}>;
export function morphologyShapeMetrics(graph:MaterialGraph):MorphologyShapeMetrics{
 const cells=graph.cells;const occupied=new Set(cells.map(c=>c.x+","+c.y));
 const minX=cells.length?Math.min(...cells.map(c=>c.x)):0;
 const maxX=cells.length?Math.max(...cells.map(c=>c.x)):-1;
 const minY=cells.length?Math.min(...cells.map(c=>c.y)):0;
 const maxY=cells.length?Math.max(...cells.map(c=>c.y)):-1;
 const width=cells.length?maxX-minX+1:0,height=cells.length?maxY-minY+1:0;
 const cardinal=[[0,1],[0,-1],[1,0],[-1,0]] as const;
 let internal=0,thin=0;
 for(const c of cells){
  const n=cardinal.filter(([dx,dy])=>occupied.has((c.x+dx)+","+(c.y+dy))).length;
  if(n===4)internal++;
  if(n<=2)thin++;
 }
 const source=new Map(graph.sourceCells.map(c=>[c.id,c]));
 const removed=graph.sourceCells.filter(c=>!cells.some(l=>l.id===c.id)).length;
 const relocated=cells.filter(c=>source.has(c.id)&&
  (source.get(c.id)!.x!==c.x||source.get(c.id)!.y!==c.y)).length;
 return {cells:cells.length,created:cells.filter(c=>c.provenance==="generated").length,
  removed,relocated,width,height,area:occupied.size,
  solidity:width*height?occupied.size/(width*height):0,
  internalCells:internal,thinCells:thin,thinFraction:cells.length?thin/cells.length:0,
  tissues:graph.tissues.length,links:graph.links.length};
}
