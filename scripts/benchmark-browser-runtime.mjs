/**
 * PERF-001 browser qualification of the REAL exported UI lifecycle.
 * These are Chromium headless samples, not results from an actual phone.
 * No animation snapshots or wall-clock figures are correctness oracles.
 *
 * Run after pnpm build:web && playwright install chromium:
 * node scripts/benchmark-browser-runtime.mjs
 */
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {tmpdir} from "node:os";
import {performance} from "node:perf_hooks";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const root=path.resolve("dist"),base=process.env.INFIPET_BASE_URL||"";
const mime={".html":"text/html",".js":"text/javascript",".json":"application/json",
  ".ttf":"font/ttf",".woff2":"font/woff2",".css":"text/css"};
const server=createServer(async(req,res)=>{
  try{
    const pathname=decodeURIComponent(new URL(req.url,"http://localhost").pathname);
    if(!pathname.startsWith(base+"/")){res.writeHead(404).end();return;}
    const relative=pathname.slice(base.length).replace(/^\//,"")||"index.html";
    const filename=path.resolve(root,relative);
    if(!filename.startsWith(root+path.sep)){res.writeHead(403).end();return;}
    const data=await readFile(filename);
    res.writeHead(200,{"Content-Type":mime[path.extname(filename)]||"application/octet-stream",
      "Cache-Control":"no-cache"});res.end(data);
  }catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const url=`http://127.0.0.1:${server.address().port}${base}/`;

const pct=(values,p)=>{
  if(!values.length)return null;
  const a=[...values].sort((x,y)=>x-y);
  return +(a[Math.min(a.length-1,Math.ceil(a.length*p)-1)]).toFixed(3);
};
const sourceInfo={kind:"browser-env",browser:"headless Chromium",sampleCount:180,
  realMobileHardware:false,node:process.version,source:"1024 cells, all 15 brushes"};
process.stdout.write(JSON.stringify(sourceInfo)+"\n");
const fixtures=[];
for(const hour of (process.env.INFIPET_BENCH_SMOKE?[0]:[0,7*24,90*24,366*24])){
  const filename=path.join(tmpdir(),`infipet-perf-${hour}.json`);
  execFileSync(process.execPath,["--expose-gc","--max-old-space-size=512","--import","tsx","scripts/create-year-life-fixture.ts",filename,String(hour)],{stdio:"pipe"});
  const doc=JSON.parse(await readFile(filename,"utf8"));
  fixtures.push({hour,filename,doc:{life:{parts:doc.life.parts,game:{clock:doc.life.game.clock},anatomicalCheckpoint:doc.life.anatomicalCheckpoint}}});
  console.log(JSON.stringify({kind:"fixture-ready",hour,bytes:(await readFile(filename)).byteLength}));
}
const browser=await chromium.launch({headless:true,
  ...(process.env.CHROMIUM_EXECUTABLE_PATH
    ? {executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{}),
  args:process.env.CHROMIUM_EXECUTABLE_PATH
    ? ["--no-sandbox","--disable-dev-shm-usage"]:[]});
try{
  for(const scenario of [
    {name:"desktop-headless",width:1280,height:900,deviceScaleFactor:1,cpuRate:1,mobile:false},
    {name:"mobile-viewport-cpu4x-emulated",width:390,height:844,
      deviceScaleFactor:2,cpuRate:4,mobile:true},
  ])for(const fixture of fixtures){
    const context=await browser.newContext({viewport:{width:scenario.width,height:scenario.height},
      deviceScaleFactor:scenario.deviceScaleFactor,hasTouch:scenario.mobile,isMobile:scenario.mobile});
    const page=await context.newPage(),errors=[];
    page.on("pageerror",error=>errors.push(error.message));
    // Shift only the Date clock to the actual recorded fixture. Performance,
    // RAF and timers stay native: fake animation timestamps are not latency.
    await page.addInitScript(offset=>{
      const OriginalDate=Date;
      class RecordedDate extends OriginalDate {
        constructor(...args){super(...(args.length?args:[OriginalDate.now()+offset]));}
        static now(){return OriginalDate.now()+offset;}
      }
      globalThis.Date=RecordedDate;
      window.__infipetLongTasks=[];
      try{new PerformanceObserver(list=>{
        for(const e of list.getEntries())window.__infipetLongTasks.push({start:e.startTime,duration:e.duration});
      }).observe({type:"longtask",buffered:true});}catch{/* report unavailable below */}
      window.__infipetReadSave=async()=>{
        let doc=JSON.parse(localStorage.getItem("infipet.pet")||"null");
        if(doc?.storage==="infipet-indexeddb-v1"){
          const raw=await new Promise((resolve,reject)=>{
            const opening=indexedDB.open("infipet-living-saves-v1",1);
            opening.onerror=()=>reject(opening.error);
            opening.onsuccess=()=>{const db=opening.result,req=db.transaction("payloads","readonly").objectStore("payloads").get(doc.key);
              req.onsuccess=()=>{db.close();resolve(req.result);};req.onerror=()=>{db.close();reject(req.error);};};
          });doc=JSON.parse(raw);
        }return doc;
      };
    },fixture.doc.life.game.clock.nowMs-Date.now());
    const cdp=await context.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate",{rate:scenario.cpuRate});
    await cdp.send("Performance.enable");
    const btn=name=>page.getByRole("button",{name,exact:true});
    const readSaved=async()=>JSON.parse(await page.evaluate(async()=>JSON.stringify(await window.__infipetReadSave())));
    const waitSaved=async predicate=>{
      const deadline=performance.now()+30000;
      while(performance.now()<deadline){const doc=await readSaved();if(doc&&predicate(doc))return doc;
        await new Promise(resolve=>setTimeout(resolve,25));}
      throw new Error("Actual saved-life acknowledgement timed out");
    };

    await page.goto(url);await btn("Open more menu").click();await btn("Import pet").click();
    const choosing=page.waitForEvent("filechooser");await btn("Open pet file").click();
    const importStart=performance.now();await (await choosing).setFiles(fixture.filename);
    await btn("Meal").waitFor();
    const before=await waitSaved(doc=>!!doc.life);
    const importMs=performance.now()-importStart;

    const reopenStart=performance.now();await page.reload();await btn("Meal").waitFor();
    const savedReopenMs=performance.now()-reopenStart;
    const sample=await page.evaluate(()=>new Promise(resolve=>{
      const intervals=[];let previous=null,count=0;const onset=performance.now();
      const loop=now=>{if(previous!==null)intervals.push(now-previous);previous=now;
        if(++count<181)requestAnimationFrame(loop);
        else resolve({elapsedMs:performance.now()-onset,intervals,
          longTasks:window.__infipetLongTasks.filter(e=>e.start>=onset)});};
      requestAnimationFrame(loop);
    }));
    const careMs=[];
    for(let i=0;i<4;i++){
      await btn("Clean").waitFor({state:"visible"});
      const start=performance.now();await btn("Clean").click();
      await waitSaved(doc=>(doc.life.game.commandSequence??doc.life.game.commandHistory.length)>(before.life.game.commandSequence??before.life.game.commandHistory.length)+i);
      careMs.push(performance.now()-start);
    }
    const after=await readSaved();
    assert.ok(after.life.game.clock.nowMs>before.life.game.clock.nowMs,"real one-second clock advances");
    assert.deepEqual(after.life.parts,fixture.doc.life.parts);
    assert.equal(after.life.anatomicalCheckpoint?.state.completedChecks??0,Math.min(365,fixture.hour/24));
    assert.deepEqual(after.life.anatomicalCheckpoint?.state.graph,fixture.doc.life.anatomicalCheckpoint?.state.graph,
      "same-day physiology, care and animation cannot change permanent material");
    assert.deepEqual(errors,[],"no runtime exceptions");
    const metrics=await cdp.send("Performance.getMetrics"),heap=metrics.metrics.find(m=>m.name==="JSHeapUsedSize")?.value??null;
    // Measured Linux headless desktop reference gates. Throttled viewports are
    // explicitly observational emulation; these are not native-phone budgets.
    const desktopBudgets={frameGapP95Ms:34,savedReopenMs:3000,savedCareAckP95Ms:1000};
    if(scenario.cpuRate===1){
      assert.ok(pct(sample.intervals,.95)<=desktopBudgets.frameGapP95Ms,"desktop frame-gap tail exceeds budget");
      assert.ok(savedReopenMs<=desktopBudgets.savedReopenMs,"desktop saved-life reopening exceeds budget");
      assert.ok(pct(careMs,.95)<=desktopBudgets.savedCareAckP95Ms,"desktop care acknowledgement exceeds budget");
    }
    console.log(JSON.stringify({kind:"browser-qualification",scenario:scenario.name,hour:fixture.hour,
      importMs:+importMs.toFixed(2),savedReopenMs:+savedReopenMs.toFixed(2),
      frameGapMedianMs:pct(sample.intervals,.5),frameGapP95Ms:pct(sample.intervals,.95),frameGapMaxMs:pct(sample.intervals,1),
      careAckMedianMs:pct(careMs,.5),careAckP95Ms:pct(careMs,.95),careAckMaxMs:pct(careMs,1),
      longTaskCount:sample.longTasks.length,longTaskP95Ms:pct(sample.longTasks.map(x=>x.duration),.95),
      jsHeapUsedMiB:heap===null?null:+(heap/1048576).toFixed(2),realPhone:false,
      desktopBudgets,interpretation:"180 native RAF gaps and 4 saved care acknowledgements per age; CPU emulation is not device qualification"}));
    await context.close();
  }
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
