# Pre-Programmed reference

Reference inspected October 23, 2026 through the connected GitHub source: [natanai/pre-programmed](https://github.com/natanai/pre-programmed), `main`. The production site is [pre-programmed.art](https://pre-programmed.art/); the source is the authoritative reference for the values below.

## Terminal styling

[src/styles.css](https://github.com/natanai/pre-programmed/blob/main/src/styles.css), blob `4732440a860678ea72b44fc5741d3f5f8d96bc67`:

| Property           | Source value                                           |
| ------------------ | ------------------------------------------------------ |
| Background         | `#000`                                                 |
| Text               | `#aaa`                                                 |
| Bright text        | `#ddd`                                                 |
| Muted text         | `#777`                                                 |
| Lines              | `#444`                                                 |
| Warning            | `#c7ad72`                                              |
| Font               | `PreProgrammed VGA`, from `Web437_DOS-V_re_ANK16.woff` |
| Terminal type size | `16px`, line height `1`, letter spacing `0`            |
| Panels             | Square corners, thin 1px rules, black fill             |
| Actions            | Transparent, borderless text buttons, bracketed labels |
| Command prompt     | White fill, black text and cursor                      |

The native font alias in Infipet is `DOS`; [font attribution and conversion](../assets/fonts/FONT-LICENSE.md) identify the original author, license and unchanged glyph data. The WOFF was downloaded from the exact source path in the repository. `DOS.ttf` is a lossless container conversion, validated by the TrueType sfnt checksum `0xB1B0AFBA`.

## Signature sorting animation

[src/features/radix/algorithm.ts](https://github.com/natanai/pre-programmed/blob/main/src/features/radix/algorithm.ts), blob `110dbff4dd862f1e4e716391f2acd42e6ad6c415`, implements stable least-significant-digit radix sorting. It reads into digit buckets and writes each bucket in order; events distinguish reads, writes, bucket boundaries and completed passes.

[src/features/radix/model.ts](https://github.com/natanai/pre-programmed/blob/main/src/features/radix/model.ts), blob `7596486766fe81f18bd47432c50cf1b021dd3491`, defaults to base four, 256 shuffled bars, white `#eeeeee`, active access red `#ff2b1c`, bucket markers cyan `#18d7e8`, black background. Its caption is `loading universe`.

[src/features/radix/ui/RadixSequenceSurface.tsx](https://github.com/natanai/pre-programmed/blob/main/src/features/radix/ui/RadixSequenceSurface.tsx), blob `d1ac4a07fafcd9d4b572534282b4bfd734c20974`, draws height-proportional vertical bars with active and bucket highlights. The optional readout reports array accesses and digit passes. [radixSequence.css](https://github.com/natanai/pre-programmed/blob/main/src/features/radix/ui/radixSequence.css), blob `de70d45430f4e6b31b5a3fcf055ba0d658c5266a`, keeps the presentation flat and black.

[src/engine/runtime/initializationRandom.ts](https://github.com/natanai/pre-programmed/blob/main/src/engine/runtime/initializationRandom.ts), blob `1325e2dc4ef4ccbb6043d314e71367dd7ecdb213`, uses UTF-8 FNV-1a text hashing, a Mulberry32 stream, and a seeded Fisher-Yates shuffle.

Infipet's [seed-sort.ts](../src/seed-sort.ts) follows those rules with 64 bars for a compact mobile view and the complete seed string as input. Sorting changes the visualization only; it never edits the seed or consumes growth randomness. Reordering seed characters produces a different initial shuffle and trace. The final ascending bars are shared across seeds, while the initial order, intermediate frames and fingerprint identify that seed. [SeedSort.tsx](../src/components/SeedSort.tsx) runs on React Native and web, pauses in the background, supports pause/replay, and starts paused when reduced motion is enabled. It has no audio.
