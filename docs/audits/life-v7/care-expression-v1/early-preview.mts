// Disposable early subset of the existing proof conditions, never a visual gate.
import {mkdir,writeFile,readFile,readdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {rasterPixels,scaleRgba,blitRgba,drawBitmapText,writePng} from '../../../../tools/audit/presentation';
import {frameHash} from '../../../../tools/audit/metrics';
const require=createRequire(import.meta.url);
const {createSimulation}=require('../../../../src/simulation');
const {clonePreset}=require('../../../../src/presets');
const {APPEARANCE_NEED_IDS}=require('../../../../src/needs');
const dir=resolve('docs/audits/life-v7/care-expression-v1/early-preview');
await mkdir(join(dir,'images'),{recursive:true});
const sha=(data:any)=>createHash('sha256').update(data).digest('hex');
async function sourceHashes(){
 const files=['src/presets.ts','src/pet-format.ts',...['src/simulation','src/needs'].flatMap(()=>[])];
 for(const folder of ['src/simulation','src/needs'])for(const item of await readdir(folder,{withFileTypes:true}))if(item.isFile()&&/\.(ts|json)$/.test(item.name))files.push(`${folder}/${item.name}`);
 files.sort((a,b)=>a<b?-1:a>b?1:0);
 return Object.fromEntries(await Promise.all(files.map(async f=>[f,sha(await readFile(f))])));
}
const before=await sourceHashes(),runtimeSourceHash=sha(JSON.stringify(before)),source=clonePreset('canine-cub'),sourceDrawingHash=sha(JSON.stringify(source)),rows:any[]=[],files:any[]=[],nativeFiles=new Map();
const neutral=new Map(Array.from({length:4},(_,i)=>{const seed=`life-v7-genome-0${i+1}`;return[seed,createSimulation(source,seed)];}));
const background=(width:number,height:number)=>{const pixels=new Uint8Array(width*height*4);for(let i=0;i<pixels.length;i+=4)pixels.set([12,12,12,255],i);return pixels;};
for(const needId of APPEARANCE_NEED_IDS){
 const width=816,height=1164,enlargedSheet=background(width,height),nw=288,nh=430,nativeSheet=background(nw,nh);
 drawBitmapText(enlargedSheet,width,height,`${needId}: ONSET0 VIEW14 / DISPOSABLE`,8,4,{scale:2});
 drawBitmapText(nativeSheet,nw,nh,`${needId}\nONSET0 VIEW14 / NATIVE64`,8,4);
 for(let si=0;si<4;si++)for(let mode=0;mode<3;mode++){
  const seed=`life-v7-genome-0${si+1}`,control=neutral.get(seed)!,fulfillment=mode===0?.75:mode===1?0:1,simulation=mode===0?control:createSimulation(source,seed,'infant',{needTimeline:[{needId,tick:0,fulfillment}]});
  const frame=simulation.frameAt(14),raster=rasterPixels(frame.pixels),scaled=scaleRgba(raster,64,64,4),x=mode*272+8,y=si*284+38;
  blitRgba(enlargedSheet,width,height,scaled.rgba,256,256,x,y);
  drawBitmapText(enlargedSheet,width,height,`S${si+1} ${['NEUTRAL75','NEED0','NEED100'][mode]}`,x,y+260);
  const nx=mode*96+8,ny=si*100+30;
  blitRgba(nativeSheet,nw,nh,raster,64,64,nx,ny);
  drawBitmapText(nativeSheet,nw,nh,`S${si+1} ${mode===0?'75':mode===1?'0':'100'}%`,nx,ny+68);
  const id=`s${si+1}-${mode===0?'neutral75':`${needId}-${fulfillment===0?'0':'100'}`}`,imagePath=join(dir,'images',`${id}.png`);
  if(!nativeFiles.has(id)){await writePng(imagePath,64,64,raster);nativeFiles.set(id,{id,path:imagePath.replaceAll('\\','/'),sha256:sha(await readFile(imagePath)),width:64,height:64,pixelHash:frameHash(frame)});}
  rows.push({id,seed,needId,fulfillment,onset:0,age:14,hash:frameHash(frame),pixels:frame.pixels,motionPace:frame.motionPace,motionAmplitude:frame.motionAmplitude,sameGenome:JSON.stringify(simulation.genome)===JSON.stringify(control.genome),birthPixelsExact:frameHash(simulation.frameAt(0))===frameHash(control.frameAt(0)),diagnostics:simulation.developmentAt(14).diagnostics});
 }
 for(const [suffix,w,h,rgba] of [['',width,height,enlargedSheet],['-native64',nw,nh,nativeSheet]] as const){const path=join(dir,`${needId}${suffix}.png`);await writePng(path,w,h,rgba);files.push({path:path.replaceAll('\\','/'),sha256:sha(await readFile(path)),kind:suffix?'native64-contact-sheet':'integer4x-contact-sheet'});}
}
const after=await sourceHashes(),sourceStable=JSON.stringify(before)===JSON.stringify(after);
await writeFile(join(dir,'preview.json'),JSON.stringify({disposable:true,visualGate:'unreviewed',populationClaim:false,source:'canine-cub',sourceDrawingHash,runtimeSourceHash,sourceHashes:before,sourceStable,beforeAfterHashMatch:sourceStable,existingProofConditionsOnly:true,uniqueConditions:52,displayedConditions:72,nativeFiles:[...nativeFiles.values()],sheets:files,rows},null,2)+'\n');
if(!sourceStable)throw new Error('Runtime source changed during disposable capture');
console.log(JSON.stringify({runtimeSourceHash,sourceStable,sheets:files.length,nativeImages:nativeFiles.size,uniqueConditions:52,displayedCells:72}));
