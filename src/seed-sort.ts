/**
 * Seeded Fisher-Yates and stable base-four LSD radix sort, matching the
 * Optional seed-visualizer presentation only. It does not assign anatomy,
 * interpret the readable A-Z genetic code, or consume the pet's random state.
 * Current seed semantics: src/genetics/seed-language.ts.
 * This is a separate stream: visualizing the seed never consumes pet randomness.
 */
export type SeedSortEvent =
  | { type: "access"; index: number; value: number; accesses: number }
  | { type: "write"; index: number; value: number; accesses: number }
  | { type: "markers"; indexes: number[]; accesses: number }
  | { type: "pass"; digit: number; accesses: number }
  | { type: "complete"; accesses: number };

export type SeedSortFrame = {
  values: readonly number[];
  activeIndex: number;
  markers: readonly number[];
  accesses: number;
  pass: number;
  complete: boolean;
  operation: "ready" | SeedSortEvent["type"];
};

/** FNV-1a over UTF-8, including the order of every character in the seed. */
export function hashSortSeed(text: string): number {
  let hash = 2166136261;
  const byte = (value: number) => {
    hash = Math.imul(hash ^ value, 16777619) >>> 0;
  };
  for (const character of text) {
    const value = character.codePointAt(0)!;
    if (value < 0x80) byte(value);
    else if (value < 0x800) {
      byte(0xc0 | (value >> 6));
      byte(0x80 | (value & 0x3f));
    } else if (value >= 0xd800 && value <= 0xdfff) {
      // Match UTF-8 TextEncoder's replacement for an unpaired surrogate.
      byte(0xef);
      byte(0xbf);
      byte(0xbd);
    } else if (value < 0x10000) {
      byte(0xe0 | (value >> 12));
      byte(0x80 | ((value >> 6) & 0x3f));
      byte(0x80 | (value & 0x3f));
    } else {
      byte(0xf0 | (value >> 18));
      byte(0x80 | ((value >> 12) & 0x3f));
      byte(0x80 | ((value >> 6) & 0x3f));
      byte(0x80 | (value & 0x3f));
    }
  }
  return hash || 1;
}

export function createSeedSortValues(seed: string, count = 64): number[] {
  if (!Number.isInteger(count) || count < 1 || count > 256)
    throw new RangeError("Seed sort size must be an integer from 1 to 256.");
  const values = Array.from({ length: count }, (_, index) => index + 1);
  let state = hashSortSeed(seed);
  const random = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  for (let index = count - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [values[index], values[other]] = [values[other], values[index]];
  }
  return values;
}

/** Actual array reads, bucket boundaries, writes and completed digit passes. */
export function seedRadixSortEvents(initial: readonly number[], radix = 4) {
  if (!Number.isInteger(radix) || radix < 2 || radix > 16)
    throw new RangeError("Radix must be an integer from 2 to 16.");
  if (initial.some((value) => !Number.isSafeInteger(value) || value < 0))
    throw new RangeError("Radix values must be non-negative safe integers.");
  const values = [...initial];
  const events: SeedSortEvent[] = [];
  const maximum = Math.max(0, ...values);
  let accesses = 0;
  let digit = 0;
  for (let divisor = 1; Math.floor(maximum / divisor) > 0; divisor *= radix) {
    const buckets = Array.from({ length: radix }, () => [] as number[]);
    for (let index = 0; index < values.length; index += 1) {
      const value = values[index];
      events.push({ type: "access", index, value, accesses: ++accesses });
      buckets[Math.floor(value / divisor) % radix].push(value);
    }
    let cursor = 0;
    const indexes: number[] = [];
    for (const bucket of buckets) {
      indexes.push(cursor);
      events.push({ type: "markers", indexes: [...indexes], accesses });
      for (const value of bucket) {
        values[cursor] = value;
        events.push({
          type: "write",
          index: cursor++,
          value,
          accesses: ++accesses,
        });
      }
    }
    events.push({ type: "pass", digit: digit++, accesses });
  }
  events.push({ type: "markers", indexes: [], accesses });
  events.push({ type: "complete", accesses });
  return { values, events };
}

export function createSeedSortTimeline(seed: string, count = 64) {
  const initial = createSeedSortValues(seed, count);
  const { events, values: sorted } = seedRadixSortEvents(initial);
  let values: readonly number[] = initial;
  let activeIndex = -1;
  let markers: readonly number[] = [];
  let pass = 0;
  const frames: SeedSortFrame[] = [
    {
      values,
      activeIndex,
      markers,
      accesses: 0,
      pass,
      complete: false,
      operation: "ready",
    },
  ];
  for (const event of events) {
    if (event.type === "access") activeIndex = event.index;
    else if (event.type === "write") {
      const next = [...values];
      next[event.index] = event.value;
      values = next;
      activeIndex = event.index;
    } else if (event.type === "markers") markers = event.indexes;
    else if (event.type === "pass") {
      pass = event.digit + 1;
      activeIndex = -1;
    } else if (event.type === "complete") {
      activeIndex = -1;
      markers = [];
    }
    frames.push({
      values,
      activeIndex,
      markers,
      accesses: event.accesses,
      pass,
      complete: event.type === "complete",
      operation: event.type,
    });
  }
  return {
    fingerprint: hashSortSeed(seed).toString(16).padStart(8, "0").toUpperCase(),
    initial,
    sorted,
    events,
    frames,
  };
}
