/**
 * Independent original World P1 reference predicates. This module has no renderer,
 * reference image, seed, combined-game clock, or mutable randomness dependency.
 * Declared counters and awake minutes are reference inputs, not proof that real
 * player commands caused them. The native call scheduler still needs a replay.
 */
export const NATIVE_P1_PROFILE = Object.freeze({
  id: "tamagotchi-p1-world-5c864cb1",
  version: "native-p1-reference-v1",
  rulesVersion: "original-native-rules-v1",
  romSha1: "4b4979cf92dc9d2fb6d7295a38f209f3da144f72",
  romCrc32: "5c864cb1",
  romBytes: 12288,
  evidence:
    "hash-identified original World P1 disassembly; ordered tables decoded statically",
  source:
    "https://github.com/agg23/tamagotchi-disassembled/blob/master/tama.asm",
  nativeRules: "data/retro-reference/native-rules-v1.json",
  clock: "awake minutes; sleep pauses lifecycle countdown; sickness does not",
  elapsedCallWindowStatus:
    "14/15 and64/65 minute phase boundaries await independent traces",
  ordinaryCommandTraceVerified: false,
} as const);

export const NATIVE_P1_CHARACTERS = [
  "p1.egg",
  "p1.babytchi",
  "p1.marutchi",
  "p1.tamatchi",
  "p1.kuchitamatchi",
  "p1.mametchi",
  "p1.ginjirotchi",
  "p1.maskutchi",
  "p1.kuchipatchi",
  "p1.nyorotchi",
  "p1.tarakotchi",
  "p1.bill",
] as const;
export type NativeP1CharacterId = (typeof NATIVE_P1_CHARACTERS)[number];
export type NativeP1Counters = Readonly<{
  careMistakes: number;
  missedDisciplineCalls: number;
}>;
export type NativeP1Selection = Readonly<{
  characterId: NativeP1CharacterId;
  historyKind: number;
  sourceAddress: number;
  firstMatchOrder: number;
  rawThresholdByte: number;
  rawOutcomeByte: number;
}>;

// Exact paired bytes at D9C..DC5: care/missed minima, next-kind/character.
// Keep the raw bytes, including the otherwise easy-to-lose native history kind.
const TABLES = [
  { address: 0xd9c, bytes: [0x00, 0x21] },
  { address: 0xd9e, bytes: [0x33, 0x45, 0x03, 0x44, 0x30, 0x33, 0x00, 0x32] },
  {
    address: 0xda6,
    bytes: [
      0x43, 0xaf, 0x23, 0x9f, 0x03, 0x8f, 0x20, 0x7f, 0x10, 0x6f, 0x00, 0x5f,
    ],
  },
  { address: 0xdb2, bytes: [0x84, 0xaf, 0x04, 0x9f, 0x20, 0x76, 0x00, 0x6f] },
  { address: 0xdba, bytes: [0x30, 0xaf, 0x20, 0x9f, 0x00, 0x8f] },
  { address: 0xdc0, bytes: [0x60, 0xaf, 0x00, 0x9f] },
  { address: 0xdc4, bytes: [0x00, 0xbf] },
] as const;

const STAT_VECTORS = [
  { address: 0x1564, hex: "ff ff 03 04 2d c0 05 05 3c f0 80 11 00" },
  { address: 0x1571, hex: "09 14 32 3c de c3 10 99 64 65 80 11 00" },
  { address: 0x157e, hex: "09 15 4b 55 78 c6 20 99 ac 68 80 11 01" },
  { address: 0x158b, hex: "09 15 4b 55 94 c2 20 99 64 65 80 11 00" },
  { address: 0x1598, hex: "09 16 51 5b 3c 8f 30 99 ff ff 8f 11 01" },
  { address: 0x15a5, hex: "09 16 51 5b f8 8a 30 99 30 7c 88 11 01" },
  { address: 0x15b2, hex: "0b 17 37 41 20 8a 30 99 40 7b b0 23 01" },
  { address: 0x15bf, hex: "09 16 3c 46 92 c4 20 99 18 f6 5f 43 01" },
  { address: 0x15cc, hex: "09 16 3c 46 68 d1 10 99 0c 73 88 11 00" },
  { address: 0x15d9, hex: "0a 16 2d 32 94 c2 20 99 a0 75 80 11 01" },
] as const;

function nibble(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 0 || value > 15)
    throw new RangeError(`${name} must be an original 4-bit value`);
  return value;
}

function minutes(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new RangeError(`${name} must be non-negative integer minutes`);
  return value;
}

export function selectNativeP1Evolution(
  historyKind: number,
  counters: NativeP1Counters,
): NativeP1Selection | null {
  nibble(historyKind, "historyKind");
  nibble(counters.careMistakes, "careMistakes");
  nibble(counters.missedDisciplineCalls, "missedDisciplineCalls");
  if (historyKind === 15) return null; // Native terminal adult; expiry is not death.
  const table = TABLES[historyKind as keyof typeof TABLES] as
    (typeof TABLES)[number] | undefined;
  if (!table || typeof table !== "object" || !("bytes" in table))
    throw new RangeError(`Unresolved native history kind ${historyKind}`);
  for (let i = 0; i < table.bytes.length; i += 2) {
    const threshold = table.bytes[i];
    if (
      counters.careMistakes < (threshold & 15) ||
      counters.missedDisciplineCalls < threshold >> 4
    )
      continue;
    const outcome = table.bytes[i + 1];
    return {
      characterId: NATIVE_P1_CHARACTERS[outcome >> 4],
      historyKind: outcome & 15,
      sourceAddress: table.address + i,
      firstMatchOrder: i / 2,
      rawThresholdByte: threshold,
      rawOutcomeByte: outcome,
    };
  }
  throw new Error("Original P1 table has no fallback");
}

export function nativeP1Statistics(characterId: NativeP1CharacterId) {
  const index = NATIVE_P1_CHARACTERS.indexOf(characterId);
  if (index < 1) throw new RangeError("Egg has no active physiology vector");
  const vector = STAT_VECTORS[index === 11 ? 4 : index - 1];
  const raw = vector.hex.split(" ").map((part) => parseInt(part, 16));
  return {
    characterId,
    sourceAddress: vector.address,
    rawHex: vector.hex,
    wakeHour: raw[0] === 255 ? null : raw[0],
    sleepHour: raw[1] === 255 ? null : raw[1],
    hungerLossMinutes: raw[2],
    happinessLossMinutes: raw[3],
    sicknessCountdownMinutes: raw[4] + ((raw[5] & 15) << 8),
    medicineParameterNibble: raw[5] >> 4,
    minimumWeightBCD: raw[6],
    maximumWeightBCD: raw[7],
    lifecycleCountdownAwakeMinutes: raw[8] + ((raw[9] & 15) << 8),
    disciplineCountdownHeartLosses: raw[9] >> 4,
    initialDisciplineNibble: raw[10] & 15,
    gameLossCarryBiasNibble: raw[10] >> 4,
    gameWinInputDelayIterations: raw[11] & 15,
    gameLossInputDelayIterations: raw[11] >> 4,
    twoBiteMealFlag: Boolean(raw[12] & 1),
    // Preserve the full last byte instead of treating unknown bits as zero.
    rawMealFlagByte: raw[12],
    unassignedRam249Nibble: raw[12] >> 4,
  } as const;
}

export function nativeP1InitialDiscipline(
  characterId: NativeP1CharacterId,
  historyKind: number,
): number {
  nibble(historyKind, "historyKind");
  return historyKind === 2 || historyKind === 4
    ? 8
    : nativeP1Statistics(characterId).initialDisciplineNibble;
}

/** Boundary input is the native 4-bit counters; the display bar is independent. */
export function nativeP1Scold(
  displayDisciplineNibble: number,
  misbehaving: boolean,
): number {
  nibble(displayDisciplineNibble, "displayDisciplineNibble");
  return misbehaving
    ? Math.min(15, displayDisciplineNibble + 4)
    : displayDisciplineNibble;
}

/** Low-level expired-call events, not player commands or certified call timing. */
export function nativeP1CountExpiredCall(
  counters: NativeP1Counters,
  kind: "care" | "discipline",
  characterId: NativeP1CharacterId,
): NativeP1Counters {
  nibble(counters.careMistakes, "careMistakes");
  nibble(counters.missedDisciplineCalls, "missedDisciplineCalls");
  if (characterId === "p1.egg" || characterId === "p1.babytchi")
    return { ...counters };
  return {
    careMistakes: Math.min(
      15,
      counters.careMistakes + (kind === "care" ? 1 : 0),
    ),
    missedDisciplineCalls: Math.min(
      15,
      counters.missedDisciplineCalls + (kind === "discipline" ? 1 : 0),
    ),
  };
}

/** isAsleep must come from the native clock/nap scheduler, never a stage label. */
export function advanceNativeP1LifecycleCountdown(
  input: Readonly<{
    remainingAwakeMinutes: number;
    elapsedMinutes: number;
    isAsleep: boolean;
    isSick: boolean;
  }>,
) {
  minutes(input.remainingAwakeMinutes, "remainingAwakeMinutes");
  minutes(input.elapsedMinutes, "elapsedMinutes");
  const awake = input.isAsleep ? 0 : input.elapsedMinutes;
  return {
    elapsedChronologicalMinutes: input.elapsedMinutes,
    elapsedAwakeMinutes: awake,
    remainingAwakeMinutes: Math.max(0, input.remainingAwakeMinutes - awake),
    overflowAwakeMinutes: Math.max(0, awake - input.remainingAwakeMinutes),
    expired: input.remainingAwakeMinutes <= awake,
  };
}

export type NativeP1HistoryRoute = Readonly<{
  id: string;
  characters: readonly NativeP1CharacterId[];
  teenHistoryKind: number;
  adultHistoryKind: number;
  witnessCounters: Readonly<{
    atTeenCommit: NativeP1Counters;
    atAdultCommit: NativeP1Counters;
  }>;
  monotoneCounterReachable: true;
  ordinaryCommandTraceVerified: false;
}>;

/** Abstract complete histories. Call-opportunity and command replay remain separate gates. */
export function listNativeP1HistoryRoutes(): NativeP1HistoryRoute[] {
  const paths = new Map<
    string,
    { route: NativeP1HistoryRoute; score: readonly number[] }
  >();
  for (let cm1 = 0; cm1 < 16; cm1++)
    for (let dm1 = 0; dm1 < 16; dm1++) {
      const teen = selectNativeP1Evolution(1, {
        careMistakes: cm1,
        missedDisciplineCalls: dm1,
      })!;
      for (let cm2 = cm1; cm2 < 16; cm2++)
        for (let dm2 = dm1; dm2 < 16; dm2++) {
          const adult = selectNativeP1Evolution(teen.historyKind, {
            careMistakes: cm2,
            missedDisciplineCalls: dm2,
          })!;
          const key = `${teen.historyKind}.${adult.characterId}.${adult.historyKind}`;
          const score = [cm2 + dm2, cm1 + dm1, cm2, cm1];
          const previous = paths.get(key);
          const earlier =
            !previous ||
            score.some(
              (n, i) =>
                score.slice(0, i).every((v, j) => v === previous.score[j]) &&
                n < previous.score[i],
            );
          if (!earlier) continue;
          const characters: NativeP1CharacterId[] = [
            "p1.babytchi",
            "p1.marutchi",
            teen.characterId,
            adult.characterId,
          ];
          if (adult.historyKind === 6) characters.push("p1.bill");
          paths.set(key, {
            score,
            route: {
              id: `p1.kind-${teen.historyKind}.${adult.characterId.slice(3)}`,
              characters,
              teenHistoryKind: teen.historyKind,
              adultHistoryKind: adult.historyKind,
              witnessCounters: {
                atTeenCommit: { careMistakes: cm1, missedDisciplineCalls: dm1 },
                atAdultCommit: {
                  careMistakes: cm2,
                  missedDisciplineCalls: dm2,
                },
              },
              monotoneCounterReachable: true,
              ordinaryCommandTraceVerified: false,
            },
          });
        }
    }
  return [...paths.values()]
    .map((item) => item.route)
    .sort((a, b) => a.id.localeCompare(b.id, "en"));
}
