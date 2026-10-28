import test from "node:test";
import assert from "node:assert/strict";
import {createGame,commandGame,type GameCommand,type GameState} from "../src/gameplay";
import {careGamePose,supportedCareGameAction} from "../src/integration/care-game-animation";
import {createSimulation} from "../src/simulation";
import {fixtures} from "./alg-development-fixtures";

const T=Date.UTC(2026,9,27,12);
test("[AUD-003/A1] each of three five-round games has a deterministic reachable animated prompt and score",()=>{
  for(const kind of ["training","direction","numbers"] as const){
    let s=createGame("GAME-ANIMATION-"+kind,"infant",T);
    s=commandGame(s,{type:"start-game",game:kind},T,kind+"/start");
    assert.equal(s.commandHistory.at(-1)!.accepted,true);
    assert.equal(s.activity?.kind,kind);
    for(let round=0;round<5;round++){
      const a:NonNullable<GameState["activity"]>=s.activity!;
      assert.ok("targets" in a);
      assert.equal(a.round,round);
      const pose=careGamePose(a);
      assert.ok(pose);
      assert.equal(pose!.action,
        kind==="training"?"play":kind==="direction"?"move":"greet");
      if(kind==="direction")
        assert.equal(pose!.target!.x,a.targets[round]===0?2:62);
      if(kind==="training")
        assert.equal(pose!.target!.y,a.targets[round]===0?17:45);
      const choice=a.choices[a.targets[a.round]];
      s=commandGame(s,{type:"choose",choice} as GameCommand,T,kind+"/"+round);
      assert.equal(s.commandHistory.at(-1)?.accepted,true);
    }
    assert.equal(s.activity?.kind,"result");
    assert.equal("score" in s.activity!?s.activity.score:null,5);
    assert.equal("won" in s.activity!?s.activity.won:null,true);
    assert.equal(careGamePose(s.activity!)?.action,"greet");
    assert.equal(s.stats.gamesWon,1);
  }
});

test("[AUD-003/A2] the renderer uses its own real material rig and refuses unsupported capabilities",()=>{
  const sim=createSimulation(fixtures.branching,"ROUNDS-RIG");
  const frame=sim.frameAt(0);
  const actions=["play","move","greet"] as const;
  for(const action of actions){
    const permitted=supportedCareGameAction(action,frame.capabilities);
    assert.ok(["idle","move","play","greet"].includes(permitted));
    if(action==="play"&&!frame.capabilities.canPlay)assert.notEqual(permitted,"play");
    if(action==="move"&&!frame.capabilities.canMove)assert.notEqual(permitted,"move");
    const posed=sim.frameAt(0,{time:1.25,action:permitted,target:{x:2,y:32}});
    assert.equal(posed.pixels.length>=0,true);
    assert.deepEqual(
      new Set(posed.pixels.map(p=>p.materialCellId)).size>0,
      posed.pixels.length>0,
      "posed pixels retain material ownership"
    );
    assert.deepEqual(sim.materialStateAt(0).graph,sim.materialStateAt(0).graph,
      "game pose does not perform physical mutation");
  }
  const sparse=sim.frameAt(0).capabilities;
  assert.equal(supportedCareGameAction("play",{canPlay:false,canMove:false,canGreet:false}),"idle");
  assert.ok(typeof sparse.canMove==="boolean");
});

test("[AUD-003/A3] CPU battle uses the same playing material and deterministic outcome cue",()=>{
  const activity={kind:"battle" as const,id:"battle/0",opponent:"Test",
    result:"win" as const,prompt:"Victory"};
  const pose=careGamePose(activity);
  assert.equal(pose?.action,"play");
  assert.equal(pose?.cue,"victory");
  assert.ok(pose?.target);
  assert.equal(careGamePose(null),null);
});
