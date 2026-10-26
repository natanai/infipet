import test from "node:test";
import assert from "node:assert/strict";
import {
  compileGenome, compileLabGenome, genomeCacheKey,
  geneRandom, materialGene,
} from "../src/simulation/genome";
import {
  DEVELOPMENTAL_CHANNELS, DEVELOPMENT_CONSUMERS,
  adaptDevelopmentPrior, expressGenotype,
  expressEnvironmentalResponse, compileDevelopmentGeneticSignals,
  type ProposedDevelopmentPrior,
} from "../src/genetics";

/** Mirrors PR #7's proposed categorical DevelopmentPrior. Not scientific fixture data. */
function fixturePrior(): ProposedDevelopmentPrior {
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
