// Review-only presentation: reads frozen evidence, never imports/evaluates the engine.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { readPng, writePng, scaleRgba, blitRgba, drawBitmapText, rasterPixels } from '../../../../../tools/audit/presentation.ts';
import { frameHash } from '../../../../../tools/audit/metrics.ts';

const root=resolve('docs/audits/life-v7/v7-regional-proof-002'), out=join(root,'review-receipts/source-comparisons');
await mkdir(out,{recursive:true});
const templates=JSON.parse(await readFile(join(root,'review-template.json'),'utf8')).filter((row:any)=>row.kind==='source-counterfactual');
const ids=[...new Set(templates.flatMap((row:any)=>[row.caseId,row.controlCaseId]))] as string[];
const cases=new Map(); const views=new Map();
for(const id of ids) {
  const data=JSON.parse(gunzipSync(await readFile(join(root,'data',`${id}.json.gz`))).toString());
  cases.set(id,data);
  for(const view of data.views) if(view.kind==='source'||view.kind==='endpoint') views.set(view.id,view);
}
const manifest=JSON.parse(await readFile(join(root,'manifest.json'),'utf8'));
const provenance:any={runId:manifest.runId,captureHash:manifest.captureHash,engineEvaluated:false,reviewer:'/root/anatomy_engine',sourceAuthorFamiliarity:true,files:[],sheets:[]};
const variants=['body-ratio','body-bend','attachment-length','face-spacing','palette-control','ordering-control'];
for(const variant of variants) {
  const w=1088,h=1164,rgba=new Uint8Array(w*h*4);
  for(let i=0;i<rgba.length;i+=4) rgba.set([12,12,12,255],i);
  const inspected:string[]=[];
  drawBitmapText(rgba,w,h,`FROZEN SOURCE COMPARISON: ${variant}`,8,4,{scale:2});
  for(let seed=1;seed<=2;seed++) for(let ai=0;ai<4;ai++) for(let edited=0;edited<2;edited++) {
    const age=[0,30,75,120][ai],seedId=`s0${seed}`;
    const id=edited?`canine-cub--${variant}__${seedId}__d${age}`:`canine-cub__${seedId}__neutral__d${age}`;
    const view=views.get(id),path=join(root,'images',`${id}.png`),bytes=await readFile(path),png=await readPng(path);
    if(png.width!==64||png.height!==64) throw new Error(`Unexpected frozen image size ${id}`);
    if(frameHash({pixels:view.pixels} as any)!==view.hash) throw new Error(`Frozen pixel hash mismatch ${id}`);
    if(!Buffer.from(png.rgba).equals(Buffer.from(rasterPixels(view.pixels)))) throw new Error(`PNG/pixel evidence mismatch ${id}`);
    const column=(ai%2)*2+edited,row=(seed-1)*2+Math.floor(ai/2),x=column*272+8,y=row*284+38;
    const enlarged=scaleRgba(png.rgba,64,64,4);
    blitRgba(rgba,w,h,enlarged.rgba,256,256,x,y);
    drawBitmapText(rgba,w,h,`S${seed} D${age} ${edited?'EDIT':'ORIGINAL'}`,x,y+260,{scale:1});
    inspected.push(id);
    if(!provenance.files.some((f:any)=>f.id===id)) provenance.files.push({id,path:path.replaceAll('\\','/'),pixelHash:view.hash,pngSha256:createHash('sha256').update(bytes).digest('hex')});
  }
  const path=join(out,`${variant}.png`); await writePng(path,w,h,rgba);
  provenance.sheets.push({variant,path:path.replaceAll('\\','/'),sha256:createHash('sha256').update(await readFile(path)).digest('hex'),viewIds:inspected});
}
provenance.crops=[];
for(const [variant,region] of [['attachment-length','tail'],['face-spacing','head']]) {
  const w=1088,h=1164,rgba=new Uint8Array(w*h*4);
  for(let i=0;i<rgba.length;i+=4) rgba.set([12,12,12,255],i);
  drawBitmapText(rgba,w,h,`FROZEN PIXEL CROP: ${region} / ${variant}`,8,4,{scale:2});
  const cropRecords=[];
  for(let seed=1;seed<=2;seed++) for(let ai=0;ai<4;ai++) {
    const age=[0,30,75,120][ai],seedId=`s0${seed}`,control=views.get(`canine-cub__${seedId}__neutral__d${age}`);
    const center=control.lineage.find((part:any)=>part.id===region).center;
    const left=Math.floor(center.x)-12,top=Math.floor(center.y)-12;
    for(let edited=0;edited<2;edited++) {
      const id=edited?`canine-cub--${variant}__${seedId}__d${age}`:control.id;
      const png=await readPng(join(root,'images',`${id}.png`)),crop=new Uint8Array(24*24*4);
      for(let y=0;y<24;y++) for(let x=0;x<24;x++) {
        const px=left+x,py=top+y,at=(y*24+x)*4;
        crop.set(px<0||px>=64||py<0||py>=64?[8,8,8,255]:png.rgba.subarray((py*64+px)*4,(py*64+px)*4+4),at);
      }
      const column=(ai%2)*2+edited,row=(seed-1)*2+Math.floor(ai/2),x=column*272+8,y=row*284+38;
      const enlarged=scaleRgba(crop,24,24,10);
      blitRgba(rgba,w,h,enlarged.rgba,240,240,x,y);
      drawBitmapText(rgba,w,h,`S${seed} D${age} ${edited?'EDIT':'ORIGINAL'}`,x,y+260);
      cropRecords.push({id,rectangle:{x:left,y:top,width:24,height:24}});
    }
  }
  const path=join(out,`${variant}-${region}-crop.png`);await writePng(path,w,h,rgba);
  provenance.crops.push({path:path.replaceAll('\\','/'),sha256:createHash('sha256').update(await readFile(path)).digest('hex'),basis:'Location only uses frozen control part bounds; image content is unaltered frozen PNG pixels.',records:cropRecords});
}
await writeFile(join(out,'provenance.json'),JSON.stringify(provenance,null,2)+'\n');
console.log(JSON.stringify({sheets:provenance.sheets.length,uniqueFrozenViews:provenance.files.length,engineEvaluated:false}));
