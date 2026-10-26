import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createSimulation } from "../src/simulation";
import { hash } from "../src/simulation/model";
import type { PetPart, Pixel } from "../src/simulation/model";

type Shape = { id:string; rows:string[] };
const cohort = JSON.parse(readFileSync(new URL("../roadmap/cohorts.json", import.meta.url), "utf8")) as {
  schemaVersion:number; ages:number[]; shapes:Shape[]; seeds:string[];
};
function anatomy(shape:Shape):PetPart[] {
  return [{id:"drawing",kind:"body",name:"unlabeled source",parentId:null,position:{x:0,y:0},
    pixels:shape.rows.flatMap((row,y)=>[...row].flatMap((c,x)=>
      c === "#" ? [{x,y,color:"#FFFFFF"}] : []))}];
}
function signature(pixels:readonly Pixel[]):string {
  const normalized = pixels.map(p=>p.x+","+p.y+","+p.color).sort();
  return hash(normalized.join(";")).toString(16).padStart(8,"0")+":"+normalized.length;
}

test("[EVAL-001/A1] bounded numeric cohort covers arbitrary sparse, symmetric, branching, detached and empty input", () => {
  assert.equal(cohort.schemaVersion,1);
  assert.deepEqual(cohort.shapes.map(s=>s.id),[
    "empty","single-cell","symmetric-blob","forked-branch","separate-marks","open-ring"
  ]);
  assert.equal(new Set(cohort.shapes.map(s=>s.id)).size,cohort.shapes.length);
  assert.ok(cohort.seeds.length >= 2);
  for(const shape of cohort.shapes) {
    assert.ok(shape.rows.length <= 32);
    assert.ok(shape.rows.every(r=>r.length <= 32 && /^[#.]*$/.test(r)));
  }
  assert.deepEqual(cohort.ages,[0,30,120]);
});

test("[EVAL-001/A2] per-milestone frame hashes replay under a fresh instance and reversed render order", () => {
  let checked = 0;
  const outcomes = new Set<string>();
  for (const shape of cohort.shapes) for (const seed of cohort.seeds) {
    const first = createSimulation(anatomy(shape), seed, "infant");
    const forward = cohort.ages.map(age=>signature(first.frameAt(age,{action:"idle",time:0}).pixels));
    const repeated = createSimulation(anatomy(shape), seed, "infant");
    const reverse = [...cohort.ages].reverse().map(age=>
      signature(repeated.frameAt(age,{action:"idle",time:0}).pixels)).reverse();
    assert.deepEqual(reverse,forward,shape.id+" / "+seed+" must be replay-stable");
    outcomes.add(shape.id+":"+forward[forward.length-1]);
    checked += forward.length;
  }
  assert.equal(checked,cohort.shapes.length*cohort.seeds.length*cohort.ages.length);
  assert.ok(outcomes.size >= cohort.shapes.length, "distinct input ink must not collapse to a single rendered state");
});
