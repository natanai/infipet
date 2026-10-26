import React from "react";
import { Platform, Text, View } from "react-native";
import Svg, { Rect } from "react-native-svg";
import { PART_GUIDE } from "../part-guide";
import type { PartKind } from "../simulation";
import { T, terminal as s } from "../theme";

/** The parent opens this compact guide from a ? button; there is no always-on help. */
export function PartInfo({ kind }: { kind: PartKind }) {
  const guide = PART_GUIDE[kind];
  return (
    <View style={{ gap: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
        <Svg
          width={64}
          height={64}
          viewBox="0 0 8 8"
          {...(Platform.OS === "web"
            ? { "aria-hidden": true }
            : { accessible: false })}
        >
          {guide.example.flatMap((row, y) =>
            [...row].flatMap((cell, x) =>
              cell === "."
                ? []
                : [
                    <Rect
                      key={`${x},${y}`}
                      x={x}
                      y={y}
                      width={1}
                      height={1}
                      fill={cell === "#" ? T.bright : T.muted}
                    />,
                  ],
            ),
          )}
        </Svg>
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={s.bright}>{guide.title.toUpperCase()}</Text>
          <Text style={s.text}>{guide.purpose}</Text>
        </View>
      </View>
      {(
        [
          ["DRAW IT", guide.placement],
          ["IF IT FLOATS", guide.floating],
          ["AS IT GROWS", guide.growth],
          ["WHEN IT MOVES", guide.activity],
        ] as const
      ).map(([label, body]) => (
        <View key={label} style={{ gap: 4 }}>
          <Text style={s.muted}>{label}</Text>
          <Text style={s.text}>{body}</Text>
        </View>
      ))}
      <Text style={s.muted}>
        The little picture is one idea. Your shape can be different.
      </Text>
    </View>
  );
}

export default PartInfo;
