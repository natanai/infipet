import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { PART_KINDS, PART_LABELS, type PartKind } from "../simulation";
import { PixelIcon, type PixelIconName } from "./PixelIcon";
import { T, terminal as s } from "../theme";

/** Every authored material category remains a visible, single-tap 5 x 3 choice.
 * Glyph names never replace complete accessible names.
 */
export function PartPalette({
  value,
  onChange,
  showLabels = false,
}: {
  value: PartKind;
  onChange: (kind: PartKind) => void;
  showLabels?: boolean;
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
              <PixelIcon
                name={(kind === "decoration" ? "details" : kind) as PixelIconName}
                size={24}
                color={selected ? T.bg : T.text}
              />
              {showLabels && (
                <Text style={[s.text, styles.label, selected && { color: T.bg }]}>
                  {PART_LABELS[kind]}
                </Text>
              )}
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}
const styles = StyleSheet.create({
  palette: { flexDirection: "row", flexWrap: "wrap", margin: -2 },
  cell: { width: "20%", padding: 2 },
  part: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: T.line,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 5,
    gap: 2,
  },
  selected: { backgroundColor: T.bright, borderColor: T.bright },
  label: { fontSize: 13, textAlign: "center", flexShrink: 1 },
});
