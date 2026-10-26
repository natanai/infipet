import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AppState,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import Svg, { Line, Rect } from "react-native-svg";
import {
  createSimulation,
  createStarterAnatomy,
  PART_KINDS,
  PART_LABELS,
  DRAW_SIZE,
  WORLD_SIZE,
  type PetPart,
  type PartKind,
  type Point,
  type PetAction,
  type SourceMode,
} from "./src/simulation";
import { drawingPixels, paintStroke, type DrawTool } from "./src/drawing";
import { STARTER_PRESETS, clonePreset } from "./src/presets";
import {
  normalizeGroomTimeline,
  type GroomStroke,
} from "./src/simulation/grooming";
import { GroomCanvas } from "./src/components/GroomCanvas";
import {
  decodePet,
  encodePet,
  loadEditablePet,
  savePet,
  PROTOTYPE_REVISION,
  type PetDocument,
} from "./src/storage";
import { T, terminal as s } from "./src/theme";
import DrawingCanvas from "./src/components/DrawingCanvas";
import ColorPicker from "./src/components/ColorPicker";
import { PetPixels } from "./src/components/PetPixels";
import { PixelIcon } from "./src/components/PixelIcon";
import { PartInfo } from "./src/components/PartInfo";
import Slider from "./src/components/TimelineSlider";
import { SeedSort } from "./src/components/SeedSort";
import { publishWidget } from "./src/widget";
import {
  NEEDS_CATALOG_VERSION,
  NEEDS_RULES_VERSION,
  DEFAULT_PREVIEW_DAYS,
  MAX_SIMULATION_DAYS,
  type NeedKeyframe,
} from "./src/needs";
import { NeedsLab } from "./src/components/NeedsLab";
import { FeelingsSheet } from "./src/components/FeelingsSheet";
import { GamePanel } from "./src/components/GamePanel";
import { RetroGallery } from "./src/components/RetroGallery";
import { RETRO_PRESETS, cloneRetroPreset } from "./src/retro";
import {
  advanceGame,
  commandGame,
  createGame,
  deriveCareTimeline,
  deriveDevelopmentContext,
  type GameCommand,
} from "./src/gameplay";
import { LINEAGE_RECIPE_VERSION, type LivingPet } from "./src/pet-format";
import {
  findSeedVariation,
  preserveDevelopmentalAge,
} from "./src/seed-variation";

type Sheet =
  | "create"
  | "parts"
  | "info"
  | "tools"
  | "color"
  | "more"
  | "seed"
  | "share"
  | "import"
  | "widget"
  | "name"
  | "about"
  | "feelings"
  | "retro"
  | null;
type SourceSnapshot = { parts: PetPart[]; mode: SourceMode };
const copy = (parts: PetPart[]) =>
  parts.map((p) => ({
    ...p,
    position: { ...p.position },
    pixels: p.pixels.map((c) => ({ ...c })),
  }));
const newSeed = () =>
  String(Math.floor(Math.random() * 0xffffffff)).padStart(10, "0");
const clean = (v: string) => v.replace(/[\u0000-\u001f\u007f]/g, "");
const title = (v: string) =>
  v === "elderly" ? "Elder" : v.charAt(0).toUpperCase() + v.slice(1);
const presetThumbnails = new Map(
  STARTER_PRESETS.map((preset) => [preset.id, drawingPixels(preset.parts)]),
);

function Button({
  label,
  children,
  onPress,
  selected = false,
  disabled = false,
  style,
}: {
  label: string;
  children: React.ReactNode;
  onPress: () => void;
  selected?: boolean;
  disabled?: boolean;
  style?: object;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        selected
          ? styles.selected
          : pressed && { backgroundColor: T.dark, borderColor: T.bright },
        disabled && { opacity: 0.3 },
        style,
      ]}
    >
      {({ pressed }) => (
        <View style={styles.buttonContent}>
          {typeof children === "string" ? (
            <Text
              numberOfLines={1}
              style={[s.text, { flexShrink: 1 }, selected && { color: T.bg }]}
            >
              {children}
            </Text>
          ) : (
            children
          )}
        </View>
      )}
    </Pressable>
  );
}
function IconButton({
  icon,
  label,
  onPress,
  selected,
  disabled,
}: {
  icon: React.ComponentProps<typeof PixelIcon>["name"];
  label: string;
  onPress: () => void;
  selected?: boolean;
  disabled?: boolean;
}) {
  return (
    <Button
      label={label}
      onPress={onPress}
      selected={selected}
      disabled={disabled}
    >
      <PixelIcon name={icon} color={selected ? T.bg : T.bright} />
    </Button>
  );
}

export default function App() {
  const { width, height } = useWindowDimensions();
  const [fontLoaded, fontError] = useFonts({
    DOS: require("./assets/fonts/DOS.ttf"),
  });
  const [parts, setParts] = useState<PetPart[]>([]);
  const [mode, setMode] = useState<SourceMode>("infant");
  const [name, setName] = useState("Little one");
  const [seed, setSeed] = useState("87320104");
  const [seedInput, setSeedInput] = useState(seed);
  const [bornAt, setBornAt] = useState(Date.now);
  const [age, setAge] = useState(0);
  const [view, setView] = useState<"draw" | "live">("draw");
  const [kind, setKind] = useState<PartKind>("body");
  const [color, setColor] = useState("#DDDDDD");
  const [tool, setTool] = useState<DrawTool>("paint");
  const [mirror, setMirror] = useState(false);
  const [history, setHistory] = useState<SourceSnapshot[]>([]);
  const [redo, setRedo] = useState<SourceSnapshot[]>([]);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [timeOpen, setTimeOpen] = useState(false);
  const [time, setTime] = useState(0);
  const [action, setAction] = useState<PetAction>("idle");
  const [target, setTarget] = useState<Point | null>(null);
  const [motion, setMotion] = useState(true);
  const [growing, setGrowing] = useState(false);
  const [speed, setSpeed] = useState(4);
  const [hydrated, setHydrated] = useState(false);
  const [writable, setWritable] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [notice, setNotice] = useState("");
  const [importInput, setImportInput] = useState("");
  const [importError, setImportError] = useState("");
  const [showCode, setShowCode] = useState(false);
  const [widgetMessage, setWidgetMessage] = useState("");
  const [needTimeline, setNeedTimeline] = useState<NeedKeyframe[]>([]);
  const [groomingTimeline, setGroomingTimeline] = useState<GroomStroke[]>([]);
  const [grooming, setGrooming] = useState(false);
  const [groomUndo, setGroomUndo] = useState<GroomStroke[][]>([]);
  const [groomRedo, setGroomRedo] = useState<GroomStroke[][]>([]);
  const [needPreview, setNeedPreview] = useState<NeedKeyframe[] | null>(null);
  const [labOpen, setLabOpen] = useState(false);
  const [timeExtent, setTimeExtent] = useState(240);
  const [labIdentity, setLabIdentity] = useState(0);
  const [rerollBusy, setRerollBusy] = useState(false);
  const [dayInput, setDayInput] = useState("0");
  const [life, setLife] = useState<LivingPet | undefined>();
  const lifeRef = useRef<LivingPet | undefined>(undefined);
  const presence = useRef<"active" | "absent">(
    AppState.currentState === "active" ? "active" : "absent",
  );
  const [sandbox, setSandbox] = useState(false);
  const [settling, setSettling] = useState(false);
  const commandPending = useRef(false);
  const deathSeen = useRef<string | null>(null);
  const playing = view === "live" && !sandbox && !!life;
  const wideLab = view === "live" && labOpen && width >= 900;
  const size = Math.floor(
    Math.min(
      width - 48,
      wideLab
        ? Math.max(260, height - 220)
        : labOpen && view === "live"
          ? Math.max(250, height - 650)
          : Math.max(260, height - (view === "live" && timeOpen ? 430 : 250)),
      wideLab ? 440 : 520,
    ),
  );
  const controlsWidth = wideLab
    ? 360
    : labOpen
      ? Math.min(width - 24, 544)
      : size + 24;
  const simulation = useMemo(
    () =>
      createSimulation(parts, seed, mode, {
        needTimeline: needPreview ?? needTimeline,
        groomingTimeline,
      }),
    [parts, seed, mode, needTimeline, needPreview, groomingTimeline],
  );
  const timelineEnd =
    simulation.hatchAt +
    Math.max(
      timeExtent,
      DEFAULT_PREVIEW_DAYS,
      Math.ceil(Math.max(0, age - simulation.hatchAt) / DEFAULT_PREVIEW_DAYS) *
        DEFAULT_PREVIEW_DAYS,
    );
  const previewFrame = useMemo(
    () =>
      simulation.frameAt(age, { time, action, ...(target ? { target } : {}) }),
    [simulation, age, time, action, target],
  );
  const liveRecipe = life
    ? JSON.stringify({
        care: deriveCareTimeline(life.game),
        context: deriveDevelopmentContext(life.game),
        grooming: life.groomingTimeline,
      })
    : "";
  const livingSimulation = useMemo(() => {
    if (!life || !liveRecipe) return null;
    const recipe = JSON.parse(liveRecipe);
    return createSimulation(life.parts, life.seed, life.mode, {
      needTimeline: recipe.care,
      groomingTimeline: recipe.grooming,
      liveContext: recipe.context,
      // Actual timestamped care and sampled physiology drive material growth.
      careGame: life.game,
    });
  }, [life?.parts, life?.seed, life?.mode, life?.game, liveRecipe]);
  const liveAge = life
    ? Math.max(
        0,
        (life.game.clock.nowMs - life.game.clock.startedAtMs) / 86400000,
      )
    : 0;
  const livingFrame = useMemo(
    () =>
      livingSimulation?.frameAt(liveAge, {
        time,
        action: life?.game.sleeping || life?.game.dead ? "idle" : action,
        ...(target ? { target } : {}),
      }),
    [
      livingSimulation,
      liveAge,
      time,
      action,
      target,
      life?.game.sleeping,
      life?.game.dead,
    ],
  );
  const frame = playing && livingFrame ? livingFrame : previewFrame;
  const pixels = useMemo(() => drawingPixels(parts), [parts]);
  const document: PetDocument = {
    version: 8,
    algorithmVersion: 7,
    revision: PROTOTYPE_REVISION,
    mode,
    name: name.trim() || "Little one",
    seed,
    parts,
    bornAt,
    age,
    needTimeline,
    groomingTimeline,
    catalogVersion: NEEDS_CATALOG_VERSION,
    needsRulesVersion: NEEDS_RULES_VERSION,
    ...(life ? { life } : {}),
  };
  const latest = useRef({ document, writable });
  latest.current = { document, writable };
  const commitLife = (next: LivingPet | undefined) => {
    lifeRef.current = next;
    setLife(next);
    if (next)
      latest.current.document = { ...latest.current.document, life: next };
    else {
      const { life: previous, ...draft } = latest.current.document;
      latest.current.document = draft;
    }
  };
  const stroke = useRef({
    before: parts,
    next: parts,
    kind,
    color,
    mirror,
    mode,
  });

  useEffect(() => {
    let active = true;
    void loadEditablePet()
      .then((doc) => {
        if (!active) return;
        presence.current =
          AppState.currentState === "active" ? "active" : "absent";
        if (doc) {
          setParts(doc.parts);
          setMode(doc.mode);
          setName(doc.name);
          setSeed(doc.seed);
          setSeedInput(doc.seed);
          setBornAt(doc.bornAt);
          setAge(doc.age);
          setNeedTimeline(doc.needTimeline);
          setGroomingTimeline(doc.groomingTimeline ?? []);
          if (doc.life) {
            const resumed = {
              ...doc.life,
              game: advanceGame(doc.life.game, Date.now(), "absent"),
            };
            commitLife(resumed);
            setView("live");
            setSandbox(false);
          }
          setWritable(true);
        } else setSheet("create");
        setHydrated(true);
      })
      .catch(() => {
        if (active) {
          setSaveError("Storage unavailable. Export your pet to keep a copy.");
          setHydrated(true);
          setSheet("create");
        }
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!hydrated || !writable) return;
    const timer = setTimeout(() => {
      void savePet(latest.current.document)
        .then(() => setSaveError(""))
        .catch(() => setSaveError("Could not save. Export a copy from More."));
    }, 350);
    return () => clearTimeout(timer);
  }, [
    hydrated,
    writable,
    parts,
    mode,
    name,
    seed,
    bornAt,
    age,
    needTimeline,
    groomingTimeline,
    life?.parts,
    life?.seed,
    life?.name,
  ]);
  useEffect(() => {
    if (!hydrated) return;
    let checkpoint = Date.now();
    const tick = () => {
      const current = lifeRef.current;
      if (!current || current.game.dead || presence.current !== "active")
        return;
      const next = {
        ...current,
        game: advanceGame(current.game, Date.now(), "active"),
      };
      commitLife(next);
      if (
        (next.game.dead || Date.now() - checkpoint >= 5000) &&
        latest.current.writable
      ) {
        checkpoint = Date.now();
        void savePet(latest.current.document)
          .then(() => setSaveError(""))
          .catch(() => setSaveError("Progress is unsaved. Retrying..."));
      }
    };
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [hydrated]);
  useEffect(() => {
    setDayInput(Math.max(0, age - simulation.hatchAt).toFixed(1));
  }, [age, simulation.hatchAt]);
  useEffect(() => {
    if (!growing || !writable) return;
    const timer = setInterval(() => {
      void savePet(latest.current.document).catch(() =>
        setSaveError("Could not save. Export a copy from More."),
      );
    }, 2500);
    return () => clearInterval(timer);
  }, [growing, writable]);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      const nextPresence = state === "active" ? "active" : "absent";
      const current = lifeRef.current;
      if (current && presence.current !== nextPresence) {
        commitLife({
          ...current,
          game: advanceGame(current.game, Date.now(), presence.current),
        });
      }
      presence.current = nextPresence;
      if (state !== "active") {
        setGrowing(false);
        setMotion(false);
        if (latest.current.writable)
          void savePet(latest.current.document).catch(() =>
            setSaveError("Could not save. Export a copy from More."),
          );
      } else setMotion(true);
    });
    return () => sub.remove();
  }, []);
  useEffect(() => {
    if (!motion || view !== "live") return;
    const timer = setInterval(() => setTime((t) => t + 0.1), 100);
    return () => clearInterval(timer);
  }, [motion, view]);
  useEffect(() => {
    if (!growing || view !== "live") return;
    const timer = setInterval(
      () =>
        setAge((a) => {
          const next = Math.min(MAX_SIMULATION_DAYS, a + 0.1 * speed);
          return next;
        }),
      100,
    );
    return () => clearInterval(timer);
  }, [growing, view, speed]);
  useEffect(() => {
    if (view === "draw") setGrowing(false);
  }, [view]);
  useEffect(() => {
    if (
      (action === "move" && !frame.capabilities.canMove) ||
      (action === "play" && !frame.capabilities.canPlay) ||
      (action === "greet" && !frame.capabilities.canGreet)
    ) {
      setAction("idle");
      setTarget(null);
      setTime(0);
    }
  }, [
    action,
    frame.capabilities.canMove,
    frame.capabilities.canPlay,
    frame.capabilities.canGreet,
  ]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 3500);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (!life?.game.dead) return;
    const identity = `${life.seed}:${life.game.clock.startedAtMs}`;
    if (deathSeen.current === identity) return;
    deathSeen.current = identity;
    setSandbox(true);
    setView("draw");
    setSheet("create");
  }, [life?.game.dead, life?.game.clock.startedAtMs, life?.seed]);
  useEffect(() => {
    if (Platform.OS !== "web" || !sheet) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSheet(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheet]);

  const resetPreview = () => {
    setAge(0);
    setTime(0);
    setAction("idle");
    setTarget(null);
    setGrowing(false);
    setWritable(true);
  };
  const begin = () => {
    stroke.current = {
      before: copy(parts),
      next: parts,
      kind,
      color,
      mirror,
      mode,
    };
    setGrowing(false);
  };
  const paint = (points: Point[], brush: DrawTool) => {
    try {
      const next = paintStroke(
        stroke.current.before,
        stroke.current.kind,
        stroke.current.color,
        points,
        brush,
        { mirror: stroke.current.mirror },
      );
      if (next === stroke.current.before) return;
      stroke.current.next = next;
      setParts(next);
      resetPreview();
    } catch {
      setNotice("That stroke could not be drawn. Try a smaller stroke.");
    }
  };
  const finish = () => {
    if (
      JSON.stringify(stroke.current.before) !==
      JSON.stringify(stroke.current.next)
    ) {
      setHistory((h) => [
        ...h.slice(-39),
        { parts: stroke.current.before, mode: stroke.current.mode },
      ]);
      setRedo([]);
    }
  };
  const replace = (next: PetPart[]) => {
    setHistory((h) => [...h.slice(-39), { parts: copy(parts), mode }]);
    setRedo([]);
    setParts(next);
    resetPreview();
    setView("draw");
    setSheet(null);
  };
  const undo = () => {
    const before = history.at(-1);
    if (!before) return;
    setRedo((r) => [...r, { parts: copy(parts), mode }]);
    setHistory((h) => h.slice(0, -1));
    setParts(before.parts);
    setMode(before.mode);
    resetPreview();
    setView("draw");
  };
  const redoStroke = () => {
    const next = redo.at(-1);
    if (!next) return;
    setHistory((h) => [...h, { parts: copy(parts), mode }]);
    setRedo((r) => r.slice(0, -1));
    setParts(next.parts);
    setMode(next.mode);
    resetPreview();
    setView("draw");
    setSheet(null);
  };
  const start = (
    next: SourceMode,
    presetId?: string,
    seedOverride?: string,
  ) => {
    const retro = RETRO_PRESETS.find((item) => item.id === presetId);
    const preset =
      retro ?? STARTER_PRESETS.find((item) => item.id === presetId);
    setNeedTimeline([]);
    setGroomingTimeline([]);
    setGrooming(false);
    setGroomUndo([]);
    setGroomRedo([]);
    setTimeExtent(DEFAULT_PREVIEW_DAYS);
    setNeedPreview(null);
    setLabIdentity((value) => value + 1);
    setLabOpen(false);
    setMode(next);
    setParts(
      preset
        ? retro
          ? cloneRetroPreset(retro.id)
          : clonePreset(preset.id)
        : next === "egg"
          ? createStarterAnatomy("egg")
          : [],
    );
    setKind(next === "egg" ? "egg" : "body");
    setTool("paint");
    setHistory([]);
    setRedo([]);
    const nextSeed = seedOverride ?? retro?.seed ?? newSeed();
    setSeed(nextSeed);
    setSeedInput(nextSeed);
    setName(preset?.name ?? "Little one");
    setBornAt(Date.now());
    resetPreview();
    setView("draw");
    setTimeOpen(false);
    setSheet(null);
    setSandbox(true);
  };
  const live = () => {
    setView("live");
    setSandbox(false);
    setLabOpen(false);
    setTimeOpen(false);
    setMotion(true);
  };
  const beginLife = async () => {
    if (!pixels.length || commandPending.current) return;
    commandPending.current = true;
    const next: LivingPet = {
      lineageVersion: LINEAGE_RECIPE_VERSION,
      parts: copy(parts),
      mode,
      seed,
      name: name.trim() || "Little one",
      game: createGame(seed, mode, Date.now(), {
        utcOffsetMinutes: -new Date().getTimezoneOffset(),
      }),
      groomingTimeline: [],
    };
    commitLife(next);
    setWritable(true);
    latest.current.writable = true;
    setView("live");
    setSandbox(false);
    setLabOpen(false);
    setTimeOpen(false);
    setAction("idle");
    setTarget(null);
    setTime(0);
    setMotion(true);
    setGrooming(false);
    setSettling(true);
    try {
      await savePet(latest.current.document);
      setSaveError("");
    } catch {
      setSaveError("Progress is unsaved. Retrying...");
    } finally {
      commandPending.current = false;
      setSettling(false);
    }
  };
  const careCommand = async (command: GameCommand) => {
    const current = lifeRef.current;
    if (!current || commandPending.current) return;
    commandPending.current = true;
    setSettling(true);
    const now = Date.now();
    const id = `command:${now}:${current.game.history.length}:${current.game.receipts.length}`;
    try {
      const next = {
        ...current,
        game: commandGame(current.game, command, now, id),
      };
      commitLife(next);
      await savePet(latest.current.document);
      setSaveError("");
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? error.message
          : "Progress is unsaved. Retrying...",
      );
    } finally {
      commandPending.current = false;
      setSettling(false);
    }
  };
  const act = (next: PetAction) => {
    setGrooming(false);
    setAction(next);
    setView("live");
    setMotion(true);
    setTime(0);
    setTarget(null);
    if (next === "play") {
      const resting = simulation.frameAt(age);
      const part =
        resting.parts.find(
          (p) => p.id === resting.capabilities.effectorIds[0],
        ) ?? resting.parts[0];
      const point = part?.pixels[Math.floor(part.pixels.length / 2)];
      if (point) setTarget({ x: point.x + 0.4, y: point.y - 0.4 });
    }
  };
  const restore = (doc: PetDocument) => {
    commitLife(
      doc.life
        ? {
            ...doc.life,
            game: advanceGame(doc.life.game, Date.now(), "absent"),
          }
        : undefined,
    );
    setSandbox(false);
    setNeedTimeline(doc.needTimeline);
    setGroomingTimeline(doc.groomingTimeline ?? []);
    setGrooming(false);
    setGroomUndo([]);
    setGroomRedo([]);
    setNeedPreview(null);
    setLabIdentity((value) => value + 1);
    setLabOpen(false);
    setParts(doc.parts);
    setMode(doc.mode);
    setName(doc.name);
    setSeed(doc.seed);
    setSeedInput(doc.seed);
    setAge(doc.age);
    setBornAt(doc.bornAt);
    setHistory([]);
    setRedo([]);
    setTime(0);
    setAction("idle");
    setTarget(null);
    setGrowing(false);
    setWritable(true);
    setView(doc.life ? "live" : "draw");
    setSheet(null);
  };
  const open = (next: Sheet) => {
    if (next === "seed") setSeedInput(seed);
    if (next === "import") {
      setImportError("");
      setImportInput("");
    }
    if (next === "share") setShowCode(false);
    if (next === "widget") setWidgetMessage("");
    setSheet(next);
  };
  const changeSeed = (next: string) => {
    setSandbox(true);
    const nextSimulation = createSimulation(parts, next, mode, {
      needTimeline,
      groomingTimeline,
    });
    setAge(
      preserveDevelopmentalAge(
        latest.current.document.age,
        simulation,
        nextSimulation,
      ),
    );
    setSeed(next);
    setSeedInput(next);
    setTime(0);
    setAction("idle");
    setTarget(null);
    setGrowing(false);
    setNeedPreview(null);
    setWritable(true);
    setView("live");
    setSheet(null);
  };
  const reroll = async () => {
    if (rerollBusy) return;
    setGrowing(false);
    setRerollBusy(true);
    const captured = { parts, seed, mode, needTimeline, groomingTimeline };
    try {
      const result = await findSeedVariation({
        current: createSimulation(parts, seed, mode, {
          needTimeline,
          groomingTimeline,
        }),
        build: (next) =>
          createSimulation(parts, next, mode, {
            needTimeline,
            groomingTimeline,
          }),
        nextSeed: newSeed,
      });
      const current = latest.current.document;
      if (
        current.parts !== captured.parts ||
        current.seed !== captured.seed ||
        current.mode !== captured.mode ||
        current.needTimeline !== captured.needTimeline ||
        current.groomingTimeline !== captured.groomingTimeline
      )
        return;
      changeSeed(result.seed);
      if (!result.different)
        setNotice(
          "Seed changed; no clear silhouette difference was found in 16 comparisons.",
        );
    } catch {
      setNotice("Could not compare those seeds. Try another seed.");
    } finally {
      setRerollBusy(false);
    }
  };
  const openLab = () => {
    setSandbox(true);
    setView("live");
    setTimeOpen(true);
    setLabOpen(true);
    setGrowing(false);
    setSheet(null);
  };
  const groomStroke = (from: Point, to: Point) => {
    const stroke = (playing ? livingSimulation : simulation)?.groomingStrokeAt(
      playing ? liveAge : age,
      from,
      to,
    );
    if (!stroke) {
      setNotice("Start your stroke on a body part.");
      return;
    }
    const currentLife = lifeRef.current;
    if (playing && currentLife) {
      commitLife({
        ...currentLife,
        groomingTimeline: normalizeGroomTimeline([
          ...currentLife.groomingTimeline,
          {
            ...stroke,
            id: `groom-${Date.now()}-${currentLife.groomingTimeline.length}`,
          },
        ]),
      });
      void savePet(latest.current.document).catch(() =>
        setSaveError("Progress is unsaved. Retrying..."),
      );
      return;
    }
    const next = normalizeGroomTimeline([
      ...groomingTimeline,
      { ...stroke, id: `groom-${Date.now()}-${groomingTimeline.length}` },
    ]);
    if (JSON.stringify(next) === JSON.stringify(groomingTimeline)) return;
    setGroomUndo((history) => [...history.slice(-39), groomingTimeline]);
    setGroomRedo([]);
    setGroomingTimeline(next);
    setWritable(true);
    setNotice("Stroke recorded. Scrub forward to see its influence.");
  };
  const seekDevelopmentalDay = () => {
    const value = Number(dayInput);
    if (!Number.isFinite(value)) return;
    setGrowing(false);
    setAge(
      simulation.hatchAt +
        Math.max(0, Math.min(MAX_SIMULATION_DAYS, Math.round(value * 24) / 24)),
    );
  };
  const share = async () => {
    try {
      if (Platform.OS === "web") {
        await navigator.clipboard.writeText(encodePet(document));
        setNotice("Pet code copied.");
      } else
        await Share.share({
          title: document.name,
          message: encodePet(document),
        });
    } catch {
      setShowCode(true);
    }
  };
  const download = () => {
    if (Platform.OS !== "web") return;
    const a = window.document.createElement("a");
    a.href = URL.createObjectURL(
      new Blob([encodePet(document)], { type: "application/json" }),
    );
    a.download = document.name.replace(/[^a-z0-9]/gi, "-") + ".infipet.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const widget = async () => {
    try {
      const result = await publishWidget(
        frame.pixels,
        playing && life ? life.name : document.name,
        playing ? liveAge : age,
      );
      setWidgetMessage(result.message);
    } catch {
      setWidgetMessage(
        "The Home Screen widget needs a signed iOS development build.",
      );
    }
  };
  const contact = frame.interaction.contactPoint;
  const ballTarget = frame.interaction.target ?? target;
  const flight = Math.min(1, time / 1.1);
  const ball =
    action === "play" && ballTarget
      ? time >= 1.1 && frame.interaction.status === "caught" && contact
        ? contact
        : {
            x:
              62 +
              (ballTarget.x - 62) * flight +
              (frame.interaction.status === "nudged" && time > 1.1
                ? Math.sin((Math.min(1, time - 1.1) * Math.PI) / 2) * 8
                : 0),
            y: 4 + (ballTarget.y - 4) * flight - Math.sin(flight * Math.PI) * 5,
          }
      : null;
  const sheetTitles: Record<Exclude<Sheet, null>, string> = {
    create: "A little beginning",
    parts: "What are you drawing?",
    info: PART_LABELS[kind],
    tools: "Drawing tools",
    color: "Color",
    more: "More",
    seed: "Another possible life",
    share: "Share a little life",
    import: "Welcome a pet",
    widget: "A little window",
    name: "A name",
    about: "About Infipet",
    feelings: "A little check-in",
    retro: "Retro drawings",
  };

  if ((!fontLoaded && !fontError) || !hydrated)
    return (
      <View style={styles.loading}>
        <Text style={[s.text, { fontFamily: "monospace" }]}>Waking up...</Text>
      </View>
    );
  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.root}>
        <StatusBar style="light" />
        <ScrollView
          contentContainerStyle={styles.page}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[styles.workbench, wideLab && styles.wideWorkbench]}>
            <View style={styles.creatureColumn}>
              <View
                style={[
                  styles.header,
                  {
                    width:
                      labOpen && view === "live" && !wideLab
                        ? controlsWidth
                        : size + 24,
                  },
                ]}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Rename pet"
                  onPress={() => open("name")}
                  style={{ flex: 1, minWidth: 0 }}
                >
                  <Text
                    numberOfLines={1}
                    style={[s.bright, { fontSize: 23, lineHeight: 26 }]}
                  >
                    {playing && life ? life.name : document.name}
                  </Text>
                  <Text numberOfLines={1} style={s.muted}>
                    {view === "draw"
                      ? life && !life.game.dead
                        ? "Lab drawing · your pet lives on"
                        : mode === "egg"
                          ? "An egg, drawn by you"
                          : "An infant, drawn by you"
                      : playing && life
                        ? `${title(life.game.stage)} · day ${liveAge.toFixed(1)}${life.game.sleeping ? " · asleep" : ""}`
                        : `Lab · ${title(frame.stage)} · day ${age.toFixed(1)}`}
                  </Text>
                </Pressable>
                {view === "live" && (
                  <>
                    <IconButton
                      icon="feel"
                      label="Check how your pet feels"
                      disabled={frame.stage === "egg"}
                      onPress={() => open("feelings")}
                    />
                    <IconButton
                      icon="time"
                      label="Open growth timeline"
                      selected={timeOpen}
                      onPress={() => {
                        setSandbox(true);
                        setTimeOpen(!timeOpen);
                      }}
                    />
                  </>
                )}
              </View>
              {!playing && (
                <View style={{ width: size + 24, gap: 8, marginBottom: 10 }}>
                  <Button
                    label={
                      life ? "Begin new life from this drawing" : "Begin life"
                    }
                    disabled={!pixels.length || settling}
                    onPress={() => void beginLife()}
                  >
                    {life ? "Begin new life from drawing" : "Begin life"}
                  </Button>
                  {life && !life.game.dead && (
                    <Text style={s.muted}>
                      Your living pet keeps its drawing and seed. Beginning a
                      new life replaces it.
                    </Text>
                  )}
                </View>
              )}
              <View style={[styles.device, { width: size + 24 }]}>
                <View style={[styles.toolbar, { width: size }]}>
                  {view === "draw" ? (
                    <>
                      <Button
                        label="Choose drawing part"
                        onPress={() => open("parts")}
                        style={{ flex: 1 }}
                      >{`${PART_LABELS[kind]} v`}</Button>
                      <IconButton
                        icon="info"
                        label={`Learn about ${PART_LABELS[kind].toLowerCase()}`}
                        onPress={() => open("info")}
                      />
                      <Button
                        label="Choose brush color"
                        onPress={() => open("color")}
                      >
                        <View
                          style={{
                            width: 20,
                            height: 20,
                            backgroundColor: color,
                            borderColor: T.text,
                            borderWidth: 1,
                          }}
                        />
                      </Button>
                      <IconButton
                        icon={tool === "erase" ? "erase" : "draw"}
                        label={tool === "erase" ? "Use pencil" : "Use eraser"}
                        selected={tool === "erase"}
                        onPress={() =>
                          setTool(tool === "paint" ? "erase" : "paint")
                        }
                      />
                      {width >= 360 && (
                        <IconButton
                          icon="undo"
                          label="Undo drawing"
                          disabled={!history.length}
                          onPress={undo}
                        />
                      )}
                      <IconButton
                        icon="more"
                        label="More drawing tools"
                        onPress={() => open("tools")}
                      />
                    </>
                  ) : playing ? (
                    <>
                      <Text style={[s.muted, { flex: 1 }]}>
                        {life?.game.stage === "egg"
                          ? "Waiting for a little life"
                          : "Your pocket companion"}
                      </Text>
                      <IconButton
                        icon="move"
                        label="Watch your pet explore"
                        selected={action === "move"}
                        disabled={
                          !!life?.game.sleeping || !frame.capabilities.canMove
                        }
                        onPress={() => act(action === "move" ? "idle" : "move")}
                      />
                      <IconButton
                        icon="groom"
                        label="Groom your living pet"
                        selected={grooming}
                        disabled={
                          life?.game.stage === "egg" || !!life?.game.sleeping
                        }
                        onPress={() => {
                          setGrooming(!grooming);
                          setAction("idle");
                        }}
                      />
                    </>
                  ) : (
                    <>
                      {(
                        [
                          { value: "idle", icon: "idle", label: "Rest" },
                          {
                            value: "move",
                            icon: "move",
                            label: "Go exploring",
                          },
                          { value: "play", icon: "play", label: "Play ball" },
                          { value: "greet", icon: "greet", label: "Say hello" },
                        ] as const
                      ).map((a) => (
                        <IconButton
                          key={a.value}
                          icon={a.icon}
                          label={a.label}
                          selected={action === a.value}
                          disabled={
                            a.value === "idle"
                              ? !frame.pixels.length
                              : a.value === "move"
                                ? !frame.capabilities.canMove
                                : a.value === "play"
                                  ? !frame.capabilities.canPlay
                                  : !frame.capabilities.canGreet
                          }
                          onPress={() => act(a.value)}
                        />
                      ))}
                      <IconButton
                        icon="groom"
                        label="Groom your pet"
                        selected={grooming}
                        disabled={!frame.pixels.length || frame.stage === "egg"}
                        onPress={() => {
                          setGrooming(!grooming);
                          if (!grooming)
                            setNotice(
                              "Stroke toward a tip or back toward its root. Changes develop over days.",
                            );
                          setAction("idle");
                          setTime(0);
                          setMotion(false);
                          setGrowing(false);
                          setTarget(null);
                        }}
                      />
                    </>
                  )}
                </View>
                {view === "draw" ? (
                  <DrawingCanvas
                    pixels={pixels}
                    size={size}
                    tool={tool}
                    onStart={begin}
                    onPaint={paint}
                    onEnd={finish}
                  />
                ) : grooming ? (
                  <View>
                    <GroomCanvas
                      pixels={frame.pixels}
                      size={size}
                      onStart={() => {
                        setMotion(false);
                        setGrowing(false);
                      }}
                      onStroke={groomStroke}
                    />
                    {view === "live" && grooming && !playing && (
                      <View style={styles.wrap}>
                        <Text style={s.muted}>
                          Groom · {groomingTimeline.length}{" "}
                          {groomingTimeline.length === 1 ? "stroke" : "strokes"}
                        </Text>
                        <Button
                          label="Undo grooming stroke"
                          disabled={!groomUndo.length}
                          onPress={() => {
                            const previous = groomUndo.at(-1);
                            if (!previous) return;
                            setGroomRedo((h) => [
                              ...h.slice(-39),
                              groomingTimeline,
                            ]);
                            setGroomUndo((h) => h.slice(0, -1));
                            setGroomingTimeline(previous);
                            setWritable(true);
                          }}
                        >
                          Undo
                        </Button>
                        <Button
                          label="Redo grooming stroke"
                          disabled={!groomRedo.length}
                          onPress={() => {
                            const next = groomRedo.at(-1);
                            if (!next) return;
                            setGroomUndo((h) => [
                              ...h.slice(-39),
                              groomingTimeline,
                            ]);
                            setGroomRedo((h) => h.slice(0, -1));
                            setGroomingTimeline(next);
                            setWritable(true);
                          }}
                        >
                          Redo
                        </Button>
                      </View>
                    )}
                  </View>
                ) : (
                  <View
                    accessibilityLabel="Your living pet. Tap to toss a ball."
                    style={{
                      width: size,
                      height: size,
                      backgroundColor: "#050505",
                    }}
                    onStartShouldSetResponder={() => action === "play"}
                    onResponderRelease={(e) => {
                      if (action === "play") {
                        setTarget({
                          x: (e.nativeEvent.locationX / size) * WORLD_SIZE,
                          y: (e.nativeEvent.locationY / size) * WORLD_SIZE,
                        });
                        setTime(0);
                        setMotion(true);
                      }
                    }}
                  >
                    <PetPixels
                      pixels={frame.pixels}
                      size={size}
                      gridSize={WORLD_SIZE}
                    />
                    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
                      <Svg
                        width={size}
                        height={size}
                        viewBox={`0 0 ${WORLD_SIZE} ${WORLD_SIZE}`}
                      >
                        {typeof frame.interaction.groundY === "number" &&
                          action === "move" && (
                            <Line
                              x1={3}
                              x2={61}
                              y1={frame.interaction.groundY}
                              y2={frame.interaction.groundY}
                              stroke={T.line}
                              strokeWidth={0.12}
                              strokeDasharray="1 2"
                            />
                          )}
                        {ball && (
                          <Rect
                            x={ball.x - 0.65}
                            y={ball.y - 0.65}
                            width={1.3}
                            height={1.3}
                            fill={T.red}
                          />
                        )}
                      </Svg>
                    </View>
                    {playing &&
                      life &&
                      (!life.game.lightsOn || life.game.sleeping) && (
                        <View
                          pointerEvents="none"
                          style={[
                            StyleSheet.absoluteFill,
                            {
                              backgroundColor: life.game.lightsOn
                                ? "#00000055"
                                : "#000000BB",
                              justifyContent: "flex-end",
                              padding: 12,
                            },
                          ]}
                        >
                          <Text style={s.muted}>
                            {life.game.sleeping ? "z z z" : "Lights off"}
                          </Text>
                        </View>
                      )}
                    {action === "play" && (
                      <Text style={[s.muted, styles.sceneCaption]}>
                        {time < 1.1
                          ? "..."
                          : frame.interaction.status === "caught"
                            ? "Got it!"
                            : frame.interaction.status === "nudged"
                              ? "Boop!"
                              : frame.interaction.status === "out-of-reach"
                                ? "Too far"
                                : "Tap to toss"}
                      </Text>
                    )}
                    {!parts.length && !playing && (
                      <Text style={[s.muted, styles.empty]}>
                        A drawing is a beginning.
                      </Text>
                    )}
                  </View>
                )}
                {playing && life && (
                  <GamePanel
                    game={life.game}
                    disabled={settling}
                    unsaved={!!saveError}
                    onCommand={(command) => void careCommand(command)}
                    lineage={frame.evolution?.lineage}
                    onNewPet={() => {
                      setSandbox(true);
                      setView("draw");
                      open("create");
                    }}
                  />
                )}
                <View style={styles.nav}>
                  {(
                    [
                      { value: "draw", icon: "draw", label: "Draw" },
                      { value: "live", icon: "live", label: "Live" },
                      { value: "more", icon: "more", label: "More" },
                    ] as const
                  ).map((item) => (
                    <Button
                      key={item.value}
                      label={
                        item.value === "more"
                          ? "Open more menu"
                          : item.value === "live"
                            ? "Watch your pet"
                            : "Draw your pet"
                      }
                      selected={view === item.value}
                      onPress={() =>
                        item.value === "more"
                          ? open("more")
                          : item.value === "draw"
                            ? (setSandbox(true), setView("draw"))
                            : live()
                      }
                      style={{ flex: 1 }}
                    >
                      <PixelIcon
                        name={item.icon}
                        color={view === item.value ? T.bg : T.text}
                      />
                      <Text
                        style={[s.text, view === item.value && { color: T.bg }]}
                      >
                        {item.label}
                      </Text>
                    </Button>
                  ))}
                </View>
              </View>
            </View>
            <View
              style={[
                styles.controlsColumn,
                {
                  width: controlsWidth,
                  display:
                    view === "live" && (timeOpen || labOpen) ? "flex" : "none",
                },
              ]}
            >
              {view === "live" && timeOpen && (
                <View style={[styles.drawer, { width: controlsWidth }]}>
                  <View style={styles.between}>
                    <Text style={s.bright}>Time</Text>
                    {labOpen ? (
                      <View style={styles.row}>
                        <Text style={s.muted}>Age (days)</Text>
                        <TextInput
                          accessibilityLabel="Preview developmental day"
                          value={dayInput}
                          onChangeText={setDayInput}
                          keyboardType="decimal-pad"
                          selectTextOnFocus
                          style={[s.input, { width: 68, paddingVertical: 2 }]}
                          onSubmitEditing={seekDevelopmentalDay}
                          onBlur={seekDevelopmentalDay}
                        />
                      </View>
                    ) : (
                      <Text style={s.muted}>Day {age.toFixed(1)}</Text>
                    )}
                  </View>
                  <Slider
                    accessibilityLabel="Growth timeline"
                    minimumValue={0}
                    maximumValue={timelineEnd}
                    step={labOpen ? 1 / 24 : 0.1}
                    value={age}
                    onSlidingStart={() => setGrowing(false)}
                    onValueChange={(v) => {
                      setGrowing(false);
                      setAge(
                        timelineEnd - v < (labOpen ? 1 / 24 : 0.1) + 0.000001
                          ? timelineEnd
                          : labOpen && v >= simulation.hatchAt
                            ? simulation.hatchAt +
                              Math.round((v - simulation.hatchAt) * 24) / 24
                            : v,
                      );
                    }}
                    style={{ height: 32 }}
                    minimumTrackTintColor={T.text}
                    maximumTrackTintColor={T.line}
                    thumbTintColor={T.bright}
                  />
                  {(!labOpen || wideLab) && (
                    <View style={styles.wrap}>
                      {simulation.milestones.map((m) => (
                        <Button
                          key={m.stage}
                          label={`View ${m.stage}`}
                          selected={Math.abs(age - m.age) < 0.1}
                          onPress={() => {
                            setGrowing(false);
                            setAge(m.age);
                          }}
                        >
                          {title(m.stage)}
                        </Button>
                      ))}
                    </View>
                  )}
                  <View style={styles.row}>
                    <Button
                      label={growing ? "Pause growth" : "Play growth"}
                      onPress={() => {
                        setGrowing(!growing);
                      }}
                    >
                      {growing ? "Pause" : "Grow"}
                    </Button>
                    <Button
                      label="Change growth speed"
                      onPress={() =>
                        setSpeed((v) => (v === 1 ? 4 : v === 4 ? 12 : 1))
                      }
                    >{`${speed}x`}</Button>
                    <Button
                      label="Extend timeline by 240 days"
                      onPress={() =>
                        setTimeExtent(
                          timelineEnd -
                            simulation.hatchAt +
                            DEFAULT_PREVIEW_DAYS,
                        )
                      }
                    >
                      +240d
                    </Button>
                    <Button
                      label="Toggle motion"
                      selected={motion}
                      onPress={() => setMotion(!motion)}
                    >
                      {motion ? "Moving" : "Still"}
                    </Button>
                  </View>
                </View>
              )}
              <View style={{ display: labOpen ? "flex" : "none", gap: 10 }}>
                <View style={styles.between}>
                  <Text
                    numberOfLines={1}
                    style={[s.muted, { flex: 1, marginRight: 8 }]}
                  >
                    Seed {seed}
                  </Text>
                  <Button
                    label="Reroll under the same conditions"
                    disabled={rerollBusy}
                    onPress={() => void reroll()}
                  >
                    {rerollBusy ? "Comparing..." : "Reroll"}
                  </Button>
                </View>
                <NeedsLab
                  key={labIdentity}
                  resetKey={labIdentity}
                  timeline={needTimeline}
                  age={age}
                  hatchAt={simulation.hatchAt}
                  wellbeing={frame.wellbeing}
                  development={frame.evolution}
                  onChange={(next) => {
                    setNeedTimeline(next);
                    setNeedPreview(null);
                    setWritable(true);
                  }}
                  onPreview={setNeedPreview}
                  onPause={() => setGrowing(false)}
                  onSeek={(next) => {
                    setGrowing(false);
                    setAge(next);
                  }}
                  onClose={() => {
                    setLabOpen(false);
                    setNeedPreview(null);
                  }}
                />
              </View>
            </View>
          </View>
          {!!saveError && (
            <Text
              accessibilityRole="alert"
              style={[
                s.text,
                { width: size + 24, color: T.warning, marginTop: 12 },
              ]}
            >
              {saveError}
            </Text>
          )}
          {!!notice && (
            <Text
              accessibilityLiveRegion="polite"
              style={[s.muted, { width: size + 24, marginTop: 12 }]}
            >
              {notice}
            </Text>
          )}
        </ScrollView>
        <Modal
          visible={sheet !== null}
          transparent
          animationType="fade"
          onRequestClose={() => setSheet(null)}
        >
          <View style={styles.overlay}>
            <View
              accessibilityViewIsModal
              style={[styles.sheet, { maxHeight: height - 70 }]}
            >
              <View style={styles.sheetHeader}>
                <Text style={[s.bright, { fontSize: 20, lineHeight: 23 }]}>
                  {sheet ? sheetTitles[sheet] : ""}
                </Text>
                <Button label="Close panel" onPress={() => setSheet(null)}>
                  X
                </Button>
              </View>
              <ScrollView
                contentContainerStyle={styles.sheetContent}
                keyboardShouldPersistTaps="handled"
              >
                {sheet === "create" && (
                  <>
                    {life?.game.dead && (
                      <Text style={[s.text, { color: T.warning }]}>
                        {life.name}'s life has ended. {life.game.message} Create
                        a new beginning when you are ready.
                      </Text>
                    )}
                    <Text style={s.muted}>
                      Draw a beginning. Discover who it becomes.
                    </Text>
                    <Button
                      label="Draw an infant"
                      onPress={() => start("infant")}
                    >
                      <PixelIcon name="draw" />
                      <Text style={s.text}>Draw an infant</Text>
                    </Button>
                    <Button label="Design an egg" onPress={() => start("egg")}>
                      <PixelIcon name="live" />
                      <Text style={s.text}>Design an egg</Text>
                    </Button>
                    <Text style={s.muted}>
                      Or begin with a little companion.
                    </Text>
                    <View style={styles.wrap}>
                      {STARTER_PRESETS.map((preset) => (
                        <Button
                          key={preset.id}
                          label={`Start with a ${preset.name.toLowerCase()}`}
                          style={styles.presetChoice}
                          onPress={() => start("infant", preset.id)}
                        >
                          <View style={styles.presetContent}>
                            <PetPixels
                              pixels={presetThumbnails.get(preset.id)!}
                              size={72}
                              gridSize={DRAW_SIZE}
                            />
                            <Text style={[s.text, styles.presetName]}>
                              {preset.name}
                            </Text>
                          </View>
                        </Button>
                      ))}
                    </View>
                    <Button
                      label="Explore retro reference drawings"
                      onPress={() => open("retro")}
                    >
                      Retro reference drawings
                    </Button>
                  </>
                )}
                {sheet === "retro" && (
                  <RetroGallery
                    onSelect={(id) => start("infant", id)}
                  />
                )}
                                {sheet === "parts" && (
                  <>
                    <View style={styles.wrap}>
                      {PART_KINDS.map((k) => (
                        <Button
                          key={k}
                          label={`Draw ${PART_LABELS[k].toLowerCase()}`}
                          selected={kind === k}
                          onPress={() => {
                            setKind(k);
                            setTool("paint");
                            setSheet(null);
                          }}
                        >
                          {PART_LABELS[k]}
                        </Button>
                      ))}
                    </View>
                    <Text style={s.muted}>
                      Labels are hints. Any drawing can live.
                    </Text>
                  </>
                )}
                {sheet === "info" && <PartInfo kind={kind} />}
                {sheet === "feelings" && (
                  <FeelingsSheet wellbeing={frame.wellbeing} />
                )}
                {sheet === "color" && (
                  <>
                    <ColorPicker
                      value={color}
                      onChange={(v) => {
                        setColor(v);
                        setTool("paint");
                      }}
                    />
                    <View style={styles.wrap}>
                      {[
                        "#000000",
                        "#444444",
                        "#777777",
                        "#AAAAAA",
                        "#DDDDDD",
                        "#FFFFFF",
                        "#18D7E8",
                        "#FF2B1C",
                        "#A378C8",
                        "#86AC6B",
                        "#E8B56C",
                        "#DA8E9F",
                      ].map((c) => (
                        <Pressable
                          key={c}
                          accessibilityRole="button"
                          accessibilityLabel={`Use color ${c}`}
                          onPress={() => {
                            setColor(c);
                            setTool("paint");
                            setSheet(null);
                          }}
                          style={{
                            width: 42,
                            height: 42,
                            backgroundColor: c,
                            borderColor: color === c ? T.bright : T.line,
                            borderWidth: 2,
                          }}
                        />
                      ))}
                    </View>
                  </>
                )}
                {sheet === "tools" && (
                  <>
                    <View style={styles.wrap}>
                      <Button
                        label="Undo drawing"
                        disabled={!history.length}
                        onPress={() => {
                          undo();
                          setSheet(null);
                        }}
                      >
                        Undo
                      </Button>
                      <Button
                        label="Mirror drawing"
                        selected={mirror}
                        onPress={() => setMirror(!mirror)}
                      >
                        Mirror
                      </Button>
                      <Button
                        label="Redo drawing"
                        disabled={!redo.length}
                        onPress={redoStroke}
                      >
                        Redo
                      </Button>
                      <Button label="Clear drawing" onPress={() => replace([])}>
                        Clear
                      </Button>
                      <Button label="New pet" onPress={() => open("create")}>
                        New pet
                      </Button>
                    </View>
                    <Text style={s.muted}>A little inspiration</Text>
                    <View style={styles.wrap}>
                      {(["biped", "crawler", "winged", "egg"] as const).map(
                        (p) => (
                          <Button
                            key={p}
                            label={`Use ${p} example`}
                            onPress={() => {
                              setMode(p === "egg" ? "egg" : "infant");
                              setKind(p === "egg" ? "egg" : "body");
                              replace(createStarterAnatomy(p));
                            }}
                          >
                            {p === "biped" ? "Bunny" : title(p)}
                          </Button>
                        ),
                      )}
                    </View>
                  </>
                )}
                {sheet === "more" && (
                  <>
                    <Button label="Needs Lab" onPress={openLab}>
                      Needs Lab
                    </Button>
                    {(
                      [
                        { sheet: "retro", label: "Retro drawings" },
                        { sheet: "create", label: "New pet" },
                        { sheet: "name", label: "Name" },
                        { sheet: "seed", label: "Seed & possibilities" },
                        { sheet: "share", label: "Share" },
                        { sheet: "import", label: "Import" },
                        { sheet: "widget", label: "Home Screen widget" },
                        { sheet: "about", label: "About" },
                      ] as const
                    ).map((item) => (
                      <Button
                        key={item.sheet}
                        label={item.label}
                        onPress={() => open(item.sheet)}
                      >
                        {item.label}
                      </Button>
                    ))}
                  </>
                )}
                {sheet === "seed" && (
                  <>
                    <Text style={s.muted}>
                      Same drawing. Another possible life.
                    </Text>
                    <View style={styles.row}>
                      <TextInput
                        accessibilityLabel="Growth seed"
                        value={seedInput}
                        onChangeText={(v) => setSeedInput(clean(v))}
                        maxLength={128}
                        style={[s.input, { flex: 1 }]}
                        autoCorrect={false}
                      />
                      <Button
                        label="Apply seed"
                        disabled={!seedInput.trim() || rerollBusy}
                        onPress={() => changeSeed(seedInput.trim())}
                      >
                        Set
                      </Button>
                      <Button
                        label="Randomize seed"
                        disabled={rerollBusy}
                        onPress={() => void reroll()}
                      >
                        {rerollBusy ? "..." : "Reroll"}
                      </Button>
                    </View>
                    <SeedSort seed={seed} />
                  </>
                )}
                {sheet === "name" && (
                  <>
                    <TextInput
                      accessibilityLabel="Pet name"
                      value={name}
                      onChangeText={(v) => setName(clean(v))}
                      maxLength={60}
                      style={s.input}
                      autoCorrect={false}
                    />
                    <Button
                      label="Save pet name"
                      onPress={() => {
                        const current = lifeRef.current;
                        if (
                          current &&
                          !sandbox &&
                          current.game.clock.startedAtMs ===
                            life?.game.clock.startedAtMs
                        )
                          commitLife({
                            ...current,
                            name: name.trim() || "Little one",
                          });
                        setSheet(null);
                      }}
                    >
                      Done
                    </Button>
                  </>
                )}
                {sheet === "share" && (
                  <>
                    <Button label="Copy pet code" onPress={() => void share()}>
                      Copy pet code
                    </Button>
                    {Platform.OS === "web" && (
                      <Button label="Download pet file" onPress={download}>
                        Save pet file
                      </Button>
                    )}
                    <Button
                      label="Show pet code"
                      onPress={() => setShowCode(!showCode)}
                    >
                      {showCode ? "Hide code" : "Show code"}
                    </Button>
                    {showCode && (
                      <TextInput
                        accessibilityLabel="Exported pet code"
                        value={encodePet(document)}
                        editable={false}
                        multiline
                        selectTextOnFocus
                        style={[
                          s.input,
                          { height: 190, textAlignVertical: "top" },
                        ]}
                      />
                    )}
                  </>
                )}
                {sheet === "import" && (
                  <>
                    <Text style={s.muted}>
                      Paste a pet from this prototype revision.
                    </Text>
                    <TextInput
                      accessibilityLabel="Pet code to import"
                      value={importInput}
                      onChangeText={setImportInput}
                      multiline
                      autoCorrect={false}
                      autoCapitalize="none"
                      style={[
                        s.input,
                        { height: 180, textAlignVertical: "top" },
                      ]}
                    />
                    {!!importError && (
                      <Text
                        accessibilityRole="alert"
                        style={[s.text, { color: T.warning }]}
                      >
                        {importError}
                      </Text>
                    )}
                    <Button
                      label="Import pet code"
                      disabled={!importInput.trim()}
                      onPress={() => {
                        try {
                          restore(decodePet(importInput));
                        } catch (e) {
                          setImportError(
                            e instanceof Error
                              ? e.message
                              : "This pet could not be opened.",
                          );
                        }
                      }}
                    >
                      Welcome this pet
                    </Button>
                  </>
                )}
                {sheet === "widget" && (
                  <>
                    <View style={{ alignItems: "center" }}>
                      <PetPixels
                        pixels={frame.pixels}
                        size={200}
                        gridSize={WORLD_SIZE}
                      />
                    </View>
                    <Text style={s.muted}>
                      This moment, close by. The lab clock stays paused while
                      you are away.
                    </Text>
                    <Button
                      label="Publish iOS widget"
                      onPress={() => void widget()}
                    >
                      Send to Home Screen
                    </Button>
                    {!!widgetMessage && (
                      <Text accessibilityLiveRegion="polite" style={s.text}>
                        {widgetMessage}
                      </Text>
                    )}
                    <Text style={s.muted}>
                      Requires a signed iOS development build.
                    </Text>
                  </>
                )}
                {sheet === "about" && (
                  <>
                    <Text style={s.text}>
                      Draw an egg or an infant. Time brings surprises. Pick a
                      brush label and tap ? to learn how that part works.
                    </Text>
                    <Text style={s.muted}>
                      Feed, play, train and care for a real-time pocket pet. Its
                      anatomy grows continuously through gameplay stages. The
                      Lab explores other possible lives while your pet
                      continues.
                    </Text>
                    <Text style={s.muted}>
                      Feelings and needs: allneeds.app. Animal ancestry: Open
                      Tree of Life. The developmental and animal-affinity rules
                      are game models.
                    </Text>
                    <Text style={s.muted}>
                      Prototype pets reset between revisions.
                    </Text>
                    <Text style={s.muted}>
                      Terminal font and sorting style: pre-programmed.art. DOS
                      font by VileR, CC BY-SA 4.0. Font credits:
                      assets/fonts/FONT-LICENSE.md.
                    </Text>
                  </>
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg },
  loading: {
    flex: 1,
    backgroundColor: T.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  page: {
    alignItems: "center",
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 22,
  },
  workbench: { alignItems: "center" },
  wideWorkbench: { flexDirection: "row", alignItems: "flex-start", gap: 20 },
  creatureColumn: { alignItems: "center" },
  controlsColumn: { gap: 12 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    minHeight: 59,
    gap: 10,
  },
  device: {
    borderWidth: 1,
    borderColor: T.line,
    backgroundColor: "#090909",
    padding: 11,
    gap: 10,
    borderRadius: 14,
  },
  toolbar: {
    flexDirection: "row",
    gap: 5,
    justifyContent: "center",
    alignItems: "center",
  },
  button: {
    minHeight: 42,
    minWidth: 38,
    borderWidth: 1,
    borderColor: T.line,
    paddingHorizontal: 10,
    paddingVertical: 9,
    backgroundColor: T.bg,
    justifyContent: "center",
  },
  buttonContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  selected: { backgroundColor: T.bright, borderColor: T.bright },
  nav: { flexDirection: "row", gap: 8 },
  row: { flexDirection: "row", gap: 8, alignItems: "center" },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  presetChoice: { width: "47%", flexGrow: 1, paddingVertical: 8 },
  presetContent: { alignItems: "center", gap: 6 },
  presetName: { fontSize: 15, textAlign: "center" },
  between: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  drawer: {
    padding: 12,
    borderWidth: 1,
    borderColor: T.line,
    gap: 12,
    marginTop: 12,
  },
  sceneCaption: { position: "absolute", bottom: 10, left: 12 },
  empty: { position: "absolute", top: "47%", alignSelf: "center" },
  overlay: {
    flex: 1,
    backgroundColor: "#000000BF",
    justifyContent: "center",
    alignItems: "center",
    padding: 12,
  },
  sheet: {
    width: "100%",
    maxWidth: 480,
    backgroundColor: T.bg,
    borderColor: T.text,
    borderWidth: 1,
  },
  sheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderBottomWidth: 1,
    borderColor: T.line,
  },
  sheetContent: { padding: 14, gap: 14 },
});
