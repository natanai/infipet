import React, { useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import Slider from "@react-native-community/slider";
import { T, terminal as s } from "../theme";

export default function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [entry, setEntry] = useState(value);
  useEffect(() => setEntry(value), [value]);
  const channels = [
    parseInt(value.slice(1, 3), 16),
    parseInt(value.slice(3, 5), 16),
    parseInt(value.slice(5, 7), 16),
  ];
  const update = (index: number, n: number) => {
    const next = [...channels];
    next[index] = Math.round(n);
    const hex =
      "#" +
      next
        .map((c) => c.toString(16).padStart(2, "0"))
        .join("")
        .toUpperCase();
    onChange(hex);
    setEntry(hex);
  };
  return (
    <View style={{ gap: 8 }}>
      <View style={s.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open RGB color picker"
          onPress={() => setExpanded(!expanded)}
          style={[
            s.button,
            {
              width: 40,
              height: 38,
              backgroundColor: value,
              borderColor: T.text,
            },
          ]}
        />
        <TextInput
          accessibilityLabel="Custom brush color"
          value={entry}
          onFocus={() => setEntry(value)}
          onChangeText={(v) => {
            setEntry(v);
            if (/^#[0-9a-f]{6}$/i.test(v)) onChange(v.toUpperCase());
          }}
          maxLength={7}
          autoCapitalize="characters"
          autoCorrect={false}
          style={[s.input, { flex: 1 }]}
        />
        <Pressable
          accessibilityRole="button"
          onPress={() => setExpanded(!expanded)}
        >
          <Text style={s.text}>[RGB{expanded ? "-" : "+"}]</Text>
        </Pressable>
      </View>
      {expanded &&
        channels.map((n, i) => (
          <View key={i} style={s.row}>
            <Text style={s.text}>{"RGB"[i]}</Text>
            <Slider
              accessibilityLabel={`${"RGB"[i]} color channel`}
              minimumValue={0}
              maximumValue={255}
              step={1}
              value={n}
              onValueChange={(v) => update(i, v)}
              thumbTintColor={T.bright}
              minimumTrackTintColor={T.text}
              maximumTrackTintColor={T.line}
              style={{ flex: 1, height: 25 }}
            />
            <Text style={s.text}>{String(n).padStart(3, "0")}</Text>
          </View>
        ))}
    </View>
  );
}
