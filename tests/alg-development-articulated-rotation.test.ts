import test from "node:test";
import assert from "node:assert/strict";
import {STARTER_PRESETS} from "../src/presets";
import {compileGenome} from "../src/simulation/genome";
import {compileSources} from "../src/simulation/material";
import {describeSource} from "../src/simulation/source-atlas";
import {compileMaterialDevelopment} from "../src/development/operators";
import {proposeArticulatedTurn,proposeRegionalSlip,proposeRegionalBend} from "../src/development/coordinated-metamorphosis";
import {compileLifetimeRemodeling} from "../src/development/lifetime-remodeling";
import {applyRemodelingProposal,remodelingProposalsBetween,
  EMPTY_REMODELING_CHRONOLOGY} from "../src/development/remodel-transactions";
import {applyDailyMaterialStep,createDailyMaterialState,verifyDailyMaterialInventory,type DailyCareWindowV1} from "../src/development/daily-step";
import {sourceStrain} from "../src/development/developmental-strain";
import {sourcePairChange} from "../src/evaluation/morphology";
import {journalMaterialEvent} from "../src/development/material-journal";
import type {MaterialCell,MaterialGraph,MaterialTissue,MaterialLink} from "../src/development/material-graph";
import {materialInputs,drawing} from "./alg-development-fixtures";

const HATCH=1_701_102_300_000;
const DAY=86_400_000;

/** Independently authored structural witness: a 3x3 core with a connected,
 * explicitly selected three-cell appendage (not a predefined adult sprite). */
function hingedDrawing(){
  const core={...drawing(["###","###","###"],"body")[0],
    id:"core",name:"Core",parentId:null};
  const wing={...drawing(["###"],"wing")[0],
    id:"wing",name:"Selected wing",parentId:"core",position:{x:3,y:1}};
  return [core,wing];
}
test("a declared wing actually swings around its original attached core",()=>{
  const {atlas,genome}=materialInputs(hingedDrawing(),"8E8L8WBRZ");
  const graph=compileMaterialDevelopment(atlas,genome).source;
  const link=graph.links.find(l=>l.kind==="attachment"&&
    graph.sourceCells.some(c=>c.id===l.fromCellId&&c.sourceKind==="wing"));
  assert.ok(link,"the ordinary drawing compiler must recognize the physical joint");
  const before=new Map(graph.cells.map(c=>[c.id,c]));
  const turned=proposeArticulatedTurn(graph,link.fromTissueId,1);
  assert.ok(turned,"ordinary authored wing should admit an actual conservative 90-degree turn");
  assert.equal(turned.cells.length,graph.cells.length);
  assert.equal(turned.relocated.length,2);
  const pivot=before.get(link.fromCellId!)!;
  for(const movement of turned.relocated){
    const original=before.get(movement.cellId)!;
    assert.deepEqual(movement.to,{
      x:pivot.x-(original.y-pivot.y),
      y:pivot.y+(original.x-pivot.x),
    });
  }
});
test("an attached authored organ turns through exact material-conserving 90-degree rotation",()=>{
  // Search a diverse, authored cohort, not a hardcoded output sprite or name.
  // A real candidate must be sourced in the normal production compiler.
  const witnesses=STARTER_PRESETS.flatMap(p=>{
    const genome=compileGenome(p.seed);
    const graph=compileMaterialDevelopment(describeSource(compileSources(p.parts,0)),genome);
    return graph.source.links.flatMap(l=>{
      if(l.kind!=="attachment")return [];
      return ([1,-1] as const).flatMap(sign=>{
        const rotated=proposeArticulatedTurn(graph.source,l.fromTissueId,sign);
        return rotated?[{graph,genome,link:l,sign,rotated}]:[];
      });
    });
  });
  assert.ok(witnesses.length>0,"real player-created parts must admit some physical joint transformations");
  const w=witnesses[0],original=w.graph.source,turned=w.rotated;
  assert.equal(turned.cells.length,original.cells.length,"rotation cannot add or remove mass");
  assert.ok(turned.relocated.length>0,"a real organ must change actual material coordinates");
  const originalIds=new Map(original.cells.map(c=>[c.id,c]));
  const newIds=new Map(turned.cells.map(c=>[c.id,c]));
  assert.deepEqual([...originalIds.keys()].sort(),[...newIds.keys()].sort());
  const pivot=originalIds.get(w.link.fromCellId!)!;
  for(const m of turned.relocated){
    const old=originalIds.get(m.cellId)!;
    const now=newIds.get(m.cellId)!;
    assert.deepEqual(m.from,{x:old.x,y:old.y});
    assert.deepEqual(m.to,{
      x:pivot.x-w.sign*(old.y-pivot.y),
      y:pivot.y+w.sign*(old.x-pivot.x),
    });
    assert.deepEqual(now.sourceIds,old.sourceIds);
    assert.equal(now.color,old.color);
    assert.equal(now.tissueId,old.tissueId);
  }
  assert.deepEqual(proposeArticulatedTurn(original,w.link.fromTissueId,w.sign),turned,
    "same drawing and signed operation must be bitwise reproducible");
  assert.throws(()=>proposeArticulatedTurn(original,w.link.fromTissueId,0 as 1),
    /articulated turn/);
});

test("accepted joint rotation is journaled and independently reversible from birth",()=>{
  const candidates=STARTER_PRESETS.flatMap(p=>{
    const genome=compileGenome(p.seed);
    const program=compileMaterialDevelopment(describeSource(compileSources(p.parts,0)),genome);
    return program.source.links.flatMap(l=>l.kind==="attachment"?
      ([1,-1] as const).flatMap(sign=>proposeArticulatedTurn(program.source,l.fromTissueId,sign)?
        [{program,genome,tissueId:l.fromTissueId,sign}]:[]):[]);
  });
  let found=false;
  for(const w of candidates){
    const op={id:"physical/turn",kind:"articulate" as const,tissueId:w.tissueId,
      direction:{x:w.sign,y:0},atHour:0,durationHours:12,units:12,strength:1};
    const remodeling=compileLifetimeRemodeling(w.program,w.genome,[op]);
    const due=remodelingProposalsBetween(remodeling,0,12);
    for(const proposal of due){
      const check=Math.ceil(proposal.atHour);
      const applied=applyRemodelingProposal(w.program.source,remodeling,proposal,
        EMPTY_REMODELING_CHRONOLOGY,check);
      if(applied.attempt.status!=="accepted")continue;
      const events=applied.graph.events.map(e=>({
        ...e,atHour:24*check,atMs:HATCH+DAY*check,
        checkIndex:check,careDigest:"articulation/numeric",
        genomeFingerprint:w.program.genomeFingerprint,
        physical:{...e.physical!,relocations:e.physical!.relocations.map(m=>({
          ...m,checkIndex:check,atMs:HATCH+DAY*check,
        }))},
      }));
      const audited={...applied.graph,events};
      verifyDailyMaterialInventory(audited,HATCH,check,w.program.source,{
        material:w.program.operators,remodeling:remodeling.operations,
      });
      const forged={...audited,events:events.map(e=>({
        ...e,physical:{...e.physical!,relocations:e.physical!.relocations.slice(1)},
      }))};
      assert.throws(()=>verifyDailyMaterialInventory(forged,HATCH,check,
        w.program.source,{material:w.program.operators,remodeling:remodeling.operations}),
        /rotation|relocation|material|journal|final/i);
      found=true;
      break;
    }
    if(found)break;
  }
  assert.ok(found,"normal genetics and exact remodeling journal must admit a verifiable organ turn");
});

test("stage-specific whole-body organizers favor genuine shearing over outward expansion",()=>{
  const {atlas,genome}=materialInputs(drawing([".....",".###.",".###.",".###.","....."],"body"),"8E8L8WRZ");
  const graph=compileMaterialDevelopment(atlas,genome).source;
  const channels=genome.genotype.channels;
  const modes=Array.from({length:12},(_,i)=>sourceStrain(graph,channels,genome.seed,"wave/original",i+1).mode);
  assert.equal(modes.filter(mode=>mode==="shear").length,8);
  assert.equal(modes.filter(mode=>mode==="expand").length,4);
  assert.equal(sourceStrain(graph,channels,genome.seed,"wave/original",1).mode,"shear");
  assert.equal(sourceStrain(graph,channels,genome.seed,"wave/original",3).mode,"expand");
});

test("a monochrome Body-only region can change proportions without gaining a single cell",()=>{
  const {atlas,genome}=materialInputs(drawing([".....",".###.",".###.",".###.","....."],"body"),"8E8L8WRZ");
  const birth=compileMaterialDevelopment(atlas,genome).source;
  const tid=birth.tissues[0].id;
  const moved=proposeRegionalSlip(birth,tid,{x:1,y:0});
  assert.ok(moved,"the simple player's own 3x3 body has a valid physical transformation");
  const old=new Map(birth.cells.map(c=>[c.id,c]));
  const now=new Map(moved.cells.map(c=>[c.id,c]));
  assert.equal(now.size,old.size);
  assert.equal(moved.cells.length,birth.cells.length);
  assert.ok(moved.relocated.length>=3,"the entire broad sheet, not one thin tip, must move");
  const span=(cs:readonly {x:number;y:number}[])=>({
    width:Math.max(...cs.map(c=>c.x))-Math.min(...cs.map(c=>c.x))+1,
    height:Math.max(...cs.map(c=>c.y))-Math.min(...cs.map(c=>c.y))+1,
  });
  assert.deepEqual(span(birth.cells),{width:3,height:3});
  assert.deepEqual(span(moved.cells),{width:4,height:3});
  const firstRow=Math.min(...birth.cells.map(c=>c.y));
  for(const [id,c] of old){
    const transformed=now.get(id)!;
    assert.ok(transformed);
    assert.equal(c.color,transformed.color);
    assert.deepEqual(c.sourceIds,transformed.sourceIds);
    assert.equal(c.tissueId,transformed.tissueId);
    assert.equal(transformed.x-c.x,c.y<=firstRow+1?1:0);
    assert.equal(transformed.y,c.y);
  }
  assert.deepEqual(moved,proposeRegionalSlip(birth,tid,{x:1,y:0}));
  assert.throws(()=>proposeRegionalSlip(birth,tid,{x:2,y:0}),/regional slip/);
});
test("whole-sheet displacement is an independently audited physical daily event",()=>{
  const {atlas,genome}=materialInputs(drawing([".....",".###.",".###.",".###.","....."],"body"),"8E8L8WRZ");
  const program=compileMaterialDevelopment(atlas,genome);
  const op={id:"whole-body-sheet",kind:"slip" as const,tissueId:program.source.tissues[0].id,
    direction:{x:1,y:0},atHour:0,durationHours:12,units:12,strength:1};
  const plan=compileLifetimeRemodeling(program,genome,[op]);
  const proposals=remodelingProposalsBetween(plan,0,12);
  assert.ok(proposals.length>0,"real genetics must authorize at least one band event");
  let accepted:ReturnType<typeof applyRemodelingProposal>|undefined;
  for(const item of proposals){
    const done=applyRemodelingProposal(program.source,plan,item,EMPTY_REMODELING_CHRONOLOGY,Math.ceil(item.atHour));
    if(done.attempt.status==="accepted"){accepted=done;break;}
  }
  assert.ok(accepted,"a source-owned broad band must commit in the daily transaction");
  const k=Math.ceil(accepted.graph.events.at(-1)!.atHour);
  const recorded=accepted.graph.events.map(e=>({
    ...e,atHour:24*k,atMs:HATCH+DAY*k,checkIndex:k,
    careDigest:"slip/verified",genomeFingerprint:program.genomeFingerprint,
    physical:{...e.physical!,relocations:e.physical!.relocations.map(m=>({
      ...m,checkIndex:k,atMs:HATCH+DAY*k,
    }))},
  }));
  const auditable={...accepted.graph,events:recorded};
  verifyDailyMaterialInventory(auditable,HATCH,k,program.source,{
    material:program.operators,remodeling:plan.operations,
  });
  const corrupt={...auditable,events:recorded.map(e=>({
    ...e,physical:{...e.physical!,relocations:e.physical!.relocations.slice(1)},
  }))};
  assert.throws(()=>verifyDailyMaterialInventory(corrupt,HATCH,k,program.source,{
    material:program.operators,remodeling:plan.operations,
  }),/slip|relocation|reconstruction|material|inventory/i);
});


test("unknown authored body silhouettes obey conserved provenance under broad physical slippage",()=>{
  // These 32 masks are generated independently of any starter/preset. They
  // contain the same center sheet but vary perimeter lobes and asymmetry.
  // Exact accepted counts are not used as aesthetic targets; every accepted
  // transaction must satisfy the structural mathematics below.
  let realizable=0;
  for(let mask=0;mask<32;mask++){
    const rows=Array.from({length:7},(_,y)=>Array.from({length:7},(_,x)=>{
      const core=x>=2&&x<=4&&y>=2&&y<=4;
      const lobes=[
        (mask&1)!==0&&x===1&&y>=2&&y<=3,
        (mask&2)!==0&&x===5&&y>=3&&y<=4,
        (mask&4)!==0&&y===1&&x>=2&&x<=4,
        (mask&8)!==0&&y===5&&x>=2&&x<=3,
        (mask&16)!==0&&x===1&&y===4,
      ];
      return core||lobes.some(Boolean)?"#":".";
    }).join(""));
    const {atlas,genome}=materialInputs(drawing(rows,"body"),"8E8L8WRZ");
    const initial=compileMaterialDevelopment(atlas,genome).source;
    const tid=initial.tissues[0].id;
    const original=new Map(initial.cells.map(c=>[c.id,c]));
    for(const axis of [{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}]){
      const proposal=proposeRegionalSlip(initial,tid,axis);
      if(!proposal)continue;
      realizable++;
      assert.equal(proposal.cells.length,initial.cells.length);
      assert.equal(new Set(proposal.cells.map(c=>c.id)).size,original.size);
      assert.ok(proposal.relocated.length>=2);
      const after=new Map(proposal.cells.map(c=>[c.id,c]));
      const displaced=new Map(proposal.relocated.map(m=>[m.cellId,m]));
      assert.equal(displaced.size,proposal.relocated.length);
      for(const [id,birth] of original){
        const child=after.get(id)!;
        assert.ok(child);
        assert.equal(child.tissueId,birth.tissueId);
        assert.equal(child.color,birth.color);
        assert.deepEqual(child.sourceIds,birth.sourceIds);
        assert.equal(child.provenance,birth.provenance);
        const moving=displaced.get(id);
        assert.equal(child.x-birth.x,moving?axis.x:0);
        assert.equal(child.y-birth.y,moving?axis.y:0);
      }
      const beforeMask=new Set(initial.cells.map(c=>c.x+","+c.y));
      const afterMask=new Set(proposal.cells.map(c=>c.x+","+c.y));
      assert.ok([...beforeMask].some(p=>!afterMask.has(p))||
        [...afterMask].some(p=>!beforeMask.has(p)),
        "accepted sheet must genuinely change the occupied physical silhouette");
      assert.deepEqual(proposeRegionalSlip(initial,tid,axis),proposal);
    }
  }
  assert.ok(realizable>=8,"varied unfamiliar compact bodies should admit multiple non-bulk developmental paths");
});

test("two opposing body bands physically bend without adding bulk or changing authored identity",()=>{
  const {atlas,genome}=materialInputs(drawing([".....",".###.",".###.",".###.","....."],"body"),"8E8L8WRZ");
  const birth=compileMaterialDevelopment(atlas,genome).source;
  const bent=proposeRegionalBend(birth,birth.tissues[0].id,{x:1,y:0});
  assert.ok(bent,"a dense player-authored body has an admissible jointless bend");
  assert.equal(bent.cells.length,birth.cells.length);
  assert.equal(bent.relocated.length,6,"two genuine three-cell bands must move in opposite directions");
  const original=new Map(birth.cells.map(c=>[c.id,c]));
  const changed=new Map(bent.cells.map(c=>[c.id,c]));
  const ys=[...new Set(birth.cells.map(c=>c.y))].sort((a,b)=>a-b);
  for(const [id,c] of original){
    const after=changed.get(id)!;
    assert.ok(after);
    assert.equal(after.color,c.color);
    assert.equal(after.provenance,c.provenance);
    assert.deepEqual(after.sourceIds,c.sourceIds);
    assert.equal(after.x-c.x,c.y===ys[0]?1:c.y===ys.at(-1)?-1:0);
    assert.equal(after.y,c.y);
  }
  const width=(cells:readonly {x:number}[])=>
    Math.max(...cells.map(c=>c.x))-Math.min(...cells.map(c=>c.x))+1;
  assert.equal(width(birth.cells),3);
  assert.equal(width(bent.cells),5,"the body transforms to a five-column diagonal profile with NO mass increase");
  assert.deepEqual(bent,proposeRegionalBend(birth,birth.tissues[0].id,{x:1,y:0}));
});
test("opposite-band bend receipts are independently checked, including stationary bridge cells",()=>{
  const {atlas,genome}=materialInputs(drawing([".....",".###.",".###.",".###.","....."],"body"),"8E8L8WRZ");
  const program=compileMaterialDevelopment(atlas,genome);
  const op={id:"wide-counterbend",kind:"bend" as const,tissueId:program.source.tissues[0].id,
    direction:{x:1,y:0},atHour:0,durationHours:12,units:12,strength:1};
  const plan=compileLifetimeRemodeling(program,genome,[op]);
  const proposals=remodelingProposalsBetween(plan,0,12);
  assert.ok(proposals.length>0);
  let accepted:ReturnType<typeof applyRemodelingProposal>|null=null;
  for(const proposal of proposals){
    const trial=applyRemodelingProposal(program.source,plan,proposal,
      EMPTY_REMODELING_CHRONOLOGY,Math.ceil(proposal.atHour));
    if(trial.attempt.status==="accepted"){accepted=trial;break;}
  }
  assert.ok(accepted,"actual chronological material transactions must permit a full body bend");
  const day=Math.ceil(accepted.graph.events.at(-1)!.atHour);
  const journal=accepted.graph.events.map(e=>({
    ...e,atHour:day*24,atMs:HATCH+day*DAY,checkIndex:day,
    careDigest:"physical-bend",genomeFingerprint:program.genomeFingerprint,
    physical:{...e.physical!,relocations:e.physical!.relocations.map(m=>({
      ...m,checkIndex:day,atMs:HATCH+day*DAY,
    }))},
  }));
  const authoritative={...accepted.graph,events:journal};
  verifyDailyMaterialInventory(authoritative,HATCH,day,program.source,{
    material:program.operators,remodeling:plan.operations,
  });
  const forged={...authoritative,events:journal.map(e=>({
    ...e,physical:{...e.physical!,relocations:e.physical!.relocations.slice(0,-1)},
  }))};
  assert.throws(()=>verifyDailyMaterialInventory(forged,HATCH,day,program.source,{
    material:program.operators,remodeling:plan.operations,
  }),/bend|material|reconstruction|inventory|relocation|physical/i);
});

test("productive daily care expresses conservative body bending; zero care cannot fabricate it",()=>{
  const {atlas,genome}=materialInputs(drawing([".....",".###.",".###.",".###.","....."],"body"),"8E8L8WRZ");
  const program=compileMaterialDevelopment(atlas,genome);
  const bend={id:"daily-body-flexure",kind:"bend" as const,tissueId:program.source.tissues[0].id,
    direction:{x:1,y:0},atHour:0,durationHours:12,units:12,strength:1};
  const plan=compileLifetimeRemodeling(program,genome,[bend]);
  const window=(day:number,care:number):DailyCareWindowV1=>({
    version:1,hatchAtMs:HATCH,checkIndex:day,
    startMs:HATCH+(day-1)*DAY,endMs:HATCH+day*DAY,
    forcing:{nutrition:care,rest:care,security:care,activity:care,threat:0,
      observedFraction:care},acceptedCommands:0,rejectedCommands:0,
    observations:0,activeMs:DAY,absentMs:0,unknownMs:0,unknown:[],
    provenanceDigest:"body-bend/"+care+"/"+day,
  });
  let nourished=createDailyMaterialState(program,HATCH);
  let starved=createDailyMaterialState(program,HATCH);
  for(let day=1;day<=12;day++){
    nourished=applyDailyMaterialStep(program,genome,nourished,window(day,1),plan);
    starved=applyDailyMaterialStep(program,genome,starved,window(day,0),plan);
  }
  assert.ok(nourished.graph.events.some(e=>e.kind==="bend"),
    "the living engine must actually execute source-conserving flexure");
  assert.equal(starved.graph.events.filter(e=>e.kind==="bend").length,0,
    "the genetic stage plan cannot bypass the chronological care gate");
  assert.deepEqual(nourished.graph.sourceCells,program.source.sourceCells);
  assert.deepEqual(starved.graph.sourceCells,program.source.sourceCells);
  assert.ok(nourished.graph.events.filter(e=>e.kind==="bend").every(e=>
    e.createdCellIds.length===0&&e.removedCellIds.length===0&&
    (e.physical?.relocations.length??0)>=2));
  verifyDailyMaterialInventory(nourished.graph,HATCH,12,program.source,{
    material:program.operators,remodeling:plan.operations,
  });
});

test("two successive physical morphs change internal relative positions without increasing tissue area",()=>{
  const {atlas,genome}=materialInputs(drawing([".....",".###.",".###.",".###.","....."],"body"),"8E8L8WRZ");
  const source=compileMaterialDevelopment(atlas,genome).source;
  const tid=source.tissues[0].id;
  const slip=proposeRegionalSlip(source,tid,{x:1,y:0});
  assert.ok(slip);
  const second=proposeRegionalBend({...source,cells:slip.cells},tid,{x:1,y:0});
  assert.ok(second,"a later stage can physically reorganize an already transformed body");
  const first={...source,cells:slip.cells},adult={...source,cells:second.cells};
  const occupied=(cells:readonly {x:number;y:number}[])=>
    new Set(cells.map(c=>c.x+","+c.y));
  const a=occupied(source.cells),b=occupied(first.cells),c=occupied(adult.cells);
  assert.equal(a.size,b.size);
  assert.equal(b.size,c.size);
  const shape=(x:ReadonlySet<string>,y:ReadonlySet<string>)=>
    [...x].filter(v=>!y.has(v)).length+[...y].filter(v=>!x.has(v)).length;
  assert.ok(shape(a,b)>0&&shape(b,c)>0,
    "each stage must alter occupied anatomy, not just the elapsed age label");
  assert.ok(sourcePairChange(source,adult)>0,
    "source-pair distances must actually change, ruling out a rigid display pose");
  assert.deepEqual([...new Set(adult.cells.map(c=>c.id))].sort(),
    source.cells.map(c=>c.id).sort());
});


test("complex six-region drawings retain every eligible real joint-movement stage within 64 operations",()=>{
  // This deliberately has more independently selected parts than the former
  // grammar could schedule without starving the final rotation passes.
  const core={...drawing(["######","######","######","######","######","######"],"body")[0],
    id:"core",name:"Body",parentId:null};
  const named=[
    {id:"left",kind:"arm" as const,position:{x:-2,y:1}},
    {id:"right",kind:"arm" as const,position:{x:6,y:1}},
    {id:"top",kind:"wing" as const,position:{x:2,y:-2}},
    {id:"bottom",kind:"leg" as const,position:{x:2,y:6}},
    {id:"tail",kind:"tail" as const,position:{x:6,y:4}},
  ].map(p=>({...drawing(["##","##"],p.kind)[0],
    id:p.id,name:p.id,parentId:"core",position:p.position}));
  const {atlas,genome}=materialInputs([core,...named],"8E8L8WBRZ");
  const physical=compileMaterialDevelopment(atlas,genome);
  assert.ok(physical.source.tissues.filter(t=>t.sourceCellIds.length>=2).length>=5);
  const attached=physical.source.links.filter(l=>l.kind==="attachment"&&
    named.some(part=>physical.source.sourceCells.some(c=>
      c.id===l.fromCellId&&c.sourcePartId===part.id)));
  assert.ok(attached.length>=4,"real parts must be mechanically attached");
  const program=compileLifetimeRemodeling(physical,genome);
  assert.ok(program.operations.length<=64);
  assert.ok(program.operations.some(o=>o.kind==="repattern"));
  assert.ok(program.operations.some(o=>o.kind==="slip"));
  assert.ok(program.operations.some(o=>o.kind==="bend"));
  const rotation=program.operations.filter(o=>o.id.startsWith("migrate/")&&
    o.kind==="articulate"&&o.direction);
  assert.equal(rotation.length,12,
    "four eligible attached organs each deserve three distinct physical-turn windows");
  const byTissue=new Map<string,number>();
  for(const op of rotation)byTissue.set(op.tissueId,(byTissue.get(op.tissueId)??0)+1);
  assert.equal(byTissue.size,4);
  assert.ok([...byTissue.values()].every(n=>n===3));
  assert.deepEqual(compileLifetimeRemodeling(physical,genome),program,
    "the allocation is fixed by the drawing and immutable genome");
});

/** Manually constructed multi-tissue source graph is deliberately not a
 * hardcoded adult silhouette. Its assertions concern source IDs, attached
 * parent links, and conserved geometry under generic operators. */
function nestedAnatomy():MaterialGraph{
 const {atlas,genome}=materialInputs(drawing(["###","###","###"],"body"),"8E8L8WRZ");
 const source=compileMaterialDevelopment(atlas,genome).source;
 const x=Math.min(...source.cells.map(c=>c.x)),y=Math.min(...source.cells.map(c=>c.y));
 const body=source.tissues[0].id,base=source.cells.find(c=>c.x===x+1&&c.y===y)!;
 const white="#E0E0E0",headColor="#627F9C";
 const headPoints=[
  {x:x+1,y:y-2},{x:x+2,y:y-2},
  {x:x+1,y:y-1},{x:x+2,y:y-1},
 ];
 const authored=(id:string,tissueId:string,p:{x:number;y:number},
  kind:"head"|"eye",color:string):MaterialCell=>({
   id,tissueId,x:p.x,y:p.y,color,provenance:"authored",
   sourceKind:kind,sourcePartId:tissueId,sourceIds:[id],
   parentCellIds:[],operationId:null,
 });
 const head=headPoints.map((p,i)=>authored("ink/head/"+i,"head",p,"head",headColor));
 const eyes=[
  authored("ink/eye/left","left-eye",headPoints[0],"eye",white),
  authored("ink/eye/right","right-eye",headPoints[1],"eye",white),
 ];
 const pupil:MaterialCell={
  id:"ink/pupil",tissueId:"pupil",x:headPoints[0].x,y:headPoints[0].y,
  color:"#111111",provenance:"authored",sourceKind:"decoration",
  sourcePartId:"pupil",sourceIds:["ink/pupil"],parentCellIds:[],
  operationId:null,
 };
 const tissues:MaterialTissue[]=[
  {id:"head",sourcePartId:"head",parentId:body,relationship:"joint",
   sourceCellIds:head.map(c=>c.id),growthSiteIds:[],rigidity:0},
  ...eyes.map(c=>({id:c.tissueId,sourcePartId:c.sourcePartId!,
   parentId:"head",relationship:"surface" as const,
   sourceCellIds:[c.id],growthSiteIds:[],rigidity:0})),
  {id:"pupil",sourcePartId:"pupil",parentId:"left-eye",relationship:"surface",
   sourceCellIds:[pupil.id],growthSiteIds:[],rigidity:0},
 ];
 const links:MaterialLink[]=[
  {id:"attachment/head",kind:"attachment",fromTissueId:"head",toTissueId:body,
   fromCellId:head[2].id,toCellId:base.id},
  {id:"attachment/left-eye",kind:"attachment",fromTissueId:"left-eye",
   toTissueId:"head",fromCellId:eyes[0].id,toCellId:head[0].id},
  {id:"attachment/right-eye",kind:"attachment",fromTissueId:"right-eye",
   toTissueId:"head",fromCellId:eyes[1].id,toCellId:head[1].id},
  {id:"attachment/pupil",kind:"attachment",fromTissueId:"pupil",
   toTissueId:"left-eye",fromCellId:pupil.id,toCellId:eyes[0].id},
 ];
 const cells=[...source.cells,...head,...eyes,pupil];
 const allTissues=[...source.tissues,...tissues],allLinks=[...source.links,...links];
 return {...source,sourceCells:cells,cells,tissues:allTissues,links:allLinks,
  birth:{tissues:allTissues,sites:source.sites,links:allLinks,
   protectedVoids:source.protectedVoids},events:[]};
}

test("a body bend and slip carry a head and two separately authored eyes by their parent anchors",()=>{
 const graph=nestedAnatomy(),body=graph.tissues[0].id;
 for(const kind of ["slip","bend"] as const){
  const candidate=kind==="slip"?
   proposeRegionalSlip(graph,body,{x:1,y:0}):
   proposeRegionalBend(graph,body,{x:1,y:0});
  assert.ok(candidate,kind+" must permit coherent child movement");
  assert.equal(candidate.cells.length,graph.cells.length);
  const before=new Map(graph.cells.map(c=>[c.id,c]));
  const after=new Map(candidate.cells.map(c=>[c.id,c]));
  const contact=graph.links.find(l=>l.id==="attachment/head")!;
  const originalRoot=before.get(contact.toCellId!)!,updatedRoot=after.get(contact.toCellId!)!;
  const delta={x:updatedRoot.x-originalRoot.x,y:updatedRoot.y-originalRoot.y};
  assert.ok(delta.x!==0||delta.y!==0);
  for(const c of graph.cells.filter(c=>["head","left-eye","right-eye","pupil"].includes(c.tissueId))){
   const updated=after.get(c.id)!;
   assert.deepEqual({x:updated.x-c.x,y:updated.y-c.y},delta);
   assert.equal(updated.color,c.color);
   assert.deepEqual(updated.sourceIds,c.sourceIds);
  }
  assert.deepEqual(candidate,kind==="slip"?
    proposeRegionalSlip(graph,body,{x:1,y:0}):
    proposeRegionalBend(graph,body,{x:1,y:0}));
 }
});

test("rotating a head carries both separately authored eyes by the SAME rigid transform",()=>{
 const graph=nestedAnatomy();
 const turn=proposeArticulatedTurn(graph,"head",-1);
 assert.ok(turn,"joint rotation must carry the eyes instead of leaving them behind");
 assert.equal(turn.cells.length,graph.cells.length);
 const byId=new Map(turn.cells.map(c=>[c.id,c]));
 for(const original of graph.cells.filter(c=>["head","left-eye","right-eye","pupil"].includes(c.tissueId))){
  const cell=byId.get(original.id)!;
  assert.equal(cell.x,turn.pivot.x+(original.y-turn.pivot.y));
  assert.equal(cell.y,turn.pivot.y-(original.x-turn.pivot.x));
  assert.equal(cell.tissueId,original.tissueId);
  assert.deepEqual(cell.sourceIds,original.sourceIds);
 }
 assert.equal(graph.cells.filter(c=>c.tissueId===graph.tissues[0].id).every(c=>
  byId.get(c.id)?.x===c.x&&byId.get(c.id)?.y===c.y),true,
  "the nonparticipating root body may not be translated");
});

test("the independent journal reconstructs every descendant and rejects a missing eye",()=>{
 const graph=nestedAnatomy(),body=graph.tissues[0].id;
 const turn=proposeRegionalSlip(graph,body,{x:1,y:0});
 assert.ok(turn);
 const operation={id:"nested-physical-carrier",kind:"slip",tissueId:body,
  direction:{x:1,y:0}};
 const originalEvent={id:operation.id+"/unit/1",kind:"slip",
  atHour:24,atMs:HATCH+DAY,checkIndex:1,
  sourceCellIds:[...new Set(graph.sourceCells.map(c=>c.id))],
  createdCellIds:[],removedCellIds:[],careDigest:"independent/nested",
  genomeFingerprint:"nested/source-provenance"};
 const prior={...graph,cells:turn.cells};
 const baseEvent=journalMaterialEvent(graph,prior,originalEvent,
  "remodeling",operation);
 const withJournal={...baseEvent,physical:{...baseEvent.physical!,
  relocations:baseEvent.physical!.relocations.map(m=>({...m,
   checkIndex:1,atMs:HATCH+DAY}))}};
 const final={...prior,events:[withJournal]};
 verifyDailyMaterialInventory(final,HATCH,1,graph);
 const withoutEye={...final,events:[{...withJournal,physical:{
  ...withJournal.physical!,
  relocations:withJournal.physical!.relocations.filter(m=>m.cellId!=="ink/eye/left"),
 }}]};
 assert.throws(()=>verifyDailyMaterialInventory(withoutEye,HATCH,1,graph),
  /attachment|movement|source|inventory|material|physical/i);
});


test("real player-authored Head with independently selected Eyes rotates through compiler without sprite substitution",()=>{
 const body={...drawing(["###","###","###"],"body")[0],
  id:"player-body",name:"body",parentId:null};
 const head={...drawing(["###","###","###"],"head")[0],
  id:"player-head",name:"head",parentId:"player-body",
  position:{x:0,y:-3}};
 const left={...drawing(["#"],"eye")[0],
  id:"player-eye-left",name:"eye left",parentId:"player-head",
  position:{x:1,y:-3}};
 const right={...drawing(["#"],"eye")[0],
  id:"player-eye-right",name:"eye right",parentId:"player-head",
  position:{x:2,y:-3}};
 const {atlas,genome}=materialInputs([body,head,left,right],"8E8L8WBRZ");
 const graph=compileMaterialDevelopment(atlas,genome).source;
 const headTissue=graph.tissues.find(t=>t.sourcePartId==="player-head");
 assert.ok(headTissue,"user's head must be a separately owned source tissue");
 const attached=graph.links.filter(l=>l.kind==="attachment");
 assert.ok(attached.some(l=>l.fromTissueId===headTissue.id),
  "normal compiler must attach authored Head physically to Body");
 const eyes=graph.tissues.filter(t=>["player-eye-left","player-eye-right"].includes(t.sourcePartId));
 assert.equal(eyes.length,2);
 assert.ok(eyes.every(t=>attached.some(l=>
  l.fromTissueId===t.id&&l.toTissueId===headTissue.id)));
 const outcome=proposeArticulatedTurn(graph,headTissue.id,-1);
 assert.ok(outcome,"authored head with eyes should admit one real rigid whole-feature rotation");
 const after=new Map(outcome.cells.map(c=>[c.id,c]));
 for(const cell of graph.cells.filter(c=>c.tissueId===headTissue.id||
  eyes.some(t=>t.id===c.tissueId))){
  const now=after.get(cell.id)!;
  assert.equal(now.x,outcome.pivot.x+(cell.y-outcome.pivot.y));
  assert.equal(now.y,outcome.pivot.y-(cell.x-outcome.pivot.x));
  assert.deepEqual(now.sourceIds,cell.sourceIds);
 }
 assert.equal(outcome.cells.length,graph.cells.length);
});
