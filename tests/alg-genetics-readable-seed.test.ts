import assert from "node:assert/strict";
import test from "node:test";
import { hash } from "../src/simulation/model";
import { compileGenome } from "../src/simulation/genome";
import { createSimulation } from "../src/simulation";
import { parseSeedInstructions, SEED_ALPHABET, SEED_ROLES,
  compileReadableSeed, scheduleSeedOpportunities } from "../src/genetics/seed-language";
import { chooseAuthoredReference } from "../src/lineage/authored-neighbor";
import { createPhylogenyView } from "../src/phylogeny";
import { FANTASY_PATHS } from "../src/phylogeny/fantasy-paths";
import { compileMaterialDevelopment, applyMaterialOperators } from "../src/development/operators";
import { sourceFeatures } from "../src/development/anatomical-features";
import { verifyAnatomicalContinuity } from "../src/development/anatomical-audit";
import { materialInputs, drawing } from "./alg-development-fixtures";

test("[PHY-004/A6] seed characters and decimal dosages have one published interpretation", () => {
  assert.deepEqual(Object.keys(SEED_ALPHABET), [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"]);
  assert.deepEqual(SEED_ROLES.length, 14);
  const parsed = parseSeedInstructions("2E3L0WAB");
  assert.deepEqual(parsed.instructions.map(i => [i.symbol,i.tickets,i.role,i.process]),
    [["E",2,"eye",null],["L",3,"leg",null],["W",0,"wing",null],
      ["A",1,"arm",null],["B",1,null,"broad-growth"]]);
  assert.equal(parseSeedInstructions("300E").instructions[0].tickets,12);
  assert.equal(parseSeedInstructions("0E").instructions[0].tickets,0);
  assert.deepEqual(parseSeedInstructions("e-e").instructions.map(i=>i.symbol),["E","E"]);
  assert.deepEqual(parseSeedInstructions("e-e").instructions.map(i=>i.tickets),[1,1]);
});

test("[PHY-004/A7] same seed and authored kinds give the identical genotype and ticket outcomes despite geometry", () => {
  const sameOne=materialInputs(drawing([".##.","####"], "body"),"12E12L7R");
  const sameTwo=materialInputs(drawing(["####","..##"], "body"),"12E12L7R");
  const ref="ott244265";
  const first=compileReadableSeed("12E12L7R",ref,sameOne.atlas);
  const second=compileReadableSeed("12E12L7R",ref,sameTwo.atlas);
  assert.deepEqual(first,second);
  assert.deepEqual(compileReadableSeed("12E12L7R",ref,sameOne.atlas),first);
  assert.equal(first.originalSeed,"12E12L7R");
  assert.equal(first.referenceId,ref);
  assert.equal(first.origin,"pluripotent-body");
  assert.equal(first.processes.remodel,7);
  for(const chance of first.opportunities){
    const expectedRoll: number=hash(first.originalSeed+"|"+ref+"|"+chance.kind+"|"+chance.ticket)/4294967296;
    assert.ok(Math.abs(chance.roll-expectedRoll)<=5e-13);
    assert.equal(chance.accepted,expectedRoll<chance.probability);
  }
  const eye=first.features.find(f=>f.kind==="eye")!;
  assert.equal(eye.proposed,12);
  assert.equal(eye.targetCount,eye.accepted);
  assert.ok(first.features.every(f=>f.targetCount>=0 && f.accepted<=f.proposed));
  const other=compileReadableSeed("0E",ref,sameOne.atlas);
  assert.equal(other.features.find(f=>f.kind==="eye")?.proposed,0);
  assert.equal(other.features.find(f=>f.kind==="leg")?.proposed,1);
});

test("[PHY-004/A8] body-only anatomy is uncommitted while the complete supported tree remains eligible", () => {
  const source=materialInputs(drawing(["#"],"body"),"SINGLE-CELL");
  const tree=createPhylogenyView(FANTASY_PATHS);
  const first=chooseAuthoredReference(source.atlas,"SINGLE-CELL")!;
  assert.equal(first.developmentalPotential,"pluripotent");
  assert.equal(first.status,"seeded-ambiguous");
  assert.equal(first.candidates.length,tree.nodes.length);
  assert.deepEqual(new Set(first.candidates.map(c=>c.nodeId)),
    new Set(tree.nodes.map(n=>n.id)));
  assert.ok(first.candidates.every(c=>c.structuralScore===0));
  const found = new Set<string>();
  for(let i=0;i<128;i++)
    found.add(chooseAuthoredReference(source.atlas,"CELL-"+i)!.referenceId);
  assert.ok([...found].some(id=>id.startsWith("fiction:")));
  assert.ok([...found].some(id=>id.startsWith("ott")));
  assert.ok([...found].some(id=>id.startsWith("ncbi:")));
});

test("[PHY-004/A9] seed opportunities compile into fixed, source-owned nonchaotic developmental operators", () => {
  const seed="12E12L7R";
  const {atlas,genome}=materialInputs(drawing(["###","###","###"],"body"),seed);
  const tree=createPhylogenyView(FANTASY_PATHS);
  const prior=tree.resolveBiologicalConstraints("ott244265")!;
  const program=compileMaterialDevelopment(atlas,genome,prior);
  const replay=compileMaterialDevelopment(atlas,compileGenome(seed),prior);
  assert.deepEqual(program,replay,"same source and seed must produce byte-identical birth development");
  assert.deepEqual(program.seedLanguage,compileReadableSeed(seed,prior.taxonId,atlas));
  const genes=program.operators.filter(op=>op.geneticInstructionId);
  assert.ok(genes.length>0,"accepted gene roll should become an actual operator");
  assert.ok(genes.every(op=>!op.chaos),
    "new readable-seed operators must never reroll or require chaotic rhythms");
  assert.ok(genes.every(op=>op.strength>0 && op.strength<=1));
  assert.ok(genes.every(op=>op.atHour+op.durationHours<=365));
  assert.ok(program.operators.length<=64);
  const adult=applyMaterialOperators(program.source,program.operators,365,program.signals);
  verifyAnatomicalContinuity(adult.sourceCells,adult.cells,{links:adult.links,protectedVoids:adult.protectedVoids});
  const realized = adult.tissues.filter(t=>t.developedKind);
  assert.ok(realized.length > 0,
    "seed-selected material must produce at least one real differentiated tissue in this valid high-potential witness");
  for(const tissue of realized){
    assert.ok(genes.some(op=>op.geneticInstructionId===tissue.geneticInstructionId &&
      op.developedKind===tissue.developedKind));
    assert.ok(tissue.sourceCellIds.every(id=>adult.sourceCells.some(c=>c.id===id)));
    assert.ok(tissue.sourcePartId);
    assert.ok(sourceFeatures(adult.sourceCells).features.every(f=>f.minimum===1));
  }
});

test("[PHY-004/A10] care cannot change birth genetics; only independently recorded expression", () => {
  const {atlas,genome}=materialInputs(drawing(["###","###","###"],"body"),"2E3L");
  const reference=chooseAuthoredReference(atlas,genome.seed)!;
  const tree=createPhylogenyView(FANTASY_PATHS);
  const prior=tree.resolveBiologicalConstraints(reference.referenceId)!;
  const first=compileMaterialDevelopment(atlas,genome,prior);
  const second=compileMaterialDevelopment(atlas,genome,prior);
  assert.deepEqual(first.seedLanguage,second.seedLanguage);
  assert.equal(first.fingerprint,second.fingerprint);
  // A zero-care physical outcome is a legitimate null, NOT a genetic reroll.
  const nullGrowth=applyMaterialOperators(first.source,[],
    365,first.signals);
  assert.deepEqual(nullGrowth.cells,first.source.cells);
  assert.deepEqual(second.seedLanguage,first.seedLanguage);
});


test("[PHY-004/A11] real daily-generated genetic tissues appear as their actual visible roles, not source-Body paint", () => {
  const original = drawing(["###", "###", "###"], "body");
  const sim = createSimulation(original, "12E12L7R", "infant", {
    previewCare: {kind:"synthetic-needs-lab-v1",nutrition:0.95,timeline:[]},
    reuseLivingMaterial:false,
  });
  const adult = sim.materialStateAt(365).graph;
  const active = new Set(adult.cells.map(c=>c.tissueId));
  const differentiated = adult.tissues.filter(t=>t.developedKind&&active.has(t.id));
  assert.ok(differentiated.length>0,
    "high-potential source must realize a physical specialized child at full care");
  const physicalFrame=sim.frameAt(365,{time:0,action:"idle"});
  for (const tissue of differentiated) {
    const part=physicalFrame.parts.find(p=>p.id==="material-growth/"+tissue.id);
    assert.ok(part,"every physical differentiated tissue must have a displayed part");
    assert.equal(part.kind,tissue.developedKind,
      "the renderer must expose the developed kind, not the original Body");
    assert.equal(part.role,tissue.developedKind);
    assert.equal(part.provenance,"grown");
    assert.ok(part.pixels.length>0,"no metadata-only specialist organs");
    assert.deepEqual(part.sourcePartIds,[tissue.sourcePartId]);
    assert.ok(part.pixels.every(p=>p.materialCellId &&
      adult.cells.some(c=>c.id===p.materialCellId&&c.tissueId===tissue.id)));
  }
  const birth=sim.frameAt(0,{time:0,action:"idle"});
  assert.ok(birth.parts.filter(p=>p.provenance==="authored")
    .every(p=>p.kind==="body"),
    "new genetics must never relabel source pixels at birth");
  assert.deepEqual(sim.materialStateAt(365).graph,adult);
});


test("[PHY-004/A12] body-only reference lottery balances supported phylogenetic domains, not catalog size", () => {
  const {atlas}=materialInputs(drawing(["#"],"body"),"DOMAIN");
  const tree=createPhylogenyView(FANTASY_PATHS);
  const domains=["animal","plant","fungus","fictional","other-scientific"] as const;
  const classify=(id:string):typeof domains[number] =>
    id.startsWith("fiction:")?"fictional":
    tree.isDescendant(id,"ncbi:33090")?"plant":
    tree.isDescendant(id,"ncbi:4751")?"fungus":
    tree.isDescendant(id,"ott691846")?"animal":"other-scientific";
  const available=domains.filter(d=>tree.nodes.some(node=>classify(node.id)===d));
  assert.deepEqual(available,domains,
    "missing represented realm invalidates the advertised five-way seed draw");
  const observed = new Set<string>();
  for (let i=0;i<125;i++) {
    const seed="uncommitted-domain/"+i;
    const chosen=chooseAuthoredReference(atlas,seed)!;
    const expectedDomain:(typeof domains)[number]=
      available[hash(seed+"|uncommitted-domain")%available.length];
    const options=tree.nodes.filter(node=>classify(node.id)===expectedDomain)
      .map(node=>({
        id:node.id,
        rank:hash(seed+"|authored-neighbor|"+node.id)/4294967296,
      })).sort((a,b)=>b.rank-a.rank||a.id.localeCompare(b.id));
    const expectedNode=options[
      hash(seed+"|uncommitted-node|"+expectedDomain)%options.length
    ]?.id;
    assert.equal(chosen.referenceDomain,expectedDomain);
    assert.equal(chosen.referenceId,expectedNode);
    assert.equal(chosen.candidates[0].nodeId,expectedNode);
    assert.equal(chosen.status,"seeded-ambiguous");
    assert.deepEqual(chosen.authoredCounts,{body:1});
    observed.add(expectedDomain);
  }
  assert.deepEqual([...observed].sort(),[...domains].sort());
});


test("[PHY-004/A13] explicit seed kinds share finite physical-growth slots before duplicates", () => {
  const {atlas}=materialInputs(drawing(["###","###","###"],"body"),"12E12L");
  const seed=compileReadableSeed("12E12L","ott244265",atlas);
  const eyes=seed.opportunities.filter(o=>o.kind==="eye"&&o.accepted&&o.source==="letter");
  const legs=seed.opportunities.filter(o=>o.kind==="leg"&&o.accepted&&o.source==="letter");
  assert.ok(eyes.length>2&&legs.length>2,
    "the deterministic high-dose witness must independently enable both selected kinds");
  const slots=scheduleSeedOpportunities(seed,6);
  assert.equal(slots.length,6);
  assert.deepEqual(slots,scheduleSeedOpportunities(seed,6));
  assert.equal(slots[0].source,"letter");
  assert.equal(slots[1].source,"letter");
  assert.notEqual(slots[0].kind,slots[1].kind,
    "one anatomical kind must not monopolize the budget by roster order");
  assert.ok(slots.some(o=>o.kind==="eye")&&slots.some(o=>o.kind==="leg"));
  assert.ok(slots.every(o=>o.accepted&&o.source==="letter"));
  assert.deepEqual(scheduleSeedOpportunities(seed,0),[]);
  assert.throws(()=>scheduleSeedOpportunities(seed,169),/0..168/);
  assert.throws(()=>scheduleSeedOpportunities(seed,-1),/0..168/);
});
