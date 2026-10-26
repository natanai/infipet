import React, { useRef } from "react";
import { PanResponder, View } from "react-native";
import { DRAW_SIZE, type Pixel, type Point } from "../simulation";
import type { DrawTool } from "../drawing";
import { PetPixels } from "./PetPixels";

/** The authoring model fills pointer gaps and mirrors each brush cell once. */
export default function DrawingCanvas({
  pixels,
  size,
  tool,
  onStart,
  onPaint,
  onEnd,
}: {
  pixels: Pixel[];
  size: number;
  tool: DrawTool;
  onStart: () => void;
  onPaint: (points: Point[], tool: DrawTool) => void;
  onEnd: () => void;
}) {
  const latest = useRef({ size, tool, onStart, onPaint, onEnd });
  latest.current = { size, tool, onStart, onPaint, onEnd };
  const stroke = useRef<Point[]>([]);
  const paint = (locationX: number, locationY: number) => {
    const v = latest.current,
      x = Math.floor((locationX / v.size) * DRAW_SIZE),
      y = Math.floor((locationY / v.size) * DRAW_SIZE);
    if (x < 0 || y < 0 || x >= DRAW_SIZE || y >= DRAW_SIZE) {
      stroke.current.push({ x: -1, y: -1 });
      return;
    }
    stroke.current.push({ x, y });
    v.onPaint(stroke.current, v.tool);
  };
  const finish = () => {
    stroke.current = [];
    latest.current.onEnd();
  };
  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        stroke.current = [];
        latest.current.onStart();
        paint(e.nativeEvent.locationX, e.nativeEvent.locationY);
      },
      onPanResponderMove: (e) =>
        paint(e.nativeEvent.locationX, e.nativeEvent.locationY),
      onPanResponderRelease: (e) => {
        paint(e.nativeEvent.locationX, e.nativeEvent.locationY);
        finish();
      },
      onPanResponderTerminate: finish,
      onPanResponderTerminationRequest: () => false,
    }),
  ).current;
  return (
    <View
      {...responder.panHandlers}
      accessibilityLabel="Draw your whole pet here"
      style={{ height: size, width: size, backgroundColor: "#080808" }}
    >
      <PetPixels pixels={pixels} size={size} gridSize={DRAW_SIZE} grid />
    </View>
  );
}
