// TypeScript and non-native tooling use this fallback. Metro selects the
// .native or .web implementation before this file on the matching platform.
export { publishWidget } from "./index.web";
export type { WidgetFrame, WidgetPublishResult } from "./types";
