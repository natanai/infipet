import test from "node:test";
import assert from "node:assert/strict";
import {measureStageIdentity} from "../src/evaluation/stage-identity";
import type {MaterialGraph,MaterialCell} from "../src/development/material-graph";

function body():MaterialGraph{
 const source:MaterialCell[]=[];
 for(let dy=0;dy<3;dy++)for(let dx=0;dx<3;dx++){
  const id="authored/"+dy+"/"+dx;
  source.push({id,tissueId:"body",x:30+dx,y:30+dy,
   color:"#23678A",provenance:"authored",sourceKind:"body",
   sourcePartId:"body",sourceIds:[id],parentCellIds:[],operationId:null});
 }
 return {version:1,sourceFingerprint:"independent-nine-cell-author",
  cells:source,sourceCells:source,sites:[],protectedVoids:[],links:[],
  tissues:[{id:"body",sourcePartId:"body",parentId:null,
    relationship:"floating",sourceCellIds:source.map(c=>c.id),
    growthSiteIds:[],rigidity:0}],events:[]};
}
test("[STAGE-004/A2] mass-only and new branches do not become a different stage",()=>{
 const original=body();
 const extra=Array.from({length:18},(_,i):MaterialCell=>({
  ...original.cells[i%9],id:"grown/"+i,tissueId:"branch",
  x:33+Math.floor(i/3),y:30+i%3,provenance:"generated",
  sourceIds:[original.cells[i%9].id],
  parentCellIds:[original.cells[i%9].id],operationId:"legal/deposition",
 }));
 const grown:MaterialGraph={...original,cells:[...original.cells,...extra],
  tissues:[...original.tissues,{...original.tissues[0],
   id:"branch",parentId:"body",relationship:"joint"}],
  links:[{id:"grown/joint",kind:"attachment",fromTissueId:"branch",
   toTissueId:"body",fromCellId:"grown/0",toCellId:"authored/0/2"}]};
 const metric=measureStageIdentity(original,grown);
 assert.ok(metric.normalizedSilhouetteDifference>0.18);
 assert.equal(metric.originalSourcePairReorganization,0);
 assert.equal(metric.preexistingReparenting,false);
 assert.equal(metric.substantiallyDifferent,false);
});
test("[STAGE-004/A2] rigid whole-body poses and proportional scaling cannot masquerade as metamorphosis",()=>{
 const original=body();
 const rotated:MaterialGraph={...original,cells:original.cells.map(c=>({
  ...c,x:31-(c.y-31),y:31+(c.x-31)}))};
 const shifted:MaterialGraph={...original,cells:original.cells.map(c=>({
  ...c,x:c.x+8,y:c.y+7}))};
 const scaled:MaterialGraph={...original,cells:original.cells.map(c=>({
  ...c,x:31+2*(c.x-31),y:31+2*(c.y-31)}))};
 for(const fake of [rotated,shifted,scaled]){
  const m=measureStageIdentity(original,fake);
  assert.ok(m.eligible&&m.comparedSourcePairs>0);
  assert.equal(m.originalSourcePairReorganization,0);
  assert.equal(m.substantiallyDifferent,false);
 }
});
test("a true source-owned counterbend changes normalized silhouette and relative anatomy",()=>{
 const original=body();
 const transformed:MaterialGraph={...original,cells:original.cells.map(c=>({
  ...c,x:c.x+(c.y===30?1:c.y===32?-1:0)}))};
 const evidence=measureStageIdentity(original,transformed);
 assert.ok(evidence.eligible);
 assert.ok(evidence.normalizedSilhouetteDifference>=0.18);
 assert.ok(evidence.originalSourcePairReorganization>=0.10);
 assert.equal(evidence.substantiallyDifferent,true);
 assert.equal(transformed.cells.length,original.cells.length);
 assert.deepEqual(new Set(transformed.cells.map(c=>c.id)),
  new Set(original.cells.map(c=>c.id)));
 assert.deepEqual(transformed.sourceCells,original.sourceCells);
 assert.deepEqual(measureStageIdentity(original,transformed),evidence);
});
