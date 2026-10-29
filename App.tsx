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
import { MorphologyWorkbench } from "./src/components/MorphologyWorkbench";
import { DEFAULT_MORPH_TUNING, morphologyShapeMetrics, tuningIsDefault,
 tuneMaterialProgram, type MorphologyTuning } from "./src/interface/morphology-tuning";
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
import { PartPalette } from "./src/components/PartPalette";
import { DevelopmentPanel } from "./src/components/DevelopmentPanel";
import { developmentLayout } from "./src/interface/development-layout";
import { PRESET_COLORS } from "./src/palette";
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
import { GamePanel, CareRail, type CareMenu } from "./src/components/GamePanel";
import { playerGeometry } from "./src/interface/player-geometry";
import { careOutcome, type CareOutcome } from "./src/interface/care-outcome";
import {
  deriveCareTimeline,
  deriveDevelopmentContext,
  type GameCommand,
} from "./src/gameplay";
import type { LivingPet } from "./src/pet-format";
import {
  birthPlayerLife,
  prepareReturnedLife,
  advancePlayerLife,
  commandPlayerLife,
} from "./src/integration/player-lifecycle";
import {
  findSeedVariation,
  preserveDevelopmentalAge,
} from "./src/seed-variation";

type Sheet =
  | "confirm"
  | "info"
  | "color"
  | "more"
  | "share"
  | "import"
  | "name"
  | "about"
  | "feelings"
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
      aria-pressed={selected}
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
  const [nameInput, setNameInput] = useState(name);
  const [seed, setSeed] = useState(newSeed);
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
  const [confirmation, setConfirmation] = useState<{
    message: string;
    accept: () => void;
  } | null>(null);
  const [devEnabled, setDevEnabled] = useState(false);
  const [starterGalleryOpen,setStarterGalleryOpen]=useState(false);
  const [morphTune,setMorphTune]=useState<MorphologyTuning>({...DEFAULT_MORPH_TUNING});
  const [careMenu, setCareMenu] = useState<CareMenu>("food");
  const [lastOutcome, setLastOutcome] = useState<{seed:string;birth:number;cue:CareOutcome}|null>(null);
  const [showLabels, setShowLabels] = useState(false);
  const devSession = useRef(0);
  const devEnabledRef = useRef(false);
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
  const [exportCode,setExportCode]=useState("");
  const [exportMessage,setExportMessage]=useState("");
  const [widgetMessage, setWidgetMessage] = useState("");
  const [needTimeline, setNeedTimeline] = useState<NeedKeyframe[]>([]);
  const [groomingTimeline, setGroomingTimeline] = useState<GroomStroke[]>([]);
  const [grooming, setGrooming] = useState(false);
  const [groomUndo, setGroomUndo] = useState<GroomStroke[][]>([]);
  const [groomRedo, setGroomRedo] = useState<GroomStroke[][]>([]);
  const [needPreview, setNeedPreview] = useState<NeedKeyframe[] | null>(null);
  const [previewNutrition,setPreviewNutrition]=useState(0.75);
  const [comparePreview,setComparePreview]=useState(false);
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
  const pendingReturnLife = useRef<LivingPet | undefined>(undefined);
  const returnGeneration = useRef(0);
  const deathSeen = useRef<string | null>(null);
  const playing = view === "live" && !sandbox && !!life;
  const layout = developmentLayout(width, devEnabled);
  const { deviceWidth, canvasSide: size } = playerGeometry(width, height, layout.playerOffset, view);
  const simulation = useMemo(
    () =>
      createSimulation(parts, seed, mode, {
        needTimeline: needPreview ?? needTimeline,
        groomingTimeline,
        ...((devEnabled||sandbox)?{previewCare:{kind:"synthetic-needs-lab-v1" as const,
          timeline:needPreview??needTimeline,nutrition:previewNutrition}}:{}),
        // Never use experimental overrides for actual gameplay, persistence,
        // or the ordinary player presentation. Source and genome stay fixed.
        ...((devEnabled||sandbox)&&!tuningIsDefault(morphTune)?{
          verifyMaterialProgram:(base:Parameters<typeof tuneMaterialProgram>[0])=>({
            program:tuneMaterialProgram(base,morphTune),
          }),
        }:{}),
      }),
    [parts, seed, mode, needTimeline, needPreview, groomingTimeline,devEnabled,sandbox,morphTune,previewNutrition],
  );
  const baselinePreview = useMemo(
    () => (devEnabled||sandbox)&&comparePreview
      ? createSimulation(parts,seed,mode,{
          previewCare:{kind:"synthetic-needs-lab-v1",timeline:[],nutrition:0.75},
        })
      : null,
    [devEnabled,sandbox,comparePreview,parts,seed,mode],
  );
  const previewComparison = useMemo(()=>{
    if(!baselinePreview||playing)return null;
    const day=Math.max(0,Math.min(365,Math.floor(age-simulation.hatchAt)));
    const actual=simulation.materialStateAt(simulation.hatchAt+day).graph;
    const baseline=baselinePreview.materialStateAt(baselinePreview.hatchAt+day).graph;
    const locations=(cells:readonly {x:number;y:number}[])=>new Set(cells.map(c=>c.x+","+c.y));
    const current=locations(actual.cells),reference=locations(baseline.cells);
    const difference=[...new Set([...current,...reference])]
      .filter(p=>current.has(p)!==reference.has(p)).length;
    return {day,current:current.size,baseline:reference.size,difference};
  },[baselinePreview,playing,simulation,age]);
  const timelineEnd =
    simulation.hatchAt +
    Math.max(
      timeExtent,
      DEFAULT_PREVIEW_DAYS,
      Math.ceil(Math.max(0, age - simulation.hatchAt) / DEFAULT_PREVIEW_DAYS) *
        DEFAULT_PREVIEW_DAYS,
    );
  // The lab's independent preview must never replace or needlessly render
  // the actual living pet during normal play.
  const previewFrame = useMemo(
    () =>
      playing && !devEnabled
        ? null
        : simulation.frameAt(age, {
            time,
            action,
            ...(target ? { target } : {}),
          }),
    [playing, devEnabled, simulation, age, time, action, target],
  );
  // Build only from the native saved-life evidence. Each accepted care command
  // invalidates this memo immediately; time is not approximated or bucketed.
  const livingSimulation = useMemo(() => {
    if (!life) return null;
    return createSimulation(life.parts, life.seed, life.mode, {
      groomingTimeline: life.groomingTimeline,
      liveContext: deriveDevelopmentContext(life.game),
      careGame: life.game,
      anatomicalCheckpoint:life.anatomicalCheckpoint,
    });
  }, [life?.parts, life?.seed, life?.mode, life?.game, life?.groomingTimeline,life?.anatomicalCheckpoint]);
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
  // Save a completed physical state once per daily boundary. Ordinary frames
  // and care commands reuse it; persisted integrity is revalidated on reopen.
  useEffect(()=>{
    if(!life||!livingSimulation||!livingFrame||livingFrame.generation<1)return;
    const existing=life.anatomicalCheckpoint as {state?:{completedChecks?:number}}|undefined;
    if(existing?.state?.completedChecks===livingFrame.generation &&
        (livingSimulation.getMaterialRuntimeStats?.().imported??0)>0)return;
    const anatomicalCheckpoint=livingSimulation.exportAnatomicalCheckpoint();
    if(anatomicalCheckpoint)commitLife({...life,anatomicalCheckpoint});
  },[life,livingSimulation,livingFrame?.generation]);
  const frame = playing ? livingFrame! : previewFrame!;
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
  // Serial writes may complete after a newer care update. Only the most
  // recently requested write can clear or set the unsaved warning.
  const saveRequest = useRef(0);
  const persist = async (
    message = "Progress is unsaved. Export a copy from More.",
  ): Promise<boolean> => {
    const request = ++saveRequest.current;
    try {
      await savePet(latest.current.document);
      if (request === saveRequest.current) setSaveError("");
      return true;
    } catch {
      if (request === saveRequest.current) setSaveError(message);
      return false;
    }
  };
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
      .then(async (doc) => {
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
            const resumed = await prepareReturnedLife(advancePlayerLife(doc.life, Date.now(), "absent"));
            if(!active)return;
            commitLife(resumed);
            setView("live");
            setSandbox(false);
          }
          setWritable(true);
        } else setWritable(true);
        setHydrated(true);
      })
      .catch((error) => {
        if (active) {
          setSaveError(error instanceof Error
            ? "The local pet is not in the current prototype format: " + error.message
            : "Could not open this local pet.");
          // Never overwrite even a CURRENT corrupted save during automatic
          // hydration. Only an explicit Begin life may start a new file.
          setWritable(false);
          setHydrated(true);
        }
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!hydrated || !writable) return;
    const timer = setTimeout(() => {
      void persist("Could not save. Export a copy from More.");
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
        ...advancePlayerLife(current, Date.now(), "active"),
      };
      commitLife(next);
      if (
        (next.game.dead || Date.now() - checkpoint >= 5000) &&
        latest.current.writable
      ) {
        checkpoint = Date.now();
        void persist("Progress is unsaved. Retrying...");
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
      void persist("Could not save. Export a copy from More.");
    }, 2500);
    return () => clearInterval(timer);
  }, [growing, writable]);
  useEffect(() => {
    let disposed=false;
    const sub = AppState.addEventListener("change", (state) => {
      const nextPresence = state === "active" ? "active" : "absent";
      const previousPresence=presence.current;
      const current=pendingReturnLife.current??lifeRef.current;
      if(nextPresence==="absent"){
        // Cancel a pending UI commit, retaining its chronological life for the
        // next return. A partly caught-up graph never replaces the saved pet.
        returnGeneration.current++;
        if(pendingReturnLife.current)
          pendingReturnLife.current=advancePlayerLife(pendingReturnLife.current,Date.now(),"absent");
        else if(current&&previousPresence==="active")
          commitLife(advancePlayerLife(current,Date.now(),"active"));
        presence.current="absent";
        setGrowing(false);setMotion(false);
        if(latest.current.writable)void persist("Could not save. Export a copy from More.");
        return;
      }
      if(!current){
        presence.current="active";setMotion(true);return;
      }
      if(previousPresence==="active"&&!pendingReturnLife.current)return;
      const generation=++returnGeneration.current;
      pendingReturnLife.current=advancePlayerLife(current,Date.now(),"absent");
      // Rendering continues with the previously complete state. Commands and
      // ordinary ticks resume only after every missed physical check is ready.
      presence.current="absent";commandPending.current=true;
      setSettling(true);setMotion(false);
      void (async()=>{
        try{
          for(;;){
            const ready=await prepareReturnedLife(pendingReturnLife.current!);
            if(disposed||generation!==returnGeneration.current)return;
            const next=advancePlayerLife(ready,Date.now(),"absent");
            const due=Math.min(365,Math.floor(Math.max(0,next.game.clock.nowMs-next.game.clock.hatchAtMs)/86400000));
            const completed=(ready.anatomicalCheckpoint as {state?:{completedChecks?:number}}|undefined)?.state?.completedChecks??0;
            pendingReturnLife.current=next;
            if(completed<due)continue;
            pendingReturnLife.current=undefined;
            commitLife(next);presence.current="active";
            commandPending.current=false;setSettling(false);setMotion(true);
            if(latest.current.writable)void persist();
            return;
          }
        }catch(error){
          if(!disposed&&generation===returnGeneration.current)
            setSaveError(error instanceof Error?error.message:"Could not reopen your pet. Export a copy from More.");
        }
      })();
    });
    return () => { disposed=true;returnGeneration.current++;sub.remove(); };
  }, []);
  useEffect(() => {
    if (!motion || view !== "live") return;
    const timer = setInterval(() => setTime((t) => t + 0.1), 100);
    return () => clearInterval(timer);
  }, [motion, view]);
  useEffect(() => {
    if (!growing || view !== "live" || !devEnabled) return;
    const timer = setInterval(
      () =>
        setAge((a) => {
          const next = Math.min(MAX_SIMULATION_DAYS, a + 0.1 * speed);
          return next;
        }),
      100,
    );
    return () => clearInterval(timer);
  }, [growing, view, speed, devEnabled]);
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
    setSheet(null);
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
  const start = (presetId?: string) => {
    const preset = STARTER_PRESETS.find((item) => item.id === presetId);
    setStarterGalleryOpen(false);
    setNeedTimeline([]);
    setGroomingTimeline([]);
    setGrooming(false);
    setGroomUndo([]);
    setGroomRedo([]);
    setTimeExtent(DEFAULT_PREVIEW_DAYS);
    setNeedPreview(null);
    setLabIdentity((value) => value + 1);
    setMorphTune({...DEFAULT_MORPH_TUNING});
    setMode("infant");
    setParts(preset ? clonePreset(preset.id) : []);
    setKind("body");
    setTool("paint");
    setHistory([]);
    setRedo([]);
    const nextSeed = preset?.seed ?? newSeed();
    setSeed(nextSeed);
    setSeedInput(nextSeed);
    setName("Little one");
    setBornAt(Date.now());
    resetPreview();
    setView("draw");
    setSheet(null);
    setSandbox(true);
  };
  const confirmReplacement = (message: string, accept: () => void) => {
    setConfirmation({ message, accept });
    setSheet("confirm");
  };
  const live = () => {
    if (!lifeRef.current) return;
    setView("live");
    setSandbox(false);
    setMotion(true);
    setGrooming(false);
    setNeedPreview(null);
    setGrowing(false);
  };
  const beginLife = async (confirmed = false) => {
    if (!pixels.length || commandPending.current) return;
    const current = lifeRef.current;
    if (current && !current.game.dead && !confirmed) {
      confirmReplacement(
`Replace ${current.name}? Its current life and care history will be replaced. Export a copy from More to keep it.`,
        () => void beginLife(true),
      );
      return;
    }
    commandPending.current = true;
    const next = birthPlayerLife(
      { parts, mode, seed, name },
      Date.now(),
      -new Date().getTimezoneOffset(),
    );
    commitLife(next);
    setWritable(true);
    latest.current.writable = true;
    setView("live");
    setSandbox(false);
    setAction("idle");
    setTarget(null);
    setTime(0);
    setMotion(true);
    setGrooming(false);
    setSettling(true);
    try {
      await persist();
    } catch {
      setSaveError("Progress is unsaved. Retrying...");
    } finally {
      commandPending.current = false;
      setSettling(false);
    }
  };
  const careCommand = async (command: GameCommand) => {
    const current = lifeRef.current;
    if (!current || commandPending.current || presence.current!=="active") return;
    commandPending.current = true;
    setSettling(true);
    const now = Date.now();
    const id = `command:${now}:${current.game.commandSequence??current.game.commandHistory.length}`;
    try {
      const next = {
        ...commandPlayerLife(current, command, now, id),
      };
      setLastOutcome({seed:current.seed,birth:current.game.clock.startedAtMs,
        cue:careOutcome(current.game,next.game,command)});
      commitLife(next);
      setTime(0);
      await persist();
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
  const act = (next: PetAction, preview = false) => {
    if (preview) openLab();
    setGrooming(false);
    setAction(next);
    setView("live");
    setMotion(true);
    setTime(0);
    setTarget(null);
    if (next === "play") {
      const resting =
        !preview && playing && livingSimulation
          ? livingSimulation.frameAt(liveAge)
          : simulation.frameAt(age);
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
            ...advancePlayerLife(doc.life, Date.now(), "absent"),
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
  const openPetFile=()=>{
    if(Platform.OS!=="web")return;
    setImportError("");
    const picker=globalThis.document.createElement("input");
    picker.type="file";picker.accept=".json,application/json";picker.style.display="none";
    picker.addEventListener("cancel",()=>picker.remove(),{once:true});
    picker.onchange=async()=>{
      try{
        const file=picker.files?.[0];if(!file)return;
        if(file.size>16*1024*1024)throw new Error("Pet files must be at most 16 MB.");
        const imported=decodePet(await file.text());
        const current=lifeRef.current;
        if(current&&!current.game.dead)confirmReplacement(
          `Importing replaces ${current.name} and its care history. Export a copy first to keep it.`,()=>restore(imported));
        else restore(imported);
      }catch(error){setImportError(error instanceof Error?error.message:"This pet could not be opened.");}
      finally{picker.remove();}
    };
    globalThis.document.body.appendChild(picker);picker.click();
  };
  const open = (next: Sheet) => {
    if (next === "name") setNameInput(playing && life ? life.name : name);
    if (next === "import") {
      setImportError("");
      setImportInput("");
    }
    if (next === "share") {setShowCode(false);setExportMessage("");}
    setSheet(next);
  };
  const changeSeed = (next: string) => {
    if (!devEnabledRef.current) return;
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
    const session = devSession.current;
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
        !devEnabledRef.current ||
        session !== devSession.current ||
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
    if (!devEnabledRef.current) return;
    setSandbox(true);
    setView("live");
    setGrooming(false);
    setGrowing(false);
    setSheet(null);
  };
  const toggleDevelopment = () => {
    const enabled = !devEnabledRef.current;
    devEnabledRef.current = enabled;
    devSession.current++;
    setDevEnabled(enabled);
    setSeedInput(seed);
    setGrowing(false);
    setSheet(null);
    if (!enabled && !sandbox) {
      // Closing diagnostic chrome without an active experiment returns to
      // the ordinary player experience. A sandbox experiment, however,
      // remains visibly intact until the player explicitly returns to pet.
      setNeedPreview(null);
      setMotion(true);
      setView(lifeRef.current ? "live" : "draw");
      setGrooming(false);
      setAction("idle");
      setTarget(null);
      setTime(0);
    }
  };
  const groomStroke = (from: Point, to: Point) => {
    if(playing&&(commandPending.current||presence.current!=="active"))return;
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
      const now=Date.now();
      if(now<currentLife.game.clock.nowMs)return;
      const advanced=advancePlayerLife(currentLife,now,"active");
      commitLife({
        ...advanced,
        groomingTimeline: normalizeGroomTimeline([
          ...currentLife.groomingTimeline,
          {
            ...stroke,
            tick:(now-advanced.game.clock.hatchAtMs)/3600000,
            id: `groom-${now}-${currentLife.groomingTimeline.length}`,
          },
        ]),
      });
      void persist("Progress is unsaved. Retrying...");
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
    if (!devEnabledRef.current) return;
    const value = Number(dayInput);
    if (!Number.isFinite(value)) return;
    openLab();
    setAge(
      simulation.hatchAt +
        Math.max(0, Math.min(MAX_SIMULATION_DAYS, Math.round(value * 24) / 24)),
    );
  };
  const revealExportCode=()=>{
    const code=encodePet(latest.current.document);
    if(code.length>200_000){setExportMessage("This pet has a long history. Save a pet file to move it to another device.");setShowCode(false);return;}
    setExportMessage("");setExportCode(code);setShowCode(true);
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
      revealExportCode();
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
    confirm: "Replace living pet?",
    info: PART_LABELS[kind],
    color: "Color",
    more: "More",
    share: "Share a little life",
    import: "Welcome a pet",
    name: "A name",
    about: "About Infipet",
    feelings: "A little check-in",
  };

  if ((!fontLoaded && !fontError) || !hydrated)
    return (
      <View style={styles.loading}>
        <Text style={[s.text, { fontFamily: "monospace" }]}>Waking up...</Text>
      </View>
    );
  return (
    <SafeAreaProvider>
      <SafeAreaView style={[styles.root, Platform.OS === "web" && ({ minHeight: "100dvh" } as any)]}>
        <StatusBar style="light" />
        <ScrollView
          style={{ flex: 1, marginLeft: layout.playerOffset }}
          contentContainerStyle={[
            styles.page,
            { paddingTop: layout.desktop ? 40 : 8, paddingBottom: layout.desktop ? 22 : 16 },
          ]}
          aria-hidden={sheet !== null || (devEnabled && !layout.desktop)}
          accessibilityElementsHidden={
            sheet !== null || (devEnabled && !layout.desktop)
          }
          importantForAccessibility={
            sheet || (devEnabled && !layout.desktop)
              ? "no-hide-descendants"
              : "auto"
          }
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.workbench}>
            <View style={styles.creatureColumn}>
              <View style={[styles.header, { width: deviceWidth, paddingRight: layout.desktop ? 0 : 52 }]}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Rename pet"
                  onPress={() => open("name")}
                  style={{ flex: 1, minWidth: 0 }}
                >
                  <Text style={[s.bright, { fontSize: 18, lineHeight: 23, flexShrink: 1 }]}>
                    {playing && life ? life.name : document.name}
                  </Text>
                  {showLabels && <Text style={[s.muted, {flexShrink:1}]}>
                    {view === "draw" ? "Drawing" : playing && life
                      ? `${title(life.game.stage)} · day ${liveAge.toFixed(1)}` : "Development preview"}
                  </Text>}
                </Pressable>
                {life && <Button
                  label={view === "draw" || sandbox ? "Return to your pet" : "Draw your pet"}
                  onPress={() => {
                    if (view === "draw" || sandbox) live();
                    else {setSandbox(true);setView("draw");setNeedPreview(null);}
                  }}
                  style={styles.symbolButton}>
                  <PixelIcon name={view === "draw" || sandbox ? "live" : "draw"} size={24} color={T.bright}/>
                </Button>}
                {!life && view === "live" && sandbox && <Button
                  label="Return to drawing"
                  onPress={()=>{
                    setView("draw");
                    setNeedPreview(null);
                    setGrowing(false);
                    setGrooming(false);
                  }}
                  style={styles.symbolButton}>
                  <PixelIcon name="draw" size={24} color={T.bright}/>
                </Button>}
                {playing && frame.stage !== "egg" && <IconButton
                  icon="feel"
                  label="Check how your pet feels"
                  onPress={() => open("feelings")}
                />}
                <Button label="Open more menu" onPress={() => open("more")}
                  style={styles.symbolButton}>
                  <PixelIcon name="more" size={24} color={T.bright} />
                </Button>
              </View>
              <View nativeID="infipet-device" style={[styles.device, { width: deviceWidth }]}>
                <View style={[styles.toolbar, { width: deviceWidth - 24 }]}>
                  {view === "draw" ? (
                    <>
                      <Button label="Use pencil" selected={tool === "paint"}
                        onPress={() => setTool("paint")} style={styles.symbolButton}>
                        <PixelIcon name="draw" size={24} color={tool === "paint" ? T.bg : T.bright} />
                      </Button>
                      <Button label="Use eraser" selected={tool === "erase"}
                        onPress={() => setTool("erase")} style={styles.symbolButton}>
                        <PixelIcon name="erase" size={24} color={tool === "erase" ? T.bg : T.bright} />
                      </Button>
                      <Button label="Choose brush color" onPress={() => open("color")}
                        style={styles.symbolButton}>
                        <View style={{ width: 23, height: 23, backgroundColor: color,
                          borderColor: T.bright, borderWidth: 1 }} />
                      </Button>
                      <Button label={`Learn about ${PART_LABELS[kind].toLowerCase()}`}
                        onPress={() => open("info")} style={styles.symbolButton}>
                        <PixelIcon name="info" size={24} color={T.bright} />
                      </Button>
                    </>
                  ) : playing && !life?.game.sleeping && frame.capabilities.canMove ? (
                    <IconButton
                      icon="move"
                      label="Watch your pet explore"
                      selected={action === "move"}
                      onPress={() => act(action === "move" ? "idle" : "move")}
                    />
                  ) : view === "live" && sandbox ? (
                    <Text style={[s.muted,{fontSize:13}]}>PREVIEW · DAY {Math.floor(age)}</Text>
                  ) : null}
                </View>
                {playing && life && <CareRail
                  side="top" game={life.game} disabled={settling} menu={careMenu}
                  onMenu={(next) => { setCareMenu(next); setGrooming(false); }}
                  onCommand={(command) => void careCommand(command)}
                  grooming={grooming}
                  onGroom={() => { setGrooming(!grooming); setAction("idle"); }}
                  showLabels={showLabels}
                />}
                {view === "draw" ? (
                  <View style={{ gap: 8 }}>
                    <View style={{borderTopWidth:1,borderColor:T.line,
                      marginBottom:5,paddingBottom:5,gap:8}}>
                      <Button label="Show or hide starter creature gallery"
                        selected={starterGalleryOpen}
                        onPress={()=>setStarterGalleryOpen(v=>!v)}>
                        {starterGalleryOpen?"[-]":"[+]"} Choose a starter
                      </Button>
                      {starterGalleryOpen&&<>
                        <Text style={[s.muted,{fontSize:13,lineHeight:17}]}>
                          Example drawings with fixed, editable genetic seeds.
                          Select one to edit, or draw your own.
                        </Text>
                        <View style={styles.starterGrid}>
                        {STARTER_PRESETS.map((preset,index)=><Button
                          key={preset.id}
                          label={`Load starter drawing ${index+1}, readable seed ${preset.seed}`}
                          style={styles.presetChoice}
                          onPress={()=>{
                            const load=()=>start(preset.id);
                            if(pixels.length)confirmReplacement(
                              "Replace the editable drawing with this starter shape? Your living pet is not replaced until you confirm Begin life.",
                              load);
                            else load();
                          }}>
                          <PetPixels pixels={presetThumbnails.get(preset.id)!}
                            size={62} gridSize={DRAW_SIZE}/>
                        </Button>)}
                        </View>
                      </>}
                    </View>
                    <DrawingCanvas
                      pixels={pixels}
                      size={size}
                      tool={tool}
                      onStart={begin}
                      onPaint={paint}
                      onEnd={finish}
                    />
                    <PartPalette
                      value={kind}
                      onChange={(next) => {
                        setKind(next);
                        setTool("paint");
                      }}
                    />
                    <View style={styles.row}>
                      <Button
                        label="Undo drawing"
                        disabled={!history.length}
                        onPress={undo}
                        style={styles.symbolButton}
                      >
                        <PixelIcon name="undo" size={24} color={T.bright} />
                      </Button>
                      <Button
                        label="Redo drawing"
                        disabled={!redo.length}
                        onPress={redoStroke}
                        style={styles.symbolButton}
                      >
                        <PixelIcon name="redo" size={24} color={T.bright} />
                      </Button>
                      <Button
                        label="Mirror drawing"
                        selected={mirror}
                        onPress={() => setMirror(!mirror)}
                        style={styles.compactTextButton}
                      >
                        Mirror
                      </Button>
                      <Button
                        label="Clear drawing"
                        disabled={!pixels.length}
                        onPress={() => replace([])}
                        style={styles.compactTextButton}
                      >
                        Clear
                      </Button>
                    </View>
                    {layout.desktop && <Button
                      label="Begin life"
                      disabled={!pixels.length || settling}
                      onPress={() => void beginLife()}
                    >
                      <PixelIcon name="birth" /> <Text style={s.text}>Begin life</Text>
                    </Button>}
                  </View>
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
                  </View>
                ) : (
                  <View
                    accessibilityLabel="Your living pet. Tap to toss a ball."
                    style={{
                      width: size,
                      height: size,
                      alignSelf: "center",
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
                {playing && life && <CareRail
                  side="bottom" game={life.game} disabled={settling} menu={careMenu}
                  onMenu={(next) => { setCareMenu(next); setGrooming(false); }}
                  onCommand={(command) => void careCommand(command)}
                  grooming={grooming}
                  onGroom={() => { setGrooming(!grooming); setAction("idle"); }}
                  showLabels={showLabels}
                />}
                {playing && life && (
                  <GamePanel
                    menu={careMenu}
                    showLabels={showLabels}
                    outcome={lastOutcome && lastOutcome.seed===life.seed && lastOutcome.birth===life.game.clock.startedAtMs ? lastOutcome.cue : null}
                    game={life.game}
                    disabled={settling}
                    unsaved={!!saveError}
                    onCommand={(command) => void careCommand(command)}
                    onNewPet={() => {
                      setSandbox(true);
                      setView("draw");
                      start();
                    }}
                  />
                )}
              </View>
            </View>
          </View>
          {!!saveError && (
            <Text
              accessibilityRole="alert"
              style={[
                s.text,
                { width: deviceWidth, color: T.warning, marginTop: 12 },
              ]}
            >
              {saveError}
            </Text>
          )}
          {!!notice && (
            <Text
              accessibilityLiveRegion="polite"
              style={[s.muted, { width: deviceWidth, marginTop: 12 }]}
            >
              {notice}
            </Text>
          )}
        </ScrollView>
        {!layout.desktop && view === "draw" && !devEnabled && <View nativeID="infipet-mobile-birth" style={styles.mobileBirthBar}>
          <Button label="Begin life" disabled={!pixels.length || settling} onPress={() => void beginLife()}
            style={{minHeight:48,flex:1}}>
            <PixelIcon name="birth" /> <Text style={s.text}>Begin life</Text>
          </Button>
        </View>}
        <DevelopmentPanel
          enabled={devEnabled}
          onToggle={toggleDevelopment}
          layout={layout}
          obscured={sheet !== null}
        >
          {devEnabled && (
            <>
              <Text style={s.muted}>
                Preview tools use the drawing draft. Your living pet keeps its
                original drawing, seed and care history.
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
              <Button
                label="Open growth timeline and diagnostics"
                onPress={openLab}
              >
                Preview drawing
              </Button>
              <View style={styles.wrap}>
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
                    <Button
                      key={a.value}
                      label={a.label}
                      selected={!playing && action === a.value}
                      disabled={
                        a.value === "idle"
                          ? !previewFrame!.pixels.length
                          : a.value === "move"
                            ? !previewFrame!.capabilities.canMove
                            : a.value === "play"
                              ? !previewFrame!.capabilities.canPlay
                              : !previewFrame!.capabilities.canGreet
                      }
                      onPress={() => act(a.value, true)}
                    >{a.label}</Button>
                  ))}
                  <Button
                    label="Groom your pet"
                    selected={grooming}
                    disabled={
                      !previewFrame!.pixels.length ||
                      previewFrame!.stage === "egg"
                    }
                    onPress={() => {
                      openLab();
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
                  >Groom</Button>
                </>
              </View>
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
                      setGroomRedo((h) => [...h.slice(-39), groomingTimeline]);
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
                      setGroomUndo((h) => [...h.slice(-39), groomingTimeline]);
                      setGroomRedo((h) => h.slice(0, -1));
                      setGroomingTimeline(next);
                      setWritable(true);
                    }}
                  >
                    Redo
                  </Button>
                </View>
              )}
              {devEnabled && (
                <View style={styles.drawer}>
                  <View style={styles.between}>
                    <Text style={s.bright}>Growth preview</Text>
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
                  </View>
                  <Slider
                    accessibilityLabel="Growth timeline"
                    minimumValue={0}
                    maximumValue={timelineEnd}
                    step={1 / 24}
                    value={age}
                    onSlidingStart={openLab}
                    onValueChange={(v) => {
                      openLab();
                      setAge(
                        timelineEnd - v < 1 / 24 + 0.000001
                          ? timelineEnd
                          : v >= simulation.hatchAt
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
                  {devEnabled && (
                    <View style={styles.wrap}>
                      {simulation.milestones.map((m) => (
                        <Button
                          key={m.stage}
                          label={`View ${m.stage}`}
                          selected={Math.abs(age - m.age) < 0.1}
                          onPress={() => {
                            openLab();
                            setAge(m.age);
                          }}
                        >
                          {title(m.stage)}
                        </Button>
                      ))}
                    </View>
                  )}
                  <View style={styles.wrap}>
                    <Button
                      label={growing ? "Pause growth" : "Play growth"}
                      onPress={() => {
                        openLab();
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

              <MorphologyWorkbench
                age={age}
                value={morphTune}
                onApply={next=>{openLab();setGrowing(false);setMorphTune(next);}}
                onCompare={()=>{
                  const baseline=createSimulation(parts,seed,mode,{
                    needTimeline:needPreview??needTimeline,groomingTimeline,
                  });
                  const originalGraph=baseline.materialStateAt(age).graph;
                  const experimentalGraph=simulation.materialStateAt(age).graph;
                  const original=morphologyShapeMetrics(originalGraph);
                  const experimental=morphologyShapeMetrics(experimentalGraph);
                  const pixels=(graph:typeof originalGraph)=>graph.cells.map(c=>({
                    x:c.x,y:c.y,color:c.color,materialCellId:c.id,
                  }));
                  return {
                    age,seed,original,experimental,
                    originalPixels:pixels(originalGraph),
                    experimentalPixels:pixels(experimentalGraph),
                    recipe:JSON.stringify({
                      kind:"infipet-morphology-lab-v1",
                      source:"currently edited drawing",
                      seed,mode,age,operatorMultipliers:morphTune,
                      needTimeline:needPreview??needTimeline,
                      measurements:{original,experimental},
                      syntheticPreviewOnly:true,
                    }),
                  };
                }}
              />
              {devEnabled && <View style={styles.drawer}>
                <Text style={s.bright}>Synthetic daily care preview</Text>
                <Text style={s.muted}>
                  Only the drawing preview is affected. These values never enter your saved pet.
                  Needs Lab controls rest, fitness, security and safety for this experiment.
                </Text>
                <View style={styles.between}>
                  <Text style={s.muted}>Nutrition (synthetic)</Text>
                  <Text style={s.bright}>{Math.round(previewNutrition*100)}%</Text>
                </View>
                <Slider
                  accessibilityLabel="Synthetic nutrition used by daily development"
                  minimumValue={0} maximumValue={1} step={0.05}
                  value={previewNutrition}
                  onSlidingStart={()=>setGrowing(false)}
                  onValueChange={v=>{openLab();setPreviewNutrition(v);}}
                  minimumTrackTintColor={T.text} maximumTrackTintColor={T.line}
                  thumbTintColor={T.bright} style={{height:32}}
                />
                <Button label="Compare synthetic care with baseline" selected={comparePreview}
                  onPress={()=>setComparePreview(!comparePreview)}>
                  {comparePreview?"Hide comparison":"Compare baseline"}
                </Button>
                {!!previewComparison && <Text style={s.muted} accessibilityLiveRegion="polite">
                  Day {previewComparison.day}: {previewComparison.current} experimental sites,
                  {previewComparison.baseline} baseline sites,
                  {previewComparison.difference} physical locations differ.
                  Zero change is a valid constrained response.
                </Text>}
              </View>}
              <NeedsLab
                embedded
                key={labIdentity}
                resetKey={labIdentity}
                timeline={needTimeline}
                age={age}
                hatchAt={simulation.hatchAt}
                wellbeing={previewFrame!.wellbeing}
                development={previewFrame!.evolution}
                onChange={(next) => {
                  openLab();
                  setNeedTimeline(next);
                  setNeedPreview(null);
                  setWritable(true);
                }}
                onPreview={setNeedPreview}
                onPause={() => setGrowing(false)}
                onSeek={(next) => {
                  openLab();
                  setAge(next);
                }}
                onClose={() => {
                  setNeedPreview(null);
                  if (lifeRef.current) live();
                  else setView("draw");
                }}
              />
              <Button label="Home Screen widget" onPress={() => void widget()}>
                Publish Home Screen widget
              </Button>
              {!!widgetMessage && (
                <Text accessibilityLiveRegion="polite" style={s.muted}>
                  {widgetMessage}
                </Text>
              )}
              <Button label="New empty drawing" onPress={() => start()}>
                New empty drawing
              </Button>
            </>
          )}
        </DevelopmentPanel>
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
                      {PRESET_COLORS.map((c) => (
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
                {sheet === "more" && (
                  <>
                    <Text style={s.muted}>Your pet</Text>
                    <View style={styles.wrap}>
                      <Button label="Export pet" onPress={() => open("share")}>
                        Export
                      </Button>
                      <Button label="Import pet" onPress={() => open("import")}>
                        Import
                      </Button>
                      <Button label="Name" onPress={() => open("name")}>
                        Name
                      </Button>
                    </View>
                    <Button label="Show care symbol labels" selected={showLabels} onPress={() => setShowLabels(!showLabels)}>
                      {showLabels ? "Care labels on" : "Show care labels"}
                    </Button>
                    <Button label="About" onPress={() => open("about")}>
                      About
                    </Button>
                  </>
                )}
                {sheet === "confirm" && confirmation && (
                  <>
                    <Text style={s.text}>{confirmation.message}</Text>
                    <Button
                      label="Keep current pet"
                      onPress={() => {
                        setConfirmation(null);
                        setSheet(null);
                      }}
                    >
                      Keep current pet
                    </Button>
                    <Button
                      label="Confirm replacement"
                      onPress={() => {
                        const accept = confirmation.accept;
                        setConfirmation(null);
                        setSheet(null);
                        accept();
                      }}
                    >
                      Replace pet
                    </Button>
                  </>
                )}
                {sheet === "name" && (
                  <>
                    <TextInput
                      accessibilityLabel="Pet name"
                      value={nameInput}
                      onChangeText={(v) => setNameInput(clean(v))}
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
                            name: nameInput.trim() || "Little one",
                          });
                        else setName(nameInput.trim() || "Little one");
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
                      onPress={() => showCode?setShowCode(false):revealExportCode()}
                    >
                      {showCode ? "Hide code" : "Show code"}
                    </Button>
                    {!!exportMessage&&<Text style={s.muted}>{exportMessage}</Text>}
                    {showCode && (
                      <TextInput
                        accessibilityLabel="Exported pet code"
                        value={exportCode}
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
                    {Platform.OS==="web"&&<Button label="Open pet file" onPress={openPetFile}>Open pet file</Button>}
                    <Button
                      label="Import pet code"
                      disabled={!importInput.trim()}
                      onPress={async () => {
                        try {
                          const imported = decodePet(importInput);
                          const current = lifeRef.current;
                          if (current && !current.game.dead)
                            confirmReplacement(
                              `Importing replaces ${current.name} and its care history. Export a copy first to keep it.`,
                              () => restore(imported),
                            );
                          else restore(imported);
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
                {sheet === "about" && (
                  <>
                    <Text style={s.text}>
                      Draw an egg or an infant. Time brings surprises. Pick a
                      brush label and tap ? to learn how that part works.
                    </Text>
                    <Text style={s.muted}>
                      Feed, play, train and care for a real-time pocket pet. Its
                      anatomy can change once every 24 real hours, for 365 checks. The
                      Lab explores other possible lives while your pet
                      continues.
                    </Text>
                    <Text style={s.muted}>
                      Feelings and needs: allneeds.app. Animal ancestry: Open
                      Tree of Life. The developmental and animal-affinity rules
                      are game models.
                    </Text>
                    <Text style={s.muted}>
                      Export your pet to keep a portable copy.
                    </Text>
                    <Text style={s.muted}>
                      Terminal font: pre-programmed.art. DOS font by VileR, CC
                      BY-SA 4.0. Font credits: assets/fonts/FONT-LICENSE.md.
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
  creatureColumn: { alignItems: "center" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    minHeight: 42,
    gap: 6,
  },
  device: {
    borderWidth: 1,
    borderColor: T.line,
    backgroundColor: "#090909",
    padding: 10,
    gap: 6,
    borderRadius: 14,
  },
  toolbar: {
    flexDirection: "row",
    gap: 5,
    justifyContent: "flex-start",
    alignItems: "center",
  },
  // Fixed accessible tap targets without giant full-width labeled tiles.
  symbolButton: { width: 44, minWidth: 44, height: 44, minHeight: 44,
    paddingHorizontal: 0, paddingVertical: 0 },
  compactTextButton: { flex: 1, minHeight: 44, paddingHorizontal: 2, paddingVertical: 2 },
  button: {
    minHeight: 44,
    minWidth: 44,
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
  row: { flexDirection: "row", gap: 6, alignItems: "center" },
  mobileBirthBar: {flexDirection:"row",paddingHorizontal:12,paddingTop:6,paddingBottom:6,backgroundColor:T.bg,borderTopWidth:1,borderColor:T.line},
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  starterGrid: { flexDirection: "row", flexWrap: "wrap", gap: 4, justifyContent: "center" },
  presetChoice: { width: "23%", flexGrow: 1, minHeight: 72, paddingHorizontal: 1, paddingVertical: 2 },
  between: {
    flexWrap: "wrap",
    gap: 8,
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
