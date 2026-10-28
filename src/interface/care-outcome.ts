import type { GameCommand, GameState } from "../gameplay";

/** Pure presentation adapter: no care mutation, no guessed rewards.
 * A native acceptance receipt only says that the command was processed; the
 * chronological event ID and changed authoritative state determine its meaning.
 */
export type CareResult =
  | "effective" | "partial" | "refused" | "missed"
  | "rejected" | "no-change" | "unresolved";
export type CareOutcome = Readonly<{
  command: GameCommand["type"];
  result: CareResult;
  description: string;
  eventId: string | null;
}>;
export function careOutcome(
  before: GameState,
  after: GameState,
  command: GameCommand,
): CareOutcome {
  const receipt = after.commandHistory.at(-1);
  const eventId = after.history.at(-1)?.event ?? null;
  const output = (result: CareResult, description: string): CareOutcome =>
    ({ command: command.type, result, description, eventId });
  if (!receipt || !receipt.accepted) return output("rejected", "The action could not be completed.");
  if (command.type === "feed") {
    if (eventId === "refusal") return output("refused", "Your pet declined the food.");
    if (eventId === "meal" && command.food === "meal" &&
        after.stats.meals === before.stats.meals + 1)
      return output("effective", "A meal was eaten.");
    if (eventId === "snack" && command.food === "snack" &&
        after.stats.snacks === before.stats.snacks + 1)
      return output("effective", "A snack was accepted.");
    if (eventId === "protein" && command.food === "protein" &&
        after.meters.weight === before.meters.weight + 2)
      return output("effective", "Protein was accepted.");
    return output("unresolved", "Food outcome could not be verified.");
  }
  if (command.type === "medicine") {
    if (eventId === "medicine-refusal") return output("refused", "Your pet did not need medicine.");
    if (eventId !== "medicine") return output("unresolved", "Treatment outcome could not be verified.");
    if (before.health.sickness > after.health.sickness) {
      if (after.health.sickness > 0) return output("partial", "Treatment helped; sickness remains.");
      return output("effective", "Sickness was treated.");
    }
    if (before.health.injury > after.health.injury) return output("effective", "An injury was treated.");
    return output("unresolved", "No verified treatment change.");
  }
  if (command.type === "clean") {
    if (eventId !== "clean" || after.waste !== 0) return output("unresolved", "Cleaning could not be verified.");
    return before.waste > 0
      ? output("effective", "Visible waste was cleared.")
      : output("no-change", "The habitat was already clean.");
  }
  if (command.type === "lights") {
    return eventId === "lights" && after.lightsOn === command.on
      ? output("effective", command.on ? "Lights on." : "Lights off; sleep is not assumed.")
      : output("unresolved", "Light change could not be verified.");
  }
  if (command.type === "discipline") {
    return eventId === "discipline"
      ? output("effective", "A real discipline call was answered.")
      : eventId === "discipline-mistake"
        ? output("missed", "There was no discipline call.")
        : output("unresolved", "Discipline outcome could not be verified.");
  }
  if (command.type === "start-game") {
    if (eventId === "refusal") return output("refused", "Your pet declined the game.");
    return eventId === "game-start" && !!after.activity
      ? output("effective", "The game started.")
      : output("unresolved", "Game start could not be verified.");
  }
  return output("no-change", "Action recorded; see the actual game result.");
}
