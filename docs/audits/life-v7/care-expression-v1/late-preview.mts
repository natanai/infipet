// Disposable bounded debug panel: the same existing four seeds and late care conditions.
import {mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {createSimulation}=require('../../../../src/simulation');
const {clonePreset}=require('../../../../src/presets');
const {APPEARANCE_NEED_IDS}=require('../../../../src/needs');
import {rasterPixels,scaleRgba,blitRgba,drawBitmapText,writePng} from '../../../../tools/audit/presentation';
import {frameHash} from '../../../../tools/audit/metrics';

const dir=resolve('docs/audits/life-v7/care-expression-v1/late-preview');await mkdir(dir,{recursive:true});
const source=clonePreset('canine-cub'),rows:any[]=[];
const neutral=new Map(Array.from({length:4},(_,i)=>{const seed=`life-v7-genome-0${i+1}`;return[seed,createSimulation(source,seed)];}));
for(const needId of APPEARANCE_NEED_IDS) {
  const width=816,height=1164,rgba=new Uint8Array(width*height*4);
  for(let i=0;i<rgba.length;i+=4)rgba.set([12,12,12,255],i);
  drawBitmapText(rgba,width,height,`${needId}: ONSET150 VIEW164 / DISPOSABLE`,8,4,{scale:2});
  for(let si=0;si<4;si++)for(let mode=0;mode<3;mode++) {
    const seed=`life-v7-genome-0${si+1}`,simulation=mode===0?neutral.get(seed)!:createSimulation(source,seed,'infant',{needTimeline:[{needId,tick:150*24,fulfillment:mode===1?0:1}]});
    const frame=simulation.frameAt(164),scaled=scaleRgba(rasterPixels(frame.pixels),64,64,4),x=mode*272+8,y=si*284+38;
    blitRgba(rgba,width,height,scaled.rgba,256,256,x,y);
    drawBitmapText(rgba,width,height,`S${si+1} ${['NEUTRAL75','NEED0','NEED100'][mode]}`,x,y+260);
    rows.push({seed,needId,fulfillment:mode===0?.75:mode===1?0:1,age:164,onset:150,hash:frameHash(frame),pixels:frame.pixels,motionPace:frame.motionPace,motionAmplitude:frame.motionAmplitude,diagnostics:simulation.developmentAt(164).diagnostics});
  }
  await writePng(join(dir,`${needId}.png`),width,height,rgba);
}
await writeFile(join(dir,'preview.json'),JSON.stringify({disposable:true,visualGate:'unreviewed',populationClaim:false,source:'canine-cub',rows},null,2)+'\n');
console.log(JSON.stringify({sheets:6,displayedCells:rows.length,uniqueConditions:52,existingLateOnsetConditionsOnly:true}));
