/**
 * Seeded, bounded deterministic chaos for *expression*, not for creating
 * creature templates. We use the discrete Arnold cat map on an integer torus:
 *
 * [x_(n+1)]   [2 1] [x_n]  (mod p)
 * [y_(n+1)] = [1 1] [y_n]  (mod p)
 *
 * The real torus automorphism is hyperbolic (largest eigenvalue
 * (3 + sqrt(5))/2 > 1), hence chaotic. The finite implementation is a
 * reversible permutation, necessarily periodic; no infinite novelty claim.
 *
 * p=65521, so the largest intermediate is 3*(p-1)=196560 < 2^53.
 * Every recurrence step is exact in JavaScript Number arithmetic. Conversion
 * to angles/growth rates is intentionally floating point and bounded.
 * An operator's chronological expression is evaluated from birth, never
 * from the previous frame or a mutable PRNG.
 */
import { hash } from "../simulation/model";

export const CHAOS_MODULUS = 65521 as const;
export const CHAOS_MAX_TICK = 8192 as const;
export const CHAOS_VERSION = "cat-torus-1" as const;

export type ChaosState = Readonly<{ x: number; y: number }>;

export type MaterialChaos = Readonly<{
  version: typeof CHAOS_VERSION;
  initial: ChaosState;
  /** Rate at hour n is 1 + amplitude*(2*x_n/(p-1)-1), in [0.6, 1.4]. */
  rateAmplitude: number;
  /** Directional perturbation at geometric growth step n, in radians. */
  turnAmplitude: number;
}>;

function validState(state: ChaosState): void {
  if (!state || !Number.isSafeInteger(state.x) ||
      !Number.isSafeInteger(state.y) ||
      state.x < 0 || state.y < 0 ||
      state.x >= CHAOS_MODULUS || state.y >= CHAOS_MODULUS)
    throw new RangeError("Chaos state must be a pair of torus integers");
}

export function seedChaos(identity: string): ChaosState {
  if (!identity) throw new TypeError("Chaos birth identity cannot be empty");
  // The full birth genome identity, the original ink geometry and operator ID
  // are supplied by the material compiler; never frame order or care from
  // after the evaluation hour.
  return {
    x: 1 + hash("chaos/x/" + identity) % (CHAOS_MODULUS - 1),
    y: 1 + hash("chaos/y/" + identity) % (CHAOS_MODULUS - 1),
  };
}

export function stepChaos(state: ChaosState): ChaosState {
  validState(state);
  return {
    x: (2 * state.x + state.y) % CHAOS_MODULUS,
    y: (state.x + state.y) % CHAOS_MODULUS,
  };
}

/** Analytic inverse (determinant exactly one): [[1,-1],[-1,2]]. */
export function reverseChaos(state: ChaosState): ChaosState {
  validState(state);
  return {
    x: (state.x - state.y + CHAOS_MODULUS) % CHAOS_MODULUS,
    y: (-state.x + 2 * state.y + CHAOS_MODULUS) % CHAOS_MODULUS,
  };
}

export function chaosAt(initial: ChaosState, tick: number): ChaosState {
  validState(initial);
  if (!Number.isSafeInteger(tick) || tick < 0 || tick > CHAOS_MAX_TICK)
    throw new RangeError("Chaos tick must be a bounded nonnegative integer");
  let current = initial;
  for (let i = 0; i < tick; i++) current = stepChaos(current);
  return current;
}

export function validateMaterialChaos(value: MaterialChaos): void {
  if (!value || value.version !== CHAOS_VERSION)
    throw new TypeError("Unrecognized material chaos recurrence");
  validState(value.initial);
  if (!Number.isFinite(value.rateAmplitude) ||
      value.rateAmplitude < 0 || value.rateAmplitude > 0.4 ||
      !Number.isFinite(value.turnAmplitude) ||
      value.turnAmplitude < 0 || value.turnAmplitude > 0.6)
    throw new RangeError("Chaotic expression exceeds numerical bounds");
}

/**
 * Exact chronology: stepwise-constant rate on each hour [n,n+1).
 * g(t) = min(1, (1/duration) * integral_start^min(t,start+duration)
 *              (1 + a*(2*x_floor(u)/(p-1)-1)) du).
 *
 * Each segment is integrated by its exact overlap length, never a frame step.
 * All rates are >=0.6, so g is causal, continuous and non-decreasing.
 * This independently composable factor multiplies the care-expression mean.
 */
export function chaoticProgress(
  chaos: MaterialChaos,
  startHour: number,
  durationHours: number,
  atHour: number,
): number {
  validateMaterialChaos(chaos);
  if (![startHour, durationHours, atHour].every(Number.isFinite) ||
      startHour < 0 || durationHours <= 0 || atHour < 0 ||
      startHour + durationHours > CHAOS_MAX_TICK)
    throw new RangeError("Invalid chaotic operator time domain");
  const end = Math.min(atHour, startHour + durationHours);
  if (end <= startHour) return 0;
  let clock = startHour;
  let state = chaosAt(chaos.initial, Math.floor(startHour));
  let area = 0;
  while (clock < end) {
    const boundary = Math.min(end, Math.floor(clock) + 1);
    const signal = 2 * state.x / (CHAOS_MODULUS - 1) - 1;
    area += (boundary - clock) * (1 + chaos.rateAmplitude * signal);
    clock = boundary;
    if (clock < end) state = stepChaos(state);
  }
  return Math.min(1, Math.max(0, area / durationHours));
}

/**
 * The n-th new material cell samples a new chaotic state along its growth
 * axis. This is spatial steering, not a floating replacement sprite.
 */
export function chaoticTurn(chaos: MaterialChaos, tick: number): number {
  validateMaterialChaos(chaos);
  const state = chaosAt(chaos.initial, tick);
  return chaos.turnAmplitude *
    (2 * state.y / (CHAOS_MODULUS - 1) - 1);
}
