import React,{useEffect,useState} from "react";
import {Pressable,Text,View} from "react-native";
import Slider from "@react-native-community/slider";
import {T,terminal as s} from "../theme";
import {PetPixels} from "./PetPixels";
import type {Pixel} from "../simulation";
import {DEFAULT_MORPH_TUNING,MORPH_KINDS,MORPH_OPERATOR_HELP,
 type MorphologyTuning,type MorphologyShapeMetrics,
} from "../interface/morphology-tuning";

type Compare=Readonly<{age:number;seed:string;original:MorphologyShapeMetrics;
 experimental:MorphologyShapeMetrics;originalPixels:Pixel[];experimentalPixels:Pixel[];
 recipe:string}>;
const textStyle={...s.muted,fontSize:13,lineHeight:17};
const labelStyle={...s.text,fontSize:15,lineHeight:18};
const btn={borderWidth:1,borderColor:T.line,paddingVertical:9,paddingHorizontal:9,
 backgroundColor:T.bg,justifyContent:"center" as const,alignItems:"center" as const};
const cap=(n:number)=>Math.max(0,Math.min(2,Math.round(n*20)/20));
export function MorphologyWorkbench({
 value,onApply,onCompare,age,
}:{
 value:Readonly<MorphologyTuning>;
 onApply:(next:MorphologyTuning)=>void;
 onCompare:()=>Compare;
 age:number;
}){
 const [open,setOpen]=useState(false);
 const [draft,setDraft]=useState<MorphologyTuning>({...value});
 const [report,setReport]=useState<Compare|null>(null);
 const [error,setError]=useState("");
 useEffect(()=>{setDraft({...value});setReport(null);},[value]);
 const change=(kind:keyof MorphologyTuning,next:number)=>{
   setDraft(v=>({...v,[kind]:cap(next)}));setReport(null);
 };
 const dirty=MORPH_KINDS.some(k=>draft[k]!==value[k]);
 const sameShape=report?JSON.stringify(report.originalPixels)===JSON.stringify(report.experimentalPixels):false;
 const camera=(()=>{
   if(!report)return "0 0 64 64";
   const both=[...report.originalPixels,...report.experimentalPixels];
   if(!both.length)return "0 0 64 64";
   const xs=both.map(p=>p.x),ys=both.map(p=>p.y);
   const minX=Math.min(...xs),maxX=Math.max(...xs);
   const minY=Math.min(...ys),maxY=Math.max(...ys);
   // Common square camera; preserve relative proportions, never scale the
   // two comparison creatures independently or draw fabricated material.
   const span=Math.max(14,maxX-minX+5,maxY-minY+5);
   const x=(minX+maxX-span+1)/2,y=(minY+maxY-span+1)/2;
   return [x,y,span,span].join(" ");
 })();
 return (
  <View style={{borderWidth:1,borderColor:T.line,padding:8,gap:7}}>
   <Pressable accessibilityRole="button"
     accessibilityLabel="Expand morphology workbench"
     accessibilityState={{expanded:open}}
     onPress={()=>setOpen(v=>!v)}
     style={[btn,{alignItems:"flex-start"}]}>
     <Text style={s.bright}>{open?"[-]":"[+]"} MORPHOLOGY WORKBENCH</Text>
   </Pressable>
   {open&&<>
    <Text style={textStyle}>
     Developer-only counterfactual: adjust existing material operator expression
     (0–200% of inherited baseline). The permanent genome, chaotic seed, source
     drawing, clock and saved life are unchanged. A zero-potential operator
     cannot be invented by a slider.
    </Text>
    <Text style={textStyle}>
     Release a slider to apply its preview. Hiding developer tools keeps
     the experiment on screen; use the pet icon to return to your saved pet.
    </Text>
    <Text style={textStyle}>
     Only scheduled material operators respond here; iterative growth fields,
     chaos, care, and rig motion use other algorithms.
     {age<1?" Day 0 must preserve the original ink; seek a later day to test development.":""}
    </Text>
    {MORPH_KINDS.map(kind=><View key={kind} style={{gap:2}}>
     <View style={{flexDirection:"row",justifyContent:"space-between",gap:4}}>
      <Text style={labelStyle}>{kind.toUpperCase()}</Text>
      <Text style={labelStyle}>{Math.round(draft[kind]*100)}%</Text>
     </View>
     <Text style={textStyle}>{MORPH_OPERATOR_HELP[kind]}</Text>
     <Slider accessibilityLabel={kind+" operator expression"}
       accessibilityHint="Only adjusts the experimental development preview, not your real pet"
       minimumValue={0} maximumValue={2} step={0.05} value={draft[kind]}
       onValueChange={n=>change(kind,n)}
       onSlidingComplete={n=>{const next={...draft,[kind]:cap(n)};
         setDraft(next);onApply(next);setReport(null);setError("");}}
       minimumTrackTintColor={T.text} maximumTrackTintColor={T.line}
       thumbTintColor={T.bright} style={{width:"100%",height:28}}/>
    </View>)}
    <Pressable accessibilityRole="button" accessibilityLabel="Reset experimental morphology settings"
       onPress={()=>{const v={...DEFAULT_MORPH_TUNING};setDraft(v);onApply(v);
         setReport(null);setError("");}} style={btn}>
       <Text style={s.text}>Reset operator tuning</Text>
    </Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="Compare original and experimental physical morphology"
     disabled={dirty} onPress={()=>{try{setReport(onCompare());setError("");}
      catch(err){setReport(null);setError(err instanceof Error?err.message:"Comparison failed");}}}
     style={[btn,{opacity:dirty?0.45:1}]}>
     <Text style={s.bright}>Compare physical anatomy at this day</Text>
    </Pressable>
    {dirty&&<Text style={textStyle}>Finish sliding to evaluate the adjusted anatomy.</Text>}
    {!!error&&<Text style={[textStyle,{color:T.warning}]}>{error}</Text>}
    {report&&<>
      <Text style={s.bright}>PHYSICAL COMPARISON · DAY {report.age.toFixed(2)}</Text>
      {sameShape&&<Text style={textStyle}>
        No physical change at this day. This may be a legitimate genetic or
        anatomical null response, or the adjusted operators may not govern
        the dominant growth path. Do not treat this as a successful transformation.
      </Text>}
      <View style={{flexDirection:"row",gap:6,justifyContent:"center"}}>
       <View style={{alignItems:"center",gap:3}}>
        <Text style={textStyle}>Original program</Text>
        <PetPixels pixels={report.originalPixels} size={118} gridSize={64} viewBox={camera}/>
       </View>
       <View style={{alignItems:"center",gap:3}}>
        <Text style={textStyle}>Adjusted program</Text>
        <PetPixels pixels={report.experimentalPixels} size={118} gridSize={64} viewBox={camera}/>
       </View>
      </View>
      <Text style={textStyle}>These are the actual unposed material-cell maps at the selected day, not an evolution target or hand-approved image. The measurements below help interpret what changed.</Text>
      <View style={{flexDirection:"row",gap:8}}>
        <Text style={[textStyle,{flex:1}]}>Metric</Text>
        <Text style={[textStyle,{flex:1,textAlign:"right"}]}>Original</Text>
        <Text style={[textStyle,{flex:1,textAlign:"right"}]}>Adjusted</Text>
      </View>
      {([
       ["Cells","cells"],["Authored relocations","relocated"],["Resorbed source","removed"],
       ["Interior cells","internalCells"],["Thin cells %","thinFraction"],["Solidity","solidity"],
       ["Width","width"],["Height","height"],["Tissues","tissues"],["Links","links"],
      ] as const).map(([label,key])=><View key={key} style={{flexDirection:"row",gap:8}}>
        <Text style={[textStyle,{flex:1}]}>{label}</Text>
        <Text style={[textStyle,{flex:1,textAlign:"right"}]}>{key==="thinFraction"||key==="solidity"?
          (report.original[key]*100).toFixed(1)+"%":report.original[key]}</Text>
        <Text style={[textStyle,{flex:1,textAlign:"right"}]}>{key==="thinFraction"||key==="solidity"?
          (report.experimental[key]*100).toFixed(1)+"%":report.experimental[key]}</Text>
      </View>)}
      <Text style={textStyle}>A large silhouette or many cells do not prove meaningful anatomy. Compare thickness, material redistribution, and topology together. These descriptive numbers are not pass/fail judgments.</Text>
      <Text selectable style={[textStyle,{fontSize:12}]}>{report.recipe}</Text>
      <Text style={textStyle}>Select the JSON recipe to copy it into an agent review.</Text>
    </>}
   </>}
  </View>
 );
}
