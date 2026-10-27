/**
 * INT-001 full-lifetime performance acceptance: independent wall clock + RSS/heap.
 * No screenshots, approved creature snapshots or frame hashes. Run as an
 * explicit CI benchmark, separate from SYS-002's fast core suite.
 */
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { createSimulation } from "../src/simulation";
import { createUnifiedMaterialTimeline } from "../src/integration/unified-runtime";
import { drawing } from "../tests/alg-development-fixtures";
import type { MaterialDevelopmentProgram } from "../src/development";
import type { InheritedGenome } from "../src/simulation/genome";

const seed="INT-PERF-32X32-2026";
const dense32=Array.from({length:32},(_,y)=>
  Array.from({length:32},(_,x)=>
    x>=12&&x<=19&&y>=12&&y<=19 ? "." : "#").join(""));
let program: MaterialDevelopmentProgram | undefined;
let inherited: InheritedGenome | undefined;
const benchmark=<T>(label:string,task:()=>T): {result:T;elapsedMs:number}=>{
  const before=process.memoryUsage();
  const start=performance.now();
  const result=task();
  const elapsedMs=performance.now()-start;
  const after=process.memoryUsage();
  const sample={label,ms:Math.round(elapsedMs),rssMB:Math.round(after.rss/1048576),
    heapMB:Math.round(after.heapUsed/1048576),
    heapDeltaMB:Math.round((after.heapUsed-before.heapUsed)/1048576)};
  process.stdout.write(JSON.stringify(sample)+"\n");
  assert.ok(Number.isFinite(elapsedMs),"benchmark time must remain finite");
  assert.ok(after.rss < 1024*1048576,"benchmark RSS exceeds safe 1GB ceiling");
  assert.ok(after.heapUsed < 768*1048576,"benchmark heap exceeds safe 768MB ceiling");
  return {result,elapsedMs};
};
const setup=benchmark("compile-real-32x32-ink",()=>createSimulation(
  drawing(dense32,"body"),seed,"infant",{
    verifyMaterialProgram(base,genome){
      program=base; inherited=genome;
      return {program:base};
    }
  }));
assert.ok(program && inherited);
const sim=setup.result;
const frame720=benchmark("first-live-frame-720h",()=>sim.frameAt(720/24,{time:0,action:"idle"}));
assert.ok(frame720.result.pixels.length>0,"720h rendered creature cannot disappear");
const repeat720=benchmark("different-pose-frame-720h",()=>sim.frameAt(720/24,{time:1,action:"idle"}));
assert.ok(repeat720.result.parts.length>0);
const frame8192=benchmark("first-live-frame-8192h",()=>sim.frameAt(8192/24,{time:0,action:"idle"}));
assert.ok(Math.abs(frame8192.result.developmentalAge-8192/24)<1e-9,
  "rendered terminal age must not silently clamp to an earlier hour");
assert.ok(frame8192.result.parts.some(part=>part.pixels.length>0));
const repeat8192=benchmark("different-pose-frame-8192h",()=>sim.frameAt(8192/24,{time:1,action:"idle"}));
assert.ok(repeat8192.result.pixels.length>0);
const timeline=createUnifiedMaterialTimeline({program:program!,genome:inherited!});
const terminal=benchmark("first-authoritative-timeline-8192h",()=>timeline.at(8192));
assert.equal(terminal.result.atHour,8192);
assert.equal(terminal.result.iterative.nextHour,8192);
assert.equal(terminal.result.graph.sourceFingerprint,program!.source.sourceFingerprint);
assert.ok(terminal.result.graph.cells.length<=4096,"material respects 64x64 finite lattice");
assert.ok(timeline.checkpointCount()<=16);
const terminalRepeat=benchmark("repeat-authoritative-timeline-8192h",()=>timeline.at(8192));
assert.equal(terminalRepeat.result.atHour,8192);
assert.deepEqual(terminalRepeat.result.graph.events,terminal.result.graph.events);
const earlier=benchmark("reverse-seek-720h",()=>timeline.at(720));
assert.equal(earlier.result.atHour,720);
assert.deepEqual(earlier.result.graph.sourceCells,program!.source.sourceCells);
// Loose absolute failsafes until measured CI throughput is known; reported
// measurements support subsequent, tighter browser-specific performance budgets.
assert.ok(frame720.elapsedMs<120000,"720h first live render exceeded 120s");
assert.ok(frame8192.elapsedMs<420000,"8192h first LIVE frame exceeded 420s");
assert.ok(repeat8192.elapsedMs<30000,"8192h repeated pose exceeded 30s");
assert.ok(terminal.elapsedMs<420000,"8192h terminal seek exceeded 420s");
assert.ok(terminalRepeat.elapsedMs<30000,"repeated 8192h seek exceeded 30s");
process.stdout.write("INT-001-PERFORMANCE-ACCEPTED\n");
