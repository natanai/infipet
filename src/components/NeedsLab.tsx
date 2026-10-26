import React, { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import {
  needs,
  needsById,
  needValueAt,
  setNeedKeyframe,
  removeNeedKeyframe,
  MAX_NEED_TICK,
  type NeedId,
  type NeedKeyframe,
  type WellbeingState,
} from "../needs";
import { T, terminal as s } from "../theme";
import Slider from "./TimelineSlider";
import { Command } from "./Terminal";
import type { DevelopmentState } from "../simulation";

export type NeedsLabProps = {
  timeline: NeedKeyframe[];
  age: number;
  hatchAt: number;
  wellbeing: WellbeingState;
  development?: DevelopmentState;
  onChange: (timeline: NeedKeyframe[]) => void;
  onPreview?: (timeline: NeedKeyframe[] | null) => void;
  onSeek: (age: number) => void;
  onPause: () => void;
  onClose: () => void;
  resetKey?: number;
};

const clone = (timeline: NeedKeyframe[]) =>
  timeline.map((event) => ({ ...event }));
const same = (a: NeedKeyframe[], b: NeedKeyframe[]) =>
  JSON.stringify(a) === JSON.stringify(b);
const hourLabel = (tick: number) =>
  `DAY ${Math.floor(tick / 24)} / ${String(tick % 24).padStart(2, "0")}:00`;
const percent = (value: number) => Math.round(value * 100);
const initialNeed = (needs.find((need) => need.id === "safety") ?? needs[0]).id;

/** Inline authoring controls. Only the final value of a drag enters undo/history. */
export function NeedsLab(props: NeedsLabProps) {
  const {
    timeline,
    age,
    hatchAt,
    onChange,
    onPreview,
    onSeek,
    onPause,
    onClose,
    resetKey = 0,
  } = props;
  const [selectedId, setSelectedId] = useState<NeedId>(initialNeed);
  const [query, setQuery] = useState("");
  const [browse, setBrowse] = useState(false);
  const [definition, setDefinition] = useState(false);
  const [inspecting, setInspecting] = useState(false);
  const [preview, setPreview] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [undo, setUndo] = useState<NeedKeyframe[][]>([]);
  const [redo, setRedo] = useState<NeedKeyframe[][]>([]);
  const latest = useRef(props);
  latest.current = props;
  const gesture = useRef<{
    before: NeedKeyframe[];
    needId: NeedId;
    tick: number;
  } | null>(null);
  const tick = Math.min(
    MAX_NEED_TICK,
    Math.max(0, Math.round(Math.max(0, age - hatchAt) * 24)),
  );
  const incubating = hatchAt > 0 && age < hatchAt;
  const selected = needsById.get(selectedId)!;
  const currentValue = needValueAt(timeline, selectedId, tick);
  const dial = preview ?? percent(currentValue);
  const selectedEvents = timeline
    .filter((event) => event.needId === selectedId)
    .sort((a, b) => a.tick - b.tick);
  const eventHere = selectedEvents.find((event) => event.tick === tick);
  const changedIds = new Set<NeedId>([
    selectedId,
    ...timeline.map((event) => event.needId),
  ]);
  const chips = [
    selected,
    ...needs.filter(
      (need) => need.id !== selectedId && changedIds.has(need.id),
    ),
  ];
  const term = query.trim().toLowerCase();
  const results = needs.filter(
    (need) =>
      !term ||
      `${need.title} ${need.category} ${need.definition}`
        .toLowerCase()
        .includes(term),
  );

  const cancelPreview = () => {
    gesture.current = null;
    setPreview(null);
    latest.current.onPreview?.(null);
  };
  useEffect(() => {
    cancelPreview();
    setUndo([]);
    setRedo([]);
    setError("");
  }, [resetKey]);
  useEffect(() => () => latest.current.onPreview?.(null), []);
  useEffect(() => {
    // Rewinding or selecting a different hour restores the dial from the recipe.
    if (gesture.current && gesture.current.tick !== tick) cancelPreview();
  }, [tick]);

  const begin = () => {
    if (incubating) return;
    onPause();
    setError("");
    gesture.current = { before: clone(timeline), needId: selectedId, tick };
    onSeek(hatchAt + tick / 24);
  };
  const drag = (value: number) => {
    if (incubating) return;
    if (!gesture.current) begin();
    const transaction = gesture.current;
    if (!transaction) return;
    const nextValue = Math.max(0, Math.min(100, Math.round(value)));
    setPreview(nextValue);
    try {
      onPreview?.(
        setNeedKeyframe(transaction.before, {
          needId: transaction.needId,
          tick: transaction.tick,
          fulfillment: nextValue / 100,
        }),
      );
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "This need change could not be previewed.",
      );
      setPreview(null);
      onPreview?.(null);
    }
  };
  const commit = (value: number) => {
    const transaction = gesture.current;
    if (!transaction || incubating) {
      cancelPreview();
      return;
    }
    try {
      const next = setNeedKeyframe(transaction.before, {
        needId: transaction.needId,
        tick: transaction.tick,
        fulfillment: Math.max(0, Math.min(100, Math.round(value))) / 100,
      });
      if (!same(transaction.before, next)) {
        setUndo((history) => [...history.slice(-39), transaction.before]);
        setRedo([]);
        onChange(next);
      }
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "This need change could not be saved.",
      );
    }
    cancelPreview();
  };
  const replace = (next: NeedKeyframe[]) => {
    cancelPreview();
    if (same(timeline, next)) return;
    onPause();
    setUndo((history) => [...history.slice(-39), clone(timeline)]);
    setRedo([]);
    onChange(next);
  };
  const select = (id: NeedId) => {
    cancelPreview();
    setSelectedId(id);
    setDefinition(false);
    setBrowse(false);
    setQuery("");
  };

  return (
    <View
      style={{
        borderTopWidth: 1,
        borderColor: T.line,
        padding: 10,
        gap: 6,
        backgroundColor: T.bg,
      }}
    >
      <View style={[s.row, { justifyContent: "space-between" }]}>
        <Text style={s.bright}>NEEDS LAB</Text>
        <Command
          label="Close Needs Lab"
          style={{ paddingVertical: 5 }}
          onPress={() => {
            cancelPreview();
            onClose();
          }}
        >
          [CLOSE]
        </Command>
      </View>
      {incubating && (
        <Text style={[s.text, { color: T.warning }]}>
          Needs begin when the egg hatches.
        </Text>
      )}
      <View style={s.row}>
        <Command
          label={`Choose a need, currently ${selected.title}`}
          active={browse}
          style={{ flex: 1, minWidth: 0, paddingVertical: 6 }}
          onPress={() => {
            cancelPreview();
            setBrowse(!browse);
          }}
        >
          <Text numberOfLines={1} ellipsizeMode="tail" style={s.bright}>
            {selected.title} v
          </Text>
        </Command>
        <Text accessibilityLabel={`${dial}% fulfilled`} style={s.bright}>
          {dial}%
        </Text>
        <Command
          label={`About ${selected.title}`}
          active={definition}
          style={{ paddingVertical: 6 }}
          onPress={() => setDefinition(!definition)}
        >
          [?]
        </Command>
      </View>
      {browse && (
        <View style={{ gap: 6 }}>
          <TextInput
            accessibilityLabel={`Search all ${needs.length} needs`}
            placeholder={`Search all ${needs.length} needs`}
            placeholderTextColor={T.muted}
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
            style={s.input}
          />
          <ScrollView
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
            style={{ maxHeight: 160, borderWidth: 1, borderColor: T.line }}
            contentContainerStyle={{ padding: 4, gap: 4 }}
          >
            {results.map((need) => (
              <Pressable
                key={need.id}
                accessibilityRole="button"
                accessibilityLabel={`Select ${need.title}`}
                accessibilityState={{ selected: need.id === selectedId }}
                onPress={() => select(need.id)}
                style={{
                  padding: 8,
                  minHeight: 42,
                  backgroundColor: need.id === selectedId ? T.dark : T.bg,
                }}
              >
                <Text style={s.bright}>{need.title}</Text>
                <Text style={[s.muted, { fontSize: 14, lineHeight: 17 }]}>
                  {need.category}
                </Text>
              </Pressable>
            ))}
            {!results.length && (
              <Text style={[s.muted, { padding: 8 }]}>
                No needs match this search.
              </Text>
            )}
          </ScrollView>
        </View>
      )}
      <Slider
        accessibilityLabel={`${selected.title} fulfillment`}
        accessibilityHint="0% is completely unmet. 100% is fully tended."
        accessibilityValue={{
          min: 0,
          max: 100,
          now: dial,
          text: `${dial}% fulfilled`,
        }}
        minimumValue={0}
        maximumValue={100}
        step={1}
        value={dial}
        disabled={incubating}
        onSlidingStart={begin}
        onValueChange={drag}
        onSlidingComplete={commit}
        minimumTrackTintColor={T.text}
        maximumTrackTintColor={T.line}
        thumbTintColor={T.bright}
        style={{ width: "100%", height: 28 }}
      />
      <View style={[s.row, { justifyContent: "space-between" }]}>
        <Text style={[s.muted, { fontSize: 14, lineHeight: 17 }]}>
          0% unmet
        </Text>
        <Text style={[s.muted, { fontSize: 14, lineHeight: 17 }]}>
          100% tended
        </Text>
      </View>
      <View
        style={[s.row, { justifyContent: "space-between", flexWrap: "wrap" }]}
      >
        <Text style={[s.muted, { fontSize: 14, lineHeight: 17 }]}>
          FROM {hourLabel(tick)}
        </Text>
        <Text style={[s.muted, { fontSize: 14, lineHeight: 17 }]}>
          {selected.appearance === "modeled"
            ? "Appearance active"
            : "Feelings only"}
        </Text>
      </View>
      {!!error && <Text style={[s.text, { color: T.warning }]}>{error}</Text>}
      <View style={[s.row, { flexWrap: "wrap", gap: 6 }]}>
        <Command
          label="Undo need change"
          style={{ paddingVertical: 6, paddingHorizontal: 8 }}
          disabled={!undo.length || incubating}
          onPress={() => {
            cancelPreview();
            onPause();
            const previous = undo.at(-1);
            if (previous) {
              setRedo((history) => [...history.slice(-39), clone(timeline)]);
              setUndo((history) => history.slice(0, -1));
              onChange(clone(previous));
            }
          }}
        >
          [UNDO]
        </Command>
        <Command
          label="Redo need change"
          style={{ paddingVertical: 6, paddingHorizontal: 8 }}
          disabled={!redo.length || incubating}
          onPress={() => {
            cancelPreview();
            onPause();
            const next = redo.at(-1);
            if (next) {
              setUndo((history) => [...history.slice(-39), clone(timeline)]);
              setRedo((history) => history.slice(0, -1));
              onChange(clone(next));
            }
          }}
        >
          [REDO]
        </Command>
        <Command
          label={`Remove ${selected.title} keyframe at this hour`}
          style={{ paddingVertical: 6, paddingHorizontal: 8 }}
          disabled={!eventHere || incubating}
          onPress={() =>
            replace(removeNeedKeyframe(timeline, selectedId, tick))
          }
        >
          [REMOVE]
        </Command>
      </View>
      {chips.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 6 }}
        >
          {chips.map((need) => (
            <Command
              key={need.id}
              label={`Select ${need.title}, ${percent(needValueAt(timeline, need.id, tick))}% fulfilled`}
              active={need.id === selectedId}
              style={{ paddingVertical: 5, paddingHorizontal: 8 }}
              onPress={() => select(need.id)}
            >
              <Text
                style={[
                  s.text,
                  { color: need.id === selectedId ? T.bright : T.muted },
                ]}
              >
                {need.title} {percent(needValueAt(timeline, need.id, tick))}%
              </Text>
            </Command>
          ))}
        </ScrollView>
      )}
      {!!selectedEvents.length && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 6 }}
        >
          {selectedEvents.map((event) => (
            <Command
              key={event.tick}
              label={`Seek ${selected.title} change, ${hourLabel(event.tick)}, ${percent(event.fulfillment)}% fulfilled`}
              active={event.tick === tick}
              style={{ paddingVertical: 5, paddingHorizontal: 8 }}
              onPress={() => {
                cancelPreview();
                onPause();
                onSeek(hatchAt + event.tick / 24);
              }}
            >
              <Text style={[s.text, { fontSize: 14, lineHeight: 17 }]}>
                {hourLabel(event.tick)} · {percent(event.fulfillment)}%
              </Text>
            </Command>
          ))}
        </ScrollView>
      )}
      {definition && (
        <View style={{ gap: 6, paddingTop: 4 }}>
          <Text style={s.text}>{selected.definition}</Text>
          <Text style={s.muted}>
            {selected.appearance === "modeled"
              ? "Appearance responds to this need."
              : "Appearance not yet modeled. Feelings still respond."}
          </Text>
          <Text style={s.muted}>
            0% means completely unmet; 100% means fully tended. Changes apply
            from this hour onward. Later keyframes stay in place.
          </Text>
        </View>
      )}
      <Command
        label="Inspect development and need influences"
        active={inspecting}
        style={{ paddingVertical: 6 }}
        onPress={() => setInspecting(!inspecting)}
      >
        {inspecting ? "[-] DEVELOPMENT" : "[+] DEVELOPMENT"}
      </Command>
      {inspecting && props.development && (
        <View
          style={{
            gap: 6,
            borderTopWidth: 1,
            borderColor: T.line,
            paddingTop: 8,
          }}
        >
          <Text style={s.text}>
            Drawing → inherited potential → development
          </Text>
          <Text style={s.muted}>
            {props.development.anatomy.length} current regions ·{" "}
            {props.development.operations.length} active operations
          </Text>
          <Text style={s.muted}>
            {selected.title}: short-term{" "}
            {percent(props.wellbeing.needs[selectedId].shortTerm)}% · shortage
            memory {percent(props.wellbeing.needs[selectedId].memory)}%
          </Text>
          <Text style={s.muted}>
            Grooming gently biases material growth within inherited limits. It
            does not set a finished shape or change need fulfillment.
          </Text>
          {props.development.operations.map((operation) => (
            <Text key={operation.id} style={s.text}>
              {operation.kind.replace(/-/g, " ")} ·{" "}
              {percent(operation.progress)}%
            </Text>
          ))}
          {!props.development.operations.length && (
            <Text style={s.muted}>
              Adaptive remodeling continues between developmental operations.
            </Text>
          )}
          {props.development.commitments.slice(-3).map((commitment) => (
            <Text key={commitment.id} style={s.muted}>
              {hourLabel(commitment.tick)} ·{" "}
              {commitment.option.replace(/-/g, " ")}
            </Text>
          ))}
          <Text style={[s.muted, { fontSize: 12, lineHeight: 16 }]}>
            Genome {props.development.genomeFingerprint} · Source{" "}
            {props.development.sourceFingerprint}
          </Text>
        </View>
      )}
    </View>
  );
}

export default NeedsLab;
