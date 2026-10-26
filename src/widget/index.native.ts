import Constants, { ExecutionEnvironment } from "expo-constants";
import { Platform } from "react-native";
import { WORLD_SIZE, type Pixel } from "../simulation";
import type {
  PetWidgetProps,
  WidgetFrame,
  WidgetPixelRun,
  WidgetPublishResult,
} from "./types";

export type { WidgetFrame, WidgetPublishResult } from "./types";

// Compress horizontal neighbors into one native view. A full world-width row
// of a single color costs one SwiftUI view, with identical pixels.
function makeProps(pixels: Pixel[], name: string, age: number): PetWidgetProps {
  const sorted = [...pixels].sort((a, b) => a.y - b.y || a.x - b.x);
  const runs: WidgetPixelRun[] = [];
  for (const pixel of sorted) {
    const previous = runs[runs.length - 1];
    if (
      previous &&
      previous.y === pixel.y &&
      previous.color === pixel.color &&
      previous.x + previous.width === pixel.x
    ) {
      previous.width += 1;
    } else {
      runs.push({ x: pixel.x, y: pixel.y, width: 1, color: pixel.color });
    }
  }
  return {
    name: name.trim().slice(0, 30) || "UNNAMED.EXE",
    age,
    gridSize: WORLD_SIZE,
    runs,
  };
}

export async function publishWidget(
  pixels: Pixel[],
  name: string,
  age: number,
  futureFrames: WidgetFrame[] = [],
): Promise<WidgetPublishResult> {
  if (Platform.OS !== "ios") {
    return {
      supported: false,
      message:
        "Home Screen widgets are available in the iOS development build.",
    };
  }
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
    return {
      supported: false,
      message:
        "Expo Go can preview your pet. Adding it to the Home Screen needs the iOS development build.",
    };
  }

  try {
    // Deliberately lazy: expo-widgets requires its native module as soon as it
    // loads. Importing PetWidget at module scope would break Expo Go startup.
    const widget = (require("./PetWidget") as typeof import("./PetWidget"))
      .default;
    const now = new Date();
    const scheduled = futureFrames
      .filter(
        (frame) => Number.isFinite(frame.date.getTime()) && frame.date > now,
      )
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .slice(0, 24);
    await widget.updateTimeline([
      { date: now, props: makeProps(pixels, name, age) },
      ...scheduled.map((frame) => ({
        date: frame.date,
        props: makeProps(frame.pixels, name, frame.age),
      })),
    ]);
    return {
      supported: true,
      message:
        "Widget updated. Long-press your iPhone Home Screen, choose Add Widget, then INFIPET.EXE. iOS chooses when scheduled changes appear.",
    };
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : "Widget extension unavailable";
    return {
      supported: false,
      message: `The widget needs an iOS build with the Infipet extension. ${detail}`,
    };
  }
}
