# Far-future seek reproduction probe

The reported browser crash was **not reproduced in the CLI**. This does not identify or clear a browser-specific failure.

Recipe: the Cub source, seed `3352806301`, one Safety keyframe at developmental day3650 (0% fulfillment), no other need events. Two runs used no grooming or one actual source-bound hind-left-leg stroke at day0. The browser's exact stroke was unavailable; the probe stroke has strength0.4167 and points down. Ages3650,3650.25,1000000 and1000000.25 each exercised `stateAt`, `developmentAt`, and idle `frameAt`. Each run additionally rendered64 advancing-animation move frames at day3650.25. Node's heap limit was512MB. Runtime files were read only.

All24 seek/API calls and both64-frame cycles completed, with no exceptions and valid bounded output pixels. Idle images contained518–523 pixels across22 parts. Explicit animation cycles used57 pose-cache entries /2109 stored pixels, below the512-entry /240000-pixel limits.

| Measurement | Observed range |
|---|---:|
| `stateAt` |0.12–0.78ms|
| `developmentAt` |3.94–35.20ms (includes first cold call)|
| idle `frameAt` after structural evaluation |4.61–14.28ms|
|64 advancing move frames |120.78–123.77ms total|
| Maximum sampled heap used |51.45MiB|
| Maximum sampled process RSS |219.57MiB|

RSS includes Node/TypeScript-loader/runtime overhead and garbage-collection behavior. This short probe is not a leak test, mobile performance result or browser memory measurement. Timings share caches within each scenario and cannot be called independent cold samples.

Code inspection found bounded elapsed-time work in these paths:

- [`snapshotAt`](../../../../src/needs/simulation.ts:198) integrates canonical event spans analytically; it does not iterate every hour up to the requested age.
- [`morphologyAt`](../../../../src/needs/simulation.ts:455) iterates at most the initial240-day prefix (5760 hourly steps), then uses analytic event-span updates. Needs checkpoint maps cap at32 entries.
- [`contextAt`](../../../../src/simulation/development.ts:466) receives the analytic `needs.morphologyAt` callback in production. Its standalone fallback also bounds the hourly prefix to240 days and later sampling to24 points per need.
- [Rendering caches](../../../../src/simulation/growth.ts:673) cap structural/complete frames at12 each, pose data at512 entries /240000 pixels, and complete-frame pixels at120000.
- [Needs Lab markers](../../../../src/components/NeedsLab.tsx:79) filter actual saved keyframes and map those events into buttons. The chronology is not expanded into daily or hourly marker arrays. The timeline normalization budget is8192 keyframes.
- [The web slider](../../../../src/components/TimelineSlider.web.tsx:64) uses a native range input; changing its maximum to a distant day does not construct a tick list.

No cause for the browser crash was established. Browser console/process logs and the exact retained browser document would be required to distinguish a rendering/session failure from the tested pure simulation paths. No runtime changes were made in response to this probe.

[Machine trace, recipe and source hashes](far-future-cli-001.json) · [CLI probe source](far-future-cli-001.ts)
