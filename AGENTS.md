# Infipet prototype policy

- Saved prototype pets and pet files are disposable between iterations. Do not add backups, migrations, old-engine support, or preservation work unless the user explicitly requests it.
- Start each new prototype iteration with a new `PROTOTYPE_REVISION`. Reset only the app's `infipet.*` storage namespace when that revision changes. Ordinary launches and reloads within one revision must retain the current drawing.
- Keep one shared drawing canvas. Anatomy labels are optional brush hints; attachments, layers, and procedural controllers stay internal.
- Growth must be reproducible from the source, mode, seed, need keyframes, age, and explicit animation time. Inherited genetics must be independent of need history. Never consume mutable randomness while seeking or rendering frames.
- Need keyframes record fulfillment at developmental hours after birth/hatching. Scrubbing never deletes history; later keyframes survive edits to the past. Seed changes retain the need timeline and developmental playhead.
- Verify web and iOS JavaScript exports. Clearly distinguish those checks from signed iOS and physical-widget testing.
