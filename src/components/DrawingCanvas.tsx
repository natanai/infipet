import React, { useRef } from "react";
import { PanResponder, View, type GestureResponderEvent } from "react-native";
import { DRAW_SIZE, type Pixel, type Point } from "../simulation";
import type { DrawTool } from "../drawing";
import { PetPixels } from "./PetPixels";

type GestureBasis = { size: number; originX: number; originY: number; tool: DrawTool };
/** Every stroke snapshots its own mapping, so Safari's dynamic viewport cannot
 * remap existing source pixels while the user's finger remains on the canvas.
 * Points outside that original square remain discontinuities, not wrapped ink.
 */
export default function DrawingCanvas({
  pixels, size, tool, onStart, onPaint, onEnd,
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
  const basis = useRef<GestureBasis | null>(null);
  const paint = (e: GestureResponderEvent) => {
    const b = basis.current;
    if (!b || b.size <= 0) return;
    const x = Math.floor(((e.nativeEvent.pageX - b.originX) / b.size) * DRAW_SIZE);
    const y = Math.floor(((e.nativeEvent.pageY - b.originY) / b.size) * DRAW_SIZE);
    if (x < 0 || y < 0 || x >= DRAW_SIZE || y >= DRAW_SIZE)
      stroke.current.push({ x: -1, y: -1 });
    else stroke.current.push({ x, y });
    latest.current.onPaint(stroke.current, b.tool);
  };
  const finish = () => {
    if (!basis.current) return;
    basis.current = null;
    stroke.current = [];
    latest.current.onEnd();
  };
  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        stroke.current = [];
        const v = latest.current;
        basis.current = {
          size: v.size,
          originX: e.nativeEvent.pageX - e.nativeEvent.locationX,
          originY: e.nativeEvent.pageY - e.nativeEvent.locationY,
          tool: v.tool,
        };
        v.onStart();
        paint(e);
      },
      onPanResponderMove: paint,
      onPanResponderRelease: (e) => { paint(e); finish(); },
      onPanResponderTerminate: finish,
      onPanResponderTerminationRequest: () => false,
    }),
  ).current;
  return (
    <View
      {...responder.panHandlers}
      accessibilityLabel="Draw your whole pet here"
      style={{ height: size, width: size, alignSelf: "center", backgroundColor: "#080808", ...({ touchAction: "none" } as any) }}
    >
      <PetPixels pixels={pixels} size={size} gridSize={DRAW_SIZE} grid />
    </View>
  );
}
