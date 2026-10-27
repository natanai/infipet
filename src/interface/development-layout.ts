/** Matches pre-programmed's authorDesktopSuite.css (16px root text):
 * desktop starts at 1000px; dock clamp(22rem, 28vw, 30rem), gap clamp(1rem, 2vw, 2rem).
 * On narrow screens the same tools occupy a full-height overlay; the corner toggle stays available.
 */
export function developmentLayout(viewportWidth: number, enabled: boolean) {
  const desktop = viewportWidth >= 1000;
  const panelWidth = desktop
    ? Math.min(480, Math.max(352, viewportWidth * 0.28))
    : viewportWidth;
  const gap = Math.min(32, Math.max(16, viewportWidth * 0.02));
  const playerOffset = enabled && desktop ? panelWidth + gap : 0;
  return {
    desktop,
    panelWidth,
    playerOffset,
    playerWidth: viewportWidth - playerOffset,
  };
}
