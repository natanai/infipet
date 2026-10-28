/** Deterministic 30-drawing source cohort, separate from genotype/engine outputs. */
import type {PetPart,Pixel} from "../simulation/model";
export const MORPH_COHORT_COUNT=30 as const;
export type MorphologySource=Readonly<{id:string;parts:PetPart[];physicalEligibility:"candidate"|"constrained"}>;
export function morphologySources():MorphologySource[]{
  const result:MorphologySource[]=[];
  for(let i=0;i<MORPH_COHORT_COUNT;i++){
    const width=3+i%5,height=3+Math.floor(i/5),pattern=i%6;
    const pixels:Pixel[]=[];
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const included=pattern===0?true:
        pattern===1?x===0||y===0||x===width-1:
        pattern===2?x===Math.floor(width/2)||y===Math.floor(height/2):
        pattern===3?(x+y)%2===0||y===height-1:
        pattern===4?x<=y+1||y===0:
        x===0||x===width-1||y===0||y===height-1;
      if(included)pixels.push({x:x+16,y:y+16,color:"#185060"});
    }
    const id="cohort-"+i;
    result.push({id,
      physicalEligibility:pixels.length>=9?"candidate":"constrained",
      parts:[{id:"original",kind:"decoration",name:"unlabeled ink",parentId:null,
        position:{x:0,y:0},pixels}],
    });
  }
  return result;
}
