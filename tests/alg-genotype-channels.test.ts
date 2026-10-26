import test from "node:test";
import assert from "node:assert/strict";
import { compileGenome, geneRandom, materialGene } from "../src/simulation/genome";
import {
  DEVELOPMENTAL_CHANNELS,
  expressGenotype,
  expressEnvironmentalResponse,
  type AncestralTraitConstraints,
} from "../src/genetics";

function sampleBounds(): AncestralTraitConstraints {
  // Synthetic contract fixture, not an evidence-backed biological clade.
  return {
    schemaVersion: 1,
    lineageNodeId: "fixture:restricted-body-plan",
    provenance: "fictional",
    bounds: {
      growth: { elongation: { min: 0.15, max: 0.2 } },
      support: { rigidity: { min: 0.8, max: 0.9 } },
      pigmentation: { contrast: { min: 0.25, max: 0.3 } },
    },
  };
}

test("[GEN-001/A1] inherited genome is deterministic, alphanumeric-seed compatible and birth-only", () => {
  const a = compileGenome("Q9A-003X", "egg");
  assert.deepEqual(a, compileGenome("Q9A-003X", "egg"));
  assert.equal(a.version, 7);
  assert.equal(a.genotype.schemaVersion, 1);
  assert.equal(a.fingerprint, compileGenome("Q9A-003X", "egg", { growth: 0.1 }).fingerprint);
  assert.equal(a.pace, compileGenome("Q9A-003X", "egg", { growth: 0.1 }).pace);
  assert.notDeepEqual(a.genotype.channels, compileGenome("Q9A-003Y", "egg").genotype.channels);
  assert.equal(a.seed, "Q9A-003X");
  assert.equal(compileGenome("   ").seed, "little-world");
  assert.equal(geneRandom(a.fingerprint, "pace"), geneRandom(a.fingerprint, "pace"));
  assert.equal(materialGene(a, "pigment", 0.2, 0.2), materialGene(a, "pigment", 0.2, 0.2));
  // Compiler does not accept artwork, names, historical reference identities or care.
  assert.deepEqual(
    Object.keys(a.genotype.channels).sort(), Object.keys(DEVELOPMENTAL_CHANNELS).sort(),
  );
});

test("[GEN-001/A2] synthetic lineage ranges constrain growth, support and pigment without genetic mutation", () => {
  const genome = compileGenome("LINEAGE-WITNESS");
  const before = JSON.stringify(genome);
  const constraints = sampleBounds();
  const expression = expressGenotype(genome.genotype, constraints);
  for (const [group, trait, min, max] of [
    ["growth", "elongation", 0.15, 0.2],
    ["support", "rigidity", 0.8, 0.9],
    ["pigmentation", "contrast", 0.25, 0.3],
  ] as const) {
    const value = (expression.channels[group] as Record<string, number>)[trait];
    assert.ok(value >= min && value <= max, group + "." + trait + " not bounded: " + value);
  }
  assert.ok(expression.adjustments.length >= 2);
  assert.equal(expression.lineage?.nodeId, "fixture:restricted-body-plan");
  assert.equal(JSON.stringify(genome), before);
  assert.deepEqual(expressGenotype(genome.genotype).channels, genome.genotype.channels);
  assert.throws(() => expressGenotype(genome.genotype, {
    ...constraints, bounds: { growth: { elongation: { min: 0.8, max: 0.3 } } },
  }), /Invalid ancestral/);
  assert.throws(() => expressGenotype(genome.genotype, {
    schemaVersion: 1, lineageNodeId: "unresolved", provenance: "unresolved",
    bounds: constraints.bounds,
  }), /Unresolved ancestry/);
  const first = expressEnvironmentalResponse(
    expression, { nutrition: 1, activity: 1, threat: 0 }, 20,
  );
  const second = expressEnvironmentalResponse(
    expression, { nutrition: 0, activity: 0, threat: 1 }, 20,
  );
  assert.ok(first.effectiveGrowthRate >= second.effectiveGrowthRate);
  assert.ok(first.effectiveSupport >= second.effectiveSupport);
  assert.equal(JSON.stringify(genome), before);
});
