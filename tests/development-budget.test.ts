/** PERF-001: daily production qualification. Run in isolation after functional
 * tests so parallel test workers do not masquerade as player update latency.
 * Reference budgets are for Linux Node 22+, not native-phone hardware. */
import test from "node:test";
import assert from "node:assert/strict";
import {performance} from "node:perf_hooks";
import {benchmarkShapes,maintainedLife,playerSimulation,measureTicks,BENCHMARK_START} from "../scripts/daily-benchmark";
import {advanceGame,DAY,HOUR} from "../src/gameplay";
import {clearDailyLivingCache,getDailyLivingCacheStats} from "../src/integration/daily-runtime";
const BUDGET=Object.freeze({ordinaryP95Ms:1000/30,firstBoundaryMs:150,freshYearMs:8000,
  savedReopenMs:1500,stateBytes:8*1048576,rssMiB:768});
const lives=maintainedLife("PERF-QUALIFIED-DAILY",366);

test("[PERF-001/A1] all required real-life scenarios reuse exact canonical anatomy against paired cold reconstruction",()=>{
  for(const [shape,source] of Object.entries(benchmarkShapes)){
    clearDailyLivingCache();
    for(const hour of [0,23,24,7*24,90*24,364*24,365*24,366*24]){
      const game=lives.get(hour)!;
      const ticks=measureTicks(source,game,32,hour===24);
      assert.equal(ticks.physicalSteps,0,"one-second play and same-day commands perform NO anatomical operations");
      const age=(ticks.game.clock.nowMs-BENCHMARK_START)/DAY;
      const cold=playerSimulation(source,ticks.game,true).materialStateAt(age);
      const cached=ticks.simulation.materialStateAt(age);
      assert.deepEqual(cached,cold,shape+" hour "+hour+" exact cells, events, source ancestry and chaos state");
      assert.equal(cached.completedChecks,Math.min(365,Math.floor(hour/24)));
      if(hour===24){assert.ok(ticks.game.commandHistory.some(c=>c.id.startsWith("tick/")&&c.accepted));
        assert.ok(ticks.game.commandHistory.some(c=>c.id.startsWith("tick/")&&!c.accepted));}
      console.log(JSON.stringify({kind:"daily-update",shape,hour,...ticks.latency,physicalSteps:ticks.physicalSteps}));
      assert.ok(ticks.latency.p95Ms<=BUDGET.ordinaryP95Ms,
        shape+" hour "+hour+" ordinary p95 "+ticks.latency.p95Ms.toFixed(2)+"ms exceeds "+BUDGET.ordinaryP95Ms.toFixed(2));
    }
    const justBefore=advanceGame(lives.get(23)!,BENCHMARK_START+DAY-1000);
    const initial=playerSimulation(source,justBefore);initial.materialStateAt((justBefore.clock.nowMs-BENCHMARK_START)/DAY);
    const begin=performance.now(),boundary=measureTicks(source,justBefore,1);
    const crossingMs=performance.now()-begin;
    assert.equal(boundary.physicalSteps,1,"exactly ONE first daily opportunity crosses");
    assert.ok(crossingMs<=BUDGET.firstBoundaryMs,"daily check exceeds isolated reference budget: "+crossingMs);
    const stats=getDailyLivingCacheStats();assert.ok(stats.entries<=3&&stats.states<=stats.maxStates);
  }
});

test("[PERF-001/A2] maximum canvas complexity has bounded graph, archive, replay, saved reopen and corrupt-cache recovery",()=>{
  for(const [shape,source] of Object.entries(benchmarkShapes)){
    clearDailyLivingCache();
    const game=lives.get(366*24)!,start=performance.now();
    const sim=playerSimulation(source,game,true),state=sim.materialStateAt(365);
    const freshMs=performance.now()-start;
    assert.ok(freshMs<=BUDGET.freshYearMs,"365-step fresh replay exceeds budget: "+shape+" "+freshMs);
    assert.equal(sim.getMaterialRuntimeStats!().steps,365);
    assert.equal(state.checks.length,365);
    assert.ok(state.graph.cells.length<=state.graph.sourceCells.length+3072);
    assert.ok(state.graph.events.length<=365*4+64*9+64*12);
    assert.ok(state.iterative.sites.length<=4096);
    assert.ok(state.iterative.ledger.reduce((n,row)=>n+row.bySite.length,0)<=365*4,
      "sparse allocation history must not retain thousands of zero awards per day");
    assert.ok(Buffer.byteLength(JSON.stringify(state))<=BUDGET.stateBytes);
    const checkpoint=sim.exportAnatomicalCheckpoint()!;
    const reopenStart=performance.now(),reopened=playerSimulation(source,game,true,JSON.parse(JSON.stringify(checkpoint)));
    assert.deepEqual(reopened.materialStateAt(366),state);
    const reopenMs=performance.now()-reopenStart;
    assert.equal(reopened.getMaterialRuntimeStats!().steps,0);
    assert.equal(reopened.getMaterialRuntimeStats!().imported,1);
    assert.ok(reopenMs<=BUDGET.savedReopenMs,"saved-life reopening exceeds reference budget: "+shape+" "+reopenMs);
    const corrupt=JSON.parse(JSON.stringify(checkpoint));corrupt.state.iterative.nextHour--;
    const reconstructed=playerSimulation(source,game,true,corrupt);
    assert.deepEqual(reconstructed.materialStateAt(366),state);
    assert.equal(reconstructed.getMaterialRuntimeStats!().imported,0);
    if(typeof global.gc==="function")global.gc();
    const rssMiB=process.memoryUsage().rss/1048576;
    assert.ok(rssMiB<=BUDGET.rssMiB,"isolated process exceeds reference memory safety budget");
    console.log(JSON.stringify({kind:"daily-year",shape,freshMs,reopenMs,cells:state.graph.cells.length,
      events:state.graph.events.length,stateBytes:Buffer.byteLength(JSON.stringify(state)),rssMiB,
      budgets:BUDGET,nativePhoneMeasured:false}));
  }
});
