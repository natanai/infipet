import test from "node:test";
import assert from "node:assert/strict";
import {rankMorphologicalField} from "../src/development/morphological-fields";
import type {MaterialCell} from "../src/development/material-graph";
const cells:MaterialCell[]=Array.from({length:16},(_,i)=>({
 id:"original-"+i,tissueId:"body",
 x:20+i%4,y:20+Math.floor(i/4),
 color:"#184c52",provenance:"authored",sourceIds:["original-"+i],
 parentCellIds:[],operationId:null,
}));
const orbit={x:32760,y:32760};
test("regional surface field responds to signed hereditary stage orientation without inventing pigment",()=>{
 const options=(axis:{x:number;y:number})=>rankMorphologicalField(
  cells,"body","surface",orbit,64,{axis,stretch:1});
 const right=options({x:1,y:0}),left=options({x:-1,y:0});
 const score=(c:typeof right,x:number,y:number)=>{
  const p=c.find(p=>p.destination.x===x&&p.destination.y===y);
  assert.ok(p,"a symmetric supported outer boundary must be available");
  assert.equal(p.neighboringMaterial,3);
  return p.score;
 };
 // For equal source support and squared distance, a signed potential must
 // make the positive-axis frontier outrank its reflected counterpart. A
 // reversed inherited axis must reverse the inequality, for the SAME ink.
 assert.ok(score(right,24,21)-score(right,19,21)>0.5);
 assert.ok(score(left,19,21)-score(left,24,21)>0.5);
 assert.deepEqual(options({x:1,y:0}),right,
  "permanent geometry and orbit are query-order deterministic");
 assert.deepEqual(cells.map(c=>[c.id,c.x,c.y,c.color]),
  Array.from({length:16},(_,i)=>["original-"+i,20+i%4,20+Math.floor(i/4),"#184c52"]));
});
