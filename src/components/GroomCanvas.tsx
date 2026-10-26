import React, { useRef, useState } from "react";
import { PanResponder, View } from "react-native";
import Svg, { Line } from "react-native-svg";
import { PetPixels } from "./PetPixels";
import type { Pixel, Point } from "../simulation";

/** A gesture records a gentle developmental bias. It never paints the authored source. */
export function GroomCanvas({
  pixels,
  size,
  onStart,
  onStroke,
}: {
  pixels: Pixel[];
  size: number;
  onStart: () => void;
  onStroke: (from: Point, to: Point) => void;
}) {
  const latest = useRef({ size, onStart, onStroke });
  latest.current = { size, onStart, onStroke };
  const start = useRef<Point | null>(null);
  const [trail, setTrail] = useState<{ from: Point; to: Point } | null>(null);
  const point = (x: number, y: number): Point => ({
    x: (x / latest.current.size) * 64,
    y: (y / latest.current.size) * 64,
  });
  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        latest.current.onStart();
        const p = point(e.nativeEvent.locationX, e.nativeEvent.locationY);
        start.current = p;
        setTrail({ from: p, to: p });
      },
      onPanResponderMove: (e) => {
        if (start.current)
          setTrail({
            from: start.current,
            to: point(e.nativeEvent.locationX, e.nativeEvent.locationY),
          });
      },
      onPanResponderRelease: (e) => {
        if (start.current)
          latest.current.onStroke(
            start.current,
            point(e.nativeEvent.locationX, e.nativeEvent.locationY),
          );
        start.current = null;
        setTrail(null);
      },
      onPanResponderTerminate: () => {
        start.current = null;
        setTrail(null);
      },
      onPanResponderTerminationRequest: () => false,
    }),
  ).current;
  return (
    <View
      {...responder.panHandlers}
      accessibilityLabel="Groom your pet by stroking a body part"
      style={{ width: size, height: size, backgroundColor: "#050505" }}
    >
      <PetPixels pixels={pixels} size={size} gridSize={64} />
      {trail && (
        <View pointerEvents="none" style={{ position: "absolute", inset: 0 }}>
          <Svg width={size} height={size} viewBox="0 0 64 64">
            <Line
              x1={trail.from.x}
              y1={trail.from.y}
              x2={trail.to.x}
              y2={trail.to.y}
              stroke="#AAAAAA"
              strokeWidth={0.5}
            />
          </Svg>
        </View>
      )}
    </View>
  );
}
