import React from "react";
import { Text, View } from "react-native";
import type { WellbeingState } from "../needs";
import { T, terminal as s } from "../theme";

/** Player-facing snapshot: feelings only, without need values or hidden scores. */
export function FeelingsSheet({ wellbeing }: { wellbeing: WellbeingState }) {
  const feelings = wellbeing.feelings.slice(0, 3);
  return (
    <View style={{ gap: 16 }}>
      <Text style={s.muted}>Your pet feels...</Text>
      {feelings.map((feeling) => {
        const intensity =
          feeling.intensity < 0.34
            ? "Slight"
            : feeling.intensity < 0.67
              ? "Moderate"
              : "Strong";
        return (
          <View
            key={feeling.id}
            accessibilityLabel={`${feeling.title}, ${intensity.toLowerCase()} intensity`}
            style={{ borderWidth: 1, borderColor: T.line, padding: 14 }}
          >
            <Text style={[s.bright, { fontSize: 20, lineHeight: 24 }]}>
              {feeling.title}
            </Text>
            <Text style={s.muted}>{intensity}</Text>
          </View>
        );
      })}
      {!feelings.length && <Text style={s.text}>No feelings to show yet.</Text>}
    </View>
  );
}

export default FeelingsSheet;
