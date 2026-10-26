import React, { useMemo } from "react";
import Svg, { Defs, Line, Pattern, Rect, Ellipse } from "react-native-svg";
import type { Pixel } from "../simulation";

type Props = {
  pixels: Pixel[];
  size: number;
  gridSize?: number;
  grid?: boolean;
  shadow?: boolean;
};

export const PetPixels = React.memo(function PetPixels({
  pixels,
  size,
  gridSize = 64,
  grid = false,
  shadow = false,
}: Props) {
  const runs = useMemo(() => {
    const sorted = [...pixels].sort((a, b) => a.y - b.y || a.x - b.x);
    const result: { x: number; y: number; width: number; color: string }[] = [];
    for (const pixel of sorted) {
      const previous = result[result.length - 1];
      if (
        previous &&
        previous.y === pixel.y &&
        previous.color === pixel.color &&
        previous.x + previous.width === pixel.x
      )
        previous.width += 1;
      else
        result.push({ x: pixel.x, y: pixel.y, width: 1, color: pixel.color });
    }
    return result;
  }, [pixels]);
  return (
    <Svg
      width={size}
      height={size}
      viewBox={`0 0 ${gridSize} ${gridSize}`}
      pointerEvents="none"
    >
      {grid && (
        <>
          <Defs>
            <Pattern
              id="cells"
              width={1}
              height={1}
              patternUnits="userSpaceOnUse"
            >
              <Line
                x1={0}
                y1={0}
                x2={1}
                y2={0}
                stroke="#292929"
                strokeWidth={0.045}
              />
              <Line
                x1={0}
                y1={0}
                x2={0}
                y2={1}
                stroke="#292929"
                strokeWidth={0.045}
              />
            </Pattern>
          </Defs>
          <Rect width={gridSize} height={gridSize} fill="url(#cells)" />
        </>
      )}
      {shadow && pixels.length > 0 && (
        <Ellipse
          cx={gridSize / 2}
          cy={gridSize * 0.84}
          rx={gridSize * 0.2}
          ry={1}
          fill="#777777"
          opacity={0.28}
        />
      )}
      {runs.map((pixel) => (
        <Rect
          key={`${pixel.x},${pixel.y}`}
          x={pixel.x}
          y={pixel.y}
          width={pixel.width + 0.015}
          height={1.015}
          fill={pixel.color}
        />
      ))}
    </Svg>
  );
});
