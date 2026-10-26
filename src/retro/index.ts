import { drawingFromMonochromeRows } from "../drawing-features";
import data from "./preset-data.json";
import type { PetPart } from "../simulation/model";

export const RETRO_DRAWING_VERSION = data.version;
export const RETRO_ROSTER: readonly {
  referenceId: string;
  deviceId: string;
  name: string;
  stage: string;
  root: boolean;
  available: boolean;
  referenceStatus?: string;
}[] = data.roster;
export type RetroDrawing = {
  referenceId: string;
  deviceId: string;
  name: string;
  stage: string;
  root: boolean;
  width: number;
  height: number;
  rows: string[];
  sourceUrl: string;
  referenceStatus?: string;
  seed: string;
  path: string[];
  startIndex: number;
};
export type RetroPreset = RetroDrawing & {
  id: string;
  mode: "infant";
  parts: PetPart[];
};

/** Source-only generic hints, shared with ordinary monochrome drawing import. */
export const drawingFromRows = drawingFromMonochromeRows;

export const RETRO_PRESETS: readonly RetroPreset[] = (
  data.drawings as RetroDrawing[]
).map((drawing) => ({
  ...drawing,
  id: `retro-${drawing.referenceId}`,
  mode: "infant",
  parts: drawingFromRows(drawing.rows),
}));
for (const preset of RETRO_PRESETS) {
  for (const part of preset.parts) {
    part.pixels.forEach(Object.freeze);
    Object.freeze(part.pixels);
    Object.freeze(part.position);
    Object.freeze(part);
  }
  Object.freeze(preset.parts);
  Object.freeze(preset.rows);
  Object.freeze(preset.path);
  Object.freeze(preset);
}
Object.freeze(RETRO_PRESETS);
export function cloneRetroPreset(id: string): PetPart[] {
  const preset = RETRO_PRESETS.find((p) => p.id === id || p.referenceId === id);
  if (!preset) throw new Error(`Unknown retro drawing: ${id}`);
  return preset.parts.map((part) => ({
    ...part,
    position: { ...part.position },
    pixels: part.pixels.map((pixel) => ({ ...pixel })),
  }));
}
