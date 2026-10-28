/** CSS-pixel geometry. The shell uses available INLINE width; the square alone is height-limited.
 * Inputs: finite viewport width/height (CSS px), player dock width (CSS px), view.
 * Outputs: device width and canvas side (CSS px, integer).
 * Invariants: 24px shell padding; no height change alters shell width; square <= shell interior.
 * The whole document may scroll under short heights / magnified text.
 */
export function playerGeometry(
  viewportWidth: number,
  viewportHeight: number,
  playerOffset: number,
  view: "draw" | "live",
) {
  const availableWidth = Math.max(0, viewportWidth - playerOffset);
  const deviceWidth = Math.min(
    view === "draw" ? 480 : 560,
    Math.max(0, availableWidth - 24),
  );
  const inside = Math.max(0, deviceWidth - 24);
  const heightBudget = Math.max(160, viewportHeight - (view === "draw" ? 295 : 280));
  const canvasSide = Math.max(0, Math.floor(Math.min(inside, heightBudget, view === "draw" ? 400 : 520)));
  return { deviceWidth, canvasSide };
}
