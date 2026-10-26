import { readFileSync } from "node:fs";
import type { PetPart } from "../../src/simulation/model";
/** Historical source artwork stays outside the player bundle and never follows the live catalog. */
export const HOUSEHOLD_PRESETS = JSON.parse(
  readFileSync(
    new URL("../../docs/audits/household-v1/sources.json", import.meta.url),
    "utf8",
  ),
) as { id: string; name: string; parts: PetPart[] }[];
export function clonePreset(id: string): PetPart[] {
  const p = HOUSEHOLD_PRESETS.find((p) => p.id === id);
  if (!p) throw new RangeError("Unknown frozen preset: " + id);
  return JSON.parse(JSON.stringify(p.parts));
}
