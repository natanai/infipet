import test from "node:test";
import assert from "node:assert/strict";
import { compileSources } from "../src/simulation/material";
import { describeSource } from "../src/simulation/source-atlas";
import { inferInkSignature } from "../src/lineage/ink-signature";
import { classifySource } from "../src/lineage";
import type { PetPart } from "../src/simulation/model";

function draw(rows: readonly string[], offsetX = 0, offsetY = 0, color = "#FFFFFF"): PetPart[] {
  return [{
    id:"ink",kind:"body",name:"any drawing",parentId:null,
    position:{x:offsetX,y:offsetY},
    pixels:rows.flatMap((row,y) => [...row].flatMap((c,x) =>
      c === "#" ? [{x,y,color}] : [])),
  }];
}
const signature = (parts: PetPart[]) =>
  inferInkSignature(describeSource(compileSources(parts, 1)));

test("[OBS-001/A1] exact empty, connected, disconnected and hollow shape signatures", () => {
  assert.deepEqual(signature([]), {
    version:"ink-signature-v1",occupiedCells:0,connectedComponents:0,
    bounds:{width:0,height:0},verticalSymmetry:0,horizontalSymmetry:0,holes:0,
  });
  const square = signature(draw(["###","###","###"]));
  assert.equal(square.occupiedCells, 9);
  assert.equal(square.connectedComponents, 1);
  assert.deepEqual(square.bounds, {width:3,height:3});
  assert.equal(square.verticalSymmetry, 1);
  assert.equal(square.horizontalSymmetry, 1);
  assert.equal(square.holes, 0);
  const broken = signature(draw(["#..#"]));
  assert.equal(broken.occupiedCells, 2);
  assert.equal(broken.connectedComponents, 2);
  assert.equal(broken.verticalSymmetry, 1);
  const ring = signature(draw(["###","#.#","###"]));
  assert.equal(ring.holes, 1);
  const lopsided = signature(draw(["#..",".##","..."]));
  assert.ok(lopsided.verticalSymmetry < 1);
});

test("[OBS-001/A2] moving, repainting, relabeling and splitting a shape never changes ink geometry", () => {
  const original = draw(["###","#.#","###"], 3, 4);
  const changed = draw(["###","#.#","###"], 12, 17, "#112233").map(p => ({
    ...p, id:"renamed", name:"uninterpreted", kind:"decoration" as const,
    pixels:[...p.pixels].reverse(),
  }));
  assert.deepEqual(signature(original), signature(changed));
  const main = draw(["###","#.#","###"], 3, 4)[0];
  const split: PetPart[] = [
    {...main, id:"first", pixels:main.pixels.slice(0,4)},
    {...main, id:"second", pixels:main.pixels.slice(4)},
    {...main, id:"overlay", pixels:main.pixels.slice(0,2).map(p=>({...p,color:"#000000"}))},
  ];
  assert.deepEqual(signature(original), signature(split));
  const source = describeSource(compileSources(original, 1));
  assert.ok(classifySource(source).evidence.some(e => e.includes("connected ink")));
});
