/**
 * PERF-001 browser qualification of the REAL exported UI lifecycle.
 * These are Chromium headless samples, not results from an actual phone.
 * No animation snapshots or wall-clock figures are correctness oracles.
 *
 * Run after pnpm build:web && playwright install chromium:
 * node scripts/benchmark-browser-runtime.mjs
 */
import assert from "node:assert/strict";
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
const browser=await chromium.launch({headless:true,
  ...(process.env.CHROMIUM_EXECUTABLE_PATH
    ? {executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{}),
  args:process.env.CHROMIUM_EXECUTABLE_PATH
    ? ["--no-sandbox","--disable-dev-shm-usage"]:[]});
const pct=(values,p)=>{
  if(!values.length)return null;
  const a=[...values].sort((x,y)=>x-y);
  return +(a[Math.min(a.length-1,Math.ceil(a.length*p)-1)]).toFixed(3);
};
const sourceInfo={kind:"browser-env",browser:"headless Chromium",
  sampleCount:180,realMobileHardware:false,node:process.version};
process.stdout.write(JSON.stringify(sourceInfo)+"\n");
try{
  for(const scenario of [
    {name:"desktop-headless",width:1280,height:900,deviceScaleFactor:1,cpuRate:1,mobile:false},
    {name:"mobile-viewport-cpu4x-emulated",width:390,height:844,
      deviceScaleFactor:2,cpuRate:4,mobile:true},
  ]){
    const context=await browser.newContext({
      viewport:{width:scenario.width,height:scenario.height},
      deviceScaleFactor:scenario.deviceScaleFactor,
      hasTouch:scenario.mobile,isMobile:scenario.mobile,
    });
    const page=await context.newPage();
    const errors=[];
    page.on("pageerror",error=>errors.push(error.message));
    await page.addInitScript(()=>{
      window.__infipetLongTasks=[];
      try{
        new PerformanceObserver(list=>{
          for(const entry of list.getEntries())
            window.__infipetLongTasks.push({start:entry.startTime,duration:entry.duration});
        }).observe({type:"longtask",buffered:true});
      }catch{ /* unsupported browser: report an empty long-task series */ }
    });
    const cdp=await context.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate",{rate:scenario.cpuRate});
    await cdp.send("Performance.enable");
    await page.goto(url);
    const canvas=page.getByLabel("Draw your whole pet here",{exact:true});
    const bounds=await canvas.boundingBox();
    assert.ok(bounds,"real player drawing canvas must exist");
    if(scenario.mobile)
      await canvas.tap({position:{x:bounds.width/2,y:bounds.height/2}});
    else
      await page.mouse.click(bounds.x+bounds.width/2,bounds.y+bounds.height/2);
    await page.getByRole("button",{name:"Begin life",exact:true}).click();
    await page.waitForFunction(()=>
      !!JSON.parse(localStorage.getItem("infipet.pet")||"null")?.life);
    const before=await page.evaluate(()=>
      JSON.parse(localStorage.getItem("infipet.pet")).life.game.clock.nowMs);
    const sample=await page.evaluate(()=>new Promise(resolve=>{
      const intervals=[];
      let previous=null;
      let count=0;
      const onset=performance.now();
      const loop=(now)=>{
        if(previous!==null)intervals.push(now-previous);
        previous=now;
        if(++count<181)requestAnimationFrame(loop);
        else resolve({elapsedMs:performance.now()-onset,intervals,
          longTasks:window.__infipetLongTasks.filter(e=>e.start>=onset)});
      };
      requestAnimationFrame(loop);
    }));
    // App commits GameState every 1s but intentionally persists the save
    // every 5s. Do not mistake a shorter localStorage read for a stopped
    // biological clock: wait for the actual persisted checkpoint separately
    // from the 180-frame rendering observation.
    await page.waitForFunction(previous=>{
      const life=JSON.parse(localStorage.getItem("infipet.pet")||"null")?.life;
      return life && life.game.clock.nowMs>previous;
    },before,{timeout:20000});
    const after=await page.evaluate(()=>
      JSON.parse(localStorage.getItem("infipet.pet")).life.game.clock.nowMs);
    const metrics=await cdp.send("Performance.getMetrics");
    const heap=metrics.metrics.find(m=>m.name==="JSHeapUsedSize")?.value??null;
    assert.ok(after>before,"native game clock must advance during sampled frames");
    assert.deepEqual(errors,[],"browser must not suffer an uncaught runtime error");
    process.stdout.write(JSON.stringify({kind:"browser-qualification",
      scenario:scenario.name,viewport:{width:scenario.width,height:scenario.height},
      cpuThrottlingRate:scenario.cpuRate,frameIntervals:sample.intervals.length,
      elapsedMs:+sample.elapsedMs.toFixed(2),savedClockAdvancedMs:after-before,
      frameGapMedianMs:pct(sample.intervals,.5),
      frameGapP95Ms:pct(sample.intervals,.95),frameGapMaxMs:pct(sample.intervals,1),
      longTaskCount:sample.longTasks.length,
      longTaskP95Ms:pct(sample.longTasks.map(x=>x.duration),.95),
      jsHeapUsedMiB:heap===null?null:+(heap/1048576).toFixed(2),
      realPhone:false,p95Interpretation:"180 headless Chromium frame gaps only; not device p95"
    })+"\n");
    await context.close();
  }
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
