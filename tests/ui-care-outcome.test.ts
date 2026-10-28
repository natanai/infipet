import assert from "node:assert/strict";
import test from "node:test";
import { createGame, commandGame, type GameCommand, type GameState } from "../src/gameplay";
import { careOutcome } from "../src/interface/care-outcome";
const start=Date.UTC(2026,9,27,12);
const fresh=()=>createGame("care-outcome-audit","infant",start);
function run(before:GameState,command:GameCommand,id:string){
  const after=commandGame(before,command,start,id);
  const bytes=JSON.stringify(after);
  const prior=JSON.stringify(before);
  const cue=careOutcome(before,after,command);
  assert.equal(JSON.stringify(before),prior,"presentational inspection never mutates original");
  assert.equal(JSON.stringify(after),bytes,"presentational inspection never changes native result");
  assert.equal(cue.command,command.type);
  return {after,cue};
}
test("processed food command is not synonymous with eating",()=>{
  const before=fresh();
  assert.equal(before.meters.hunger,4);
  const {after,cue}=run(before,{type:"feed",food:"meal"},"full-1");
  assert.equal(after.commandHistory.at(-1)?.accepted,true);
  assert.equal(after.stats.meals,before.stats.meals);
  assert.equal(after.history.at(-1)?.event,"refusal");
  assert.equal(cue.result,"refused");
  const protein=run(after,{type:"feed",food:"protein"},"protein-2");
  assert.equal(protein.cue.result,"effective");
  assert.equal(protein.after.meters.weight,after.meters.weight+2);
});
test("medicine outcome distinguishes refusal, partial recovery, complete recovery",()=>{
  const healthy=fresh();
  assert.equal(run(healthy,{type:"medicine"},"healthy").cue.result,"refused");
  const ill:GameState={...healthy,health:{...healthy.health,sickness:2,sickSinceMs:start}};
  const part=run(ill,{type:"medicine"},"ill-1");
  assert.equal(part.after.health.sickness,1);
  assert.equal(part.cue.result,"partial");
  const cured=run(part.after,{type:"medicine"},"ill-2");
  assert.equal(cured.after.health.sickness,0);
  assert.equal(cured.cue.result,"effective");
});
test("clean is a no-op only for already clean rooms; darkness is not sleep proof",()=>{
  const clean=fresh();
  assert.equal(run(clean,{type:"clean"},"clean-1").cue.result,"no-change");
  const dirty:GameState={...clean,waste:2};
  const cleaned=run(dirty,{type:"clean"},"clean-2");
  assert.equal(cleaned.after.waste,0);
  assert.equal(cleaned.cue.result,"effective");
  const night=run(cleaned.after,{type:"lights",on:false},"lights-3");
  assert.equal(night.after.lightsOn,false);
  assert.equal(night.cue.result,"effective");
  assert.ok(!night.cue.description.includes("fell asleep"));
});
test("rejected and unverified events never receive successful presentation",()=>{
  const egg=createGame("audit-egg","egg",start);
  const result=run(egg,{type:"feed",food:"snack"},"egg-feed");
  assert.equal(result.after.commandHistory.at(-1)?.accepted,false);
  assert.equal(result.cue.result,"rejected");
  const fake:GameState={...result.after,commandHistory:result.after.commandHistory.map(
    (receipt)=>({...receipt,accepted:true})
  )};
  assert.equal(careOutcome(egg,fake,{type:"feed",food:"snack"}).result,"unresolved");
});
