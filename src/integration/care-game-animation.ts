/** Game mechanics choose a target; the same living material pose engine
 * decides whether that target can be reached. No game sprite or stage art. */
import type {GameActivity} from "../gameplay";
import type {PetAction,Point,Capabilities} from "../simulation/model";

export type CareGamePose=Readonly<{action:PetAction;target:Point|null;cue:string}>;
export function careGamePose(activity:GameActivity|null):CareGamePose|null{
  if(!activity)return null;
  if(activity.kind==="result")
    return {action:"greet",target:null,cue:activity.won?"celebrate":"recover"};
  if(activity.kind==="battle")
    return {action:"play",target:{x:52,y:31},cue:activity.result==="win"?"victory":"duel"};
  const target=activity.targets[activity.round];
  if(activity.kind==="training")return {action:"play",
    target:{x:32,y:target===0?17:45},cue:target===0?"high":"low"};
  if(activity.kind==="direction")return {action:"move",
    target:{x:target===0?2:62,y:32},cue:target===0?"left":"right"};
  return {action:"greet",target:null,cue:"count"};
}
/** A sparse creature may decline an action without inventing legs, hands or
 * another anatomy. Greeting and resting are the biologically safe fallbacks. */
export function supportedCareGameAction(
  requested:PetAction,capabilities:Pick<Capabilities,"canPlay"|"canMove"|"canGreet">,
):PetAction{
  if(requested==="play"&&capabilities.canPlay)return "play";
  if(requested==="move"&&capabilities.canMove)return "move";
  if(requested==="greet"&&capabilities.canGreet)return "greet";
  if(capabilities.canGreet)return "greet";
  return "idle";
}
