import React, { useEffect, useMemo, useState } from "react";
import {
  AccessibilityInfo,
  AppState,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Svg, { Rect } from "react-native-svg";
import { createSeedSortTimeline } from "../seed-sort";

type Props = { seed: string; accent?: string };

/** Native + web rendition of Pre-Programmed's seeded radix presentation. */
export function SeedSort({ seed, accent = "#ff2b1c" }: Props) {
  const timeline = useMemo(() => createSeedSortTimeline(seed), [seed]);
  const [cursor, setCursor] = useState(0);
  const [running, setRunning] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [foreground, setForeground] = useState(
    AppState.currentState !== "background",
  );
  const finished = cursor >= timeline.frames.length - 1;

  useEffect(() => {
    let mounted = true;
    const update = (reduce: boolean) => {
      if (!mounted) return;
      setReducedMotion(reduce);
      if (reduce) setRunning(false);
    };
    void AccessibilityInfo.isReduceMotionEnabled().then(update);
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      update,
    );
    const appState = AppState.addEventListener("change", (state) =>
      setForeground(state === "active"),
    );
    return () => {
      mounted = false;
      subscription.remove();
      appState.remove();
    };
  }, []);

  useEffect(() => {
    setCursor(0);
    setRunning(!reducedMotion);
  }, [timeline, reducedMotion]);

  useEffect(() => {
    if (!running || !foreground || finished) return;
    const timer = setInterval(() => {
      setCursor((current) => Math.min(current + 4, timeline.frames.length - 1));
    }, 24);
    return () => clearInterval(timer);
  }, [running, foreground, timeline, finished]);

  const frame = timeline.frames[Math.min(cursor, timeline.frames.length - 1)];
  const markerSet = new Set(frame.markers);
  const playing = running && !frame.complete;
  const replay = () => {
    setCursor(0);
    setRunning(true);
  };
  return (
    <View style={styles.surface}>
      <View style={styles.header}>
        <Text style={styles.label}>SEED SORT / RADIX 4</Text>
        <View style={styles.controls}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={playing ? "Pause seed sort" : "Play seed sort"}
            onPress={() => (frame.complete ? replay() : setRunning(!running))}
            hitSlop={6}
          >
            <Text style={styles.action}>{playing ? "[PAUSE]" : "[PLAY]"}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Replay seed sort"
            onPress={replay}
            hitSlop={6}
          >
            <Text style={styles.action}>[REPLAY]</Text>
          </Pressable>
        </View>
      </View>
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={`Deterministic seed ${timeline.fingerprint}, base-four radix sort, pass ${frame.pass}, ${frame.accesses} array accesses${frame.complete ? ", complete" : ""}`}
        style={styles.chart}
      >
        <Svg
          width="100%"
          height={84}
          viewBox={`0 0 ${frame.values.length} ${frame.values.length}`}
          preserveAspectRatio="none"
          pointerEvents="none"
        >
          {frame.values.map((value, index) => (
            <Rect
              key={index}
              x={index}
              y={frame.values.length - value}
              width={1}
              height={value}
              fill={
                index === frame.activeIndex
                  ? accent
                  : markerSet.has(index)
                    ? "#18d7e8"
                    : "#eeeeee"
              }
            />
          ))}
        </Svg>
      </View>
      <View style={styles.footer}>
        <Text style={styles.muted}>#{timeline.fingerprint}</Text>
        <Text style={styles.muted}>
          {frame.accesses} ACCESSES / PASS {frame.pass}
          {frame.complete ? " / COMPLETE" : ""}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  surface: { backgroundColor: "#000", gap: 8 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 8,
  },
  controls: { flexDirection: "row", gap: 12 },
  label: { fontFamily: "DOS", fontSize: 16, color: "#aaa" },
  action: { fontFamily: "DOS", fontSize: 16, color: "#ddd" },
  chart: {
    backgroundColor: "#000",
    borderBottomWidth: 1,
    borderColor: "#444",
    overflow: "hidden",
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 8,
  },
  muted: { fontFamily: "DOS", fontSize: 14, color: "#777" },
});
