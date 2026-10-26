import React, { useEffect, useState } from "react";
import { Text, TextInput, View } from "react-native";
import { T, terminal as s } from "../theme";

export default function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [entry, setEntry] = useState(value);
  useEffect(() => setEntry(value), [value]);
  return (
    <View style={s.row}>
      {React.createElement("input", {
        type: "color",
        value,
        "aria-label": "Open color picker",
        onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
          onChange(e.currentTarget.value.toUpperCase()),
        style: {
          width: 40,
          height: 38,
          padding: 2,
          background: T.bg,
          border: `1px solid ${T.line}`,
          cursor: "pointer",
        },
      })}
      <TextInput
        accessibilityLabel="Custom brush color"
        value={entry}
        onChangeText={(v) => {
          setEntry(v);
          if (/^#[0-9a-f]{6}$/i.test(v)) onChange(v.toUpperCase());
        }}
        maxLength={7}
        autoCorrect={false}
        style={[s.input, { flex: 1 }]}
      />
      <Text style={s.muted}>COLOR</Text>
    </View>
  );
}
