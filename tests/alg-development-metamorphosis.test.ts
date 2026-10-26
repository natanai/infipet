import test from "node:test";
import assert from "node:assert/strict";
import {
  compileLifetimeRemodeling, lifetimeRemodelingAt, auditRemodelLegibility,
  REMODEL_LIMITS, type RemodelOperation,
} from "../src/development/lifetime-remodeling";
import { compileMaterialDevelopment } from "../src/development/operators";
import { materialSourceAncestry } from "../src/development/material-graph";
import { drawing, fixtures, materialInputs } from "./alg-development-fixtures";

const operation = (
  id: string, kind: RemodelOperation["kind"], tissueId: string,
  options: Partial<RemodelOperation> = {},
): RemodelOperation => ({
  id, kind, tissueId, atHour: 10, durationHours: 12,
  units: 12, strength: 1, ...options,
});
const programFor = (
  shape: ReturnType<typeof drawing>, seed = "SOURCE-REM-1",
  make?: (tissueId: string) => readonly RemodelOperation[],
) => {
  const { atlas, genome } = materialInputs(shape, seed);
  const material = compileMaterialDevelopment(atlas, genome);
  const tissue = material.source.tissues[0]?.id ?? "";
  return compileLifetimeRemodeling(material, genome,
    make ? make(tissue) : undefined);
};
const key = (c: {x: number; y: number}) => c.x + "," + c.y;
const distance = (a: {x: number; y: number},
  b: {x: number; y: number}) =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
function connected(cells: readonly {id: string; x: number; y: number}[]): boolean {
  if (!cells.length) return true;
  const visited = new Set([cells[0].id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const c of cells)
      if (!visited.has(c.id) && cells.some(p => visited.has(p.id) &&
        distance(c, p) <= 1)) { visited.add(c.id); changed = true; }
  }
  return visited.size === cells.length;
}

test("[DEV-004/A1] independently predicted linear extension, seed replay, and ancestry", () => {
  const p = programFor(drawing(["###"]), "EXTENSION-FIXTURE", tissueId => [
    operation("axis", "extend", tissueId, {
      direction: {x: 1, y: 0},
    }),
  ]);
  const origin = p.birth.cells.slice().sort((a, b) =>
    b.x - a.x || a.y - b.y)[0];
  const geneticRate = p.signals.channels.growth.elongation;
  const expectedCount = Math.floor(12 * geneticRate + 1e-10);
  const mature = lifetimeRemodelingAt(p, 100);
  const grown = mature.graph.cells.filter(c => c.provenance === "generated");
  assert.equal(grown.length, expectedCount);
  // This oracle is derived from the lattice recurrence x_k=x_0+k,
  // y_k=y_0, rather than from a snapshot or exported geometry helper.
  assert.deepEqual(grown.map(c => key(c)),
    Array.from({length: expectedCount},
      (_, i) => (origin.x + i + 1) + "," + origin.y));
  assert.ok(grown.every(c => c.operationId === "axis"));
  assert.ok(grown.every(c => materialSourceAncestry(mature.graph, c.id).length));
  assert.deepEqual(mature.graph.sourceCells, p.birth.sourceCells);
  assert.deepEqual(lifetimeRemodelingAt(p, 100), mature);
  assert.deepEqual(lifetimeRemodelingAt(p, 0).graph.cells, p.birth.cells);
  assert.deepEqual(auditRemodelLegibility(mature), []);
  assert.ok(connected(mature.graph.cells));
  const half = lifetimeRemodelingAt(p, 16);
  const expectedHalf = Math.min(expectedCount, 6);
  assert.equal(half.transitions.length, expectedHalf);
  assert.ok(half.transitions.every((event, i) =>
    event.atHour === 10 + i + 1 &&
    event.createdCellIds.length === 1));
});

test("[DEV-004/A1] randomized unfamiliar silhouettes preserve local topology, no overlap and protected cavities", () => {
  let rng = 0x3abca63;
  const rand = () => ((rng = (Math.imul(1664525, rng) + 1013904223) >>> 0) /
    4294967296);
  const shapes = [fixtures.empty, fixtures.disconnected, fixtures.blob,
    fixtures.fantasy, fixtures.cavity];
  // Generate assorted self-avoiding paths with branch remnants, holes and
  // independent marks; no drawn anatomy labels or reference creature species.
  for (let i = 0; i < 36; i++) {
    const map = Array.from({length: 16}, () => Array(16).fill("."));
    let x = 7, y = 7;
    for (let j = 0; j < 9 + i % 12; j++) {
      map[y][x] = "#";
      const step = Math.floor(rand() * 4);
      x = Math.max(1, Math.min(14, x + [1, 0, -1, 0][step]));
      y = Math.max(1, Math.min(14, y + [0, 1, 0, -1][step]));
    }
    if (i % 3 === 0) map[1][14] = "#";
    shapes.push(drawing(map.map(line => line.join(""))));
  }
  for (let i = 0; i < shapes.length; i++) {
    for (const seed of ["C-", "D-"]) {
      const p = programFor(shapes[i], seed + i);
      const replay = lifetimeRemodelingAt(p, 400);
      assert.deepEqual(auditRemodelLegibility(replay), [], "silhouette " + i);
      assert.deepEqual(p.birth.sourceCells, replay.graph.sourceCells);
      for (const tissue of replay.graph.tissues) {
        const active = replay.graph.cells.filter(c => c.tissueId === tissue.id);
        assert.ok(connected(active), "unexpected tissue disconnection");
      }
      assert.ok(replay.graph.cells.length <= p.birth.sourceCells.length +
        REMODEL_LIMITS.maxAdded);
      assert.ok(replay.graph.cells.every(c => c.x >= 0 && c.x < 64 &&
        c.y >= 0 && c.y < 64));
      assert.ok(replay.graph.cells.every(c => c.sourceIds.every(id =>
        p.birth.sourceCells.some(s => s.id === id))));
      assert.ok(replay.graph.cells.every(c =>
        !replay.graph.protectedVoids.includes(key(c))));
      assert.deepEqual(lifetimeRemodelingAt(p, 400), replay);
    }
  }
});

test("[DEV-004/A1] different birth seeds yield different valid source-continuous remodeling", () => {
  const structures = new Set<string>();
  const identicalDrawing = drawing(["....#....", "...###...", "....#...."]);
  for (let i = 0; i < 24; i++) {
    const p = programFor(identicalDrawing, "METAMORPH-SEED-" + i);
    const later = lifetimeRemodelingAt(p, 260);
    assert.deepEqual(auditRemodelLegibility(later), []);
    structures.add(later.graph.cells.map(c => key(c)).sort().join(";"));
    assert.ok(later.transitions.every(e => e.sourceCellIds.every(s =>
      p.birth.sourceCells.some(c => c.id === s))));
  }
  assert.ok(structures.size >= 3,
    "seed must alter physical structure, not only color or metadata");
});

test("[DEV-004/A2] recorded reinforcement, reabsorption and mechanical potential follow real material", () => {
  const p = programFor(drawing([".###.", "#####", ".###."]),
    "MATERIAL-TEST", tissueId => [
      operation("grow", "extend", tissueId, {
        atHour: 10, durationHours: 12, direction: {x: 1, y: 0},
      }),
      operation("add-wall", "reinforce", tissueId, {
        atHour: 30, durationHours: 12,
      }),
      operation("joint", "articulate", tissueId, {
        atHour: 60, durationHours: 12,
      }),
      operation("prune", "resorb", tissueId, {
        atHour: 90, durationHours: 12,
      }),
    ]);
  const young = lifetimeRemodelingAt(p, 25);
  const mature = lifetimeRemodelingAt(p, 160);
  assert.ok(young.transitions.some(e => e.kind === "extend"));
  assert.ok(mature.transitions.some(e => e.kind === "reinforce" &&
    e.createdCellIds.length === 1 && e.rigidityAfter! > e.rigidityBefore!));
  assert.ok(mature.transitions.some(e => e.kind === "resorb" &&
    e.removedCellIds.length === 1));
  assert.ok(mature.capabilities.some(c => c.kind === "support" &&
    c.cellIds.every(id => mature.graph.cells.some(cell => cell.id === id))));
  assert.ok(mature.capabilities.every(c => c.cellIds.every(id =>
    mature.graph.cells.some(cell => cell.id === id))));
  assert.deepEqual(mature.graph.sourceCells, p.birth.sourceCells);
  assert.deepEqual(auditRemodelLegibility(mature), []);
  const oldTransitions = young.transitions;
  assert.deepEqual(mature.transitions.slice(0, oldTransitions.length), oldTransitions);
  assert.deepEqual(lifetimeRemodelingAt(p, 160), mature);
  assert.deepEqual(lifetimeRemodelingAt(p, 25), young);
});

test("[DEV-004/A2] persistent authored identity under translation; chronology and reattachment are explicit", () => {
  const first = {...drawing(["##"])[0], id: "alpha"};
  const second = {...drawing(["##"])[0], id: "beta",
    position: {x: 5, y: 0}};
  const p = programFor([first, second], "REASSIGN", tissueId => [
    operation("shift", "translate", tissueId, {
      direction: {x: 1, y: 0}, atHour: 10, durationHours: 12,
    }),
  ]);
  const young = lifetimeRemodelingAt(p, 0);
  const adult = lifetimeRemodelingAt(p, 100);
  const moved = adult.transitions.filter(e => e.kind === "translate");
  assert.ok(moved.length >= 1);
  for (const e of moved) for (const m of e.relocated) {
    assert.equal(m.to.x, m.from.x + 1);
    assert.equal(m.to.y, m.from.y);
    assert.ok(p.birth.sourceCells.some(c => c.id === m.cellId));
  }
  assert.deepEqual(young.graph.sourceCells, adult.graph.sourceCells);
  assert.deepEqual(auditRemodelLegibility(adult), []);
  assert.ok(adult.graph.cells.filter(c =>
    c.tissueId === p.birth.tissues[0].id).every(c =>
    p.birth.sourceCells.some(source => source.id === c.id)));
  const partial = lifetimeRemodelingAt(p, 15);
  assert.deepEqual(adult.transitions.slice(0, partial.transitions.length),
    partial.transitions);
  assert.deepEqual(lifetimeRemodelingAt(p, 15), partial);

  // Adjacent parts start distinct. Their association must be an actual link.
  const touching = programFor([
    {...first, position: {x: 0, y: 0}},
    {...second, position: {x: 2, y: 0}},
  ], "LINKER");
  const [a, b] = touching.birth.tissues;
  assert.ok(a && b);
  const manual = programFor([
    {...first, position: {x: 0, y: 0}},
    {...second, position: {x: 2, y: 0}},
  ], "LINKER", () => [
    operation("real-attach", "reattach", a.id, {targetTissueId: b.id}),
  ]);
  const linked = lifetimeRemodelingAt(manual, 100);
  assert.ok(linked.transitions.some(e => e.kind === "reattach" &&
    e.newLinks.length === 1));
  assert.ok(linked.graph.links.some(e => e.toTissueId === b.id &&
    e.fromTissueId === a.id &&
    linked.graph.cells.some(c => c.id === e.toCellId)));
  assert.deepEqual(auditRemodelLegibility(linked), []);
});


test("[DEV-004/A2] structural regions exist only where authored tissue supports a real hinge", () => {
  let witness: ReturnType<typeof lifetimeRemodelingAt> | undefined;
  for (let i = 0; i < 20; i++) {
    const p = programFor(drawing(["#####"]), "HINGE-SEED-" + i, tissueId => [
      operation("bend", "articulate", tissueId),
    ]);
    const frame = lifetimeRemodelingAt(p, 100);
    if (frame.capabilities.some(c => c.kind === "joint")) {
      witness = frame; break;
    }
  }
  assert.ok(witness, "some permanent genotypes should allow articulation");
  const joint = witness.capabilities.find(c => c.kind === "joint")!;
  const spans = witness.regions.filter(r => r.hingeCellId !== null);
  assert.equal(spans.length, 2,
    "removing one source-derived cut vertex gives exactly two spans in a line");
  const spanIds = spans.flatMap(r => r.cellIds);
  assert.equal(spanIds.length, new Set(spanIds).size,
    "material ownership of regions cannot overlap");
  assert.ok(spans.every(r => r.hingeCellId &&
    joint.cellIds.includes(r.hingeCellId) &&
    r.sourceCellIds.every(id =>
      witness!.graph.sourceCells.some(source => source.id === id))));
  assert.deepEqual(auditRemodelLegibility(witness), []);

  const bulk = programFor(drawing(["###", "###", "###"]),
    "NO-INVENTED-JOINT", tissueId => [operation("bend", "articulate", tissueId)]);
  const filled = lifetimeRemodelingAt(bulk, 100);
  assert.equal(filled.capabilities.some(c => c.kind === "joint"), false,
    "a solid block contains no graph articulation, regardless of labels");
  assert.equal(filled.regions.length, 1);
  assert.deepEqual(auditRemodelLegibility(filled), []);
});

test("[DEV-004/A2] impossible geometry is deferred; voids, endpoints and the time domain cannot be bypassed", () => {
  const hole = programFor(fixtures.cavity, "CAVITY-GUARD", tissueId => [
    operation("shift-hole", "translate", tissueId, {
      direction: {x: 1, y: 0},
    }),
  ]);
  const late = lifetimeRemodelingAt(hole, 200);
  assert.ok(late.deferred.some(e => e.reason === "translation-collision-or-void"));
  assert.deepEqual(late.graph.cells, hole.birth.cells);
  assert.deepEqual(auditRemodelLegibility(late), []);
  const empty = programFor(fixtures.empty);
  assert.equal(lifetimeRemodelingAt(empty, 999).graph.cells.length, 0);
  assert.throws(() => lifetimeRemodelingAt(empty, Infinity), /Invalid remodeling age/);
  assert.throws(() => lifetimeRemodelingAt(empty, -1), /Invalid remodeling age/);
  assert.throws(() => programFor(fixtures.blob, "BAD", t => [
    operation("invalid", "extend", t, {durationHours: 0}),
  ]), /Invalid remodeling/);
  assert.throws(() => programFor(fixtures.blob, "BAD", t => [
    operation("duplicate", "resorb", t),
    operation("duplicate", "resorb", t),
  ]), /Repeated/);
  const same = programFor(fixtures.blob, "PERMUTE", t => [
    operation("B", "reinforce", t, {atHour: 20}),
    operation("A", "extend", t, {atHour: 20}),
  ]);
  const reverse = programFor(fixtures.blob, "PERMUTE", t => [
    operation("A", "extend", t, {atHour: 20}),
    operation("B", "reinforce", t, {atHour: 20}),
  ]);
  assert.deepEqual(lifetimeRemodelingAt(same, 100),
    lifetimeRemodelingAt(reverse, 100));
  assert.deepEqual(auditRemodelLegibility(lifetimeRemodelingAt(same, 100)), []);
});


/* Composable post-growth contracts: no replacement simulation or snapshots. */
import {
  applyRemodelingProposal, applyRemodelingInterval,
  remodelingProposalsBetween, remodelingMechanicalState,
  EMPTY_REMODELING_CHRONOLOGY,
  type RemodelingProposal, type RemodelingChronology,
} from "../src/development/remodel-transactions";
import { applyMaterialOperators } from "../src/development/operators";
import { iterativeGrowthAt } from "../src/development/iterative-growth";
import type { MaterialGraph } from "../src/development/material-graph";

const makeComposable = (
  parts: ReturnType<typeof drawing>,
  ops: (tissues: MaterialGraph["tissues"], sites: MaterialGraph["sites"]) =>
    readonly RemodelOperation[],
  seed = "COMPOSABLE-DEV-004",
) => {
  const {atlas, genome}=materialInputs(parts, seed);
  const material=compileMaterialDevelopment(atlas,genome);
  const remodel=compileLifetimeRemodeling(material,genome,
    ops(material.source.tissues,material.source.sites));
  return {material,remodel};
};
const opAt=(id:string,kind:RemodelOperation["kind"],tissueId:string,
  atHour:number,detail:Partial<RemodelOperation>={}):RemodelOperation=>({
    id,kind,tissueId,atHour,durationHours:12,units:12,strength:1,...detail,
  });
const uniqueGeometry=(g:MaterialGraph)=>new Set(g.cells.map(c=>key(c)));
const unchangedOriginal=(before:MaterialGraph,after:MaterialGraph)=>{
  assert.deepEqual(after.sourceCells,before.sourceCells);
  assert.equal(after.sourceFingerprint,before.sourceFingerprint);
};
const firstDue=(p:ReturnType<typeof makeComposable>["remodel"],
  op:RemodelOperation):RemodelingProposal=>{
  const steps=remodelingProposalsBetween(p,0,200,[op]);
  assert.ok(steps.length>0,"expected inherited potential for this operator");
  return steps[0];
};

test("[DEV-004/A1] composable steps preserve post-care growth, exact chronology and original ink",()=>{
  const p=makeComposable(drawing(["###"]),t=>[
    opAt("care/reinforce","reinforce",t[0].id,30),
    opAt("care/translate","translate",t[0].id,50,{direction:{x:1,y:0}}),
    opAt("care/resorb","resorb",t[0].id,70),
  ]);
  const initial=p.material.source;
  const careGrowth=applyMaterialOperators(initial,[{
    id:"chronological-care-growth",kind:"elongate",tissueId:initial.tissues[0].id,
    direction:{x:1,y:0},atHour:0,durationHours:10,strength:1,
  }],20,p.material.signals);
  assert.ok(careGrowth.cells.some(c=>c.operationId==="chronological-care-growth"));
  assert.ok(careGrowth.events.some(e=>e.id==="chronological-care-growth"));
  const due=remodelingProposalsBetween(p.remodel,20,100);
  const result=applyRemodelingInterval(careGrowth,p.remodel,due);
  const accepted=result.transactions.filter(t=>t.transition);
  assert.ok(accepted.some(t=>t.transition!.kind==="reinforce"),"wall addition");
  assert.ok(accepted.some(t=>t.transition!.kind==="translate"),"coordinate shift");
  assert.ok(accepted.some(t=>t.transition!.kind==="resorb"),"bounded reabsorption");
  assert.deepEqual(result.graph.events.slice(0,careGrowth.events.length),
    careGrowth.events,"do not discard earlier care events");
  assert.ok(result.graph.cells.some(c=>c.operationId==="chronological-care-growth") ||
    result.transactions.some(t=>t.transition?.removedCellIds.some(id=>
      careGrowth.cells.some(c=>c.id===id &&
        c.operationId==="chronological-care-growth"))),
    "earlier generated material remains active OR has an explicit resorption witness");
  unchangedOriginal(careGrowth,result.graph);
  assert.equal(result.graph.cells.length,
    careGrowth.cells.length + accepted.filter(t=>
      t.transition!.kind==="reinforce").length -
      accepted.filter(t=>t.transition!.kind==="resorb").length);
  for(const tr of accepted) {
    assert.ok(tr.transition!.atHour>=tr.attempt.atHour);
    assert.ok(tr.transition!.sourceCellIds.every(id=>
      careGrowth.sourceCells.some(c=>c.id===id)));
  }
  const past=applyRemodelingInterval(careGrowth,p.remodel,
    due.filter(x=>x.atHour<=46));
  assert.deepEqual(result.transactions.slice(0,past.transactions.length),
    past.transactions,"later operators may not alter earlier committed steps");
  assert.deepEqual(applyRemodelingInterval(careGrowth,p.remodel,due),result);
});

test("[DEV-004/A1] actual growth-site anchors follow moved material and growing tips",()=>{
  const p=makeComposable(drawing(["###"]), (t,s)=>[
    opAt("translate-site","translate",t[0].id,10,{direction:{x:1,y:0}}),
    opAt("extend-tip","extend",t[0].id,30,{
      direction:s[0].direction,sourceSiteId:s[0].id,
    }),
  ]);
  const source=p.material.source;
  const oldSite=source.sites[0];
  const oldRoot=source.cells.find(c=>c.id===oldSite.rootCellId)!;
  const shift=applyRemodelingProposal(source,p.remodel,
    firstDue(p.remodel,p.remodel.operations.find(o=>o.id==="translate-site")!));
  assert.equal(shift.attempt.status,"accepted",shift.attempt.reason??"");
  assert.deepEqual(shift.graph.sites[0],oldSite,"stable site identity/root cell ID");
  assert.deepEqual(shift.siteChanges.map(s=>s.siteId),
    source.sites.map(s=>s.id),
    "moving a tissue moves every physical growth-site anchor");
  assert.deepEqual(shift.siteChanges[0].from,{x:oldRoot.x,y:oldRoot.y});
  assert.deepEqual(shift.siteChanges[0].to,{x:oldRoot.x+1,y:oldRoot.y});
  const extend=applyRemodelingProposal(shift.graph,p.remodel,
    firstDue(p.remodel,p.remodel.operations.find(o=>o.id==="extend-tip")!),shift.chronology);
  assert.equal(extend.attempt.status,"accepted",extend.attempt.reason??"");
  assert.equal(extend.graph.sites[0].rootCellId,
    extend.transition!.createdCellIds[0],"growth-site tracks new active tip");
  assert.ok(extend.siteChanges.length===1);
  assert.deepEqual(extend.graph.sourceCells,source.sourceCells);
  assert.ok(extend.graph.cells.some(c=>c.id===oldRoot.id &&
    c.x===oldRoot.x+1));
  assert.ok(extend.capabilities.every(cap=>
    cap.cellIds.every(id=>extend.graph.cells.some(c=>c.id===id))));
});

test("[DEV-004/A2] real attachment endpoints survive legal motion; illegal cycle is atomic",()=>{
  const first={...drawing(["##"],"body")[0],id:"primary"};
  const second={...drawing(["#"],"tail")[0],id:"extension",
    parentId:"primary",position:{x:2,y:0}};
  const p=makeComposable([first,second],(t)=>[
    opAt("shift-attached","translate",
      t.find(x=>x.parentId!==null)!.id,10,{direction:{x:1,y:0}}),
    opAt("make-cycle","reattach",
      t.find(x=>x.parentId===null)!.id,30,
      {targetTissueId:t.find(x=>x.parentId!==null)!.id}),
  ]);
  const link=p.material.source.links.find(x=>x.kind==="attachment");
  assert.ok(link,"fixture must preserve a physical authored attachment");
  const shift=applyRemodelingProposal(p.material.source,p.remodel,
    firstDue(p.remodel,p.remodel.operations.find(o=>o.id==="shift-attached")!));
  assert.equal(shift.attempt.status,"accepted",shift.attempt.reason??"");
  assert.deepEqual(shift.graph.links,p.material.source.links);
  const before=p.material.source.cells.find(c=>c.id===link!.fromCellId)!;
  const after=shift.graph.cells.find(c=>c.id===link!.fromCellId)!;
  assert.equal(after.x,before.x+1);
  assert.equal(after.y,before.y);
  const other=shift.graph.cells.find(c=>c.id===link!.toCellId)!;
  assert.ok(Math.abs(after.x-other.x)<=2&&Math.abs(after.y-other.y)<=2);
  const cycle=applyRemodelingProposal(shift.graph,p.remodel,
    firstDue(p.remodel,p.remodel.operations.find(o=>o.id==="make-cycle")!),shift.chronology);
  assert.equal(cycle.attempt.status,"rejected");
  assert.match(cycle.deferral!.reason,/cycle/);
  assert.strictEqual(cycle.graph,shift.graph,
    "invalid reattachment cannot mutate or replace the graph");
  assert.deepEqual(cycle.graph.events,shift.graph.events);
});

test("[DEV-004/A2] unrelated material and events survive conflicts and rejected mutations",()=>{
  const first={...drawing(["##"])[0],id:"a"};
  const other={...drawing(["##"])[0],id:"b",position:{x:5,y:0}};
  const p=makeComposable([first,other],(t)=>[
    opAt("translate-a","translate",t[0].id,10,{direction:{x:1,y:0}}),
    opAt("extend-a","extend",t[0].id,10,{direction:{x:1,y:0}}),
  ]);
  const original=p.material.source;
  const untouched=original.tissues[1].id;
  const baseOther=original.cells.filter(c=>c.tissueId===untouched);
  const earlier:MaterialGraph={...original,events:[...original.events,{
    id:"outside/care/ledger",kind:"external",atHour:1,
    createdCellIds:[],removedCellIds:[],
    sourceCellIds:[original.sourceCells[0].id],
  }]};
  // Ties are intentionally NOT reordered; integration controls precedence.
  const intents=remodelingProposalsBetween(p.remodel,0,15)
    .filter(x=>x.unit===1);
  assert.equal(intents.length,2);
  const ab=applyRemodelingInterval(earlier,p.remodel,intents);
  const ba=applyRemodelingInterval(earlier,p.remodel,[...intents].reverse());
  assert.deepEqual(ab.graph.cells.filter(c=>c.tissueId===untouched),baseOther);
  assert.deepEqual(ab.graph.tissues.find(t=>t.id===untouched),
    earlier.tissues.find(t=>t.id===untouched));
  assert.deepEqual(ab.graph.events[0],earlier.events[0]);
  assert.deepEqual(ba.graph.events[0],earlier.events[0]);
  assert.deepEqual(ab.transactions.map(x=>x.attempt.id),
    intents.map(x=>x.operation.id+"/unit/1"));
  assert.deepEqual(ba.transactions.map(x=>x.attempt.id),
    intents.slice().reverse().map(x=>x.operation.id+"/unit/1"));
  assert.equal(ab.transactions.length,2);
  assert.equal(ba.transactions.length,2);
  // Collision with an unrelated source is not a free fusion.
  const invalid=applyRemodelingProposal(ab.graph,p.remodel,{
    operation:opAt("bad-move","translate",original.tissues[0].id,20,
      {direction:{x:1,y:0}}),unit:1,atHour:21,
  },ab.chronology);
  assert.ok(["accepted","rejected"].includes(invalid.attempt.status));
  assert.ok(invalid.graph.cells.filter(c=>c.tissueId===untouched)
    .every(c=>baseOther.some(o=>o.id===c.id && key(o)===key(c))));
  unchangedOriginal(earlier,ab.graph);
});

test("[DEV-004/A2] generated child branches are remodelable without reconstructing from birth",()=>{
  let witness:ReturnType<typeof makeComposable>|undefined;
  let grown:MaterialGraph|undefined;
  for(let i=0;i<28;i++) {
    const p=makeComposable(drawing(["###"]),()=>[],"BRANCH-COMPOSE-"+i);
    const id=p.material.source.tissues[0].id;
    const graph=applyMaterialOperators(p.material.source,[{
      id:"branched-before-remodel",kind:"branch",tissueId:id,
      atHour:0,durationHours:10,strength:1,
    }],20,p.material.signals);
    if(graph.tissues.some(t=>t.parentId!==null)) {
      witness=p; grown=graph; break;
    }
  }
  assert.ok(witness&&grown,"source-derived operator must create a physical child");
  const daughter=grown.tissues.find(t=>t.parentId!==null)!;
  const {atlas,genome}=materialInputs(drawing(["###"]),witness.material.genomeFingerprint);
  // Child did NOT exist in the birth schedule, so an integration-generated
  // remodeling proposal uses the same immutable genetic signals at its real time.
  const childOp=opAt("child-specialization","reinforce",daughter.id,30);
  const program={...witness.remodel,operations:[childOp]};
  const proposals=remodelingProposalsBetween(program,20,100,[childOp]);
  assert.ok(proposals.length);
  const result=applyRemodelingInterval(grown,program,proposals);
  assert.ok(result.transactions.some(t=>t.attempt.status==="accepted"));
  assert.ok(result.graph.tissues.some(t=>t.id===daughter.id &&
    t.parentId===daughter.parentId));
  assert.ok(result.graph.links.some(l=>l.fromTissueId===daughter.id &&
    l.fromCellId && result.graph.cells.some(c=>c.id===l.fromCellId)));
  assert.deepEqual(result.graph.events.slice(0,grown.events.length),grown.events);
  unchangedOriginal(grown,result.graph);
  assert.ok(result.graph.cells.some(c=>c.tissueId===daughter.id &&
    c.provenance==="generated" && c.operationId==="child-specialization"));
  assert.ok(result.capabilities.every(cap=>
    cap.cellIds.every(id=>result.graph.cells.some(c=>c.id===id))));
});

test("[DEV-004/A1] later care and iterative growth cannot alter earlier replayed remodeling prefix",()=>{
  const {material,remodel}=makeComposable(drawing(["....", ".###", "..##"]),
    (t)=>[opAt("chronology/r","reinforce",t[0].id,40)]);
  const experiences=[{atHour:0,resources:0.8,light:null}];
  const earlyGrowth=iterativeGrowthAt(material,experiences,24).graph;
  const earlyDue=remodelingProposalsBetween(remodel,24,45);
  const early=applyRemodelingInterval(earlyGrowth,remodel,earlyDue);
  const lateGrowth=iterativeGrowthAt(material,experiences,100).graph;
  assert.ok(lateGrowth.events.length>=earlyGrowth.events.length);
  // The integrator must replay complete history, NOT feed a 100h frame
  // into a 45h operation (explicitly rejected by the causal guard).
  const invalid=earlyDue.length ? applyRemodelingProposal(lateGrowth,remodel,
    earlyDue[0]) : null;
  if(invalid) {
    assert.equal(invalid.attempt.status,"rejected");
    assert.strictEqual(invalid.graph,lateGrowth);
    assert.equal(invalid.deferral?.reason,"future-anatomy-in-transaction");
  }
  assert.deepEqual(applyRemodelingInterval(earlyGrowth,remodel,earlyDue),early);
  assert.deepEqual(applyRemodelingInterval(earlyGrowth,remodel,earlyDue),early);
  assert.throws(()=>applyRemodelingInterval(earlyGrowth,remodel,
    earlyDue.slice().reverse()),/chronological/);
  assert.deepEqual(early.graph.sourceCells,material.source.sourceCells);
});

test("[DEV-004/A2] unusual cavity and multi-island drawings reject occupation without partial graph writes",()=>{
  for(const shape of [fixtures.cavity,fixtures.disconnected,fixtures.fantasy]) {
    const p=makeComposable(shape,t=>[
      opAt("gather","translate",t[0]?.id??"empty",10,
        {direction:{x:1,y:0}}),
    ]);
    const due=remodelingProposalsBetween(p.remodel,0,30);
    assert.ok(due.length);
    const result=applyRemodelingInterval(p.material.source,p.remodel,due);
    for(const tr of result.transactions) {
      if(tr.attempt.status==="rejected") {
        assert.strictEqual(tr.graph,
          tr===result.transactions[0]?p.material.source:
          result.transactions[result.transactions.indexOf(tr)-1].graph);
        assert.equal(tr.transition,null);
        assert.ok(tr.deferral?.reason);
      }
    }
    assert.ok(result.graph.cells.every(c=>c.sourceIds.every(id=>
      p.material.source.sourceCells.some(s=>s.id===id))));
    assert.ok(result.graph.cells.every(c=>!result.graph.protectedVoids.includes(key(c))));
    unchangedOriginal(p.material.source,result.graph);
  }
  const empty=makeComposable(fixtures.empty,()=>[]);
  assert.deepEqual(applyRemodelingInterval(empty.material.source,empty.remodel,[]).graph,
    empty.material.source);
  assert.deepEqual(remodelingMechanicalState(empty.material.source).capabilities,[]);
});


test("[DEV-004/A2] equal-time competing extensions commit one coordinate and reject the loser atomically",()=>{
  const p=makeComposable(drawing(["#.#",".#."]),t=>[
    opAt("A-left","extend",t[0].id,10,{
      direction:{x:1,y:0},sourceSiteId:"fixture/left",
    }),
    opAt("B-right","extend",t[0].id,10,{
      direction:{x:-1,y:0},sourceSiteId:"fixture/right",
    }),
  ],"COMPETING-TIPS");
  const birth=p.material.source;
  const left=birth.cells.find(c=>c.x===birth.cells.reduce((n,c)=>Math.min(n,c.x),64) &&
    c.y===Math.min(...birth.cells.map(c=>c.y)))!;
  const right=birth.cells.find(c=>c.x===Math.max(...birth.cells.map(c=>c.x)) &&
    c.y===Math.min(...birth.cells.map(c=>c.y)))!;
  assert.ok(left&&right&&left.id!==right.id);
  // Additional sites refer to actual drawn cells; no new material or
  // anatomical assumptions are manufactured by this adversarial fixture.
  const sites=[...birth.sites,{
    id:"fixture/left",tissueId:left.tissueId,
    rootCellId:left.id,direction:{x:1,y:0},
  },{
    id:"fixture/right",tissueId:right.tissueId,
    rootCellId:right.id,direction:{x:-1,y:0},
  }];
  const graph:MaterialGraph={...birth,sites,
    tissues:birth.tissues.map(t=>t.id===left.tissueId?
      {...t,growthSiteIds:[...t.growthSiteIds,"fixture/left","fixture/right"]}:t)};
  const due=remodelingProposalsBetween(p.remodel,0,11)
    .filter(q=>q.unit===1);
  assert.equal(due.length,2);
  assert.equal(due[0].atHour,due[1].atHour);
  for(const order of [due,[...due].reverse()]) {
    const result=applyRemodelingInterval(graph,p.remodel,order);
    assert.deepEqual(result.transactions.map(t=>t.attempt.status),
      ["accepted","rejected"]);
    assert.equal(result.transactions[1].deferral?.reason,
      "extension-occupied-or-void");
    assert.strictEqual(result.transactions[1].graph,
      result.transactions[0].graph);
    assert.equal(result.graph.cells.length,birth.cells.length+1);
    const generated=result.graph.cells.filter(c=>c.provenance==="generated");
    assert.equal(generated.length,1);
    assert.equal(generated[0].operationId,order[0].operation.id);
    assert.equal(generated[0].x,Math.min(left.x,right.x)+1);
    assert.equal(generated[0].y,left.y);
    assert.deepEqual(result.graph.events.slice(0,birth.events.length),
      birth.events);
    assert.ok(result.chronology.attempts.some(a=>
      a.status==="rejected" && a.reason==="extension-occupied-or-void"));
    unchangedOriginal(graph,result.graph);
  }
});
