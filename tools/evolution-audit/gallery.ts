import type { AuditManifest } from "./types";

export type GalleryTile = {
  id?: string;
  blindLabel?: string;
  caseId?: string;
  presetId?: string;
  historyId?: string;
  age?: number;
  kind?: string;
  action?: string;
  time?: number;
  movement?: string;
  page: string;
  x: number;
  y: number;
  evolution?: unknown;
};
const escape = (value: unknown) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );

export function gallery(manifest: AuditManifest, rows: GalleryTile[]) {
  return `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Evolution ${escape(manifest.runId)}</title>
<style>
body{background:#111;color:#ddd;font:14px system-ui;margin:20px}header{position:sticky;top:0;background:#111;padding:10px;z-index:2}a{color:#bcd}button,select,input{font:inherit;background:#222;color:#eee;border:1px solid #666;padding:7px;margin:4px}#grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:12px}.card{border:1px solid #444;padding:8px}.sprite{width:128px;height:128px;image-rendering:pixelated;background-color:#080808;margin:auto}.meta{font-size:12px;color:#aaa;white-space:pre-wrap}#motion,#comparisons{display:flex;gap:15px;flex-wrap:wrap}.loop,.comparison{border:1px solid #555;padding:8px}.filmstrip{display:flex;flex-wrap:wrap;gap:10px}.filmstrip figure{margin:0}.filmstrip figcaption{font-size:12px}.comparison{max-width:100%;overflow:auto}h1{font-size:20px}
</style>
<header><h1>Evolution ${escape(manifest.runId)}</h1>
<p>Blind labels by default. Reveal after judging distinctiveness. Numerical separation is not visual acceptance.</p>
<a href="REPORT.md">Report</a> · <a href="visual-reviews.json">Review records</a> · <a href="metrics.json">Metrics</a><br>
<button id="reveal">Reveal seed/history</button>
<select id="kind"><option value="endpoint">Endpoints</option><option value="interior">Intermediate growth</option><option value="pose">Motion poses</option><option value="all">All scheduled views</option><option value="loops">Motion loops</option><option value="lifecycles">Source / lifecycle comparison</option><option value="differences">Difference masks</option><option value="sources">Source drawings</option></select>
<select id="preset"><option value="all">All starters</option>${manifest.presets.map((p) => `<option>${escape(p.id)}</option>`).join("")}</select>
<select id="history"><option value="all">All histories</option>${manifest.histories.map((h) => `<option>${escape(h.id)}</option>`).join("")}</select>
<input id="filter" placeholder="Age / blind label / revealed case"></header>
<main id="grid"></main><section id="motion"></section><section id="comparisons"></section>
<script>
const rows=${JSON.stringify(rows).replaceAll("<", "\\u003c")};
const sources=${JSON.stringify(manifest.presets.map((p) => ({ id: p.id, path: "sources/" + p.id + ".png" }))).replaceAll("<", "\\u003c")};
let revealed=false;
const grid=document.getElementById('grid'),motion=document.getElementById('motion'),comparisons=document.getElementById('comparisons');
function sprite(r){const d=document.createElement('div');d.className='sprite';d.style.backgroundImage='url('+r.page+')';d.style.backgroundPosition=(-r.x)+'px '+(-r.y)+'px';return d}
function image(path){const d=document.createElement('div');d.className='sprite';d.style.backgroundImage='url('+path+')';d.style.backgroundSize='128px 128px';return d}
function figure(element,text){const f=document.createElement('figure'),c=document.createElement('figcaption');c.textContent=text;f.append(element,c);return f}
function caseLabel(row){return revealed?row.caseId:row.blindLabel+' lineage'}
function draw(){
  grid.replaceChildren();motion.replaceChildren();comparisons.replaceChildren();
  const kind=document.getElementById('kind').value,preset=document.getElementById('preset').value,history=document.getElementById('history').value,filter=document.getElementById('filter').value.toLowerCase();
  if(kind==='sources'){
    for(const s of sources.filter(s=>preset==='all'||s.id===preset)){const card=document.createElement('article');card.className='card';card.append(image(s.path),document.createTextNode(s.id+' · authored source'));grid.append(card)}return;
  }
  const selected=rows.filter(r=>(preset==='all'||r.presetId===preset)&&(history==='all'||r.historyId===history)&&((r.blindLabel+' d'+r.age+(revealed?' '+r.caseId:'')).toLowerCase().includes(filter)));
  if(kind==='loops'){
    const groups=new Map;
    for(const r of selected.filter(r=>r.kind==='pose')){const key=r.caseId+'/'+r.age;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r)}
    for(const frames of groups.values()){frames.sort((a,b)=>a.time-b.time);const c=document.createElement('div');c.className='loop';c.append(sprite(frames[0]));const label=document.createElement('p');label.textContent=caseLabel(frames[0])+' D'+frames[0].age;c.append(label);c._frames=frames;motion.append(c)}return;
  }
  if(kind==='lifecycles'||kind==='differences'){
    const groups=new Map;
    for(const r of selected.filter(r=>r.kind==='endpoint')){if(!groups.has(r.caseId))groups.set(r.caseId,[]);groups.get(r.caseId).push(r)}
    for(const frames of groups.values()){
      frames.sort((a,b)=>a.age-b.age);const card=document.createElement('article');card.className='comparison';const title=document.createElement('p');title.textContent=caseLabel(frames[0]);card.append(title);
      const strip=document.createElement('div');strip.className='filmstrip';
      if(kind==='lifecycles'){
        const source=sources.find(s=>s.id===frames[0].presetId);if(source)strip.append(figure(image(source.path),'Source'));
        for(const r of frames)strip.append(figure(sprite(r),'Day '+r.age));
      }else{
        for(let i=1;i<frames.length;i++){const a=frames[i-1],b=frames[i];strip.append(figure(image('differences/'+a.caseId+'__'+a.age+'-'+b.age+'.png'),a.age+' → '+b.age))}
        const legend=document.createElement('p');legend.className='meta';legend.textContent='White: retained ink positions. Green: new. Magenta: lost. Raw common camera coordinates; these are diagnostic masks, not normalized shape metrics.';card.append(legend);
      }
      card.append(strip);comparisons.append(card);
    }return;
  }
  for(const r of selected.filter(r=>kind==='all'||r.kind===kind)){
    const c=document.createElement('article');c.className='card';c.append(sprite(r));const l=document.createElement('strong');l.textContent=r.blindLabel+' D'+Number(r.age.toFixed(2));c.append(l);
    const m=document.createElement('p');m.className='meta';m.textContent=revealed?r.caseId+'\\n'+r.kind+' t='+r.time.toFixed(6)+'\\n'+r.movement+'\\n'+JSON.stringify(r.evolution):r.kind+' · visual review recorded separately';c.append(m);grid.append(c);
  }
}
document.getElementById('reveal').onclick=()=>{revealed=!revealed;document.getElementById('reveal').textContent=revealed?'Hide seed/history':'Reveal seed/history';draw()};
for(const id of ['kind','preset','history','filter'])document.getElementById(id).oninput=draw;
let phase=0;
setInterval(()=>{phase=(phase+1)%8;for(const c of motion.children){const f=c._frames;if(f?.length){const r=f[phase%f.length],s=c.querySelector('.sprite');s.style.backgroundImage='url('+r.page+')';s.style.backgroundPosition=(-r.x)+'px '+(-r.y)+'px'}}},125);
draw();
</script></html>`;
}
