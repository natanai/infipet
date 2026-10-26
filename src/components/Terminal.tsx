import React from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import { T, terminal as s } from "../theme";

export function Command({
  children,
  onPress,
  disabled = false,
  active = false,
  label,
  style,
}: {
  children: React.ReactNode;
  onPress: () => void;
  disabled?: boolean;
  active?: boolean;
  label?: string;
  style?: ViewStyle;
}) {
  const element = React.isValidElement(children);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, selected: active }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        !element && (active || pressed) && s.active,
        element && active && { borderColor: T.bright },
        disabled && { opacity: 0.35 },
        style,
      ]}
    >
      {({ pressed }) =>
        element ? (
          children
        ) : (
          <Text style={[s.text, (active || pressed) && { color: T.bg }]}>
            {children}
          </Text>
        )
      }
    </Pressable>
  );
}
export function Panel({
  title,
  status,
  children,
  style,
}: {
  title: string;
  status?: string;
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  return (
    <View style={[styles.panel, style]}>
      <View style={styles.title}>
        <Text style={s.bright}>{title}</Text>
        {!!status && <Text style={s.muted}>{status}</Text>}
      </View>
      <View style={styles.content}>{children}</View>
    </View>
  );
}
export function Readout({
  label,
  value,
  ok,
}: {
  label: string;
  value: string;
  ok?: boolean;
}) {
  return (
    <View
      style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}
    >
      <Text style={s.muted}>{label}</Text>
      <Text
        style={[
          s.text,
          { color: ok === false ? T.muted : ok === true ? T.bright : T.text },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}
const styles = StyleSheet.create({
  panel: {
    borderWidth: 1,
    borderColor: T.line,
    backgroundColor: T.bg,
    minWidth: 0,
  },
  title: {
    borderBottomWidth: 1,
    borderBottomColor: T.line,
    paddingHorizontal: 12,
    paddingVertical: 9,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  content: { padding: 12, gap: 12 },
});
