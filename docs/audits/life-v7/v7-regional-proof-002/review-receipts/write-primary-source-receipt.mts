// Manual visual judgments transcribed after viewing the frozen comparison PNGs.
// The code copies template identities/hashes; it does not generate visual scores.
import {readFile,writeFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {validateReviews} from '../../../../../tools/source-audit/reviews.ts';

const dir=resolve('docs/audits/life-v7/v7-regional-proof-002');
const templates=JSON.parse(await readFile(join(dir,'review-template.json'),'utf8'));
const selected=templates.filter((row:any)=>row.kind==='source-counterfactual');
const ids=[...new Set(selected.flatMap((r:any)=>[r.caseId,r.controlCaseId]))] as string[];
const cases=await Promise.all(ids.map(async id=>JSON.parse(gunzipSync(await readFile(join(dir,'data',`${id}.json.gz`))).toString())));
const views=new Map(cases.flatMap(c=>c.views).map(v=>[v.id,v]));
const provenance=JSON.parse(await readFile(join(dir,'review-receipts/source-comparisons/provenance.json'),'utf8'));
const manualCoherence:any={s01:{0:3,30:1,75:1,120:2},s02:{0:3,30:2,75:2,120:1}};
const manualDescent:any={
 'body-ratio':{s01:[3,2,2,2],s02:[3,2,2,2]},
 'body-bend':{s01:[3,2,2,2],s02:[3,2,2,2]},
 'attachment-length':{s01:[2,2,2,2],s02:[2,2,2,2]},
 'face-spacing':{s01:[2,2,2,2],s02:[2,2,2,2]},
 'palette-control':{s01:[3,3,3,3],s02:[3,3,3,3]},
 'ordering-control':{s01:[3,3,3,3],s02:[3,3,3,3]},
};
const cues:any={
 'body-ratio':{
  s01:{0:'The edited infant trunk is visibly longer and flatter under the same head and legs.',30:'The edited lower trunk is broader/flatter and the two main masses meet at a different angle. This is a source-conditioned body difference, with noticeable coupled head/stance movement.',75:'The original rounded upper arch becomes a more elongated/open trunk arrangement in the edit; the cranial position also shifts upward.',120:'The edited belly/fore mass is broader and more angular relative to the head; the original is a more rounded compact body.'},
  s02:{0:'The edited infant trunk is visibly longer and flatter under the same head and legs.',30:'The edit has a broader, flatter body relative to its feet and head, with altered shoulder placement.',75:'The edited trunk has a taller open arch and a different posterior-to-central mass balance; source response is clear but not restricted to only one patch.',120:'The lower trunk is a broader, more angular slanted mass in the edit; the head and neck remain recognizable but coupled placement differs.'}},
 'body-bend':{
  s01:{0:'The authored upper/lower trunk outline has a visible bowed/stepped bend.',30:'The edited waist/lower trunk has a different asymmetric turn and contour from the original upright form.',75:'The edited trunk forms a taller open arch with a straighter narrow side and curved opposing boundary, unlike the original rounded upper hump.',120:'The edited lower-body inner outline and front/upper mass turn differ visibly; this is not a pigment-only change.'},
  s02:{0:'The authored upper/lower trunk outline has a visible bowed/stepped bend.',30:'The bowed source produces a different upper/lower torso contour and mass junction around the shoulder.',75:'The edit develops a high open arch and visibly changed inner trunk boundary compared with the broader original.',120:'The edit has a substantially more open C-like trunk/neck-side boundary rather than the original mostly filled slanted lower mass.'}},
 'attachment-length':{
  s01:{0:'The edited source tail extends farther left. The stretch fixture itself introduces a one-cell isolated tip; this is present in the authored edited infant, not evidence of a newly lost feature.',30:'In the frozen tail crop the lower hanging tail stroke extends farther down than the original. Its root is visually tenuous in both compared forms.',75:'The left-side stair-step tail reaches farther upward/outward in the edit; this is subtle at native64 and clearer in the unaltered-pixel crop.',120:'The upturned tail on the left has a longer staircase/outer reach than the original, while the overall creature remains close.'},
  s02:{0:'The edited source tail extends farther left. The isolated outer tip is already in the authored edited infant.',30:'The edited left tail has a farther-out stepped tip, including the small isolated source-tip pixel; other anatomy is close.',75:'The edited left/back tail staircase is visibly taller/longer than the original.',120:'The lower hanging tail stroke ends below the original tail endpoint in the same-coordinate crop. This is a small pixel-scale effect, not a large new structure.'}},
 'face-spacing':{
  s01:{0:'The dark eye clusters are farther apart in the source; the outer eye also cuts the head-outline edge.',30:'The left dark eye cluster is farther from the front/outer eye notch. The ears and snout remain identifiable.',75:'The eye-cluster separation changes in the lower-right cranial region. The surrounding torso crowds that region, so a clean face is not assured at native64.',120:'The left eye/back cluster and outer edge notch remain farther separated, with the same pointed ears and snout.'},
  s02:{0:'The eye clusters are farther apart; the outer eye appears as a notch at the head edge.',30:'The edited left eye cluster sits farther from the front notch while the source ears and snout are retained.',75:'The left cluster shifts outward from the front eye/notch on the same recognizable head. The outer eye is partly expressed as an outline cut.',120:'The left dark cluster and front-edge notch retain the wider spacing. The thin neck remains a separate coherence concern.'}},
};
const records=selected.map((template:any)=>{
 const variant=template.caseId.split('--')[1].split('__')[0],seed=template.caseId.endsWith('s01')?'s01':'s02',age=template.fromAge,ai=[0,30,75,120].indexOf(age);
 let coherence=manualCoherence[seed][age];
 if(age===0 && ['attachment-length','face-spacing'].includes(variant)) coherence=2;
 const cue=variant==='palette-control'?'The complete outline, interior markings and eye/snout positions visually match the original; only the intended mint/dark-green palette changes.'
  :variant==='ordering-control'?'The complete outline, interior dark markings, facial placement and limb/tail silhouettes visually match the original.'
  :cues[variant][seed][age];
 const concern=seed==='s01'&&age===30?' The head/body junction and lower appendage/root read thin and tenuous in the matched original; I do not infer a severed pixel graph from this image.'
  :seed==='s01'&&age===75?' The matched original cranial region is crowded into the torso/arch, weakening immediate face/head readability.'
  :seed==='s02'&&age===120?' The head reads tethered above the lower trunk by a long narrow diagonal neck in the matched original; this limits coherence even when the source effect is visible.'
  :'';
 return {...template,reviewer:'/root/anatomy_engine',reviewerKind:'agent',role:'primary',status:'reviewed',descent:manualDescent[variant][seed][ai],featureCoherence:coherence,
  inspectedViewIds:[...template.requiredViewIds],evidenceHashes:Object.fromEntries(template.requiredViewIds.map((id:string)=>[id,views.get(id).hash])),
  notes:`Actual frozen original/edit PNG comparison, same recorded seed/care and age; source/engine-author familiarity, not blind. ${cue}${concern} Full images inspected; tail/face crops only enlarge existing pixels. No in-between or gait-continuity claim.`};
});
validateReviews(records,templates,cases);
const controls=[];
for(const variant of ['palette-control','ordering-control']) for(const seed of ['s01','s02']) for(const age of [0,30,75,120]) {
 const a=views.get(`canine-cub__${seed}__neutral__d${age}`),b=views.get(`canine-cub--${variant}__${seed}__d${age}`);
 const canonical=(pixels:any[])=>JSON.stringify([...pixels].map(p=>[p.x,p.y,p.color.toLowerCase()]).sort((a,b)=>a[1]-b[1]||a[0]-b[0]));
 const expected=variant==='palette-control'?a.pixels.map((p:any)=>({...p,color:p.color.toLowerCase()==='#ffffff'?'#B9D8C5':'#17251D'})):a.pixels;
 controls.push({variant,seed,age,exactIntendedColorMappingMatch:canonical(expected)===canonical(b.pixels)});
}
const genotypeChecks=cases.filter(c=>c.plan.group==='source').map(c=>({caseId:c.plan.id,controlCaseId:`canine-cub__s0${c.plan.seedIndex+1}__neutral`,sameInheritedHash:c.inheritedHash===cases.find(p=>p.plan.group==='primary'&&p.plan.seed===c.plan.seed).inheritedHash,sameCare:JSON.stringify(c.plan.keyframes)===JSON.stringify(cases.find(p=>p.plan.group==='primary'&&p.plan.seed===c.plan.seed).plan.keyframes)}));
const findings=[];
for(const variant of ['body-ratio','body-bend','attachment-length','face-spacing']) for(const seed of ['s01','s02']) findings.push({variant,seed,visuallyDistinguishableDevelopedAges:[30,75,120],meetsTwoDevelopedAges:true,qualification:variant==='attachment-length'?'Small1–2px extent changes require enlargement in some frames; native64 salience is weak. The isolated tip in the edited infant is an authored fixture artifact.':variant==='face-spacing'?'Outer eyes can read as outline notches; wider spacing persists but does not cure overall head/neck readability.':'Body edits also move connected head/support arrangements; observed influence is not strictly confined to edited pixels.'});
const receipt={runId:provenance.runId,captureHash:provenance.captureHash,reviewer:'/root/anatomy_engine',reviewerKind:'agent',role:'primary',sourceAuthorFamiliarity:true,engineEvaluated:false,humanReview:false,
 coverage:{sourceViews:48,matchedOriginalViews:8,uniqueFrozenViews:56,comparisons:48,derivedSheetsViewed:6,focusedCropSheetsViewed:2,main204CoverageClaimed:false},
 method:'Read frozen PNGs and JSON-gzip pixel evidence only. Six integer-nearest-neighbor comparison sheets and two fixed-coordinate crops were actually viewed. PNG bytes match stored frozen pixels and raw pixel hashes. Crops use frozen control part bounds only to locate the picture region; contributor/count metadata did not determine visual scores.',
 frozenImageEvidence:provenance.files,derivedSheets:[...provenance.sheets,...provenance.crops],genotypeChecks,automatedControlChecks:controls,
 findings,limitations:['Only two raw seeds and four endpoint ages per edit; no population estimate.','No intermediate or motion review in these records.','Source and engine authorship make this informed, not blind, review.','Body reorganization can crowd the cranial region and long narrow necks remain visible coherence concerns.','Recorded contributor counts are not evidence that every feature is visible.'],records};
const file=join(dir,'review-receipts/primary-source-counterfactual-anatomy.json');
await writeFile(file,JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify({file,records:records.length,findings:findings.length,controls:controls.length,controlMatches:controls.filter(x=>x.exactIntendedColorMappingMatch).length,inheritedMatches:genotypeChecks.filter(x=>x.sameInheritedHash&&x.sameCare).length,sha256:createHash('sha256').update(await readFile(file)).digest('hex')}));
