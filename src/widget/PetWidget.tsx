import { HStack, Spacer, Text, VStack, ZStack } from "@expo/ui/swift-ui";
import {
  accessibilityElement,
  accessibilityLabel,
  background,
  border,
  containerBackground,
  font,
  foregroundStyle,
  frame,
  lineLimit,
  offset,
  widgetURL,
} from "@expo/ui/swift-ui/modifiers";
import { createWidget, type WidgetEnvironment } from "expo-widgets";
import type { PetWidgetProps } from "./types";

// This function runs inside the extension's isolated JavaScript runtime.
// Keep runtime constants inside it; only serializable props cross from the app.
// The extension uses SwiftUI's system monospaced face. The app's DOS.ttf is not
// assumed to be registered in the separately packaged WidgetKit extension.
const PetWidget = (props: PetWidgetProps, environment: WidgetEnvironment) => {
  "widget";
  const medium = environment.widgetFamily === "systemMedium";
  const side = medium ? 112 : 88;
  const gridSize =
    Number.isFinite(props.gridSize) && props.gridSize > 0 ? props.gridSize : 64;
  const cell = side / gridSize;
  const muted = "#777777";
  const ink = "#dddddd";
  const paper = "#000000";
  const text = "#aaaaaa";
  const name = props.name || "UNNAMED.EXE";
  const age = Math.max(0, Math.floor(props.age || 0));
  const runs = props.runs || [];
  const pet = (
    <ZStack
      alignment="topLeading"
      modifiers={[
        accessibilityElement("ignore"),
        accessibilityLabel(`${name}, day ${age}`),
      ]}
    >
      <Spacer
        minLength={0}
        modifiers={[
          frame({ width: side, height: side }),
          background(paper),
          border({ color: "#444444", width: 1 }),
        ]}
      />
      {runs.map((run, index) => (
        <Spacer
          key={index}
          minLength={0}
          modifiers={[
            frame({ width: run.width * cell, height: cell }),
            background(run.color),
            offset({ x: run.x * cell, y: run.y * cell }),
          ]}
        />
      ))}
    </ZStack>
  );

  if (medium) {
    return (
      <HStack
        spacing={16}
        modifiers={[
          containerBackground(paper, "widget"),
          widgetURL("infipet://pet"),
        ]}
      >
        {pet}
        <VStack alignment="leading" spacing={7}>
          <Text
            modifiers={[
              font({ size: 10, weight: "regular", design: "monospaced" }),
              foregroundStyle(muted),
            ]}
          >
            INFIPET.EXE
          </Text>
          <Text
            modifiers={[
              font({ size: 16, weight: "regular", design: "monospaced" }),
              foregroundStyle(ink),
              lineLimit(1),
            ]}
          >
            {name}
          </Text>
          <Text
            modifiers={[
              font({ size: 12, design: "monospaced" }),
              foregroundStyle(text),
            ]}
          >{`[ DAY ${age} ]`}</Text>
          <Text
            modifiers={[
              font({ size: 10, design: "monospaced" }),
              foregroundStyle(muted),
            ]}
          >
            GROWTH SNAPSHOT
          </Text>
          <Text
            modifiers={[
              font({ size: 10, design: "monospaced" }),
              foregroundStyle(text),
            ]}
          >
            TAP TO OPEN &gt;
          </Text>
        </VStack>
      </HStack>
    );
  }

  return (
    <VStack
      spacing={4}
      modifiers={[
        containerBackground(paper, "widget"),
        widgetURL("infipet://pet"),
      ]}
    >
      <Text
        modifiers={[
          font({ size: 11, weight: "regular", design: "monospaced" }),
          foregroundStyle(ink),
          lineLimit(1),
        ]}
      >
        {name}
      </Text>
      {pet}
      <Text
        modifiers={[
          font({ size: 9, design: "monospaced" }),
          foregroundStyle(muted),
        ]}
      >{`INFIPET.EXE / DAY ${age}`}</Text>
    </VStack>
  );
};

export default createWidget<PetWidgetProps>("InfipetWidget", PetWidget);
