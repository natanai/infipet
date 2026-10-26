import test from "node:test";
import assert from "node:assert/strict";
import { HOUR, advanceGame, commandGame, createGame } from "../src/gameplay";
import { createEnvironmentalHistory, compileCareDevelopmentSignals } from "../src/environment";
import { compileGenome, compileLabGenome } from "../src/simulation/genome";

const START = 12 * HOUR;
function sample(wellFed: boolean) {
  let s = createGame("GENE-CARE", "infant", START);
  for (let h = 1; h <= 6; h++) {
    s = advanceGame(s, START + h * HOUR);
    if (wellFed)
      s = commandGame(s, { type: "feed", food: "meal" },
        START + h * HOUR, "feeding-" + h);
  }
  return createEnvironmentalHistory(s).atHour(6);
}

test("[CARE-002/A1] same permanent genotype under different care has different noncosmetic operator availability", () => {
  const genotype = compileGenome("CONSTANT-GENOME", "infant").genotype;
  const before = JSON.stringify(genotype);
  const fed = compileCareDevelopmentSignals(genotype, sample(true));
  const hungry = compileCareDevelopmentSignals(genotype, sample(false));
  assert.equal(fed.genotypeFingerprint, hungry.genotypeFingerprint);
  assert.deepEqual(fed.genetic, hungry.genetic);
  assert.ok(fed.environmental.cumulative.nutritionDeficitDays <
    hungry.environmental.cumulative.nutritionDeficitDays);
  assert.ok(fed.reaction.effectiveGrowthRate > hungry.reaction.effectiveGrowthRate);
  assert.ok(fed.operators["tip-extension"].expressedPotential >
    hungry.operators["tip-extension"].expressedPotential);
  assert.ok(fed.operators["branch-axis"].expressedPotential >
    hungry.operators["branch-axis"].expressedPotential);
  assert.equal(fed.verifiedAnatomicalIntegration, false);
  assert.equal(JSON.stringify(genotype), before);
});

test("[CARE-002/A2] distinct genetic sensitivities react differently to identical lived pressures", () => {
  const a = compileLabGenome("NEIGHBOR", "infant", { sensitivity: 0.1 }).genotype;
  const b = compileLabGenome("NEIGHBOR", "infant", { sensitivity: 0.9 }).genotype;
  const aBefore = JSON.stringify(a), bBefore = JSON.stringify(b);
  const pressure = sample(false);
  const first = compileCareDevelopmentSignals(a, pressure);
  const second = compileCareDevelopmentSignals(b, pressure);
  assert.notEqual(first.genotypeFingerprint, second.genotypeFingerprint);
  assert.notEqual(first.reaction.effectiveGrowthRate, second.reaction.effectiveGrowthRate);
  assert.notEqual(first.operators["tip-extension"].expressedPotential,
    second.operators["tip-extension"].expressedPotential);
  assert.equal(JSON.stringify(a), aBefore);
  assert.equal(JSON.stringify(b), bBefore);
  assert.deepEqual(first, compileCareDevelopmentSignals(a, pressure));
});

test("[CARE-002/A2] genuine observed training, not arbitrary commands, changes activity channels", () => {
  let game = createGame("TRAIN-RESPONSE", "infant", START);
  const before = advanceGame(game, START + HOUR / 4);
  game = commandGame(before, { type: "start-game", game: "training" },
    START + HOUR / 4, "session");
  game = commandGame(game, { type: "cancel" }, START + HOUR / 4, "cancel");
  game = advanceGame(game, START + HOUR);
  const noTraining = advanceGame(before, START + HOUR);
  const trained = createEnvironmentalHistory(game).atHour(1);
  const untrained = createEnvironmentalHistory(noTraining).atHour(1);
  assert.equal(trained.cumulative.trainingSessions, 1);
  assert.equal(untrained.cumulative.trainingSessions, 0);
  assert.ok(trained.exposure.activity > untrained.exposure.activity);
  const genotype = compileGenome("STRENGTH-TRAIT", "infant").genotype;
  const x = compileCareDevelopmentSignals(genotype, trained);
  const y = compileCareDevelopmentSignals(genotype, untrained);
  assert.ok(x.operators["wall-deposition"].expressedPotential >
    y.operators["wall-deposition"].expressedPotential);
});
