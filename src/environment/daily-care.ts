/**
 * CARE-004: causal zero-order-hold integration of actual recorded physiology.
 * For channel x and window [a,b), I(x)=sum x_i*(min(b,t_(i+1))-max(a,t_i))/DAY.
 * A sample is available at its timestamp; a sample/command at b is excluded.
 * Values before the first observation are UNKNOWN and contribute no resources.
 * Nutrition is observed hunger/4, not the count of accepted feed receipts.
 * Rest/activity/security are recorded gameplay need values; threat=1-safety.
 * Presence is evidence of an interval, never evidence of player care commands.
 * All timestamps are nonnegative safe integer epoch ms. Integrals use Number;
 * durations are exact integers and accumulation order is increasing timestamp.
 * This module neither runs material operators nor changes a GameState/genome.
 */
import {validateGameState,HOUR,type GameState,type CareObservation} from "../gameplay";
import {hash} from "../simulation/model";
import {dailyCheckTime,DAILY_INTERVAL_MS,validateDailyCareWindow,type DailyCareWindowV1} from "../development/daily-contract";
export type {DailyCareWindowV1} from "../development/daily-contract";

type Evidence = Readonly<{
  atMs:number;values:readonly number[];nutrition:number|null;
  presence:CareObservation["presence"]|"unknown";
}>;
export function createDailyCareWindowSummarizer(input:GameState) {
  // Validate the whole source once, then capture immutable input values.
  const game=validateGameState(input),hatch=game.clock.hatchAtMs;
  const firstExact=game.careObservations?.[0]?.atMs ?? Infinity;
  const records:Evidence[]=[
    ...game.careSamples.filter(s=>hatch+s.hour*HOUR<firstExact).map(s=>({
      atMs:hatch+s.hour*HOUR,values:[...s.values],nutrition:s.nutrition??null,presence:"unknown" as const})),
    ...(game.careObservations??[]).map(o=>({...o,values:[...o.values]})),
  ];
  const commands=game.commandHistory.map(c=>({...c,command:{...c.command}}));
  const through=game.clock.nowMs;
  return (checkIndex:number):DailyCareWindowV1=>{
    const endMs=dailyCheckTime(hatch,checkIndex),startMs=dailyCheckTime(hatch,checkIndex-1);
    if(checkIndex<1||endMs>through)throw new RangeError("Daily window is not yet recorded");
    // Binary search is essential for late lives: never rescan every earlier
    // observation for each daily boundary during a 365-check cold replay.
    let lo=0,hi=records.length;
    while(lo<hi){const m=(lo+hi)>>>1;if(records[m].atMs<=startMs)lo=m+1;else hi=m;}
    const first=Math.max(0,lo-1);
    const used:Evidence[]=[];
    for(let i=first;i<records.length && records[i].atMs<endMs;i++)used.push(records[i]);
    let current:Evidence|null=null,cursor=startMs;
    const totals={nutrition:0,rest:0,activity:0,threat:0,security:0,observedFraction:0};
    let activeMs=0,absentMs=0,unknownMs=0;
    const unknown=new Set<string>();
    function integrate(until:number){
      const duration=until-cursor;
      if(duration<=0)return;
      if(current) {
        if(current.nutrition!==null){totals.nutrition+=duration*current.nutrition;totals.observedFraction+=duration;}
        else unknown.add("nutrition");
        totals.rest+=duration*current.values[3];
        totals.activity+=duration*current.values[5];
        totals.threat+=duration*(1-current.values[0]);
        totals.security+=duration*current.values[1];
        if(current.presence==="absent")absentMs+=duration;
        else if(current.presence==="active"||current.presence==="birth")activeMs+=duration;
        else {unknownMs+=duration;unknown.add("presence");}
      } else {unknownMs+=duration;unknown.add("physiology");unknown.add("presence");}
      cursor=until;
    }
    for(const record of used){
      integrate(Math.max(startMs,record.atMs));
      current=record;
    }
    integrate(endMs);
    let l=0,r=commands.length;
    while(l<r){const m=(l+r)>>>1;if(commands[m].atMs<startMs)l=m+1;else r=m;}
    const observed=commands.slice(l).filter(c=>c.atMs<endMs);
    const forcing=Object.fromEntries(Object.entries(totals).map(([k,v])=>[k,v/DAILY_INTERVAL_MS])) as DailyCareWindowV1["forcing"];
    const window:DailyCareWindowV1={version:1,hatchAtMs:hatch,checkIndex,startMs,endMs,
      forcing,acceptedCommands:observed.filter(c=>c.accepted).length,
      rejectedCommands:observed.filter(c=>!c.accepted).length,observations:used.length,
      activeMs,absentMs,unknownMs,unknown:[...unknown].sort(),
      // Descriptor, not a cryptographic signature or sole cache credential.
      provenanceDigest:String(hash(JSON.stringify([hatch,checkIndex,used,observed]))),
    };
    validateDailyCareWindow(window);
    return Object.freeze({...window,forcing:Object.freeze(forcing),unknown:Object.freeze(window.unknown)});
  };
}
export function summarizeDailyCareWindow(game:GameState,checkIndex:number):DailyCareWindowV1 {
  return createDailyCareWindowSummarizer(game)(checkIndex);
}
