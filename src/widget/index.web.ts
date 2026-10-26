import type { Pixel } from "../simulation";
import type { WidgetFrame, WidgetPublishResult } from "./types";

export type { WidgetFrame, WidgetPublishResult } from "./types";

export async function publishWidget(
  _pixels: Pixel[],
  _name: string,
  _age: number,
  _futureFrames: WidgetFrame[] = [],
): Promise<WidgetPublishResult> {
  return {
    supported: false,
    message:
      "The Home Screen widget is available in the iOS development build. This preview shows the same pet pixels.",
  };
}
