import React, { useRef } from "react";
import { View } from "react-native";
import type { SliderProps } from "@react-native-community/slider";

export default function TimelineSlider(props: SliderProps) {
  const {
    minimumValue = 0,
    maximumValue = 1,
    value = 0,
    onValueChange,
    onSlidingStart,
    onSlidingComplete,
  } = props;
  const interaction = useRef<"pointer" | "keyboard" | null>(null);
  const lastValue = useRef(value);
  lastValue.current = value;
  const begin = (kind: "pointer" | "keyboard", current: number) => {
    if (props.disabled || interaction.current) return;
    interaction.current = kind;
    onSlidingStart?.(current);
  };
  const finish = (current: number) => {
    if (!interaction.current) return;
    interaction.current = null;
    lastValue.current = current;
    onSlidingComplete?.(current);
  };
  const editingKeys = new Set([
    "ArrowLeft",
    "ArrowRight",
    "ArrowUp",
    "ArrowDown",
    "Home",
    "End",
    "PageUp",
    "PageDown",
  ]);
  const percent =
    maximumValue > minimumValue
      ? Math.max(
          0,
          Math.min(
            100,
            ((value - minimumValue) / (maximumValue - minimumValue)) * 100,
          ),
        )
      : 0;
  const filled =
    typeof props.minimumTrackTintColor === "string"
      ? props.minimumTrackTintColor
      : "#AAAAAA";
  const empty =
    typeof props.maximumTrackTintColor === "string"
      ? props.maximumTrackTintColor
      : "#444444";
  return (
    <View style={[props.style, { justifyContent: "center" }]}>
      {React.createElement(
        "style",
        {},
        ".infipet-timeline { appearance: none; cursor: pointer; outline-offset: 6px; } .infipet-timeline::-webkit-slider-thumb { appearance: none; width: 17px; height: 17px; border-radius: 0; background: #ddd; border: 1px solid #aaa; } .infipet-timeline::-moz-range-thumb { width: 12px; height: 12px; border-radius: 0; background: #ddd; border: 1px solid #aaa; }",
      )}
      {React.createElement("input", {
        type: "range",
        className: "infipet-timeline",
        "aria-label": props.accessibilityLabel,
        min: minimumValue,
        max: maximumValue,
        step: props.step === 0 ? "any" : (props.step ?? 0.1),
        value,
        disabled: props.disabled,
        "aria-valuetext": props.accessibilityValue?.text,
        onPointerDown: (event: React.PointerEvent<HTMLInputElement>) => {
          begin("pointer", Number(event.currentTarget.value));
          event.currentTarget.setPointerCapture?.(event.pointerId);
        },
        onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => {
          if (editingKeys.has(event.key))
            begin("keyboard", Number(event.currentTarget.value));
        },
        onKeyUp: (event: React.KeyboardEvent<HTMLInputElement>) => {
          if (editingKeys.has(event.key) && interaction.current === "keyboard")
            finish(Number(event.currentTarget.value));
        },
        onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
          const next = Number(event.currentTarget.value);
          if (interaction.current) onValueChange?.(next);
          else {
            // Assistive controls can emit an input change without pointer/key events.
            onSlidingStart?.(lastValue.current);
            onValueChange?.(next);
            onSlidingComplete?.(next);
          }
          lastValue.current = next;
        },
        onPointerUp: (event: React.PointerEvent<HTMLInputElement>) =>
          finish(Number(event.currentTarget.value)),
        onPointerCancel: (event: React.PointerEvent<HTMLInputElement>) =>
          finish(Number(event.currentTarget.value)),
        onLostPointerCapture: (event: React.PointerEvent<HTMLInputElement>) =>
          finish(Number(event.currentTarget.value)),
        onBlur: (event: React.FocusEvent<HTMLInputElement>) =>
          finish(Number(event.currentTarget.value)),
        style: {
          width: "100%",
          height: 4,
          borderRadius: 0,
          margin: 0,
          opacity: props.disabled ? 0.45 : 1,
          cursor: props.disabled ? "default" : "pointer",
          background: `linear-gradient(to right, ${filled} ${percent}%, ${empty} ${percent}%)`,
        },
      })}
    </View>
  );
}
