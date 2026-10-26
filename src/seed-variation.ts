import type { PetSimulation, Pixel } from "./simulation";

const COMPARISON_DAYS = [30, 75, 120, 240] as const;
export const MIN_DEVELOPMENT_DIFFERENCE = 0.05;

/** Compare occupied cells, so a recolor alone cannot count as a new shape. */
export function silhouetteDifference(a: readonly Pixel[], b: readonly Pixel[]) {
  const left = new Set(a.map((p) => `${p.x},${p.y}`));
  const right = new Set(b.map((p) => `${p.x},${p.y}`));
  let intersection = 0;
  for (const cell of left) if (right.has(cell)) intersection++;
  const union = left.size + right.size - intersection;
  return union ? 1 - intersection / union : 0;
}

export function developmentDifference(a: PetSimulation, b: PetSimulation) {
  return Math.max(
    ...COMPARISON_DAYS.map((day) =>
      silhouetteDifference(
        a.frameAt(a.hatchAt + day).pixels,
        b.frameAt(b.hatchAt + day).pixels,
      ),
    ),
  );
}

/** Bounded search; callers provide randomness only to choose the next seed. */
export async function findSeedVariation({
  current,
  build,
  nextSeed,
  maxAttempts = 16,
}: {
  current: PetSimulation;
  build: (seed: string) => PetSimulation;
  nextSeed: () => string;
  maxAttempts?: number;
}) {
  const reference = COMPARISON_DAYS.map(
    (day) => current.frameAt(current.hatchAt + day).pixels,
  );
  let best = { seed: current.genome.seed, difference: 0, attempts: 0 };
  const seen = new Set([current.genome.seed]);
  for (let attempt = 1; attempt <= Math.min(16, maxAttempts); attempt++) {
    // Let the UI paint its busy state between candidates on mobile JS.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const seed = nextSeed();
    if (seen.has(seed)) continue;
    seen.add(seed);
    const candidate = build(seed);
    const difference = Math.max(
      ...COMPARISON_DAYS.map((day, i) =>
        silhouetteDifference(
          reference[i],
          candidate.frameAt(candidate.hatchAt + day).pixels,
        ),
      ),
    );
    if (best.seed === current.genome.seed || difference > best.difference)
      best = { seed, difference, attempts: attempt };
    if (difference >= MIN_DEVELOPMENT_DIFFERENCE)
      return { seed, difference, attempts: attempt, different: true };
  }
  return { ...best, different: false };
}

export function preserveDevelopmentalAge(
  age: number,
  previous: Pick<PetSimulation, "hatchAt">,
  next: Pick<PetSimulation, "hatchAt" | "maxAge">,
) {
  const nextAge =
    previous.hatchAt > 0 && age < previous.hatchAt
      ? (age / previous.hatchAt) * next.hatchAt
      : Math.max(0, age - previous.hatchAt) + next.hatchAt;
  // maxAge is the initial preview extent, not the end of the pet's life.
  return nextAge;
}
