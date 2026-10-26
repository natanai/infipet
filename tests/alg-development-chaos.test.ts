import test from "node:test";
import assert from "node:assert/strict";
import {
  CHAOS_MAX_TICK, CHAOS_MODULUS, CHAOS_VERSION,
  chaosAt, chaoticProgress, chaoticTurn,
  seedChaos, reverseChaos, stepChaos, type MaterialChaos, type ChaosState,
} from "../src/development/chaos";
import {
  compileMaterialDevelopment, materialDevelopmentAt, applyMaterialOperators,
  materialSourceAncestry, type MaterialOperator,
} from "../src/development";
import { drawing, fixtures, materialInputs } from "./alg-development-fixtures";
import { compileLabGenome } from "../src/simulation/genome";

const P = BigInt(CHAOS_MODULUS);

/**
 * Independent exact BigInt reference calculation. It intentionally does not
 * reuse stepChaos, chaoticProgress or any material-operator implementation.
 */
function referenceState(start: ChaosState, n: number): ChaosState {
  let a = BigInt(start.x), b = BigInt(start.y);
  for (let k = 0; k < n; k++) {
    const nextA = (2n * a + b) % P;
    b = (a + b) % P;
    a = nextA;
  }
  return { x: Number(a), y: Number(b) };
}

function referenceIntegral(
  initial: ChaosState,
  amp: number,
  start: number,
  duration: number,
  queried: number,
): number {
  const end = Math.min(queried, start + duration);
  let integral = 0;
  // Integral of stepwise-constant rate over exact hourly intersections.
  for (let hour = Math.floor(start); hour <= Math.floor(end); hour++) {
    const overlap = Math.max(0,
      Math.min(end, hour + 1) - Math.max(start, hour));
    if (overlap <= 0) continue;
    const x = referenceState(initial, hour).x;
    integral += overlap * (1 + amp * (2 * x / (CHAOS_MODULUS - 1) - 1));
  }
  return Math.min(1, Math.max(0, integral / duration));
}

function dynamics(state: ChaosState, a=0.32, turn=0.42): MaterialChaos {
  return {
    version: CHAOS_VERSION, initial: state,
    rateAmplitude: a, turnAmplitude: turn,
  };
}

test("[CHAOS/A1] exact cat-map dynamics match a wholly independent modular reference", () => {
  const expected = [
    [1, 1], [3, 2], [8, 5], [21, 13], [55, 34], [144, 89],
  ];
  for (let i = 0; i < expected.length; i++)
    assert.deepEqual(chaosAt({ x: 1, y: 1 }, i), {
      x: expected[i][0], y: expected[i][1],
    });
  for (let i = 0; i < 45; i++) {
    const start = seedChaos("arbitrary-ink/genome/" + i);
    for (const n of [0, 1, 2, 13, 177, 499, 2048]) {
      const state = chaosAt(start, n);
      assert.deepEqual(state, referenceState(start, n));
      assert.ok(state.x >= 0 && state.x < CHAOS_MODULUS);
      assert.ok(state.y >= 0 && state.y < CHAOS_MODULUS);
      // det([[2,1],[1,1]])=1 mod p, so even finite-state dynamics
      // conserve information and are reversible, not a snapshot RNG.
      assert.deepEqual(reverseChaos(stepChaos(state)), state);
      assert.deepEqual(stepChaos(reverseChaos(state)), state);
    }
  }
  assert.deepEqual(reverseChaos({ x: 0, y: 0 }), { x: 0, y: 0 });
  assert.throws(() => chaosAt({ x: 1, y: 1 }, CHAOS_MAX_TICK + 1), /bounded/);
  assert.throws(() => stepChaos({ x: -1, y: 1 }), /torus/);
  assert.throws(() => chaoticTurn(dynamics({ x: 1, y: 1 }, 0.5), 1), /bounds/);
});

test("[CHAOS/A2] hourly chaotic growth obeys independent integration, positive bounded rate and chronological causality", () => {
  for (const seed of ["single-pixel", "ring", "fork", "empty", "fantasy"]) {
    const chaos = dynamics(seedChaos(seed));
    for (const [start, duration] of [[0, 9], [10.25, 25], [40.5, 42.75], [110, 80]]) {
      let prior = 0;
      for (const elapsed of [0, 0.25, 1, 3.5, 8, 15, 24, 38, 51, 79, 190]) {
        const now = start + Math.min(duration, elapsed);
        const actual = chaoticProgress(chaos, start, duration, now);
        const derived = referenceIntegral(chaos.initial,
          chaos.rateAmplitude, start, duration, now);
        assert.ok(Math.abs(actual - derived) < 1e-12,
          `independent integral disagreement at ${seed} / ${start} / ${now}`);
        assert.ok(actual >= prior - 1e-13,
          "Positive rate cannot erase chronological accumulated growth");
        assert.ok(actual >= 0 && actual <= 1);
        prior = actual;
      }
      const noChaos = dynamics(chaos.initial, 0, 0);
      assert.ok(Math.abs(
        chaoticProgress(noChaos, start, duration, start + duration * 0.37)
        - 0.37,
      ) < 1e-12);
      assert.equal(chaoticProgress(chaos, start, duration, start), 0);
      assert.equal(chaoticProgress(chaos, start, duration, start + duration + 100), 
        chaoticProgress(chaos, start, duration, start + duration));
    }
  }
  assert.throws(() => chaoticProgress(dynamics({x:1,y:1}), 8190, 50, 8200),
    /time domain/);
});

test("[CHAOS/A3] a known source-tip growth path is predicted by the independent recurrence, not a snapshot", () => {
  const { atlas, genome } = materialInputs(drawing(["..###..."], "body"));
  const compiled = compileMaterialDevelopment(atlas, genome);
  const tissue = compiled.source.tissues[0];
  const op: MaterialOperator = {
    id: "known-source-path", tissueId: tissue.id,
    kind: "elongate", direction: {x: 1, y: 0},
    atHour: 0, durationHours: 10, strength: 1,
    chaos: dynamics({ x: 1, y: 1 }, 0, 0.6),
  };
  const produced = applyMaterialOperators(compiled.source,
    [op], 100, compiled.signals);
  const growth = produced.cells.filter(c => c.operationId === op.id);
  assert.ok(growth.length >= 2);
  const endpoint = [...compiled.source.sourceCells]
    .sort((a,b) => b.x - a.x || a.id.localeCompare(b.id))[0];
  let x = endpoint.x, y = endpoint.y;
  const expected: string[] = [];
  for (let i = 0; i < growth.length; i++) {
    const state = referenceState(op.chaos!.initial, i);
    const turn = 0.6 * (2 * state.y / (CHAOS_MODULUS - 1) - 1);
    x += Math.cos(turn); y += Math.sin(turn);
    expected.push(Math.round(x) + "," + Math.round(y));
  }
  assert.deepEqual(growth.map(c => c.x + "," + c.y), expected);
  assert.ok(growth.every(c => materialSourceAncestry(produced, c.id).length));
  assert.deepEqual(produced.sourceCells, compiled.source.sourceCells);
  // The same independent specimen without chaos follows its original axis.
  const legacy = applyMaterialOperators(compiled.source,
    [{ ...op, chaos: undefined }], 100, compiled.signals);
  assert.ok(legacy.cells.filter(c => c.operationId === op.id).every(
    c => c.y === endpoint.y));
});

test("[CHAOS/A4] diverse ordinary seeds generate reproducible physical paths without invented material, and care-independent birth", () => {
  for (const shape of [fixtures.blob, fixtures.branching, fixtures.cavity,
    fixtures.fantasy, fixtures.disconnected, fixtures.empty]) {
    for (const seed of ["CHAOS-00", "CHAOS-01", "CHAOS-02"]) {
      const { atlas, genome } = materialInputs(shape, seed);
      const program = compileMaterialDevelopment(atlas, genome);
      const birth = materialDevelopmentAt(program, 0);
      assert.deepEqual(birth.cells, birth.sourceCells);
      assert.ok(program.operators.every(op => op.chaos?.version === CHAOS_VERSION));
      const earlier = materialDevelopmentAt(program, 35);
      const mature = materialDevelopmentAt(program, 240);
      assert.deepEqual(earlier, materialDevelopmentAt(program, 35));
      assert.deepEqual(mature, materialDevelopmentAt(
        compileMaterialDevelopment(atlas, genome), 240));
      assert.deepEqual(mature.sourceCells, birth.sourceCells);
      assert.ok(mature.cells.every(c =>
        c.sourceIds.length > 0 && materialSourceAncestry(mature, c.id).length > 0));
      assert.ok(mature.cells.every(c =>
        c.x >= 0 && c.y >= 0 && c.x < 64 && c.y < 64));
      assert.deepEqual(JSON.parse(JSON.stringify(mature)), mature);
    }
  }

  const base = materialInputs(fixtures.branching, "CHAOS-LAB-SENSITIVITY");
  const low = compileLabGenome("CHAOS-LAB-SENSITIVITY", "infant", { sensitivity: 0 });
  const high = compileLabGenome("CHAOS-LAB-SENSITIVITY", "infant", { sensitivity: 1 });
  const lowProgram = compileMaterialDevelopment(base.atlas, low);
  const highProgram = compileMaterialDevelopment(base.atlas, high);
  assert.deepEqual(lowProgram.operators, highProgram.operators,
    "changing only the care-sensitivity gene cannot silently reseed growth sites");
  assert.ok(lowProgram.operators.every(op =>
    op.chaos?.initial.x !== 0 || op.chaos?.initial.y !== 0));

  const initials = new Set<string>();
  const paths = new Set<string>();
  for (let n = 0; n < 12; n++) {
    const {atlas, genome} = materialInputs(fixtures.branching, "CAT-GROWTH-" + n);
    const program = compileMaterialDevelopment(atlas, genome);
    assert.ok(program.operators.length > 0);
    initials.add(JSON.stringify(program.operators[0].chaos!.initial));
    const grown = materialDevelopmentAt(program, 180);
    paths.add(grown.cells.map(c => c.x + "," + c.y).sort().join(";"));
  }
  assert.ok(initials.size >= 10, "birth-seeded chaos must not collapse into a small set of initial states");
  assert.ok(paths.size >= 5, "different seeds should express structural geometry, not only colors");
});
