import {
  createUnifiedMaterialTimeline, chaosWeightedCareHours,
  cumulativeChaosCareExpression, recordedIterativeResources,
} from "../src/integration/unified-runtime";
import {
  compileMaterialDevelopment, compileLifetimeRemodeling, materialOperatorPotential,
  materialOperatorChaosRate, materialSourceAncestry,
  type MaterialDevelopmentProgram as ActualMaterialProgram,
  type MaterialOperator,
} from "../src/development";
import {
  createCareOperatorChronology, type EnvironmentalHistory,
  type EnvironmentPressure,
} from "../src/environment";
import { materialInputs, drawing } from "./alg-development-fixtures";
import { createSimulation } from "../src/simulation";
import { HOUR, createGame, advanceGame, commandGame } from "../src/gameplay";
import { createEnvironmentalHistory } from "../src/environment";
import { seedChaos, CHAOS_VERSION } from "../src/development/chaos";
import test from "node:test";
import assert from "node:assert/strict";
import {
  CHRONOLOGICAL_LIMITS,
  CHRONOLOGICAL_LEGACY_WARNINGS,
  compareChronologicalEvents,
  evaluateChronologicalMaterial,
  validateChronologicalGraph,
  type ChronologicalProposal,
} from "../src/integration/chronological-material";
import { iterativeGrowthAt, lifetimeRemodelingAt, type LifetimeRemodelingProgram } from "../src/development";
import { inferFunctionalMaterial } from "../src/integration/functional-material";
import { buildFunctionalGraph, poseFunctionalGraph } from "../src/simulation/locomotion";
import type { Region } from "../src/simulation/development";
import type { MaterialGraph, MaterialCell, MaterialDevelopmentProgram } from "../src/development";

type State = Readonly<{ resourceCredits: number; genome: string }>;
const source = (id: string, x: number, y: number): MaterialCell => ({
  id, tissueId: "tissue", x, y, color: "#99bbdd",
  provenance: "authored", sourceIds: [id], parentCellIds: [],
  operationId: null,
});
function fixture(): MaterialGraph {
  const sourceCells = [
    source("ink/0", 8, 10), source("ink/1", 9, 10),
    source("ink/2", 10, 10),
  ];
  return {
    version: 1, sourceFingerprint: "unchanged-ink",
    sourceCells, cells: [...sourceCells],
    tissues: [{ id: "tissue", sourcePartId: "ink", parentId: null,
      relationship: "root", sourceCellIds: sourceCells.map(c => c.id),
      growthSiteIds: ["site"], rigidity: 0 }],
    sites: [{ id: "site", tissueId: "tissue", rootCellId: "ink/2",
      direction: { x: 1, y: 0 } }],
    links: [], events: [], protectedVoids: ["15,15"],
  };
}
const originalState: State = { resourceCredits: 0, genome: "PERMANENT" };
function translate(atHour: number, dy: number): ChronologicalProposal<State> {
  return {
    id: "move-tissue", kind: "remodel-transition", atHour,
    apply(graph, context) {
      const cells = graph.cells.map(c => ({ ...c, y: c.y + dy }));
      return { accepted: true, graph: { ...graph, cells }, context };
    },
  };
}
function grow(atHour: number, id = "grown"): ChronologicalProposal<State> {
  return {
    id, kind: "iterative-interval", atHour,
    apply(graph, context) {
      if (!context.resourceCredits)
        return { accepted: false, reason: "no-resource",
          graph, context };
      const tip = [...graph.cells].sort((a, b) => b.x - a.x)[0];
      const p = { x: tip.x + 1, y: tip.y };
      if (graph.cells.some(c => c.x === p.x && c.y === p.y) ||
          graph.protectedVoids.includes(p.x + "," + p.y))
        return { accepted: false, reason: "occupied-or-protected",
          graph, context };
      const newCell: MaterialCell = {
        id, tissueId: tip.tissueId, ...p, color: tip.color,
        provenance: "generated", sourceIds: [...tip.sourceIds],
        parentCellIds: [tip.id], operationId: id,
      };
      return { accepted: true, context: {
        ...context, resourceCredits: context.resourceCredits - 1,
      }, graph: { ...graph, cells: [...graph.cells, newCell],
        events: [...graph.events, { id, kind: "elongate",
          atHour, createdCellIds: [id], removedCellIds: [],
          sourceCellIds: [...tip.sourceIds] }] } };
    },
  };
}
const credit = (hour: number, value: number, id: string): ChronologicalProposal<State> =>
  ({ id, kind: "care-boundary", atHour: hour,
    apply(graph, context) {
      return { accepted: true, graph,
        context: { ...context, resourceCredits: value } };
    } });

test("[INT-001/A1] fractional remodeling precedes the next completed hourly growth step", () => {
  const born = fixture();
  const events: ChronologicalProposal<State>[] = [
    grow(1), translate(0.5, 1), credit(0, 1, "start-resource"),
  ];
  const atHalf = evaluateChronologicalMaterial(born, originalState, events, 0.5);
  assert.deepEqual(atHalf.graph.cells.map(c => c.y), [11, 11, 11]);
  assert.equal(atHalf.graph.cells.length, 3);
  const atOne = evaluateChronologicalMaterial(born, originalState, events, 1);
  assert.equal(atOne.graph.cells.length, 4);
  const extended = atOne.graph.cells.find(c => c.id === "grown")!;
  assert.deepEqual([extended.x, extended.y], [11, 11],
    "growth tip follows its current relocated source, not the birth snapshot");
  assert.deepEqual(extended.sourceIds, ["ink/2"]);
  assert.deepEqual(extended.parentCellIds, ["ink/2"]);
  assert.deepEqual(atOne.graph.sourceCells, born.sourceCells);
  assert.deepEqual(atOne.outcomes.map(o => o.id),
    ["start-resource", "move-tissue", "grown"]);
  assert.deepEqual(atOne.outcomes.find(o => o.id === "move-tissue")?.delta.relocatedCellIds,
    ["ink/0", "ink/1", "ink/2"]);
  assert.deepEqual(atOne.outcomes.find(o => o.id === "grown")?.delta.createdCellIds,
    ["grown"]);
  assert.deepEqual(validateChronologicalGraph(born, atOne.graph), []);
});

test("[INT-001/A1] exact ties respect interval completion, remodeling, then next-interval care", () => {
  const proposed = [
    credit(1, 0, "care-c"),
    grow(1, "grow-b"),
    { ...translate(1, 1), id: "remodel-z" },
    grow(1, "grow-a"),
    credit(0, 2, "initial"),
  ];
  const ordered = [...proposed].sort(compareChronologicalEvents);
  assert.deepEqual(ordered.map(x => x.id),
    ["initial", "remodel-z", "grow-a", "grow-b", "care-c"]);
  const frame = evaluateChronologicalMaterial(fixture(), originalState,
    proposed, 1);
  assert.deepEqual(frame.graph.cells.filter(c => c.provenance === "generated")
    .map(c => [c.x, c.y]), [[11, 11], [12, 11]]);
  assert.equal(frame.context.resourceCredits, 0,
    "care at completed hour governs future growth, not earlier interval");
  assert.deepEqual(frame.graph.sourceCells, fixture().sourceCells);
});

test("[INT-001/A1] same-time remodeling collisions defer atomically in lexical order", () => {
  const occupy: ChronologicalProposal<State> = {
    id: "a-occupy", kind: "remodel-transition", atHour: 1,
    apply(graph, context) {
      const child:MaterialCell={...source("first",11,10),
        provenance:"generated",sourceIds:["ink/2"],
        parentCellIds:["ink/2"],operationId:"a-occupy"};
      return {accepted:true,graph:{...graph,cells:[...graph.cells,child]},
        context};
    },
  };
  const collision:ChronologicalProposal<State>={
    id:"z-collide",kind:"remodel-transition",atHour:1,
    apply(graph,context) {
      if(graph.cells.some(c=>c.x===11&&c.y===10))
        return {accepted:false,reason:"occupied",graph,context:{
          ...context,resourceCredits:context.resourceCredits,
        }};
      throw new Error("Expected occupied material at the same timestamp");
    },
  };
  const frame=evaluateChronologicalMaterial(fixture(),originalState,
    [collision,occupy],1);
  assert.equal(frame.graph.cells.length,4);
  assert.deepEqual(frame.outcomes.map(o=>o.id),["a-occupy","z-collide"]);
  const deferred=frame.outcomes[1];
  assert.equal(deferred.accepted,false);
  assert.equal(deferred.reason,"occupied");
  assert.deepEqual(deferred.delta.createdCellIds,[]);
  assert.deepEqual(validateChronologicalGraph(fixture(),frame.graph),[]);
});

test("[INT-001/A3] chronological care prefix changes geometry, never genotype or earlier material", () => {
  const born = fixture();
  const nourished = [credit(0, 1, "care-start"), grow(1),
    credit(2, 4, "future-feed"), grow(3, "later-growth")];
  const deprived = [credit(0, 0, "care-start"), grow(1),
    credit(2, 4, "future-feed"), grow(3, "later-growth")];
  const good = evaluateChronologicalMaterial(born, originalState, nourished, 1);
  const bad = evaluateChronologicalMaterial(born, originalState, deprived, 1);
  assert.equal(good.graph.cells.length, 4);
  assert.equal(bad.graph.cells.length, 3);
  assert.deepEqual(good.graph.sourceCells, bad.graph.sourceCells);
  assert.equal(good.context.genome, bad.context.genome);
  assert.deepEqual(evaluateChronologicalMaterial(born, originalState,
    nourished.slice(0, 2), 1), good,
    "a future command must not influence an earlier frame");
  const shuffled = [3, 0, 1, 2, 1].map(hour =>
    evaluateChronologicalMaterial(born, originalState, nourished, hour));
  assert.deepEqual(shuffled[2], shuffled[4]);
  assert.deepEqual(shuffled[2], good);
});

test("[INT-001/A2] invalid attachments, void growth, unrecorded matter and age overflow are rejected", () => {
  const born = fixture();
  assert.deepEqual(validateChronologicalGraph(born, {
    ...born, cells: [...born.cells, { ...source("generated", 15, 15),
      provenance: "generated", operationId: "fake", sourceIds: ["ink/2"] }],
  }).filter(s => s.includes("protected-void")), ["protected-void:generated"]);
  assert.deepEqual(validateChronologicalGraph(born, {
    ...born, links: [{ id: "orphan", fromTissueId: "tissue",
      toTissueId: "tissue", kind: "attachment",
      fromCellId: "missing", toCellId: "ink/0" }],
  }).filter(s => s.includes("stale-link")), ["stale-link-source:orphan"]);
  assert.throws(() => evaluateChronologicalMaterial(born, originalState,
    [], CHRONOLOGICAL_LIMITS.maxHour + 1), /out of supported/);
  assert.throws(() => evaluateChronologicalMaterial(born, originalState,
    [{ ...grow(513), id: "beyond-iterative" }], 513),
    /exceeds DEV-003/);
});

test("[INT-001/A1/A2/A3] merged from-birth APIs cannot compose a relocated growth site", () => {
  const birth = fixture();
  const stubSignals = { channels: {
    maturation: { plasticity: 1 },
    support: { rigidity: 0, membrane: 0 },
    growth: { rate: 0.4 },
    branching: { initiation: 0, divergence: 0.2 },
    appendages: { extension: 0 },
  } } as unknown as MaterialDevelopmentProgram["signals"];
  const compiled = {
    version: 1, source: birth, genomeFingerprint: "genome",
    signals: stubSignals, operators: [], fingerprint: "from-birth",
  } as MaterialDevelopmentProgram;
  const remodel: LifetimeRemodelingProgram = {
    version: 1, birth, seed: "TEST", genomeFingerprint: "genome",
    signals: stubSignals, operations: [{
      id: "relocate", kind: "translate", tissueId: "tissue",
      direction: { x: 0, y: 1 }, atHour: 0,
      durationHours: 1, units: 2, strength: 1,
    }],
  };
  const remodeled = lifetimeRemodelingAt(remodel, 0.5);
  assert.ok(remodeled.transitions.length >= 1);
  assert.equal(remodeled.graph.cells.find(c => c.id === "ink/2")!.y, 11);
  const grown = iterativeGrowthAt(compiled, [
    { atHour: 0, resources: 1, light: null },
  ], 1);
  assert.equal(grown.graph.sourceFingerprint, remodeled.graph.sourceFingerprint);
  assert.equal(grown.graph.cells.find(c => c.id === "ink/2")!.y, 10,
    "iterative solver independently reconstructs its birth");
  assert.equal(grown.graph.cells.some(c => c.x === 11 && c.y === 11), false,
    "no development API can step iterative growth on the relocated graph with persistent age/orbit");
  assert.ok(CHRONOLOGICAL_LEGACY_WARNINGS.length >= 3);
});

test("[INT-001/A3] source-derived DEV-003 child tissue IDs can become functional only while attached and flexible", () => {
  const base = fixture();
  const branches: MaterialCell[] = [];
  const tissues = [...base.tissues];
  const links = [...base.links];
  for (const x of [8, 10]) {
    const id = "site/" + x + "/iterative/0";
    for (let y = 11; y <= 16; y++) {
      branches.push({
        id: id + "/cell/" + y, tissueId: id, x, y,
        color: "#99bbdd", provenance: "generated",
        sourceIds: [x === 8 ? "ink/0" : "ink/2"],
        parentCellIds: [y === 11 ?
          (x === 8 ? "ink/0" : "ink/2") : id + "/cell/" + (y - 1)],
        operationId: "iterative/" + y,
      });
    }
    tissues.push({ id, sourcePartId: "ink", parentId: "tissue",
      relationship: "joint", sourceCellIds: [x === 8 ? "ink/0" : "ink/2"],
      growthSiteIds: [], rigidity: 0.2 });
    links.push({ id: id + "/attachment", kind: "attachment",
      fromTissueId: id, toTissueId: "tissue",
      fromCellId: id + "/cell/11",
      toCellId: x === 8 ? "ink/0" : "ink/2" });
  }
  const graph = { ...base, cells: [...base.cells, ...branches], tissues, links };
  assert.deepEqual(validateChronologicalGraph(base, graph), []);
  const region = { id: "live-body", kind: "body", role: "trunk",
    sourceIds: ["ink"], source: { id: "ink" },
    center: { x: 9, y: 10 }, anchor: { x: 9, y: 10 },
    tip: { x: 9, y: 10 }, parentId: null,
  } as unknown as Region;
  const node = { id: region.id, kind: "body" as const, role: "trunk",
    sourceIds: ["ink"], center: region.center,
    anchor: region.anchor, tip: region.tip, readiness: 1 };
  const functional = inferFunctionalMaterial(graph, [region], [node]);
  assert.equal(functional.bindings.length, 2,
    "no substring /growth/ is necessary when an explicit child material linkage exists");
  const rig = buildFunctionalGraph(functional.nodes);
  const active = poseFunctionalGraph(rig, { action: "move", time: 5 });
  assert.ok(active.diagnostics.worldAdvance > 0);
  assert.ok(active.locomotionSupported);
  const detached = { ...graph, links: links.filter(l =>
    !l.id.includes("site/8/iterative")) };
  const detachedRig = buildFunctionalGraph(
    inferFunctionalMaterial(detached, [region], [node]).nodes);
  assert.equal(poseFunctionalGraph(detachedRig, {
    action: "move", time: 5 }).diagnostics.worldAdvance, 0);
  const rigid = { ...graph, tissues: tissues.map(t =>
    t.id.includes("site/8/") ? { ...t, rigidity: 0.99 } : t) };
  const rigidRig = buildFunctionalGraph(
    inferFunctionalMaterial(rigid, [region], [node]).nodes);
  assert.equal(poseFunctionalGraph(rigidRig, {
    action: "move", time: 5 }).diagnostics.worldAdvance, 0);
});

function realProgram(rows: string[], seed: string, kind: MaterialOperator["kind"]="elongate",
  durationHours=4) {
  const {atlas,genome}=materialInputs(drawing(rows),seed);
  const original=compileMaterialDevelopment(atlas,genome);
  const site=original.source.sites[0];
  const operator:MaterialOperator={
    id:"test/"+kind,tissueId:site?.tissueId??"",
    siteId:site?.id,kind,
    atHour:0,durationHours,strength:1,
    direction:{x:1,y:0},
  };
  const program:ActualMaterialProgram={
    ...original,operators:site?[operator]:[],
    fingerprint:original.fingerprint+"/int-real-"+kind,
  };
  return {program,genome,operator};
}
const coords=(cells:readonly {x:number;y:number}[]) =>
  cells.map(c=>[c.x,c.y].join(",")).sort();

test("[INT-001/A1] real material and iterative engines share persistent source-connected cells and exact replay",()=>{
  const {program,genome}=realProgram(["####","####"],"INT-REAL-4", "elongate",2);
  const timeline=createUnifiedMaterialTimeline({program,genome});
  const t0=timeline.at(0),t1=timeline.at(1),t2=timeline.at(2),t3=timeline.at(3);
  assert.deepEqual(t0.graph.cells,program.source.cells);
  assert.equal(t2.material.records.length,1);
  assert.ok(t2.iterative.ledger.length===2);
  assert.ok(t3.graph.cells.length>=t1.graph.cells.length);
  assert.equal(new Set(t3.graph.events.map(e=>e.id)).size,t3.graph.events.length);
  assert.ok(t3.graph.cells.every(c=>materialSourceAncestry(t3.graph,c.id).length>0));
  for(const l of t3.iterative.ledger) {
    assert.equal(l.spent+l.unspent,l.available);
    assert.equal(l.bySite.reduce((s,v)=>s+v.spent,0),l.spent);
  }
  assert.deepEqual(timeline.at(3),timeline.replay(3));
  assert.deepEqual(timeline.at(1),t1);
  assert.deepEqual(timeline.at(0),t0);
  assert.deepEqual(timeline.at(2),t2);
  assert.deepEqual(JSON.parse(JSON.stringify(t3.graph)),t3.graph);
  assert.ok(timeline.checkpointCount()<=16);
});

test("[INT-001/A1] material quantum appears at earned threshold, not query cutoff",()=>{
  const {program,genome,operator}=realProgram(["###"],"INT-THRESHOLD-9","elongate",2);
  const potential=materialOperatorPotential(operator.kind,program.signals);
  const expected=operator.durationHours/(7*operator.strength*potential);
  assert.ok(expected>0&&expected<2);
  const timeline=createUnifiedMaterialTimeline({program,genome});
  const before=timeline.at(expected-1e-5);
  const after=timeline.at(expected+1e-5);
  const beforeOp=before.graph.events.filter(e=>e.id.startsWith("operator/"));
  const afterOp=after.graph.events.filter(e=>e.id.startsWith("operator/"));
  assert.equal(beforeOp.length,0,
    "disallow committing first operator quantum before independently predicted threshold");
  assert.equal(afterOp.length,1,
    "commit physical threshold with no missed/duplicated first unit");
  const date=afterOp[0].atHour;
  assert.ok(Math.abs(date-expected)<2e-6,
    "accepted event must be timestamped at its earned threshold, not at requested frame age");
  assert.deepEqual(timeline.at(expected+1e-5),after);
  assert.deepEqual(timeline.replay(expected+1e-5),after);
});

test("[INT-001/A3] chaos-weighted exact care exposure uses unstrengthened expressed hours, including fractional changes",()=>{
  const {program,genome,operator}=realProgram(["###"],"INT-CHAOS-44","elongate",4);
  const op:MaterialOperator={...operator,strength:0.65,
    chaos:{version:CHAOS_VERSION,initial:seedChaos("INT-CHAOS-44"),
      rateAmplitude:0.35,turnAmplitude:0}};
  const p:ActualMaterialProgram={...program,operators:[op],fingerprint:program.fingerprint+"/chaos"};
  const sensitivity=genome.genotype.channels.sensitivity.nutrition;
  const q1=1-0.6*sensitivity;
  const emptyNeeds=[0.75,0.75,0.75,0.75,0.75,0.75];
  const makePressure=(hour:number):EnvironmentPressure=>{
    const nutrition=hour<0.5?1:0.4;
    return {
      atHour:hour,exposure:{nutrition,activity:0.5,threat:0},
      physiology:{nutrition,restRecovery:1,physicalFitness:0.5,
        resourceSecurity:0.75,persistentStress:0},
      cumulative:{nutritionDeficitDays:0,nutritionOpportunityDays:0,
        nutritionMean:nutrition,restDeficitDays:0,safetyDeficitDays:0,
        trainingSessions:0,battles:0},
      provenance:{nutrition:"sampled-hunger",latestCareSampleHour:0,
        observedCommands:hour>=0.5?1:0},
    };
  };
  const history:EnvironmentalHistory={
    version:1,maxHour:4,
    samples:[{hour:0,nutrition:1,needs:emptyNeeds}],
    commands:[{id:"fractional",atHour:0.5,accepted:true,
      command:{type:"start-game",game:"training"}}],
    atHour:makePressure,eventsThrough:()=>[],
  };
  const care=createCareOperatorChronology(p,history,genome.genotype);
  const r0=materialOperatorChaosRate(op,0);
  const r1=materialOperatorChaosRate(op,1);
  const predicted=0.5*r0+0.5*q1*r0+q1*r1;
  const actual=chaosWeightedCareHours(op,0,2,care);
  assert.ok(Math.abs(actual-predicted)<1e-10,
    "independent two-hour piecewise integral is required");
  assert.ok(Math.abs(actual-(chaosWeightedCareHours(op,0,0.5,care)+
    chaosWeightedCareHours(op,0.5,1,care)+
    chaosWeightedCareHours(op,1,2,care)))<1e-10);
  const credit=care.interval(0,2)[0];
  assert.ok(Math.abs(credit.strengthHours-0.65*credit.expressedHours)<1e-10);
  assert.ok(Math.abs(cumulativeChaosCareExpression(op,2,care)-actual/4)<1e-10);
  assert.ok(Math.abs(actual-credit.progressDelta)>1e-3,
    "must not pass progressDelta as material's cumulative expression");
  assert.deepEqual(createUnifiedMaterialTimeline({program:p,genome,care,history}).at(0).graph,p.source);
  const complete=createUnifiedMaterialTimeline({program:p,genome,care,history});
  assert.deepEqual(complete.at(1),complete.replay(1));
  assert.deepEqual(complete.at(0.5),complete.replay(0.5));
  assert.deepEqual(complete.at(2),complete.replay(2));
  assert.throws(()=>complete.at(4.5),/Cannot extrapolate/);
  const changed:EnvironmentalHistory={...history,atHour:hour=>({
    ...makePressure(hour),
    exposure:{nutrition:1,activity:0.5,threat:0},
  })};
  const other=createCareOperatorChronology(p,changed,genome.genotype);
  assert.ok(chaosWeightedCareHours(op,0,2,other)>actual);
  assert.deepEqual(createUnifiedMaterialTimeline({program:p,genome,care,history}).at(0).graph,
    createUnifiedMaterialTimeline({program:p,genome,care:other,history:changed}).at(0).graph);
});

test("[INT-001/A2] live frame consumes unified physical chronology without changing original ink at birth",()=>{
  const parts=drawing(["....###....","...#####...","....###....",".....#.....",".....#....."]);
  const simulation=createSimulation(parts,"INT-LIVE-143");
  const atBirth=simulation.frameAt(0);
  const grown=simulation.frameAt(0.2,{time:1,action:"idle"});
  assert.ok(grown.parts.every(p=>p.pixels.every(x=>Number.isInteger(x.x)&&Number.isInteger(x.y))));
  const diag=(grown.interaction.diagnostics as Record<string,any>).physicalMaterial;
  assert.equal(typeof diag?.sourceFingerprint,"string");
  assert.ok(diag.graphEvents>=0);
  const after=simulation.frameAt(0.2,{time:1,action:"idle"});
  assert.deepEqual(after,grown,"repeated visible frames are replay deterministic");
  assert.deepEqual(simulation.frameAt(0),atBirth);
});

test("[INT-001/A3] saved traditional-care histories reconstruct the exact same live anatomical pixels",()=>{
  const seed="INT-SAVE-REPLAY-2026";
  const ink=drawing(["...###...","..#####..","...###...","....#....","....#...."]);
  const birth=5*HOUR;
  let game=createGame(seed,"infant",birth);
  game=advanceGame(game,birth+HOUR);
  game=commandGame(game,{type:"feed",food:"meal"},birth+HOUR,"save-feed");
  game=advanceGame(game,birth+2*HOUR);
  const restored=JSON.parse(JSON.stringify(game));
  const a=createSimulation(ink,seed,"infant",{careGame:game});
  const b=createSimulation(ink,seed,"infant",{careGame:restored});
  for(const h of [0,0.5,1,1.5,2,1,0]) {
    assert.deepEqual(a.frameAt(h/24,{time:1,action:"move"}),
      b.frameAt(h/24,{time:1,action:"move"}));
  }
  assert.equal(a.program.genomeIdentity,b.program.genomeIdentity);
  assert.deepEqual(a.frameAt(2/24,{time:0}),
    a.frameAt(2/24,{time:0}));
});

test("[INT-001/A3] genuine saved care changes physiological expression without changing genome or birth",()=>{
  const seed="CARE-GEOMETRY-527";
  const {program,genome}=realProgram(["####","####","####"],seed,"elongate",30);
  const birth=12*HOUR;
  let fed=createGame(seed,"infant",birth);
  let unfed=createGame(seed,"infant",birth);
  for(let i=1;i<=30;i++) {
    const at=birth+i*HOUR;
    fed=advanceGame(fed,at);
    unfed=advanceGame(unfed,at);
    if(fed.attention.discipline)
      fed=commandGame(fed,{type:"discipline"},at,"well-discipline-"+i);
    if(unfed.attention.discipline)
      unfed=commandGame(unfed,{type:"discipline"},at,"low-discipline-"+i);
    if(i%8===0) {
      fed=commandGame(fed,{type:"clean"},at,"well-clean-"+i);
      unfed=commandGame(unfed,{type:"clean"},at,"low-clean-"+i);
    }
    if(!fed.sleeping&&fed.meters.hunger<4)
      fed=commandGame(fed,{type:"feed",food:"meal"},at,"meal-"+i);
    if(i%8===0&&!unfed.sleeping&&unfed.meters.hunger<4)
      unfed=commandGame(unfed,{type:"feed",food:"meal"},at,"sparse-meal-"+i);
    if(fed.health.sickness)
      fed=commandGame(fed,{type:"medicine"},at,"medicine-well-"+i);
    if(unfed.health.sickness)
      unfed=commandGame(unfed,{type:"medicine"},at,"medicine-low-"+i);
  }
  assert.equal(fed.dead,false);
  assert.equal(unfed.dead,false);
  const historyA=createEnvironmentalHistory(fed);
  const historyB=createEnvironmentalHistory(unfed);
  const careA=createCareOperatorChronology(program,historyA,genome.genotype);
  const careB=createCareOperatorChronology(program,historyB,genome.genotype);
  const expressedA=chaosWeightedCareHours(program.operators[0],0,30,careA);
  const expressedB=chaosWeightedCareHours(program.operators[0],0,30,careB);
  assert.ok(Math.abs(expressedA-expressedB)>1e-6,
    "actual accepted feeding history must affect expression in this fixture");
  const a=createUnifiedMaterialTimeline({program,genome,care:careA,history:historyA});
  const b=createUnifiedMaterialTimeline({program,genome,care:careB,history:historyB});
  assert.deepEqual(a.at(0).graph,b.at(0).graph);
  assert.deepEqual(a.at(0).iterative,b.at(0).iterative);
  assert.deepEqual(a.at(0).material,b.at(0).material);
  const physicalWitness=[2,4,6,8,12,16,20,24,28,30].find(hour=>
    JSON.stringify(coords(a.at(hour).graph.cells)) !==
    JSON.stringify(coords(b.at(hour).graph.cells)));
  assert.ok(physicalWitness!==undefined,
    "different actual meal histories must alter physical positions at an independently sampled chronological age");
  assert.deepEqual(a.at(12),a.replay(12));
  assert.deepEqual(b.at(12),b.replay(12));
  assert.deepEqual(a.at(3),a.replay(3));
  assert.deepEqual(b.at(3),b.replay(3));
  assert.deepEqual(a.at(0).graph.sourceCells,b.at(12).graph.sourceCells);
  assert.ok(a.at(12).graph.events.every(e=>e.atHour<=12));
  assert.ok(b.at(12).graph.events.every(e=>e.atHour<=12));
});

test("[INT-001/A1] actual fractional remodeling moves a persistent iterative tip before its hourly growth",()=>{
  const {program:base,genome}=realProgram(["###"],"INT-RELOC-TIP-55","elongate",4);
  const tip=[...base.source.cells].sort((a,b)=>b.x-a.x)[0];
  const siteId=tip.tissueId+"/relocated-tip";
  const source={...base.source,
    sites:[{id:siteId,tissueId:tip.tissueId,
      rootCellId:tip.id,direction:{x:1,y:0}}],
    tissues:base.source.tissues.map(t=>({...t,
      growthSiteIds:t.id===tip.tissueId?[siteId]:[]}))};
  const program:ActualMaterialProgram={...base,source,operators:[],
    fingerprint:base.fingerprint+"/real-relocate",
    signals:{...base.signals,channels:{...base.signals.channels,
      maturation:{...base.signals.channels.maturation,plasticity:1}}}};
  const remodel=compileLifetimeRemodeling(program,genome,[{
    id:"fractional-move",kind:"translate",tissueId:tip.tissueId,
    direction:{x:0,y:1},atHour:0,durationHours:0.5,units:1,strength:1,
  }]);
  const t=createUnifiedMaterialTimeline({program,genome,remodelingProgram:remodel});
  const justBefore=t.at(0.5-1e-12);
  assert.deepEqual(justBefore.graph.cells.find(c=>c.id===tip.id),
    source.cells.find(c=>c.id===tip.id));
  const half=t.at(0.5);
  assert.equal(half.graph.cells.find(c=>c.id===tip.id)?.y,tip.y+1);
  assert.equal(half.graph.cells.length,source.cells.length);
  const atOne=t.at(1);
  const first=atOne.graph.cells.find(c=>c.provenance==="generated" &&
    c.x===tip.x+1&&c.y===tip.y+1);
  assert.ok(first,"newly completed material follows the relocated, same-ID live tip");
  assert.deepEqual(first!.sourceIds,tip.sourceIds);
  assert.deepEqual(first!.parentCellIds,[tip.id]);
  const remodEvent=atOne.graph.events.find(e=>e.id==="fractional-move/unit/1");
  assert.equal(remodEvent?.atHour,0.5);
  assert.equal(atOne.graph.events.filter(e=>e.atHour>1).length,0);
  assert.deepEqual(atOne,t.replay(1));
  assert.deepEqual(t.at(0.5),half);
  assert.deepEqual(t.at(0),t.birth());
});


/** Real module programs, but explicit deterministic anatomy instead of opaque
 * birth-only rendering fixtures. The verification seam cannot alter source
 * cell identities, source positions, or inherited genotype. */
function tracedSimulation(ink: ReturnType<typeof drawing>, seed: string,
  opts: { careGame?: ReturnType<typeof createGame>; remodel?: boolean; care?: boolean } = {}) {
  let physical!: ActualMaterialProgram;
  let inherited!: ReturnType<typeof materialInputs>["genome"];
  let remodeling: LifetimeRemodelingProgram | undefined;
  const simulation = createSimulation(ink,seed,"infant",{
    ...(opts.careGame ? { careGame:opts.careGame } : {}),
    verifyMaterialProgram(base,genome) {
      inherited=genome;
      const root=[...base.source.cells].sort((a,b)=>
        b.x-a.x || Math.abs(a.y-18)-Math.abs(b.y-18))[0];
      assert.ok(root,"verification drawing must have original ink");
      const id=root.tissueId+"/int-001-physical-site";
      const source={...base.source,
        sites:[{id,tissueId:root.tissueId,rootCellId:root.id,
          direction:{x:1,y:0}}],
        tissues:base.source.tissues.map(t=>({...t,
          growthSiteIds:t.id===root.tissueId?[id]:[]})),
      };
      const signals={...base.signals,
        channels:{...base.signals.channels,
          maturation:{...base.signals.channels.maturation,plasticity:1},
          growth:{...base.signals.channels.growth,rate:0.9}}};
      physical={...base,source,signals:opts.care?base.signals:signals,
        operators:opts.care?[{
          id:"int-001/care-elongation",tissueId:root.tissueId,siteId:id,
          kind:"elongate",atHour:0,durationHours:30,strength:1,
          direction:{x:1,y:0},
        }]:[],
        fingerprint:base.fingerprint+"/int-001-render-trace"+
          (opts.care?"/care":"")};
      if(opts.remodel){
        remodeling=compileLifetimeRemodeling(physical,genome,[
          {id:"verify-resorb",kind:"resorb",tissueId:root.tissueId,
            atHour:0,durationHours:0.25,units:1,strength:1},
          {id:"verify-translate",kind:"translate",tissueId:root.tissueId,
            direction:{x:0,y:1},atHour:0.25,durationHours:0.25,
            units:1,strength:1},
        ]);
      }
      return {program:physical,...(remodeling?{remodelingProgram:remodeling}:{})};
    },
  });
  return {simulation,program:physical,genome:inherited,remodeling};
}
function annotatedPixels(frame: ReturnType<ReturnType<typeof createSimulation>["frameAt"]>) {
  return frame.parts.flatMap((part: {id:string;pixels:readonly {x:number;y:number;materialCellId?:string;materialSourceIds?:readonly string[];materialParentCellIds?:readonly string[]}[]})=>
    part.pixels.filter(pixel=>pixel.materialCellId).map(pixel=>({
      partId:part.id,id:pixel.materialCellId!,x:pixel.x,y:pixel.y,
      sources:pixel.materialSourceIds,parents:pixel.materialParentCellIds,
    })));
}

/** Independent polygon-coverage oracle. It consumes projected WORLD quads
 * before the renderer's rasterizer (not a frame snapshot or pixel output),
 * computes integer-lattice triangle containment, then applies the one
 * common view transform and last-painter ownership. */
function oracleVisibleMaterial(frame:ReturnType<ReturnType<typeof createSimulation>["frameAt"]>) {
  const diagnostics=(frame.interaction.diagnostics as any);
  const quads=diagnostics.physicalMaterial?.renderedCellQuads as
    {partId:string;cellId:string;quad:{x:number;y:number}[]}[];
  const camera=diagnostics.camera as {
    scale:number;offset:{x:number;y:number};
  };
  assert.ok(quads?.length>0 && camera);
  const cross=(a:{x:number;y:number},b:{x:number;y:number},p:{x:number;y:number})=>
    (b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x);
  const inside=(a:{x:number;y:number},b:{x:number;y:number},c:{x:number;y:number},
    p:{x:number;y:number})=>{
    if(Math.abs(cross(a,b,c))<1e-9)return false;
    const ab=cross(a,b,p),bc=cross(b,c,p),ca=cross(c,a,p);
    return (ab>=-1e-7&&bc>=-1e-7&&ca>=-1e-7)||
      (ab<=1e-7&&bc<=1e-7&&ca<=1e-7);
  };
  const expected=new Map<string,Map<string,string>>();
  for(const entry of quads){
    const [a,b,c,d]=entry.quad;
    let filled=false;
    const xs=entry.quad.map(p=>p.x),ys=entry.quad.map(p=>p.y);
    const owned=expected.get(entry.partId)??new Map<string,string>();
    const claim=(x:number,y:number)=>{
      const vx=Math.round(x*camera.scale+camera.offset.x);
      const vy=Math.round(y*camera.scale+camera.offset.y);
      if(vx>=0&&vx<64&&vy>=0&&vy<64)owned.set(vx+","+vy,entry.cellId);
    };
    for(let y=Math.ceil(Math.min(...ys)-1e-8);
      y<=Math.floor(Math.max(...ys)+1e-8);y++)
      for(let x=Math.ceil(Math.min(...xs)-1e-8);
        x<=Math.floor(Math.max(...xs)+1e-8);x++){
        if(inside(a,b,c,{x,y})||inside(a,c,d,{x,y})){
          claim(x,y);filled=true;
        }
      }
    assert.ok(filled,"the test's chosen 1-cell-wide source quads must cover lattice points");
    expected.set(entry.partId,owned);
  }
  for(const [partId,owned] of expected){
    const actual=frame.parts.find(part=>part.id===partId);
    assert.ok(actual,"each physical projected quad must have a rendered part");
    const drawn=new Map(actual!.pixels
      .filter(pixel=>pixel.materialCellId)
      .map(pixel=>[pixel.x+","+pixel.y,pixel.materialCellId!]));
    assert.deepEqual([...drawn].sort(),[...owned].sort(),
      "exact projected pixel coordinate AND causal owner must equal independent polygon oracle: "+partId);
  }
}

test("[INT-001/A2] actual frameAt raster preserves every relocated source ID, resorption and daughter ancestry",()=>{
  const ink=drawing([".....","..###","..###","..###","....."],"body");
  const {simulation,program,genome,remodeling}=tracedSimulation(ink,
    "INT-LIVE-PIXEL-2026",{remodel:true});
  assert.ok(remodeling);
  const timeline=createUnifiedMaterialTimeline({program,genome,remodelingProgram:remodeling});
  const t0=timeline.at(0),r=timeline.at(0.25),shift=timeline.at(0.5),late=timeline.at(8);
  const removed=t0.graph.cells.filter(c=>!r.graph.cells.some(a=>a.id===c.id));
  assert.equal(removed.length,1,"one real DEV-004 structural resorption");
  assert.equal(r.remodeling.attempts.find(a=>a.id==="verify-resorb/unit/1")?.status,
    "accepted");
  const moved=shift.graph.cells.filter(c=>c.provenance==="authored");
  assert.equal(shift.remodeling.attempts.find(a=>a.id==="verify-translate/unit/1")?.status,
    "accepted");
  for(const cell of moved){
    const born=t0.graph.cells.find(c=>c.id===cell.id)!;
    assert.equal(cell.x,born.x);
    assert.equal(cell.y,born.y+1,"independent integer-lattice translation oracle");
  }
  const generated=late.graph.cells.filter(c=>c.provenance==="generated");
  assert.ok(generated.length>=2,"real DEV-003 iterative growth must produce active daughters");
  assert.ok(generated.some(c=>c.parentCellIds.some(parent=>
    generated.some(other=>other.id===parent))),
    "chronologically deeper child must descend from a generated parent");
  const frames=[0.5,1,2,4,8].map(hour=>({
    hour, frame:simulation.frameAt(hour/24,{action:"idle",time:0}),
    graph:timeline.at(hour).graph,
  }));
  for(const {hour,frame,graph} of frames) {
    const pixels=annotatedPixels(frame);
    oracleVisibleMaterial(frame);
    const active=new Map(graph.cells.map(cell=>[cell.id,cell]));
    assert.ok(pixels.length>0,"frameAt must expose actual cell-owned visible pixels at "+hour);
    assert.ok(!pixels.some(p=>removed.some(c=>c.id===p.id)),
      "resorbed source ink cannot own a visible physical pixel");
    for(const p of pixels){
      const owner=active.get(p.id);
      assert.ok(owner,"displayed physical pixel must cite an active material cell");
      assert.deepEqual(p.sources,owner!.sourceIds,
        "displayed cell must cite original immutable source");
      assert.deepEqual(p.parents,owner!.parentCellIds,
        "visible ancestry must preserve actual parent-cell IDs");
      assert.ok(graph.sourceCells.some(c=>owner!.sourceIds.includes(c.id)));
      assert.ok(!graph.protectedVoids.includes(owner!.x+","+owner!.y),
        "physical cells cannot occupy protected cavities");
    }
    for(const original of moved)
      assert.ok(pixels.some(p=>p.id===original.id),
        "each active relocated authored cell must own a visible pixel at "+hour);
    if(hour>=4)
      assert.ok(pixels.some(p=>generated.some(c=>c.id===p.id)),
        "frameAt must render real generated cells rather than merely report them");
    assert.deepEqual(simulation.frameAt(hour/24,{action:"idle",time:0}),frame);
  }
  const last=frames[frames.length-1].frame;
  const seen=new Set(annotatedPixels(last).map(p=>p.id));
  assert.ok(generated.some(c=>seen.has(c.id)));
  assert.deepEqual(late,timeline.replay(8));
});

test("[INT-001/A3] real saved feeding changes player-visible physical pixels only after causal care",()=>{
  const seed="CARE-GEOMETRY-527",ink=drawing(["#####","#####","#####"],"body");
  const birth=12*HOUR;
  let fed=createGame(seed,"infant",birth);
  let sparse=createGame(seed,"infant",birth);
  for(let i=1;i<=30;i++){
    const at=birth+i*HOUR;
    fed=advanceGame(fed,at);sparse=advanceGame(sparse,at);
    if(fed.attention.discipline)fed=commandGame(fed,{type:"discipline"},at,"f-d-"+i);
    if(sparse.attention.discipline)sparse=commandGame(sparse,{type:"discipline"},at,"s-d-"+i);
    if(i%8===0){
      fed=commandGame(fed,{type:"clean"},at,"f-c-"+i);
      sparse=commandGame(sparse,{type:"clean"},at,"s-c-"+i);
    }
    if(!fed.sleeping&&fed.meters.hunger<4)
      fed=commandGame(fed,{type:"feed",food:"meal"},at,"f-m-"+i);
    if(i%8===0&&!sparse.sleeping&&sparse.meters.hunger<4)
      sparse=commandGame(sparse,{type:"feed",food:"meal"},at,"s-m-"+i);
    if(fed.health.sickness)fed=commandGame(fed,{type:"medicine"},at,"f-med-"+i);
    if(sparse.health.sickness)sparse=commandGame(sparse,{type:"medicine"},at,"s-med-"+i);
  }
  assert.equal(fed.dead,false);assert.equal(sparse.dead,false);
  const before=tracedSimulation(ink,seed,{careGame:createGame(seed,"infant",birth),care:true});
  const well=tracedSimulation(ink,seed,{careGame:fed,care:true});
  const low=tracedSimulation(ink,seed,{careGame:sparse,care:true});
  assert.deepEqual(well.program.source,low.program.source);
  assert.equal(well.genome.fingerprint,low.genome.fingerprint);
  // First accepted feeding intervention is no earlier than hour 1.
  // Later history must not rewrite the same organism's older image, physical
  // state, program identity, or its immutable genotype.
  for(const hour of [0,0.25,0.5,0.99]) {
    const a=well.simulation.frameAt(hour/24,{time:0,action:"idle"});
    const b=low.simulation.frameAt(hour/24,{time:0,action:"idle"});
    assert.deepEqual(a,b,"future care cannot affect earlier rendered frame "+hour);
    assert.deepEqual(a.pixels,b.pixels);
  }
  const wellHistory=createEnvironmentalHistory(fed);
  const lowHistory=createEnvironmentalHistory(sparse);
  const careWell=createCareOperatorChronology(well.program,wellHistory,well.genome.genotype);
  const careLow=createCareOperatorChronology(low.program,lowHistory,low.genome.genotype);
  const wellTimeline=createUnifiedMaterialTimeline({program:well.program,genome:well.genome,
    history:wellHistory,care:careWell});
  const lowTimeline=createUnifiedMaterialTimeline({program:low.program,genome:low.genome,
    history:lowHistory,care:careLow});
  assert.deepEqual(wellTimeline.at(0).graph,lowTimeline.at(0).graph);
  const ages=[1,2,3,4,6,8,10,12,16,20,24,28,30];
  const witness=ages.map(hour=>{
    const fg=wellTimeline.at(hour).graph,lg=lowTimeline.at(hour).graph;
    const f=well.simulation.frameAt(hour/24,{time:0,action:"idle"});
    const l=low.simulation.frameAt(hour/24,{time:0,action:"idle"});
    const visible=(frame:typeof f)=>annotatedPixels(frame)
      .filter(p=>p.partId.startsWith("material-growth/"))
      .map(p=>[p.id,p.x,p.y].join(":")).sort();
    return {hour,actualGraphDifference:JSON.stringify(coords(fg.cells)) !==
      JSON.stringify(coords(lg.cells)),a:visible(f),b:visible(l)};
  }).find(x=>x.actualGraphDifference && JSON.stringify(x.a)!==JSON.stringify(x.b));
  assert.ok(witness,"saved meals must alter material geometry visible in real frameAt pixels");
  assert.ok(witness!.a.length>0 || witness!.b.length>0);
  assert.deepEqual(well.simulation.frameAt(0),before.simulation.frameAt(0));
  assert.deepEqual(low.simulation.frameAt(0),before.simulation.frameAt(0));
  assert.deepEqual(wellTimeline.at(0).graph,lowTimeline.at(0).graph);
  assert.deepEqual(wellTimeline.at(3),wellTimeline.replay(3));
  assert.deepEqual(lowTimeline.at(3),lowTimeline.replay(3));
  const restored=tracedSimulation(ink,seed,{careGame:JSON.parse(JSON.stringify(fed)),care:true});
  assert.deepEqual(restored.simulation.frameAt(witness!.hour/24,{time:0,action:"idle"}),
    well.simulation.frameAt(witness!.hour/24,{time:0,action:"idle"}));
});
