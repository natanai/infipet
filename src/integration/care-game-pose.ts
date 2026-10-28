/** GAME-003: visual feedback for existing, actual care games. This is a rigid
 * pose of owned material, not development. p'=R(theta)(p-center)+center+offset.
 * Translations <=2 world cells; rotations <=.1 radians. No state, clock reads,
 * randomness, cell creation or hidden next-number inspection. Preview time is
 * explicit seconds; identical inputs produce identical cues and geometry. */
import type {GameState} from "../gameplay";
export type CareGamePresentation=Readonly<{
  kind:string;cue:string;offset:Readonly<{x:number;y:number}>;rotation:number;
}>;
export function careGamePresentation(game:GameState|undefined,time:number):CareGamePresentation {
  const idle:CareGamePresentation={kind:"idle",cue:"",offset:{x:0,y:0},rotation:0};
  if(!game||game.dead||game.sleeping)return idle;
  const t=Number.isFinite(time)?Math.max(0,time):0,pulse=.6+.4*Math.sin(t*Math.PI*2);
  const a=game.activity;
  if(a&&"targets" in a){
    if(a.kind==="training"){
      const high=a.targets[a.round]===0;
      return {kind:a.kind,cue:high?"Aim high":"Aim low",offset:{x:0,y:(high?-1:1)*1.5*pulse},rotation:0};
    }
    if(a.kind==="direction"){
      const side=a.targets[a.round]===0?-1:1;
      return {kind:a.kind,cue:"Follow your pet's lean",offset:{x:side*2*pulse,y:0},rotation:side*.08*pulse};
    }
    return {kind:a.kind,cue:`${a.shownNumbers[a.round]} · Guess higher or lower`,offset:{x:0,y:-.4*pulse},rotation:Math.sin(t*Math.PI)*.03};
  }
  if(a){
    const won=a.kind==="result"?a.won:a.result==="win";
    return {kind:a.kind,cue:a.kind==="battle"?`${a.opponent} · ${won?"Victory":"Defeat"}`:a.prompt,
      offset:{x:a.kind==="battle"?Math.sin(t*8)*1.5:0,y:won?-Math.abs(Math.sin(t*4))*1.5:.5},rotation:won?Math.sin(t*6)*.06:-.06};
  }
  const command=game.commandHistory.at(-1),event=game.history.at(-1)?.event;
  if(!command?.accepted||game.clock.nowMs-command.atMs>2500||!event)return idle;
  const cues:Record<string,string>={meal:"Munch",snack:"Yum",protein:"Feeling stronger",clean:"All clean",medicine:"Feeling better",discipline:"Listening",refusal:"No thanks","medicine-refusal":"Already feeling well"};
  if(!cues[event])return idle;
  return {kind:event,cue:cues[event],offset:{x:Math.sin(t*7)*.4,y:-Math.abs(Math.sin(t*6))*.6},rotation:Math.sin(t*6)*.04};
}
