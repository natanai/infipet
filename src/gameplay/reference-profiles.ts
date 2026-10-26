import { NATIVE_P1_PROFILE } from "./native-p1";

/** Internal reference data; these profiles are not separate player modes. */
export const REFERENCE_PROFILES = Object.freeze({
  digitalMonster1997V1: {
    id: "digital-monster-1997-international-v1",
    source:
      "https://wikimon.net/index.php?title=Digital_Monster_Ver._1&oldid=649680",
    status: "secondary-source-transcription; hardware trace unverified",
    callMinutes: 20,
    initialStageMinutes: 60,
    trainingCountsOnStart: true,
    adultCounterReset: true,
    finalBattleWindow: 15,
    finalWinsRequired: 12,
    finalGateStatus:
      "provisional: source chart also describes Perfect requirements as uncertain",
  },
  tamagotchi1997P1: {
    nativeProfile: NATIVE_P1_PROFILE,
    id: "tamagotchi-vintage-international-p1",
    source: "https://members.tripod.com/~Tamagotchi_Central/instructions.html",
    status:
      "transcription of Bandai instructions; original hardware trace unverified",
    game: "direction",
    rounds: 5,
    winsForHeart: 3,
    weightLoss: 1,
  },
  tamagotchi1997P2: {
    id: "tamagotchi-vintage-international-p2",
    source: "https://tamagotchi.fandom.com/wiki/Tamagotchi_(1996_Pet)",
    status:
      "secondary-source vintage behavior; not the modern 3-round rerelease manual",
    game: "numbers",
    rounds: 5,
    winsForHeart: 3,
    firstNumber: 5,
    minimumNumber: 1,
    maximumNumber: 9,
    chainedNumbers: true,
    tiePolicy:
      "exclude equal numbers (Infipet default; original tie behavior unverified)",
  },
});
export const V1_BRANCH_SLOTS = Object.freeze([
  { id: "agumon", from: "koromon", care: [0, 3] },
  { id: "betamon", from: "koromon", care: [4, Infinity] },
  { id: "greymon", from: "agumon", care: [0, 3], training: [32, Infinity] },
  { id: "devimon", from: "agumon", care: [0, 3], training: [0, 31] },
  {
    id: "tyranomon",
    from: "agumon",
    care: [4, Infinity],
    training: [5, 15],
    overfeeds: [3, Infinity],
    sleep: [0, 4],
  },
  {
    id: "meramon",
    from: "agumon",
    care: [4, Infinity],
    training: [16, Infinity],
    overfeeds: [3, Infinity],
    sleep: [0, 6],
  },
  { id: "devimon", from: "betamon", care: [0, 3], training: [48, Infinity] },
  { id: "meramon", from: "betamon", care: [0, 3], training: [0, 47] },
  {
    id: "airdramon",
    from: "betamon",
    care: [4, Infinity],
    training: [8, 31],
    overfeeds: [0, 3],
    sleep: [9, Infinity],
  },
  {
    id: "seadramon",
    from: "betamon",
    care: [4, Infinity],
    training: [8, 31],
    overfeeds: [4, Infinity],
    sleep: [0, 8],
  },
]);
type Metrics = {
  careMistakes: number;
  training: number;
  overfeeds: number;
  sleepDisturbances: number;
};
export function selectV1Branch(
  stage: string,
  previous: string | undefined,
  metrics: Metrics,
): string {
  if (stage === "hatchling") return "botamon";
  if (stage === "infant") return "koromon";
  if (stage === "advanced")
    return ["greymon", "devimon", "airdramon"].includes(previous ?? "")
      ? "metal-greymon"
      : previous === "numemon"
        ? "monzaemon"
        : "mamemon";
  const between = (value: number, range?: readonly number[]) =>
    !range || (value >= range[0] && value <= range[1]);
  const match = V1_BRANCH_SLOTS.find(
    (slot) =>
      slot.from === previous &&
      between(metrics.careMistakes, slot.care) &&
      between(
        metrics.training,
        "training" in slot ? slot.training : undefined,
      ) &&
      between(
        metrics.overfeeds,
        "overfeeds" in slot ? slot.overfeeds : undefined,
      ) &&
      between(
        metrics.sleepDisturbances,
        "sleep" in slot ? slot.sleep : undefined,
      ),
  );
  return (
    match?.id ??
    (stage === "juvenile"
      ? metrics.careMistakes < 4
        ? "agumon"
        : "betamon"
      : "numemon")
  );
}
