import test from "node:test";
import assert from "node:assert/strict";
import {
  createPhylogenyView, resolveBiologicalConstraints,
  developmentalPossibilities,
  type DevelopmentPrior,
} from "../src/phylogeny";
import {
  compileGenome, compileLabGenome, genomeCacheKey,
  geneRandom, materialGene,
} from "../src/simulation/genome";
import {
  DEVELOPMENTAL_CHANNELS, DEVELOPMENT_CONSUMERS,
  adaptDevelopmentPrior, expressGenotype,
  expressEnvironmentalResponse, compileDevelopmentGeneticSignals,
} from "../src/genetics";

/** Synthetic malformed-evidence fixture retained only for negative validation. */
function fixturePrior(): DevelopmentPrior {
  return {
    taxonId: "fiction:example",
    fixedAncestry: ["fiction:example", "ncbi:3193", "ncbi:33090", "ncbi:2759"],
    version: "infipet-developmental-priors-v1",
    semantics: "reference-clade-evidence-not-lifetime-gate",
    includesFiction: true,
    constraints: {
      growthPattern: {
        allowed: ["meristem-directed"],
        introducedBy: "ncbi:3193",
        refinedBy: [],
        evidenceUrls: ["https://example.org/fixture-only"],
      },
    },
    operatorHints: [
      { operator: "tip-extension", provenance: "scientific",
        introducedBy: "ncbi:3193", evidenceUrl: "https://example.org/fixture-only" },
      { operator: "branch-axis", provenance: "fictional",
        introducedBy: "fiction:example", evidenceUrl: "" },
    ],
  };
}

test("[GEN-001/A1] ordinary alphanumeric seeds replay and Lab coordinates cannot alias identity or cache", () => {
  const a = compileGenome("Q9A-003X", "egg");
  assert.deepEqual(a, compileGenome("Q9A-003X", "egg"));
  assert.equal(a.version, 7);
  assert.equal(a.genotype.schemaVersion, 1);
  assert.match(a.fingerprint, /^[a-f0-9]{8}$/);
  assert.equal(a.genotype.fingerprint, a.fingerprint);
  assert.equal(a.seed, "Q9A-003X");
  assert.equal(compileGenome("   ").seed, "little-world");
  assert.equal(geneRandom(a.fingerprint, "pace"), geneRandom(a.fingerprint, "pace"));
  assert.equal(materialGene(a, "pigment", 0.2, 0.2), materialGene(a, "pigment", 0.2, 0.2));
  assert.notDeepEqual(a.genotype.channels, compileGenome("Q9A-003Y", "egg").genotype.channels);
  assert.deepEqual(Object.keys(a.genotype.channels).sort(), Object.keys(DEVELOPMENTAL_CHANNELS).sort());

  const x = compileLabGenome("Q9A-003X", "egg", { growth: 0.1 });
  const y = compileLabGenome("Q9A-003X", "egg", { growth: 0.2 });
  assert.notEqual(x.fingerprint, y.fingerprint);
  assert.notEqual(x.genotype.fingerprint, y.genotype.fingerprint);
  assert.notEqual(genomeCacheKey(x), genomeCacheKey(y));
  assert.notEqual(genomeCacheKey(a), genomeCacheKey(x));
  assert.notDeepEqual(x.genotype.channels.growth, y.genotype.channels.growth);
  assert.deepEqual(x, compileLabGenome("Q9A-003X", "egg", { growth: 0.1 }));
  assert.equal(a.pace, x.pace, "unrelated legacy genes keep their deterministic seed values");
  assert.throws(() => compileLabGenome("Q", "infant", { growth: -0.1 }), /Invalid genetic coordinate/);
  assert.throws(() => compileLabGenome("Q", "infant", { growth: Number.NaN }), /Invalid genetic coordinate/);
});

test("[GEN-001/A2] projected phylogeny categories preserve unknown, evidence provenance and genome", () => {
  const genome = compileGenome("LINEAGE-WITNESS");
  const before = JSON.stringify(genome);
  const prior = adaptDevelopmentPrior(fixturePrior());
  assert.equal(prior.semantics, "reference-clade-evidence-not-lifetime-gate");
  assert.equal(prior.traits.organization.status, "unknown");
  assert.equal(prior.traits.growthPattern.status, "supported");
  assert.equal(prior.operators["surface-expansion"].status, "unknown");
  assert.equal(prior.operators["branch-axis"].status, "supported");
  if (prior.operators["branch-axis"].status === "supported")
    assert.equal(prior.operators["branch-axis"].sources[0].provenance, "fictional");
  if (prior.operators["tip-extension"].status === "supported")
    assert.equal(prior.operators["tip-extension"].sources[0].provenance, "scientific");
  const expression = expressGenotype(genome.genotype, prior);
  assert.deepEqual(expression.channels, genome.genotype.channels,
    "categorical biological priors do not justify numeric clamping");
  const signals = compileDevelopmentGeneticSignals(expression);
  assert.equal(signals.operators["branch-axis"].potential, expression.channels.branching.initiation);
  assert.equal(signals.operators["surface-expansion"].evidence.status, "unknown");
  assert.deepEqual(
    Object.keys(DEVELOPMENT_CONSUMERS).sort(), Object.keys(DEVELOPMENTAL_CHANNELS).sort());
  for (const group of Object.keys(DEVELOPMENTAL_CHANNELS) as (keyof typeof DEVELOPMENTAL_CHANNELS)[])
    assert.deepEqual(
      Object.keys(DEVELOPMENT_CONSUMERS[group]).sort(),
      Object.keys(DEVELOPMENTAL_CHANNELS[group]).sort(),
    );
  const first = expressEnvironmentalResponse(
    expression, { nutrition: 1, activity: 1, threat: 0 }, 20);
  const second = expressEnvironmentalResponse(
    expression, { nutrition: 0, activity: 0, threat: 1 }, 20);
  assert.ok(first.effectiveGrowthRate >= second.effectiveGrowthRate);
  assert.ok(first.effectiveSupport >= second.effectiveSupport);
  assert.equal(JSON.stringify(genome), before);
  assert.throws(() => adaptDevelopmentPrior({
    ...fixturePrior(),
    operatorHints: [{ operator: "tip-extension", introducedBy: "ncbi:3193",
      provenance: "scientific", evidenceUrl: "" }],
  }), /Unverified prior operator/);
});


test("[GEN-001/A2] merged PHY-002 animal, plant, fungal and fictional priors integrate without altering a pet", () => {
  const genome = compileGenome("REAL-PHYLOGENY-WITNESS");
  const before = JSON.stringify(genome);
  const references = [
    ["ott691846", "animal"],
    ["ncbi:3193", "land plant"],
    ["ncbi:4751", "fungus"],
  ] as const;
  for (const [id, label] of references) {
    const source = resolveBiologicalConstraints(id);
    assert.ok(source, "Missing real ancestry data for " + label);
    assert.equal(source.taxonId, id);
    assert.equal(source.includesFiction, false);
    assert.equal(source.semantics, "reference-clade-evidence-not-lifetime-gate");
    const adapted = adaptDevelopmentPrior(source);
    assert.equal(adapted.lineageNodeId, id);
    assert.equal(adapted.includesFiction, false);
    assert.equal(adapted.priorVersion, source.version);
    const genes = expressGenotype(genome.genotype, adapted);
    assert.deepEqual(genes.channels, genome.genotype.channels);
    assert.equal(genes.lineage?.semantics, "reference-clade-evidence-not-lifetime-gate");
    assert.ok(Object.values(adapted.traits).every(item =>
      item.status === "unknown" || item.status === "supported"));
    assert.ok(Object.values(adapted.operators).every(item =>
      item.status === "unknown" || item.status === "supported"));
    for (const hint of source.operatorHints) {
      const evidence = adapted.operators[hint.operator];
      assert.equal(evidence.status, "supported", label + ": " + hint.operator);
      if (evidence.status === "supported")
        assert.ok(evidence.sources.some(item =>
          item.introducedBy === hint.introducedBy &&
          item.provenance === hint.provenance &&
          item.evidenceUrl === hint.evidenceUrl));
    }
  }
  const tree = createPhylogenyView([{
    id: "fiction:genic-branch",
    parentId: "ncbi:3193",
    name: "Fictional growth inspiration",
    rationale: "Test fictional provenance in a single-pet developmental path",
    operatorHints: ["appendage-extension"],
  }]);
  const imaginary = tree.resolveBiologicalConstraints("fiction:genic-branch");
  assert.ok(imaginary);
  assert.equal(imaginary.includesFiction, true);
  const fiction = adaptDevelopmentPrior(imaginary);
  assert.equal(fiction.includesFiction, true);
  const fictionalHint = fiction.operators["appendage-extension"];
  assert.equal(fictionalHint.status, "supported");
  if (fictionalHint.status === "supported")
    assert.ok(fictionalHint.sources.some(item =>
      item.provenance === "fictional" &&
      item.introducedBy === "fiction:genic-branch"));
  assert.deepEqual(expressGenotype(genome.genotype, fiction).channels, genome.genotype.channels);
  // The same pet can explore cross-clade anatomical inspirations.
  const possibilities = developmentalPossibilities("ncbi:3193", [
    "ncbi:3193", "ott691846", "ncbi:4751",
  ]);
  assert.ok(possibilities);
  assert.deepEqual(possibilities.possibilities.map(item => item.referenceId),
    ["ncbi:3193", "ott691846", "ncbi:4751"]);
  assert.ok(possibilities.possibilities.every(item =>
    item.availability === "reference-only-not-a-lifetime-permission-gate"));
  assert.equal(possibilities.fixedBirthReferenceLineage[0], "ncbi:3193");
  assert.equal(JSON.stringify(genome), before,
    "Biological inspiration never rewrites the pet's inherited genome");
});
