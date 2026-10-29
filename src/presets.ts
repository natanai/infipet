import type {PartKind,PetPart} from "./simulation";
import {PRESET_COLORS} from "./palette";

/**
 * Original 32x32 pixel-creatures. These are editable birth drawings, never
 * species destinations or hidden evolution templates. Design vocabulary is
 * broadly retro virtual-pet / handheld-monster, with no copied silhouettes.
 * All ink belongs to the player's normal 12-color brush palette.
 *
 * A starter's stable seed is a NORMAL readable-seed-v1 genetic script:
 * decimal tickets immediately before A-Z gene letters, with no mascot name,
 * hidden special case or optimized preset outcome encoded. The exact same
 * compiler, fixed seed roll, chronological care and source-owned physiology
 * are used for hand-drawn pets. Players can edit the seed after loading.
 * These fixed examples are NOT preverified adult forms or hardcoded evolutions.
 */
export type StarterPreset=Readonly<{
 id:string;seed:string;description:string;parts:PetPart[];
}>;
export type HouseholdPreset=StarterPreset;
type Ink=Readonly<{id:string;kind:PartKind;x:number;y:number;rows:readonly string[];parentId?:string|null}>;
const swatches:Record<string,string>={
 k:PRESET_COLORS[0],s:PRESET_COLORS[1],d:PRESET_COLORS[2],
 m:PRESET_COLORS[3],l:PRESET_COLORS[4],w:PRESET_COLORS[5],
 c:PRESET_COLORS[6],r:PRESET_COLORS[7],p:PRESET_COLORS[8],
 g:PRESET_COLORS[9],o:PRESET_COLORS[10],q:PRESET_COLORS[11],
};
function build(parts:readonly Ink[]):PetPart[]{
 return parts.map((p,i)=>({
  id:p.id,kind:p.kind,name:p.id.replace(/-/g," "),
  parentId:p.parentId===undefined?(p.id==="body"?null:"body"):p.parentId,
  position:{x:p.x,y:p.y},layer:i,
  pixels:p.rows.flatMap((row,y)=>[...row].flatMap((a,x)=>
    a==="."?[]:[{x,y,color:swatches[a]??(()=>{throw Error("Unknown preset ink "+a)})()}])),
 }));
}
const designs:ReadonlyArray<Readonly<{
 id:string;seed:string;description:string;ink:readonly Ink[];
}>>=[
 {id:"pippo",seed:"2W2F2TBGQZ",description:"Round body, two broad ears and tiny feet",ink:[
  {id:"body",kind:"body",x:9,y:11,rows:[
   "....mmmmmmmm....","..mmllllllllmm..",".mmllwwwwwwllmm.","mmllwwwwwwwwllmm",
   "mllwwwwwwwwwwllm","mllwwwwwwwwwwllm","mllwwwwwwwwwwllm",
   "mmllwwwwwwwwllmm",".mmllwwwwwwllmm.","..mmllllllllmm..",
   "....mmmmmmmm...."]},
  {id:"ear-left",kind:"ear",x:8,y:5,rows:["..mmmm..",".mllllm.","mllllllm","mllllllm",".mllllm.","..mmmm.."]},
  {id:"ear-right",kind:"ear",x:19,y:5,rows:["..mmmm..",".mllllm.","mllllllm","mllllllm",".mllllm.","..mmmm.."]},
  {id:"feet",kind:"leg",x:12,y:21,rows:["mmm...mmm","mmmm.mmmm"]},
  {id:"eye-left",kind:"eye",x:13,y:15,rows:["k"]},
  {id:"eye-right",kind:"eye",x:17,y:15,rows:["k"]},
  {id:"cheeks",kind:"decoration",x:14,y:16,rows:["q.q"]},
  {id:"mouth",kind:"mouth",x:15,y:17,rows:["k"]},
 ]},
 {id:"brumby",seed:"2H3W2AGKRZ",description:"A low armored quadruped with strong feet",ink:[
  {id:"body",kind:"body",x:6,y:12,rows:[
   "...sssssssssss....",".ssdddddddddddss..","ssddooooooooooddss",
   "sdooddddddddddooods","sdoooooooooooooods","ssddooooooooooddss",
   ".ssdddddddddddss..","...sssssssssss...."]},
  {id:"head",kind:"head",x:20,y:11,rows:["..ssssss.",".ssllllss","ssllwwlls","sslllllls",".sssssss"]},
  {id:"legs",kind:"leg",x:9,y:19,rows:["sss...sss...sss","sss...sss...sss","sss...sss...sss"]},
  {id:"tail",kind:"tail",x:3,y:14,rows:["..sss","ssss.","sss.."]},
  {id:"eye",kind:"eye",x:25,y:14,rows:["k"] ,parentId:"head"},
 ]},
 {id:"glim",seed:"2T3I2LBGYZ",description:"A soft floating bell with four rounded arms",ink:[
  {id:"body",kind:"body",x:9,y:6,rows:[
   ".....ccccc.....","...ccccccccc...","..ccwwwwwwwcc..",".ccwwwwwwwwwcc.",
   "ccwwwwwwwwwwwcc","ccwwwwwwwwwwwcc","ccwwwwwwwwwwwcc",
   ".ccwwwwwwwwwcc.","..ccccccccccc..","....ccccccc...."]},
  {id:"arm-left",kind:"arm",x:5,y:15,rows:["cccc...","cccc...","cccc...","cccc...","..cc...","...cc.."]},
  {id:"arm-mid-left",kind:"arm",x:12,y:16,rows:["ccc","ccc","ccc","ccc","ccc"]},
  {id:"arm-mid-right",kind:"arm",x:18,y:16,rows:["ccc","ccc","ccc","ccc","ccc"]},
  {id:"arm-right",kind:"arm",x:24,y:15,rows:["...cccc","...cccc","...cccc","...cccc","..cc...","..cc..."]},
  {id:"eyes",kind:"eye",x:13,y:11,rows:["k....k","k....k"]},
  {id:"mouth",kind:"mouth",x:15,y:15,rows:["kk"]},
 ]},
 {id:"thimbleaf",seed:"2C3H2FBGRZ",description:"A leafy crest above a rounded seed body",ink:[
  {id:"body",kind:"body",x:11,y:14,rows:[
   "...gggggg...","..ggllllgg..",".ggllllllgg.","ggllllllllgg",
   "ggllllllllgg",".ggllllllgg.","..ggllllgg..","...gggggg..."]},
  {id:"leaf-left",kind:"wing",x:4,y:5,rows:["....gg....","..ggggg...","gggggggg..","ggggggggg.","..gggggggg","....gggggg","......gggg",".......gg."]},
  {id:"leaf-right",kind:"wing",x:17,y:4,rows:["......gg.","....ggggg","..ggggggg","ggggggggg","gggggggg.","..ggggg..","....gg..."]},
  {id:"roots",kind:"leg",x:11,y:22,rows:["gg...gggg","gg...gggg","gg...gggg"]},
  {id:"eyes",kind:"eye",x:14,y:17,rows:["k...k"]},
 ]},
 {id:"vellune",seed:"3L2I2FSGQZ",description:"A diamond-winged glider with a narrow core",ink:[
  {id:"body",kind:"body",x:13,y:9,rows:[
   "..pppp..",".ppwwpp.","ppwwwwpp","ppwwwwpp","ppwwwwpp",
   ".ppwwpp.","..pppp..","..pppp..","..pppp.."]},
  {id:"wing-left",kind:"wing",x:2,y:6,rows:[
   "......ppp...","....ppppp...","..ppppppp...","pppppppppp..",
   "pppppppppppp","..pppppppppp","....pppppp..","......ppp..."]},
  {id:"wing-right",kind:"wing",x:20,y:6,rows:[
   "...ppp......","...ppppp....","...ppppppp..","..pppppppppp",
   "pppppppppppp","pppppppppp..","..pppppp....","...ppp......"]},
  {id:"tail",kind:"tail",x:15,y:18,rows:["pp","pp","pp","pp","pp","pp"]},
  {id:"eye",kind:"eye",x:16,y:12,rows:["k"]},
 ]},
 {id:"craggle",seed:"2W3T2MDKRZ",description:"A compact segmented shell with sturdy joints",ink:[
  {id:"body",kind:"body",x:9,y:11,rows:[
   "....ssssss....","..ssmmmmmmss..",".ssmllllllmss.","ssmllooooollmss",
   "smlloooooo llms".replace(" ",""),"smllooooooollms",
   "ssmllooooollmss",".ssmllllllmss.","..ssmmmmmmss..","....ssssss...."]},
  {id:"head",kind:"head",x:13,y:6,rows:["..ssss..",".ssmmss.","ssmmm mss".replace(" ",""),".ssmmss.","..ssss.."]},
  {id:"legs-left",kind:"leg",x:5,y:14,rows:["ssss...","sssss..",".ssss..","..ssss."]},
  {id:"legs-right",kind:"leg",x:24,y:14,rows:["...ssss","..sssss","..ssss.",".ssss.."]},
  {id:"eyes",kind:"eye",x:15,y:8,rows:["k..k"],parentId:"head"},
  {id:"seam",kind:"decoration",x:15,y:14,rows:["kk","kk","kk","kk"]},
 ]},
 {id:"nibblet",seed:"3W2F2TBGRZ",description:"A broad-headed biped with mobile antennae",ink:[
  {id:"body",kind:"body",x:11,y:13,rows:["..rrrrrr..",".rrqqqqrr.","rrqqqqqqrr","rrqqqqqqrr","rrqqqqqqrr",".rrqqqqrr.","..rrrrrr.."]},
  {id:"head",kind:"head",x:10,y:6,rows:["..rrrrrrrr..",".rrqqqqqqrr.","rrqqqqqqqqrr","rrqqqqqqqqrr","rrqqqqqqqqrr",".rrqqqqqqrr.","..rrrrrrrr.."]},
  {id:"antenna-left",kind:"horn",x:10,y:3,rows:["rrrr.","rrrr.","..rr."]},
  {id:"antenna-right",kind:"horn",x:19,y:3,rows:[".rrrr",".rrrr",".rr.."]},
  {id:"arm-left",kind:"arm",x:6,y:15,rows:["rrrrr","rrrrr","..rrr"]},
  {id:"arm-right",kind:"arm",x:21,y:15,rows:["rrrrr","rrrrr","rrr.."]},
  {id:"leg-left",kind:"leg",x:12,y:20,rows:["rrr","rrr","rrrr"]},
  {id:"leg-right",kind:"leg",x:19,y:20,rows:["rrr","rrr","rrrr"]},
  {id:"eyes",kind:"eye",x:14,y:9,rows:["k....k"] ,parentId:"head"},
 ]},
 {id:"orbini",seed:"2L3H2CUGQZ",description:"A hollow ring organism with trailing fins",ink:[
  {id:"body",kind:"body",x:7,y:8,rows:[
   "......cccc......","....cccccccc....","..ccc......ccc..",
   ".ccc..........ccc","ccc............ccc","ccc............ccc",
   "ccc............ccc","ccc............ccc","ccc............ccc",
   ".ccc..........ccc","..ccc......ccc..","....cccccccc....",
   "......cccc......"]},
  {id:"fin-left",kind:"wing",x:3,y:15,rows:["ccccc.","cccccc",".ccccc","..cccc","...ccc"]},
  {id:"fin-right",kind:"wing",x:24,y:15,rows:[".ccccc","cccccc","ccccc.","cccc..","ccc..."]},
  {id:"eye-left",kind:"eye",x:11,y:13,rows:["ww","ww"]},
  {id:"eye-right",kind:"eye",x:19,y:13,rows:["ww","ww"]},
  {id:"mouth",kind:"mouth",x:15,y:18,rows:["ww"]},
 ]},
 {id:"spoori",seed:"3W2T2FGYZ",description:"A wide fungal cap over a sturdy short stalk",ink:[
  {id:"body",kind:"body",x:13,y:15,rows:["..oooo..",".oolloo.","oolllloo","oolllloo","oolllloo",".oolloo.","..oooo..","..oooo.."]},
  {id:"cap",kind:"head",x:6,y:6,rows:[
   "......qqqqqq......","....qqqqqqqqqq....","..qqqqqqqqqqqqqq..",
   ".qqqqqqqqqqqqqqqq.","qqqqqqqqqqqqqqqqqq","oooooooooooooooooo",
   ".oooooooooooooooo.","...oooooooooooo..."]},
  {id:"spots",kind:"decoration",x:10,y:9,rows:["ww...ww...ww",".w........w."] ,parentId:"cap"},
  {id:"feet",kind:"leg",x:11,y:22,rows:["oooo...oooo","oooo...oooo"]},
  {id:"eyes",kind:"eye",x:15,y:17,rows:["k...k"]},
 ]},
 {id:"tukkin",seed:"2I2A3TBRQZ",description:"A round owl-like creature with broad horns",ink:[
  {id:"body",kind:"body",x:9,y:10,rows:[
   "...gggggggg...","..ggllllllgg..",".ggllllllllgg.","ggllllllllllgg",
   "ggllllllllllgg","ggllllllllllgg","ggllllllllllgg",
   ".ggllllllllgg.","..ggllllllgg..","...gggggggg..."]},
  {id:"horn-left",kind:"horn",x:6,y:5,rows:["ggggg","ggggg",".gggg","..ggg"]},
  {id:"horn-right",kind:"horn",x:21,y:5,rows:["ggggg","ggggg","gggg.","ggg.."]},
  {id:"wing-left",kind:"wing",x:5,y:15,rows:["ggggg","ggggg","ggggg",".gggg"]},
  {id:"wing-right",kind:"wing",x:22,y:15,rows:["ggggg","ggggg","ggggg","gggg."]},
  {id:"feet",kind:"leg",x:12,y:20,rows:["ggg....ggg","ggg....ggg"]},
  {id:"eyes",kind:"eye",x:13,y:13,rows:["kk....kk","kk....kk"]},
  {id:"beak",kind:"mouth",x:16,y:17,rows:["oo","oo"]},
 ]},
 {id:"flinta",seed:"3A2H2CBGZ",description:"A long curved body with fins and a heavy head",ink:[
  {id:"body",kind:"body",x:6,y:12,rows:[
   "...pppppppp......",".ppwwwwwwwwpp....","ppwwwwwwwwwwpp...",
   "ppwwwwwwwwwwwpp..",".ppwwwwwwwwwwpp.","..ppwwwwwwwwwwpp",
   "....pppppppppppp","......pppppppp.."]},
  {id:"head",kind:"head",x:18,y:8,rows:["..pppppp..",".ppwwwwpp.","ppwwwwwwpp","ppwwwwwwpp",".ppwwwwpp.","..pppppp.."]},
  {id:"tail",kind:"tail",x:3,y:9,rows:["pp......","pppp....",".pppppp.","..pppppp","....pppp"]},
  {id:"fin-back",kind:"wing",x:11,y:7,rows:["....pp....","..pppppp..","pppppppppp"]},
  {id:"legs",kind:"leg",x:11,y:20,rows:["pppp...pppp","pppp...pppp"]},
  {id:"eye",kind:"eye",x:24,y:11,rows:["k"] ,parentId:"head"},
 ]},
 {id:"vespri",seed:"2L3T2IMGRZ",description:"A small core with four distinct rounded wings",ink:[
  {id:"body",kind:"body",x:14,y:10,rows:["..qqqq..",".qqwwqq.","qqwwwwqq","qqwwwwqq","qqwwwwqq","qqwwwwqq",".qqwwqq.","..qqqq..","..qqqq.."]},
  {id:"upper-left",kind:"wing",x:3,y:4,rows:[
   "......ppp..","....pppppp.","..ppppppppp","ppppppppppp",
   "pppppppppp.","..ppppppp..","....ppp...."]},
  {id:"upper-right",kind:"wing",x:20,y:4,rows:[
   "..ppp......",".pppppp....","ppppppppp..","ppppppppppp",
   ".pppppppppp","..ppppppp..","....ppp...."]},
  {id:"lower-left",kind:"wing",x:5,y:16,rows:["..ppppppp","ppppppppp","pppppppp.","..ppppp..","....pp..."]},
  {id:"lower-right",kind:"wing",x:20,y:16,rows:["ppppppp..","ppppppppp",".pppppppp","..ppppp..","...pp...."]},
  {id:"antennae",kind:"horn",x:13,y:5,rows:["pp.....pp","pp.....pp",".pp...pp."]},
  {id:"eyes",kind:"eye",x:16,y:12,rows:["k..k"]},
 ]},
];
export const STARTER_PRESETS:readonly StarterPreset[]=designs.map(d=>({
 id:d.id,seed:d.seed,description:d.description,parts:build(d.ink)
}));
for(const preset of STARTER_PRESETS){
 for(const part of preset.parts){
   part.pixels.forEach(Object.freeze);Object.freeze(part.pixels);
   Object.freeze(part.position);Object.freeze(part);
 }
 Object.freeze(preset.parts);Object.freeze(preset);
}
Object.freeze(STARTER_PRESETS);
export const HOUSEHOLD_PRESETS=STARTER_PRESETS;
export function clonePreset(id:string):PetPart[]{
 const preset=STARTER_PRESETS.find(candidate=>candidate.id===id);
 if(!preset)throw new RangeError("Unknown starter preset: "+id);
 return preset.parts.map(p=>({...p,position:{...p.position},pixels:p.pixels.map(c=>({...c}))}));
}
