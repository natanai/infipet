import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { birthPlayerLife, drawableMaterial, advancePlayerLife,
  commandPlayerLife, createPlayerLifeSimulation } from "../src/integration/player-lifecycle";
import { createSimulation, type PetPart, type PartKind } from "../src/simulation";
import { HOUR, GAME_RULES, advanceGame, deriveCareTimeline,
  deriveDevelopmentContext } from "../src/gameplay";
import { encodePet, decodePet, PROTOTYPE_REVISION,
  LINEAGE_RECIPE_VERSION, type PetDocument, type LivingPet } from "../src/pet-format";
import { NEEDS_CATALOG_VERSION, NEEDS_RULES_VERSION } from "../src/needs";

const birthMs=12*HOUR;
const make=(rows:readonly string[], kind:PartKind="body",name="Unfamiliar creature"):PetPart[]=>[{
  id:"my-ink",kind,name,parentId:null,position:{x:0,y:0},layer:12,
  pixels:rows.flatMap((row,y)=>[...row].flatMap((p,x)=>
    p==="."?[]:[{x,y,color:p==="r"?"#D05555":p==="b"?"#55AACC":"#82B9A2",z:y*32+x}])),
}];
const source=make(["...b..","r..r..","rr....","..r...",".r...."]);
const identity=(pet:LivingPet)=>({seed:pet.seed,mode:pet.mode,
  parts:pet.parts,name:pet.name,genome:pet.game.seed,
  startedAtMs:pet.game.clock.startedAtMs,
  lineageVersion:pet.lineageVersion});
function portable(pet:LivingPet):PetDocument {
  // Deliberately DIFFERENT editable Lab ink/seed: export/import must retain
  // the committed living organism, not substitute the current preview.
  return {
    version:8,algorithmVersion:7,revision:PROTOTYPE_REVISION,
    mode:"infant",name:"Editable Lab",seed:"NOT-THE-LIVING-SEED",
    parts:make(["##"],"decoration","Unused lab drawing"),
    needTimeline:[],groomingTimeline:[],bornAt:birthMs,age:0,
    catalogVersion:NEEDS_CATALOG_VERSION,
    needsRulesVersion:NEEDS_RULES_VERSION,life:pet,
  };
}
const atHour=(pet:LivingPet)=> (pet.game.clock.nowMs-pet.game.clock.startedAtMs)/(24*HOUR);
const materialSources=(frame:ReturnType<ReturnType<typeof createSimulation>["frameAt"]>)=>
  frame.parts.flatMap(part=>part.pixels.flatMap(pixel=>pixel.materialSourceIds??[]));

test("[GAME-001/A1] sparse, disconnected, asymmetric, fantasy and named multi-part ink begins without taxonomy",()=>{
  const scenarios=[
    make(["r"]),
    make(["r....b","......","...b.."]),
    make(["r.....","rrr...","..b...",".....b"]),
    make([".r..bb.","r...b..","..r...r","....rr."]),
    [...make([".rrr.","rrrrr",".rrr."],"body","My invented one"),{
      id:"glowing-mark",kind:"eye" as const,name:"Blue eye",parentId:"my-ink",
      position:{x:4,y:1},layer:40,pixels:[{x:0,y:0,color:"#55AACC",z:5}],
    }],
  ];
  for (let i=0;i<scenarios.length;i++){
    const parts=scenarios[i],copy=JSON.stringify(parts);
    assert.equal(drawableMaterial(parts),true);
    const pet=birthPlayerLife({parts,mode:"infant",
      seed:"RETRO-INK-"+i,name:"Anything I draw"},birthMs);
    assert.equal(pet.lineageVersion,LINEAGE_RECIPE_VERSION);
    assert.deepEqual(pet.parts,parts);
    assert.equal(JSON.stringify(parts),copy,"birth does not mutate authored ink");
    assert.equal(pet.game.seed,pet.seed);
    const frame=createPlayerLifeSimulation(pet).frameAt(0);
    assert.ok(frame.pixels.length>0,"a living pet has drawable pixels");
    assert.ok(frame.parts.some(part=>part.pixels.length>0));
    assert.equal(frame.interaction.action,"idle");
    for(const input of parts)
      for(const pixel of input.pixels)
        assert.ok(pet.parts.some(part=>part.id===input.id && part.pixels.some(saved=>
          saved.x===pixel.x&&saved.y===pixel.y&&saved.color===pixel.color&&saved.z===pixel.z)),
        "every original cell/color/definition survives birth");
  }
  assert.equal(drawableMaterial([]),false);
  assert.equal(drawableMaterial(make(["...","..."])),false);
  assert.throws(()=>birthPlayerLife({parts:[],seed:"SEED",mode:"infant",name:"New"},birthMs),
    /Draw at least one pixel/);
  assert.throws(()=>birthPlayerLife({parts:make([".."]),seed:"SEED",mode:"infant",name:"New"},birthMs),
    /Draw at least one pixel/);
  assert.throws(()=>birthPlayerLife({parts:source,seed:"",mode:"infant",name:"New"},birthMs),
    /stable birth identity/);
});

test("[GAME-001/A2] real care changes GameState without altering permanent source, seed or clinical taxonomy",()=>{
  const pet=birthPlayerLife({parts:source,seed:"CARE-PLAYER-828",mode:"infant",
    name:"Little chaos"},birthMs,0);
  const unchanged=identity(pet);
  const waiting=advancePlayerLife(pet,birthMs+2*HOUR,"active");
  const next=commandPlayerLife(waiting,{type:"feed",food:"meal"},
    birthMs+2*HOUR,"feed-1");
  assert.deepEqual(identity(next),unchanged);
  assert.deepEqual(identity(waiting),unchanged);
  assert.equal(next.game.stats.meals,waiting.game.stats.meals+1);
  assert.equal(next.game.commandHistory.at(-1)?.command.type,"feed");
  assert.equal(next.game.commandHistory.at(-1)?.accepted,true);
  const clean=commandPlayerLife(next,{type:"clean"},birthMs+2*HOUR,"clean-2");
  const lights=commandPlayerLife(clean,{type:"lights",on:false},birthMs+2*HOUR,"rest-3");
  const medicine=commandPlayerLife(lights,{type:"medicine"},birthMs+2*HOUR,"treat-4");
  const active=commandPlayerLife(medicine,{type:"start-game",game:"training"},
    birthMs+2*HOUR,"play-5");
  assert.deepEqual(active.game.commandHistory.map(x=>x.id),
    ["feed-1","clean-2","rest-3","treat-4","play-5"]);
  assert.ok(active.game.commandHistory.every(x=>x.accepted));
  assert.deepEqual(identity(active),unchanged);
  assert.deepEqual(pet.game.commandHistory,[]);
  assert.equal(next.game.clock.startedAtMs,pet.game.clock.startedAtMs);
  assert.ok(active.game.careSamples.every(x=>Number.isSafeInteger(x.hour)));
  assert.equal(commandPlayerLife(active,{type:"clean"},birthMs+2*HOUR,"feed-1")
    .game.commandHistory.length,5,"native idempotent receipt prevents duplicate care");
});

test("[GAME-001/A2] native save/import and deterministic absent-to-active replay retain one organism",()=>{
  const born=birthPlayerLife({parts:source,seed:"PERSISTENT-FANTASY-4",
    mode:"infant",name:"Night glider"},birthMs);
  const after=commandPlayerLife(
    advancePlayerLife(born,birthMs+2*HOUR,"active"),
    {type:"feed",food:"meal"},birthMs+2*HOUR,"known-meal");
  const half=commandPlayerLife(after,{type:"clean"},
    birthMs+2*HOUR+HOUR/2,"fractional-clean");
  const offlineAt=birthMs+5*HOUR;
  const restored=decodePet(encodePet(portable(half)));
  assert.ok(restored.life);
  assert.notEqual(restored.seed,restored.life.seed,
    "editable preview must remain separate from committed living organism");
  assert.notDeepEqual(restored.parts,restored.life.parts);
  assert.deepEqual(restored.life,half);
  const resumed=advancePlayerLife(restored.life,offlineAt,"absent");
  const reference=advanceGame(half.game,offlineAt,"absent");
  assert.deepEqual(resumed.game,reference,
    "app-resume uses canonical offline event engine with explicit clock");
  assert.deepEqual(identity(resumed),identity(half));
  assert.deepEqual(resumed.game.commandHistory,half.game.commandHistory);
  assert.deepEqual(resumed.game.careSamples.slice(0,half.game.careSamples.length),
    half.game.careSamples,"earlier physiology samples survive offline advance");
  assert.equal(resumed.game.clock.nowMs,offlineAt);
  const next=commandPlayerLife(resumed,{type:"feed",food:"meal"},
    offlineAt+HOUR/4,"after-return-meal");
  assert.equal(next.game.commandHistory.at(-1)?.id,"after-return-meal");
  const secondExport=decodePet(encodePet(portable(next))).life!;
  assert.deepEqual(secondExport.game.commandHistory,next.game.commandHistory);
  assert.deepEqual(secondExport.game.careSamples,next.game.careSamples);
  assert.deepEqual(identity(secondExport),identity(born));
  const first=createPlayerLifeSimulation(next);
  const second=createPlayerLifeSimulation(secondExport);
  assert.equal(first.program.genomeIdentity,second.program.genomeIdentity);
  for(const h of [0,0.5,1,2,3,4,5]){
    const f=first.frameAt(h/24,{action:"idle",time:0});
    const g=second.frameAt(h/24,{action:"idle",time:0});
    assert.deepEqual(f,g,"export/import must replay same actual physical history at "+h);
  }
  assert.deepEqual(first.frameAt(atHour(next),{action:"idle",time:0}),
    second.frameAt(atHour(secondExport),{action:"idle",time:0}));
  assert.ok(first.frameAt(3/24,{time:0}).interaction.diagnostics);
  const preview=createSimulation(restored.parts,restored.seed,restored.mode);
  assert.notEqual(preview.program.sourceFingerprint,first.program.sourceFingerprint,
    "lab preview cannot replace saved life in the player render pathway");
  const canonicalCare=deriveCareTimeline(next.game);
  const context=deriveDevelopmentContext(next.game);
  assert.ok(canonicalCare.history.length>0 && context.stagePoints.length>0);
  assert.deepEqual(JSON.parse(encodePet(portable(next))).life.game.commandHistory,
    next.game.commandHistory);
});

test("[GAME-001/A2] background, failure and laboratory paths never silently reroll active pet",()=>{
  const pet=birthPlayerLife({parts:make(["rrr","rrr"],"body"),seed:"NOT-REROLLED",
    mode:"infant",name:"Mine"},birthMs);
  const saved=encodePet(portable(pet));
  const shadow=createSimulation(make(["r"],"decoration"),"LAB-ONLY-SEED");
  assert.notEqual(shadow.program.genomeIdentity,
    createPlayerLifeSimulation(pet).program.genomeIdentity);
  assert.deepEqual(decodePet(saved).life,pet);
  assert.throws(()=>decodePet(saved.slice(0,Math.floor(saved.length/2))),/Cannot open this pet/);
  assert.throws(()=>decodePet(JSON.stringify({...JSON.parse(saved),
    life:{...pet,seed:"TAMPERED"}})),/living game must match/);
  assert.deepEqual(decodePet(saved).life,pet,
    "invalid import must not mutate the resident object or its export");
  assert.deepEqual(advancePlayerLife(pet,birthMs-1,"absent"),pet);
  assert.deepEqual(advancePlayerLife(pet,birthMs,"active"),pet);
  const after=advancePlayerLife(pet,birthMs+HOUR,"absent");
  assert.equal(after.game.clock.nowMs,birthMs+HOUR);
  assert.equal(pet.game.clock.nowMs,birthMs);
  assert.deepEqual(identity(after),identity(pet));
});

test("[GAME-001/A2] real linked mechanics do not invent locomotion for unsupported sparse ink",()=>{
  const pet=birthPlayerLife({parts:make([".r.","rrr",".r."],"body"),
    seed:"STATIONARY-INK",mode:"infant",name:"Not a leg"},birthMs);
  const sim=createPlayerLifeSimulation(
    advancePlayerLife(pet,birthMs+HOUR,"active"));
  const frame=sim.frameAt(1/24,{time:5,action:"move"});
  const d=frame.interaction.diagnostics as Record<string,any>;
  assert.equal(frame.capabilities.canWalk,false);
  assert.equal(d.worldAdvance,0);
  assert.equal(d.locomotionSupported,false);
  assert.ok(frame.parts.some(part=>part.pixels.length>0));
});

test("[GAME-001/A1/A2] actual player UI does not demand taxonomy, and keeps lab secondary",()=>{
  const panel=readFileSync("src/components/GamePanel.tsx","utf8");
  const app=readFileSync("App.tsx","utf8");
  const storage=readFileSync("src/storage.ts","utf8");
  assert.ok(panel.includes('label="Meal"')||panel.includes('action("Meal"'));
  for(const label of ["Clean","Medicine","Lights off","Training"])
    assert.ok(panel.includes(label),"native control remains available: "+label);
  assert.doesNotMatch(panel,/Animal affinity|lineageLabel|genome fingerprint|phylogeny/i);
  assert.ok(app.includes('createSimulation(life.parts, life.seed, life.mode'));
  assert.ok(app.includes('careGame: life.game'));
  assert.ok(app.includes('previewFrame = useMemo('));
  assert.match(app, /playing(?:\s*&& !devEnabled)?\s*\? null\s*:/);
  assert.ok(app.includes('onCommand={(command) => void careCommand(command)}'));
  assert.ok(app.includes('setSandbox(true)'));
  assert.doesNotMatch(storage,/multiRemove|removeItem/);
  assert.ok(storage.includes('writePayload(PET_KEY, raw)'));
  assert.equal(GAME_RULES.id,"infipet-classic-v3");
});
