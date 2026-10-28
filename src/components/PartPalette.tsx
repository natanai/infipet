import React, { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { PART_KINDS, PART_LABELS, type PartKind } from "../simulation";
import PixelIcon, { type PixelIconName } from "./PixelIcon";
import { T } from "../theme";

/**
 * Minimal three-control anatomy selector, inspired by handheld pet devices.
 * Prev / current (opens all) / next are the ordinary drawing controls.
 * All 15 species-neutral anatomical glyphs remain a tap away in a compact
 * 5x3 grid with 44px touch targets. No visible part names are shown.
 * VoiceOver and other accessibility clients receive exact names and hints.
 */
export function PartPalette({
  value,
  onChange,
}: {
  value: PartKind;
  onChange: (kind: PartKind) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const index = PART_KINDS.indexOf(value);
  const selectRelative = (direction: number) => {
    onChange(PART_KINDS[(index + direction + PART_KINDS.length) % PART_KINDS.length]);
  };
  const iconColor = (selected: boolean) => selected ? T.bg : T.bright;
  return (
    <View accessibilityLabel="Drawing body parts" style={styles.container}>
      <View style={styles.selector}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Previous body part"
          accessibilityHint="Select the previous anatomy symbol for drawing"
          onPress={() => selectRelative(-1)}
          style={styles.part}>
          <PixelIcon name="left" size={23} color={T.bright}/>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Choose body part"
          accessibilityHint={`Current part: ${PART_LABELS[value]}. Open or close all fifteen anatomical symbols.`}
          accessibilityState={{ expanded }}
          aria-expanded={expanded}
          onPress={() => setExpanded(v => !v)}
          style={[styles.part, styles.current]}>
          <PixelIcon name={value === "decoration" ? "details" : value as PixelIconName} size={27} color={T.bright}/>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next body part"
          accessibilityHint="Select the next anatomy symbol for drawing"
          onPress={() => selectRelative(1)}
          style={styles.part}>
          <PixelIcon name="right" size={23} color={T.bright}/>
        </Pressable>
      </View>
      {expanded && (
        <View accessibilityLabel="All anatomical symbols" style={styles.palette}>
          {PART_KINDS.map((kind) => {
            const selected = value === kind;
            return (
              <Pressable
                key={kind}
                accessibilityRole="button"
                accessibilityLabel={`Draw ${PART_LABELS[kind].toLowerCase()}`}
                accessibilityHint="Choose this anatomical material for the next drawing stroke"
                accessibilityState={{ selected }}
                aria-pressed={selected}
                onPress={() => {onChange(kind);setExpanded(false);}}
                style={[styles.part, styles.gridPart, selected && styles.selected]}>
                <PixelIcon name={kind === "decoration" ? "details" : kind as PixelIconName} size={23} color={iconColor(selected)}/>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: "center", gap: 6 },
  selector: { flexDirection: "row", gap: 6, justifyContent: "center" },
  part: {
    width: 44, height: 44, minHeight: 44, minWidth: 44,
    borderWidth: 1, borderColor: T.line,
    justifyContent: "center", alignItems: "center",
    backgroundColor: T.bg,
  },
  current: { borderColor: T.bright, width: 54 },
  palette: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 4,
    width: 236, maxWidth: "100%", alignSelf: "center", paddingVertical: 2 },
  gridPart: { margin: 0 },
  selected: { backgroundColor: T.bright, borderColor: T.bright },
});
