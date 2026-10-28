/**
 * MORPH-001 deterministic drawings. Ten independent structural families, three
 * independently characterized variants per family (30 total). No species
 * labels, reference sprites, renderer calls or random global state.
 */
import type { PetPart } from "../src/simulation/model";

export const MORPH_COHORT_VERSION = "morphology-authored-ink-30-v1" as const;
export type MorphologyCohortCase = Readonly<{
  id: string;
  family: string;
  characteristics: readonly string[];
  source: PetPart[];
}>;
type Point = Readonly<{x:number;y:number}>;
const key = (x:number,y:number) => x + "," + y;
const make = () => {
  const points = new Set<string>();
  const mark = (x:number,y:number) => {
    x=Math.round(x);y=Math.round(y);
    if (x>=0&&x<32&&y>=0&&y<32) points.add(key(x,y));
  };
  const line = (x0:number,y0:number,x1:number,y1:number) => {
    x0=Math.round(x0);x1=Math.round(x1);y0=Math.round(y0);y1=Math.round(y1);
    const dx=Math.abs(x1-x0),sx=x0<x1?1:-1,dy=-Math.abs(y1-y0),sy=y0<y1?1:-1;
    let error=dx+dy;
    for (;;) {
      mark(x0,y0);if(x0===x1&&y0===y1)break;
      const e=2*error;if(e>=dy){error+=dy;x0+=sx;}if(e<=dx){error+=dx;y0+=sy;}
    }
  };
  const rect=(a:number,b:number,c:number,d:number,fill=true)=>{
    for(let y=b;y<=d;y++)for(let x=a;x<=c;x++)
      if(fill||x===a||x===c||y===b||y===d)mark(x,y);
  };
  return {points,mark,line,rect};
};
const families=[
  ["sparse",["isolated source dots","low area"]],
  ["dense",["filled region","broad material"]],
  ["hollow",["interior cavity","closed perimeter"]],
  ["asymmetric",["unequal sides","concave body"]],
  ["articulated",["narrow connecting joints","multiple lobes"]],
  ["compact",["round clustered mass","high compactness"]],
  ["elongated",["high aspect ratio","narrow cross section"]],
  ["plant-like",["central axis","lateral tips"]],
  ["animal-like",["body and multiple supports","source-defined attachment analogies"]],
  ["abstract",["irregular source","multiple separated structural signatures"]],
] as const;
export function morphologyCohort(): readonly MorphologyCohortCase[] {
  const cases:MorphologyCohortCase[]=[];
  for(const [family,characteristics] of families)
    for(let variant=0;variant<3;variant++){
      const {points,mark,line,rect}=make();
      const x=variant-1;
      switch(family){
        case "sparse":
          [[6,7],[16,12+variant],[25,25],[8+variant,23]].forEach(p=>mark(p[0],p[1]));
          break;
        case "dense":rect(9-x,9,21+x,21+variant);break;
        case "hollow":rect(8-x,8,23+x,23,true);rect(10-x,10,21+x,21,false);
          for(let y=10;y<=21;y++)for(let xx=10-x;xx<=21+x;xx++)points.delete(key(xx,y));
          break;
        case "asymmetric":
          rect(9,7,13+variant,25);rect(12,21-variant,24,25);rect(18,11,20+variant,15);
          break;
        case "articulated":
          rect(12,11,19,20);rect(9-x,7,21+x,9);
          line(13,20,8-x,26);line(18,20,24+x,26);line(12,15,5,12+x);
          break;
        case "compact":
          for(let yy=5;yy<27;yy++)for(let xx=5;xx<27;xx++){
            const dx=(xx-16)/(7+variant),dy=(yy-16)/(7+variant);
            if(dx*dx+dy*dy<=1)mark(xx,yy);
          }break;
        case "elongated":rect(13-x,3,16+x,28-variant);break;
        case "plant-like":
          line(16,29,16+x,7);line(16,22,9-x,13);line(16,18,24+x,11);
          line(16,13,12-x,7);line(16,12,20+x,6);
          break;
        case "animal-like":
          rect(8,13,23,20);rect(19,10-x,25,15);
          line(10,20,8-x,27);line(15,20,14,27);line(20,20,22+x,27);
          line(8,17,4,12-variant);break;
        case "abstract":
          for(let i=0;i<60+variant*12;i++){
            const px=4+((i*17+variant*11+i*i*3)%24);
            const py=4+((i*13+variant*7+i*i*5)%24);
            if(i%5===0)line(px,py,Math.min(30,px+2),py+2);
            else mark(px,py);
          }break;
      }
      const pixels=[...points].map(v=>{
        const [px,py]=v.split(",").map(Number);
        return {x:px,y:py,color:"#184c52"};
      }).sort((a,b)=>a.y-b.y||a.x-b.x);
      cases.push({
        id:family+"-"+variant,family,characteristics:[...characteristics,
          "variant-"+variant,"authored-cells-"+pixels.length],
        source:[{id:"original",name:"Unlabeled authored drawing",kind:"decoration",
          parentId:null,position:{x:0,y:0},pixels}],
      });
    }
  return cases;
}
