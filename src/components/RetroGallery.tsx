import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { RETRO_PRESETS, RETRO_ROSTER } from "../retro";
import { drawingPixels } from "../drawing";
import { PetPixels } from "./PetPixels";
import { T, terminal as s } from "../theme";

const devices = [
  { id: "all", name: "All" },
  { id: "dm1", name: "Digimon V1" },
  { id: "p1", name: "Tama P1" },
  { id: "p2", name: "Tama P2" },
];
export function RetroGallery({
  onSelect,
}: {
  onSelect: (id: string) => void;
}) {
  const [device, setDevice] = useState("all"),
    [search, setSearch] = useState("");
  const drawings = useMemo(
    () =>
      new Map(
        RETRO_PRESETS.map((p) => [
          p.referenceId,
          { preset: p, pixels: drawingPixels(p.parts) },
        ]),
      ),
    [],
  );
  const roster = RETRO_ROSTER.filter(
    (p) =>
      (device === "all" || p.deviceId === device) &&
      `${p.name} ${p.stage}`
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
  );
  return (
    <View style={{ gap: 12 }}>
      <Text style={s.text}>
        {RETRO_PRESETS.length} observed drawings · {RETRO_ROSTER.length}{" "}
        reference forms
      </Text>
      <Text style={s.muted}>
        Choose ordinary editable ink. Full lifecycle tests start with the
        earliest baby drawing and generate every later form.
      </Text>
      <View style={styles.row}>
        {devices.map((d) => (
          <Pressable
            key={d.id}
            accessibilityRole="button"
            accessibilityLabel={`Filter ${d.name}`}
            accessibilityState={{ selected: device === d.id }}
            onPress={() => setDevice(d.id)}
            style={[s.button, device === d.id && s.active]}
          >
            <Text style={[s.text, device === d.id && { color: T.bg }]}>
              {d.name}
            </Text>
          </Pressable>
        ))}
      </View>
      <TextInput
        accessibilityLabel="Search retro drawings"
        value={search}
        onChangeText={setSearch}
        placeholder="Find a creature or stage"
        placeholderTextColor={T.muted}
        style={s.input}
      />
      <View style={styles.row}>
        {roster.map((item) => {
          const source = drawings.get(item.referenceId);
          return (
            <Pressable
              key={item.referenceId}
              accessibilityRole="button"
              accessibilityLabel={`Draw ${item.name}`}
              accessibilityState={{ disabled: !source }}
              disabled={!source}
              onPress={() => source && onSelect(source.preset.id)}
              style={[styles.card, !source && { opacity: 0.45 }]}
            >
              {source ? (
                <PetPixels pixels={source.pixels} size={96} gridSize={32} />
              ) : (
                <View style={styles.missing}>
                  <Text style={s.muted}>?</Text>
                </View>
              )}
              <Text style={[s.bright, { textAlign: "center" }]}>
                {item.name}
              </Text>
              <Text style={[s.muted, { textAlign: "center", fontSize: 13 }]}>
                {item.root ? "Lifecycle beginning" : `${item.stage} drawing`}
              </Text>
              {!source && (
                <Text style={[s.muted, { fontSize: 12, textAlign: "center" }]}>
                  Reference image pending
                </Text>
              )}
              {source?.preset.referenceStatus === "provisional" && (
                <Text style={[s.muted, { fontSize: 12, textAlign: "center" }]}>
                  Edition unverified
                </Text>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  card: {
    width: "47%",
    flexGrow: 1,
    borderWidth: 1,
    borderColor: T.line,
    alignItems: "center",
    padding: 8,
    gap: 5,
    backgroundColor: T.panel,
  },
  missing: {
    width: 96,
    height: 96,
    alignItems: "center",
    justifyContent: "center",
  },
});
