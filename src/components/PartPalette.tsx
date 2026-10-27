import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { PART_KINDS, PART_LABELS, type PartKind } from "../simulation";
import { T, terminal as s } from "../theme";

/** Every supported brush label stays one tap away from the shared canvas. */
export function PartPalette({
  value,
  onChange,
}: {
  value: PartKind;
  onChange: (kind: PartKind) => void;
}) {
  return (
    <View accessibilityLabel="Drawing body parts" style={styles.palette}>
      {PART_KINDS.map((kind) => (
        <View key={kind} style={styles.cell}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Draw ${PART_LABELS[kind].toLowerCase()}`}
            accessibilityState={{ selected: value === kind }}
            aria-pressed={value === kind}
            onPress={() => onChange(kind)}
            style={[styles.part, value === kind && styles.selected]}
          >
            <Text
              numberOfLines={1}
              style={[s.text, styles.label, value === kind && { color: T.bg }]}
            >
              {PART_LABELS[kind]}
            </Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}
const styles = StyleSheet.create({
  palette: { flexDirection: "row", flexWrap: "wrap", margin: -2 },
  cell: { width: "20%", padding: 2 },
  part: {
    minHeight: 42,
    borderWidth: 1,
    borderColor: T.line,
    justifyContent: "center",
    alignItems: "center",
  },
  selected: { backgroundColor: T.bright, borderColor: T.bright },
  label: { fontSize: 15 },
});
