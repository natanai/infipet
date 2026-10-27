import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { T, terminal as s } from "../theme";
import type { developmentLayout } from "../interface/development-layout";

/** Pre-programmed's author-mode chrome: corner square + independently scrolling left dock. */
export function DevelopmentPanel({
  enabled,
  onToggle,
  layout,
  obscured,
  children,
}: {
  enabled: boolean;
  onToggle: () => void;
  layout: ReturnType<typeof developmentLayout>;
  obscured: boolean;
  children: React.ReactNode;
}) {
  return (
    <>
      {enabled && (
        <View
          nativeID="development-tools"
          role="complementary"
          accessibilityLabel="Development tools panel"
          aria-hidden={obscured}
          accessibilityElementsHidden={obscured}
          importantForAccessibility={obscured ? "no-hide-descendants" : "auto"}
          style={[styles.panel, { width: layout.panelWidth }]}
        >
          <View style={[styles.heading, !layout.desktop && { minHeight: 56 }]}>
            <Text style={s.text}>DEVELOPMENT TOOLS</Text>
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.content}
          >
            {children}
          </ScrollView>
        </View>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          enabled ? "Preview player experience" : "Enable development tools"
        }
        accessibilityHint="Show or hide the development panel"
        accessibilityState={{ selected: enabled }}
        aria-pressed={enabled}
        aria-expanded={enabled}
        aria-controls="development-tools"
        aria-hidden={obscured}
        onPress={onToggle}
        style={[styles.toggle, !layout.desktop && styles.touchToggle]}
      >
        <View
          aria-hidden
          style={[styles.tick, enabled && { backgroundColor: T.text }]}
        />
      </Pressable>
    </>
  );
}
const styles = StyleSheet.create({
  // 1.7em outer button and .55em inner square from pre-programmed/src/styles.css.
  toggle: {
    position: "absolute",
    top: 6,
    right: 8,
    zIndex: 30,
    width: 27.2,
    height: 27.2,
    borderWidth: 1,
    borderColor: T.line,
    backgroundColor: T.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  touchToggle: { width: 44, height: 44, borderColor: "transparent" },
  tick: { width: 8.8, height: 8.8, borderWidth: 1, borderColor: T.muted },
  panel: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    zIndex: 20,
    backgroundColor: T.bg,
    borderRightWidth: 1,
    borderRightColor: T.line,
  },
  content: {
    paddingTop: 14,
    paddingBottom: 16,
    paddingLeft: 12,
    paddingRight: 16,
    gap: 14,
  },
  heading: {
    paddingTop: 16,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: T.line,
    paddingBottom: 8,
  },
});
