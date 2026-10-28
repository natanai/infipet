# Player symbols and Mobile Safari qualification

Status: **implementation in PR #37; not real-iPhone qualified**. This does not modify the canonical [roadmap](../../roadmap/plan.json). PR #37 is stacked on #36 and must be integrated after that work, not overwrite it.

## Production ownership
- Physical organism, lineage, seed, material inventory, care effects and daily anatomical opportunities are exclusively owned by the existing simulation and native gameplay. **No render callback creates anatomy or care rewards.**
- A player sees original 12-unit pixel symbols, with full accessible button names and optional visible labels (More > Show symbol labels). Confirmation, errors and replacement remain explicit text.
- The developer toggle remains the pre-programmed-style top-right control and mobile left-panel overlay. No ordinary tools are moved into developer mode.

## Layout and gesture contract
```ts
available = max(0, viewportWidth - developerDockOffset);
deviceWidth = min(maxDeviceWidth, max(0, available - 24));
inside = max(0, deviceWidth - 24);
canvasSide = floor(max(0, min(inside, max(160, viewportHeight - heightReserve), maxCanvasSide)));
```
For draw: maxDeviceWidth=480, heightReserve=420, maxCanvasSide=400. For live: 560, 280, 520. All dimensions are CSS pixels. The square scales independently from the device rail; under tiny heights the page scrolls instead of forcing all buttons to shrink. Mobile (<1000px) drawing birth is a separate bottom action in SafeAreaView, so it remains reachable under a short visible viewport. The root uses dynamic viewport minimum height on web and does **not** disable browser zoom.

Drawing has logical 32×32 cells; live/groom uses 64×64 world coordinates. On gesture begin we capture (size, pageX-locationX, pageY-locationY, tool). Until release/cancellation, every point is mapped to **that** basis, not the latest prop size. Off-canvas drawing points remain discontinuities. Gesture completion commits via the existing stroke implementation only once.

Test invariants: deviceWidth does not depend on viewportHeight; canvasSide ≤ inside; increasing available height cannot decrease canvasSide; original 15 one-tap selectors, 5 columns × 3 rows, each at least 44×44 CSS px; no page-wide horizontal overflow.

## Current 16-flow ledger

| Flow | This PR | Remaining acceptance |
|---|---|---|
| Feed | Food glyph, real meal/protein/snack native command and receipt semantics | Contact-aware offering and source-owned food approach |
| Clean | Broom glyph and native clear, no invented per-piece reward | Deterministic visible waste world props and sweep sequence |
| Treat | Kit glyph, actual medicine, refused/partial/effective distinctions | Supported offering/contact sequence and honest refusal prop |
| Rest | Lamp glyph and canonical lights/sleep state | Source-appropriate settling, not an invented closed eye |
| Status | Compact source-driven meters, optional detailed text | Accessible/reduced-motion refinements on actual devices |
| Attention | Bell routes to real call and matching available care | More direct in-habitat alert cue, validated call interruption policy |
| Groom | Source-linked existing authored-hair stroke | General touch only after approved source-capability and care contract |
| Greet | Existing material-linked greet action in developer preview | Accessible ordinary greeting reaction and fallback selection |
| Explore | Existing supported locomotion preview | Target-directed navigation and physically qualified stopping/turning |
| Ball | Existing preview throw/contact diagnostic | Actual swept contact, catch vs nudge, grasp/hold/release, replayable scoring |
| Direction game | Native seeded five-round prediction + existing PR #36 cues | More visible round sprites and meaningful animation retargeting |
| Numbers game | Native number progression and PR #36 cues | In-world number tiles and result affordances |
| Training | Native five-round high/low + PR #36 cues | Physical goal contact; new skill rules only after design approval |
| Sparring | Native statistical battle and PR #36 bounded reveal | Interactive combat requires new explicit saved-state rule system |
| Return/birth | Fixed mobile birth; original pet return and import/export unchanged | Real Safari persistent state/recovery checks |
| Ending/recovery | Explicit, readable old-save/replacement/errors preserved | Real phone/assistive review and no false happy cues |

The PR does **not** claim a successful catch, physical feeding animation, navigation for every morphology, or tactile affection reward. PR #36 independently maintains source-owned bounded animation for the existing seeded care games.

## Release acceptance (not yet satisfied)
1. CI verifies roadmap, TypeScript, mathematical tests, web export, existing exported-browser care flows and mobile viewport checks. Treat screenshots only as UI evidence.
2. **Real iPhone Safari:** expanded/collapsed bars; 320/360/375/390/393/414/430 width coverage when available; 390×640; portrait, rotation, keyboard, scroll, tap, sustained drawing stroke while viewport changes; PWA home-screen standalone.
3. 200% enlarged text, voice-over screen-reader control names/states, motor-accessible 44px targets, focus order, no unintended field focus zoom, no tap intercepted by developer button.
4. UI input acknowledgement latency and long-session memory on target phone are measured, not inferred from Chromium. Newcomer usability: match symbols to actions without coaching.
5. After #36 merges, verify the exact main commit, merge only on passing checks and operator review; deployed release identity must match merged main.

No real Safari hardware result is implied by the browser checks in this PR.
