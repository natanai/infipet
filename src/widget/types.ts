import type { Pixel } from "../simulation";

export type WidgetPublishResult = {
  supported: boolean;
  message: string;
};

export type WidgetFrame = {
  date: Date;
  pixels: Pixel[];
  age: number;
};

export type WidgetPixelRun = {
  x: number;
  y: number;
  width: number;
  color: string;
};

export type PetWidgetProps = {
  name: string;
  age: number;
  gridSize: number;
  runs: WidgetPixelRun[];
};
