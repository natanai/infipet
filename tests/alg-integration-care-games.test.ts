import test from "node:test";
import assert from "node:assert/strict";
import {createGame,advanceGame,commandGame,DAY,HOUR,type GameState,type GameKind} from "../src/gameplay";
import {careGamePresentation} from "../src/integration/care-game-pose";
import {createSimulation} from "../src/simulation";
import {fixtures} from "./alg-development-fixtures";
const T=Date.UTC(2026,9,27,12),parts=fixtures.branching;
function command(s:GameState,c:Parameters<typeof commandGame>[1]){return commandGame(s,c,s.clock.nowMs,"game/"+s.commandHistory.length);}
test("[GAME-003/A1] every existing game has reproducible playable choices, earned results and real physiological consequences",()=>{
  for(const kind of ["training","direction","numbers"] as GameKind[]){
    let game=command(createGame("PLAY-"+kind,"infant",T),{type:"start-game",game:kind});
    const snapshot=JSON.stringify(game),energy=game.meters.energy;
    assert.ok(energy<100);
    for(let round=0;round<5;round++){
      const a=game.activity;assert.ok(a&&"targets" in a);
      const cue=careGamePresentation(game,0);
      const expected=kind==="training"?(cue.cue==="Aim high"?"high":"low"):kind==="direction"?(cue.offset.x<0?"left":"right"):a.shownNumbers[round+1]>a.shownNumbers[round]?"higher":"lower";
      game=command(game,{type:"choose",choice:expected});
    }
    assert.ok(game.activity?.kind==="result"&&game.activity.won);
    assert.equal(game.activity.score,5);assert.equal(game.stats.gamesWon,1);
    assert.deepEqual(JSON.parse(JSON.stringify(game)),game);
    let reopened=JSON.parse(snapshot) as GameState;
    for(const c of game.commandHistory.slice(1))reopened=commandGame(reopened,c.command,c.atMs,c.id);
    assert.deepEqual(reopened,game);
  }
  const born=createGame("BATTLE","infant",T);
  let adult=advanceGame(born,T+3*DAY,"absent");
  adult=command(adult,{type:"feed",food:"meal"});
  adult=command(adult,{type:"clean"});
  for(let i=0;i<4&&(adult.health.sickness||adult.health.injury);i++)adult=command(adult,{type:"medicine"});
  const battle=command(adult,{type:"battle"});
  assert.ok(battle.activity?.kind==="battle");assert.equal(battle.stats.battles,1);
  assert.ok(battle.meters.energy<adult.meters.energy);
  assert.match(careGamePresentation(battle,.25).cue,/Victory|Defeat/);
});
test("[GAME-003/A2] actual saved-player frames pose owned cells for cues/results without changing anatomy or revealing future numbers",()=>{
  for(const kind of ["training","direction","numbers"] as GameKind[]){
    const game=command(createGame("POSE-"+kind,"infant",T),{type:"start-game",game:kind});
    const simulation=createSimulation(parts,game.seed,"infant",{careGame:game});
    const state=simulation.materialStateAt(0),a=simulation.frameAt(0,{time:.1}),b=simulation.frameAt(0,{time:.7});
    assert.notDeepEqual((a.interaction.diagnostics as any).physicalMaterial.renderedCellQuads,(b.interaction.diagnostics as any).physicalMaterial.renderedCellQuads);
    assert.deepEqual(simulation.materialStateAt(0),state);
    assert.ok(a.parts.flatMap(p=>p.pixels).every(p=>state.graph.cells.some(c=>c.id===p.materialCellId)));
    if(kind==="numbers"){
      const altered=JSON.parse(JSON.stringify(game));altered.activity.targets.reverse();altered.activity.shownNumbers.splice(1,5,1,2,3,4,5);
      assert.deepEqual(careGamePresentation(altered,.3),careGamePresentation(game,.3),"numbers pose must not leak any unrevealed number");
    }
  }
  const game=createGame("INVALID","infant",T),rejected=command(game,{type:"choose",choice:"left"});
  assert.equal(rejected.commandHistory.at(-1)!.accepted,false);
  assert.equal(careGamePresentation(rejected,0).kind,"idle");
});
