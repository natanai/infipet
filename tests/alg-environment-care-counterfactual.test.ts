import test from "node:test";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import {
  HOUR, createGame, advanceGame, commandGame, validateGameState,
  type GameState, type GameCommand,
} from "../src/gameplay";
import { createCareOperatorChronology, createEnvironmentalHistory } from "../src/environment";
import {
  compileMaterialDevelopment, materialSourceAncestry, type MaterialGraph,
  type MaterialOperator,
} from "../src/development";
import {
  createUnifiedMaterialTimeline, cumulativeChaosCareExpression,
  type UnifiedMaterialTimeline,
} from "../src/integration/unified-runtime";
import { validateChronologicalGraph } from "../src/integration/chronological-material";
import { createSimulation } from "../src/simulation";
import { fixtures, materialInputs } from "./alg-development-fixtures";

const BIRTH = 12 * HOUR;
const EPS = 2e-9;
const LIFE = 360;
type Strategy = "feed" | "rest" | "activity" | "clean";
const assertNear = (actual: number, expected: number, reason: string) =>
  assert.ok(Math.abs(actual - expected) <= EPS, reason + ": " + actual + " vs " + expected);

/** All nonintervention care attempts are at identical times and with identical IDs.
 * A strategy may naturally change which attempts are accepted or physiologically effective. */
function life(seed: string, until: number, strategy: Strategy, experimental: boolean): GameState {
  let s = createGame(seed, "infant", BIRTH);
  function act(hour: number, key: string, command: GameCommand) {
    s = commandGame(s, command, BIRTH + hour * HOUR, key + "/" + hour);
  }
  for (let h = 1; h <= until; h++) {
    s = advanceGame(s, BIRTH + h * HOUR);
    // Identical, unconditional nonintervention attempts in both arms.
    if (h % 3 === 0 && strategy !== "clean") act(h, "clean", { type: "clean" });
    if (h % 5 === 0) act(h, "discipline", { type: "discipline" });
    if (h % 8 === 0) act(h, "medicine", { type: "medicine" });
    if (h % 24 === 9 || h % 24 === 19) {
      const lights = strategy === "rest" && experimental && h >= 33 && h <= 177
        ? h % 24 !== 9 : true;
      act(h, "lights", { type: "lights", on: lights });
    }
    if (strategy === "clean") {
      // Both issued an identical baseline until 33h and again after 153h.
      if (h % (experimental && h >= 33 && h <= 153 ? 9 : 3) === 0)
        act(h, "clean", { type: "clean" });
    }
    // Hunger care differs only in the intervention window. Both arms are
    // fed regularly before/after to prevent fabricated deaths.
    if (!s.sleeping && s.meters.hunger < 4) {
      const period = strategy === "feed" && experimental && h >= 21 && h <= 153 ? 4 : 1;
      if (h % period === 0) act(h, "meal", { type: "feed", food: "meal" });
    }
    if (strategy === "activity" && experimental && (h === 116 || h === 140)) {
      const t = h + 0.5;
      s = advanceGame(s, BIRTH + t * HOUR);
      act(t, "training", { type: "start-game", game: "training" });
      act(t + 0.125, "training-close", { type: "cancel" });
    }
    // One controlled fractional feeding choice, inside a growth interval.
    if (strategy === "feed" && !experimental && h === 20) {
      s = advanceGame(s, BIRTH + 20.5 * HOUR);
      if (!s.sleeping && s.meters.hunger < 4)
        act(20.5, "fractional-meal", { type: "feed", food: "meal" });
    }
    assert.equal(s.dead, false, seed + " " + strategy + " life died at " + h +
      " cause=" + s.death?.cause);
  }
  return s;
}

function pair(seed: string, shape: typeof fixtures.blob, strategy: Strategy, until = LIFE) {
  const control = life(seed, until, strategy, false);
  const treatment = life(seed, until, strategy, true);
  const { atlas, genome } = materialInputs(shape, seed);
  const program = compileMaterialDevelopment(atlas, genome);
  const firstHistory = createEnvironmentalHistory(control);
  const secondHistory = createEnvironmentalHistory(treatment);
  const firstCare = createCareOperatorChronology(program, firstHistory, genome.genotype);
  const secondCare = createCareOperatorChronology(program, secondHistory, genome.genotype);
  const first = createUnifiedMaterialTimeline({
    program, genome, care: firstCare, history: firstHistory,
  });
  const second = createUnifiedMaterialTimeline({
    program, genome, care: secondCare, history: secondHistory,
  });
  assert.equal(control.seed, treatment.seed);
  assert.equal(control.clock.hatchAtMs, treatment.clock.hatchAtMs);
  assert.equal(control.mode, treatment.mode);
  assert.deepEqual(control.careSamples[0], treatment.careSamples[0]);
  assert.equal(first.program, second.program, "both timelines share the actual immutable birth program");
  return { seed, shape, strategy, program, genome,
    control, treatment, first, second, firstHistory, secondHistory, firstCare, secondCare };
}

const points = (g: MaterialGraph) => new Set(g.cells.map(c=>c.tissueId+":"+c.x+","+c.y));
const symmetricDifference = (a: Set<string>, b: Set<string>): number =>
  [...a].filter(x=>!b.has(x)).length + [...b].filter(x=>!a.has(x)).length;
const topology = (g: MaterialGraph) =>
  g.tissues.map(t=>[t.id,t.parentId,t.relationship,t.rigidity]).sort((a,b)=>
    String(a[0]).localeCompare(String(b[0])));
function metric(g: MaterialGraph) {
  const xs = g.cells.map(c=>c.x), ys = g.cells.map(c=>c.y);
  return {
    survivingCells: g.cells.length,
    generatedCells: g.cells.filter(c=>c.provenance==="generated").length,
    tissues: g.tissues.length,
    attachments: g.links.filter(l=>l.kind==="attachment").length,
    fusions: g.links.filter(l=>l.kind==="fusion").length,
    operations: g.events.length,
    width: xs.length ? Math.max(...xs)-Math.min(...xs)+1 : 0,
    height: ys.length ? Math.max(...ys)-Math.min(...ys)+1 : 0,
  };
}
function physicalDifference(a: MaterialGraph, b: MaterialGraph) {
  const ma = metric(a), mb = metric(b);
  const changedCells = symmetricDifference(points(a),points(b));
  const changedTopology = JSON.stringify(topology(a)) !== JSON.stringify(topology(b));
  const changedLinks = JSON.stringify(a.links) !== JSON.stringify(b.links);
  return { changedCells, changedTopology, changedLinks, signedCellDelta: mb.survivingCells-ma.survivingCells,
    signedGeneratedDelta: mb.generatedCells-ma.generatedCells,
    structural: changedCells>0 || changedTopology || changedLinks };
}
function invariant(program: ReturnType<typeof compileMaterialDevelopment>, graph: MaterialGraph, hour: number) {
  assert.deepEqual(graph.sourceCells, program.source.sourceCells);
  assert.equal(graph.sourceFingerprint,program.source.sourceFingerprint);
  assert.deepEqual(validateChronologicalGraph(program.source,graph),[]);
  const authored = new Set(program.source.sourceCells.map(c=>c.id));
  for(const c of graph.cells) {
    assert.ok(c.sourceIds.length>0);
    assert.ok(c.sourceIds.every(id=>authored.has(id)));
    assert.ok(materialSourceAncestry(graph,c.id).length>0);
    if(c.provenance==="generated") assert.ok(c.operationId);
  }
  assert.ok(graph.events.every(e=>e.atHour<=hour+1e-8));
}
/** Classifier deliberately ignores all colors, motion/pose, labels and hashes. */
function classify(
  a: MaterialGraph, b: MaterialGraph, physiological: boolean, colorChanged = false,
): "anatomical" | "physiological-only" | "cosmetic-only" | "constrained-null" {
  if (physicalDifference(a,b).structural) return "anatomical";
  if (physiological) return "physiological-only";
  return colorChanged ? "cosmetic-only" : "constrained-null";
}

test("INT-001 independently equals an enumerated q×chaos integral (not production vs production)",()=>{
  const {program,genome,firstHistory,firstCare}=pair("CARE-GEOMETRY-527",fixtures.blob,"feed",44);
  const op=program.operators.find(o=>o.kind==="elongate")!;
  assert.ok(op.chaos);
  const at=34.75;
  const marks=new Set<number>([op.atHour,at]);
  for(let n=Math.ceil(op.atHour);n<at;n++)marks.add(n);
  for(const s of firstHistory.samples)
    if(s.hour>op.atHour&&s.hour<at)marks.add(s.hour);
  for(const e of firstHistory.commands)
    if(e.atHour>op.atHour&&e.atHour<at)marks.add(e.atHour);
  const sorted=[...marks].sort((x,y)=>x-y);
  let weighted=0;
  const p=65521;
  for(let i=0;i+1<sorted.length;i++){
    const left=sorted[i], right=sorted[i+1];
    const pressure=firstHistory.atHour(left);
    // Independently derive the exact tip-extension reaction norm from the
    // genetic channel equations, not compileCareDevelopmentSignals/interval().
    const sensitivity=program.signals.channels.sensitivity.nutrition;
    const q=(1-sensitivity*(1-pressure.exposure.nutrition))*
      (0.6+0.4*pressure.physiology.restRecovery);
    let x=op.chaos!.initial.x, y=op.chaos!.initial.y;
    for(let k=0;k<Math.floor(left);k++){
      [x,y]=[(2*x+y)%p,(x+y)%p];
    }
    const r=1+op.chaos!.rateAmplitude*(2*x/(p-1)-1);
    assert.ok(q>=0&&q<=1&&r>=0.6&&r<=1.4);
    weighted+=(right-left)*q*r;
  }
  const expected=Math.min(1,weighted/op.durationHours);
  const observed=cumulativeChaosCareExpression(op,at,firstCare);
  console.log("CARE-003 independent exposure "+JSON.stringify({
    operator:op.id,throughHour:at,
    weightedHours:Number(weighted.toFixed(9)),
    independentlyNormalized:Number(expected.toFixed(9)),
    productionNormalized:Number(observed.toFixed(9)),
    inheritedStrength:Number(op.strength.toFixed(9)),
  }));
  assertNear(observed,expected,"manual weighted exposure integral");
  assert.ok(observed<=1&&observed>=0);
  assert.ok(op.strength>0&&op.strength<=1);
  const exposure=firstCare.interval(10,11).find(x=>x.operatorId===op.id)!;
  assert.ok(exposure.progressDelta<=exposure.expressedHours,
    "environmental permission and inherited strength remain separate");
  assert.equal(genome.genotype.fingerprint,program.genomeFingerprint);
});

test("[CARE-003/A1] bounded paired cohort: one strategy, stable identity, physical changes AND honest nulls",()=>{
  const started=performance.now();
  const cohort=[
    ["CARE-GEOMETRY-527",fixtures.blob,"feed",LIFE],
    ["CARE-GEOMETRY-527",fixtures.branching,"feed",156],
    ["CARE-GEOMETRY-815",fixtures.symmetric,"feed",156],
    ["CARE-GEOMETRY-527",fixtures.blob,"rest",156],
    ["CARE-GEOMETRY-527",fixtures.blob,"clean",156],
    ["CARE-GEOMETRY-527",fixtures.blob,"activity",156],
    ["CARE-GEOMETRY-527",fixtures.empty,"feed",156],
  ] as const;
  const samples=[0,10,20.25,21,30,60,110,125,155,195,204,240,300,360];
  const report: Array<Record<string,unknown>>=[];
  let positive=0, noOpportunity=0, physiologicalOnly=0;
  for(const [seed,shape,strategy,horizon] of cohort){
    const trial=pair(seed,shape,strategy,horizon);
    const birthGenome=JSON.stringify(trial.genome);
    const birthProgram=JSON.stringify(trial.program);
    const measured: Array<{hour:number;classification:string;cellDelta:number;changedCells:number}>=[];
    for(const hour of samples.filter(h=>h<=horizon)){
      const a=trial.first.at(hour).graph,b=trial.second.at(hour).graph;
      invariant(trial.program,a,hour);
      invariant(trial.program,b,hour);
      const mediator=trial.firstHistory.atHour(hour),other=trial.secondHistory.atHour(hour);
      const changed=JSON.stringify(mediator.exposure)!==JSON.stringify(other.exposure) ||
        JSON.stringify(mediator.physiology)!==JSON.stringify(other.physiology);
      const diff=physicalDifference(a,b);
      const label=classify(a,b,changed);
      if(label==="anatomical")positive++;
      if(label==="physiological-only")physiologicalOnly++;
      measured.push({hour,classification:label,cellDelta:diff.signedCellDelta,
        changedCells:diff.changedCells});
      assert.deepEqual(trial.first.at(hour),trial.first.at(hour),"same-age query cannot grow material twice");
      if(hour===30||hour===125){
        assert.deepEqual(trial.first.at(hour),trial.first.replay(hour));
        assert.deepEqual(trial.second.at(hour),trial.second.replay(hour));
      }
    }
    if(strategy==="feed"){
      for(const h of [0,10,20.25]){
        assert.deepEqual(trial.first.at(h).graph,trial.second.at(h).graph,
          "future intervention must not modify earlier material");
      }
    }
    if(shape===fixtures.empty){
      assert.equal(trial.program.source.cells.length,0);
      assert.equal(trial.program.operators.length,0);
      assert.ok(measured.every(m=>m.classification!=="anatomical"));
      assert.ok(measured.some(m=>m.classification==="physiological-only"));
      noOpportunity++;
    }
    assert.equal(JSON.stringify(trial.genome),birthGenome);
    assert.equal(JSON.stringify(trial.program),birthProgram);
    const latest=measured.at(-1)!;
    report.push({seed,shape:shape===fixtures.empty?"empty":shape===fixtures.blob?"blob":
      shape===fixtures.branching?"branching":"symmetric",strategy,horizon,
      last:latest,peakSymmetricDifference:Math.max(...measured.map(m=>m.changedCells)),
      anatomyWitnesses:measured.filter(m=>m.classification==="anatomical").length});
  }
  assert.ok(positive>0,"at least one independent physically permitted care response must occur");
  assert.ok(noOpportunity>0);
  assert.ok(physiologicalOnly>0,"the physical-null/physiology distinction is observable");
  const duration=performance.now()-started;
  console.log("CARE-003 numerical cohort "+JSON.stringify({report,positive,
    noOpportunity,physiologicalOnly,elapsedMs:Math.round(duration)}));
  assert.ok(duration<90_000,"focused cohort must stay bounded (<90s CI)");
});

test("counterfactual prefix causality, accepted fractional activity and reversible query order",()=>{
  const trial=pair("CARE-GEOMETRY-527",fixtures.blob,"activity",141);
  const act=trial.secondHistory.commands.filter(e=>e.command.type==="start-game");
  assert.equal(act.length,2);
  assert.ok(act.every(e=>e.accepted));
  assert.deepEqual(act.map(e=>e.atHour),[116.5,140.5]);
  assert.deepEqual(trial.first.at(116.25),trial.second.at(116.25));
  const baseline=trial.firstCare.interval(116.5,116.75);
  const trained=trial.secondCare.interval(116.5,116.75);
  const reinforcement=trial.program.operators.find(op=>op.kind==="reinforce")!;
  const e=(list:typeof baseline)=>list.find(x=>x.operatorId===reinforcement.id)!;
  assert.ok(e(trained).expressedHours>=e(baseline).expressedHours);
  assert.deepEqual(trial.second.at(130),trial.second.replay(130));
  assert.deepEqual(trial.second.at(30),trial.second.replay(30));
  assert.deepEqual(trial.second.at(141),trial.second.replay(141));
  const restored=validateGameState(JSON.parse(JSON.stringify(trial.treatment)));
  const history=createEnvironmentalHistory(restored);
  const care=createCareOperatorChronology(trial.program,history,trial.genome.genotype);
  const replay=createUnifiedMaterialTimeline({program:trial.program,genome:trial.genome,care,history});
  for(const hour of [141,116.25,30,130]){
    assert.deepEqual(replay.at(hour),trial.second.at(hour));
  }
  const activitySample=trial.secondHistory.atHour(117);
  assert.ok(activitySample.cumulative.trainingSessions>0);
});

test("rejected commands and color-only changes never masquerade as structural care",()=>{
  const seed="CARE-GEOMETRY-527";
  let a=createGame(seed,"infant",BIRTH);
  a=advanceGame(a,BIRTH+HOUR/2);
  a=commandGame(a,{type:"start-game",game:"training"},
    BIRTH+HOUR/2,"accepted-session");
  assert.equal(a.commandHistory.at(-1)?.accepted,true);
  const b=commandGame(a,{type:"start-game",game:"training"},
    BIRTH+HOUR/2,"rejected-overlapping-session");
  assert.equal(b.commandHistory.at(-1)?.accepted,false);
  const {atlas,genome}=materialInputs(fixtures.blob,seed);
  const program=compileMaterialDevelopment(atlas,genome);
  const baseline=createEnvironmentalHistory(a),rejected=createEnvironmentalHistory(b);
  const aTimeline=createUnifiedMaterialTimeline({program,genome,
    care:createCareOperatorChronology(program,baseline,genome.genotype),history:baseline});
  const bTimeline=createUnifiedMaterialTimeline({program,genome,
    care:createCareOperatorChronology(program,rejected,genome.genotype),history:rejected});
  assert.deepEqual(aTimeline.at(0.5).graph,bTimeline.at(0.5).graph);
  assert.deepEqual(bTimeline.at(0.25).graph,aTimeline.at(0.25).graph);
  const born=aTimeline.at(0).graph;
  const recolored={...born,cells:born.cells.map(c=>({...c,color:"#00ff00"}))};
  assert.equal(classify(born,recolored,false,true),"cosmetic-only");
  assert.equal(classify(born,born,false),"constrained-null");
  assert.equal(classify(born,born,true),"physiological-only");
});

test("[CARE-003/A2] rendered anatomical ownership maps to the same real graph, never pose/color alone",()=>{
  const seed="CARE-GEOMETRY-527";
  const shape=fixtures.blob;
  const trial=pair(seed,shape,"feed",80);
  const a=createSimulation(shape,seed,"infant",{careGame:trial.control});
  const b=createSimulation(shape,seed,"infant",{careGame:trial.treatment});
  const hour=60;
  const f1=a.frameAt(hour/24,{time:0,action:"idle"});
  const f2=b.frameAt(hour/24,{time:0,action:"idle"});
  const materialParts=(frame:typeof f1)=>frame.parts.filter(p=>p.role==="material-growth");
  const aGraph=a.materialStateAt(hour/24).graph,bGraph=b.materialStateAt(hour/24).graph;
  for(const [frame,graph] of [[f1,aGraph],[f2,bGraph]] as const)
    for(const pixel of frame.pixels)assert.ok(graph.cells.some(c=>c.id===pixel.materialCellId),
      "daily rendered material must belong to the same authoritative graph");
  assert.ok(materialParts(f1).every(p=>(p.sourcePartIds?.length ?? 0)>0));
  assert.ok(materialParts(f2).every(p=>(p.sourcePartIds?.length ?? 0)>0));
  if(physicalDifference(aGraph,bGraph).structural) {
    // The renderer may legitimately occlude some developed cells; never
    // infer structure solely from pixel differences or motion poses.
    assert.ok(aGraph.cells.some(c=>c.provenance==="generated") ||
      bGraph.cells.some(c=>c.provenance==="generated"));
    assert.ok(materialParts(f1).length+materialParts(f2).length>0,
      "source-derived material is represented by actual rendered material-growth parts");
  }
  assert.deepEqual(aGraph.sourceCells,bGraph.sourceCells);
});
