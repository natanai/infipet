import type {PartKind,PetPart} from "./simulation";
import {PRESET_COLORS} from "./palette";

/**
 * Twelve ORIGINAL, minimal player drawings. No prior starter geometry or
 * hardcoded adult sprites are retained. These are editable birth material,
 * not named species. The ordinary 32x32 drawing path and all anatomical
 * operators work identically for a hand-drawn pet.
 *
 * Each stored alphanumeric seed is a NORMAL readable-seed-v1 script.
 * Repeated explicit opportunities increase the probability of expressed
 * anatomy without guaranteeing an outcome or bypassing source/chaos/care.
 * No preset IDs are passed to the developmental program.
 */
export type StarterPreset=Readonly<{
 id:string;seed:string;description:string;parts:PetPart[];
}>;
export type HouseholdPreset=StarterPreset;
type Ink=Readonly<{
 id:string;kind:PartKind;x:number;y:number;rows:readonly string[];
 parentId?:string|null;
}>;
const colors:Readonly<Record<string,string>>={
 k:PRESET_COLORS[0],s:PRESET_COLORS[1],d:PRESET_COLORS[2],
 m:PRESET_COLORS[3],l:PRESET_COLORS[4],w:PRESET_COLORS[5],
 c:PRESET_COLORS[6],r:PRESET_COLORS[7],p:PRESET_COLORS[8],
 g:PRESET_COLORS[9],o:PRESET_COLORS[10],q:PRESET_COLORS[11],
};
function build(ink:readonly Ink[]):PetPart[]{
 return ink.map((p,i)=>({
  id:p.id,kind:p.kind,name:p.id.replace(/-/g," "),
  parentId:p.parentId===undefined?(p.id==="body"?null:"body"):p.parentId,
  position:{x:p.x,y:p.y},layer:i,
  pixels:p.rows.flatMap((row,y)=>[...row].flatMap((symbol,x)=>
    symbol==="."?[]:[{x,y,color:colors[symbol]??(()=>{throw new Error("Unknown starter pigment "+symbol)})()}])),
 }));
}
const designs:ReadonlyArray<Readonly<{
 id:string;seed:string;description:string;ink:readonly Ink[];
}>>=[
 {id:"dot",seed:"8E8L8WBRZ",
  description:"Minimal round cell; pluripotent Body ink with no named organs",ink:[
   {id:"body",kind:"body",x:14,y:14,rows:[".ccc.","ccccc","ccccc","ccccc",".ccc."]},
 ]},
 {id:"ribbon",seed:"8H8I8TGRZ",
  description:"Low, long Body ribbon with two original end lobes",ink:[
   {id:"body",kind:"body",x:10,y:15,rows:[
    "..gggggggg..",".gggggggggg.","gggggggggggg",".gggggggggg.","..gggggggg.."]},
 ]},
 {id:"spire",seed:"8W8A8FQRZ",
  description:"Very narrow vertical Body stalk with a small crown",ink:[
   {id:"body",kind:"body",x:14,y:10,rows:[
    "..p..",".ppp.","ppppp",".ppp.","..p..","..p..","..p..",
    "..p..","..p..",".ppp.",".ppp."]},
 ]},
 {id:"halo",seed:"8M8E8JBRZ",
  description:"A simple ring of Body ink surrounding a protected opening",ink:[
   {id:"body",kind:"body",x:12,y:12,rows:[
    "..ooooo..",".oo...oo.","oo.....oo","oo.....oo",
    "oo.....oo","oo.....oo","oo.....oo",".oo...oo.","..ooooo.."]},
 ]},
 {id:"fork",seed:"8C8L8WGRZ",
  description:"Compact Body core with two separately authored upper arms",ink:[
   {id:"body",kind:"body",x:13,y:15,rows:[".rrrr.","rrrrrr","rrrrrr",".rrrr.","..rr.."]},
   {id:"arm-left",kind:"arm",x:10,y:11,rows:["rr..","rr..",".rr.",".rr."]},
   {id:"arm-right",kind:"arm",x:18,y:11,rows:["..rr","..rr",".rr.",".rr."]},
 ]},
 {id:"drop",seed:"8F8H8ASRZ",
  description:"Asymmetric teardrop Body with an independently authored short tail",ink:[
   {id:"body",kind:"body",x:11,y:11,rows:[
    "......mm...",".....mmmm..","....mmmmmm.","..mmmmmmmm.",
    ".mmmmmmmmm.","mmmmmmmmmm.","mmmmmmmmm..",".mmmmmm....","...mmm....."]},
   {id:"tail",kind:"tail",x:7,y:18,rows:["..mmm","mmmm.",".mm.."]},
 ]},
 {id:"mushroom",seed:"8I8W8TBRZ",
  description:"Wide shallow head perched above a very small Body stalk",ink:[
   {id:"body",kind:"body",x:15,y:17,rows:["oo","oo","oo","oo","oo"]},
   {id:"cap",kind:"head",x:11,y:11,rows:[
    "...qqqq...","..qqqqqq..",".qqqqqqqq.","qqqqqqqqqq","qqqqqqqqqq"]},
 ]},
 {id:"kite",seed:"8E8L8HGRZ",
  description:"Diamond-shaped Body with short distinct wing sheets",ink:[
   {id:"body",kind:"body",x:13,y:11,rows:[
    "...l...","..lll..",".lllll.","lllllll",
    ".lllll.","..lll..","...l..."]},
   {id:"left-wing",kind:"wing",x:7,y:13,rows:["..llll","llllll",".llll."]},
   {id:"right-wing",kind:"wing",x:20,y:13,rows:["llll..","llllll",".llll."]},
 ]},
 {id:"twins",seed:"8M8W8FBRZ",
  description:"Two separate small Body islands with independent original material",ink:[
   {id:"body",kind:"body",x:9,y:14,rows:[".cccc.","cccccc","cccccc",".cccc."]},
   {id:"satellite",kind:"body",x:20,y:14,parentId:null,
    rows:[".pppp.","pppppp","pppppp",".pppp."]},
 ]},
 {id:"crescent",seed:"8A8I8JGRZ",
  description:"Thin curved Body arc with genuine open negative space",ink:[
   {id:"body",kind:"body",x:10,y:9,rows:[
    ".....sssss","...sss...s","..ss......","..ss......",
    ".ss.......",".ss.......","..ss......","..ss......",
    "...sss...s",".....sssss"]},
 ]},
 {id:"tripod",seed:"8E8W8TBRZ",
  description:"Small rounded Body connected to three distinct supports",ink:[
   {id:"body",kind:"body",x:13,y:11,rows:[".gggg.","gggggg","gggggg",".gggg."]},
   {id:"left-leg",kind:"leg",x:12,y:15,rows:["gg","gg","gg","gg","gg"]},
   {id:"middle-leg",kind:"leg",x:16,y:15,rows:["gg","gg","gg","gg","gg"]},
   {id:"right-leg",kind:"leg",x:19,y:15,rows:["gg","gg","gg","gg","gg"]},
 ]},
 {id:"zigzag",seed:"8L8F8HGRZ",
  description:"Angular, irregular zigzag of undifferentiated Body material",ink:[
   {id:"body",kind:"body",x:9,y:12,rows:[
    "rrr..........",".rrrr........","...rrrr......",
    ".....rrrr....",".......rrrr..",".........rrrr",
    "........rrrr.","......rrrr...","....rrrr.....",
    "..rrrr.......","rrrr........."]},
 ]},
];
export const STARTER_PRESETS:readonly StarterPreset[]=designs.map(d=>({
 id:d.id,seed:d.seed,description:d.description,parts:build(d.ink)
}));
for(const preset of STARTER_PRESETS){
 for(const part of preset.parts){
  part.pixels.forEach(Object.freeze);
  Object.freeze(part.pixels);Object.freeze(part.position);Object.freeze(part);
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
