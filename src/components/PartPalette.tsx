import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { PART_KINDS, PART_LABELS, type PartKind } from "../simulation";
import { T, terminal as s } from "../theme";

/**
 * Drawing is an authoring task, not a symbol-guessing game.
 * Every material kind has its visible name on every device; icons are
 * intentionally absent because the 15 tiny glyphs are not self-explanatory.
 */
export function PartPalette({
  value,
  onChange,
}: {
  value: PartKind;
  onChange: (kind: PartKind) => void;
}) {
  return (
    <View accessibilityLabel="Drawing body parts" style={styles.palette}>
      {PART_KINDS.map((kind) => {
        const selected = value === kind;
        return (
          <View key={kind} style={styles.cell}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Draw ${PART_LABELS[kind].toLowerCase()}`}
              accessibilityHint="Select the material for the next drawing stroke"
              accessibilityState={{ selected }}
              aria-pressed={selected}
              onPress={() => onChange(kind)}
              style={({ pressed }) => [
                styles.part,
                selected && styles.selected,
                pressed && { borderColor: T.bright },
              ]}
            >
              <Text
                numberOfLines={1}
                style={[s.text, styles.label, selected && { color: T.bg }]}
              >
                {PART_LABELS[kind]}
              </Text>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}
const styles = StyleSheet.create({
  palette: { flexDirection: "row", flexWrap: "wrap", margin: -2 },
  cell: { width: "33.333333%", padding: 2 },
  part: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: T.line,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 3,
    paddingVertical: 5,
  },
  selected: { backgroundColor: T.bright, borderColor: T.bright },
  label: { fontSize: 16, textAlign: "center", flexShrink: 1 },
});
