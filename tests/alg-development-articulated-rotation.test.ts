import test from "node:test";
import assert from "node:assert/strict";
import {STARTER_PRESETS} from "../src/presets";
import {compileGenome} from "../src/simulation/genome";
import {compileSources} from "../src/simulation/material";
import {describeSource} from "../src/simulation/source-atlas";
import {compileMaterialDevelopment} from "../src/development/operators";
import {proposeArticulatedTurn,proposeRegionalSlip} from "../src/development/coordinated-metamorphosis";
import {compileLifetimeRemodeling} from "../src/development/lifetime-remodeling";
import {applyRemodelingProposal,remodelingProposalsBetween,
  EMPTY_REMODELING_CHRONOLOGY} from "../src/development/remodel-transactions";
import {verifyDailyMaterialInventory} from "../src/development/daily-step";
import {sourceStrain} from "../src/development/developmental-strain";
import {materialInputs,drawing} from "./alg-development-fixtures";

const HATCH=1_701_102_300_000;
const DAY=86_400_000;
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
  for(const [id,c] of old){
    const transformed=now.get(id)!;
    assert.ok(transformed);
    assert.equal(c.color,transformed.color);
    assert.deepEqual(c.sourceIds,transformed.sourceIds);
    assert.equal(c.tissueId,transformed.tissueId);
    assert.equal(transformed.x-c.x,c.y<=2?1:0);
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
