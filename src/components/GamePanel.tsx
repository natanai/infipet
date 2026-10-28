import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { GAME_RULES, type GameCommand, type GameState } from "../gameplay";
import { careGamePresentation } from "../integration/care-game-pose";
import { PixelIcon, type PixelIconName } from "./PixelIcon";
import type { CareOutcome } from "../interface/care-outcome";
import { T, terminal as s } from "../theme";

/** Visual selection does not emit gameplay events. Every command goes to the
 * authoritative native care/game reducer exactly once on intentional press.
 */
export type CareMenu = "food" | "games" | "status" | "attention";

function Action({
  label, icon, onPress, disabled = false, selected = false, showLabel = false,
}: {
  label: string;
  icon: PixelIconName;
  onPress: () => void;
  disabled?: boolean;
  selected?: boolean;
  showLabel?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, selected }}
      aria-pressed={selected}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        selected && styles.selected,
        pressed && { borderColor: T.bright },
        disabled && { opacity: 0.35 },
      ]}
    >
      <PixelIcon name={icon} color={selected ? T.bg : T.text} />
      {showLabel && <Text style={[s.text, styles.optionLabel, selected && { color: T.bg }]}>{label}</Text>}
    </Pressable>
  );
}

/** Four familiar device symbols on either side of the pet habitat. */
export function CareRail({
  game, disabled, side, menu, onMenu, onCommand,
  grooming, onGroom, showLabels = false,
}: {
  game: GameState;
  disabled: boolean;
  side: "top" | "bottom";
  menu: CareMenu;
  onMenu: (next: CareMenu) => void;
  onCommand: (command: GameCommand) => void;
  grooming: boolean;
  onGroom: () => void;
  showLabels?: boolean;
}) {
  const blocked = disabled || game.dead || game.stage === "egg";
  const rail = side === "top" ? [
    <Action key="food" label="Food" icon="food" selected={menu === "food"} onPress={() => onMenu("food")} showLabel={showLabels} />,
    <Action key="games" label="Play and training" icon="play" selected={menu === "games"} onPress={() => onMenu("games")} showLabel={showLabels} />,
    <Action key="clean" label="Clean" icon="clean" disabled={blocked} onPress={() => onCommand({ type: "clean" })} showLabel={showLabels} />,
    <Action key="lights" label={game.lightsOn ? "Lights off" : "Lights on"} icon="rest" disabled={disabled || game.dead} onPress={() => onCommand({ type: "lights", on: !game.lightsOn })} showLabel={showLabels} />,
  ] : [
    <Action key="medicine" label="Medicine" icon="health" disabled={blocked} onPress={() => onCommand({ type: "medicine" })} showLabel={showLabels} />,
    <Action key="groom" label="Groom your living pet" icon="groom" selected={grooming} disabled={blocked || game.sleeping} onPress={onGroom} showLabel={showLabels} />,
    <Action key="status" label="Status" icon="status" selected={menu === "status"} onPress={() => onMenu("status")} showLabel={showLabels} />,
    <Action key="attention" label="Attention" icon="attention" selected={menu === "attention"} onPress={() => onMenu("attention")} showLabel={showLabels} />,
  ];
  return <View style={styles.rail} accessibilityLabel={side === "top" ? "Care tools above habitat" : "Care tools below habitat"}>{rail}</View>;
}

function Meter({ label, value }: { label: string; value: number }) {
  const filled = Math.max(0, Math.min(4, Math.floor(value)));
  return (
    <Text style={[s.text, styles.meter]} accessibilityLabel={`${label} ${value} of 4`}>
      {label === "Food" ? "▣" : label === "Happy" ? "♥" : label === "Strong" ? "◆" : "▥"}
      {" "}{"■".repeat(filled)}{"□".repeat(4 - filled)}
    </Text>
  );
}
function choiceIcon(choice: string): PixelIconName {
  switch (choice.toLowerCase()) {
    case "high": case "higher": case "up": return "high";
    case "low": case "lower": case "down": return "low";
    case "left": return "left";
    case "right": return "right";
    default: return "numbers";
  }
}

/** Only the selected contextual tray is rendered. Games never predict unrevealed
 * targets; training/number/direction scores remain native and chronological.
 */
export function GamePanel({
  game, disabled, unsaved, onCommand, onNewPet, menu = "food",
  showLabels = false, outcome = null,
}: {
  game: GameState;
  disabled: boolean;
  unsaved: boolean;
  outcome?: CareOutcome | null;
  onCommand: (command: GameCommand) => void;
  onNewPet: () => void;
  menu?: CareMenu;
  showLabels?: boolean;
}) {
  const blocked = disabled || game.dead || game.stage === "egg";
  const action = (label: string, icon: PixelIconName, command: GameCommand, extraDisabled = false) => (
    <Action key={label} label={label} icon={icon} showLabel onPress={() => onCommand(command)} disabled={blocked || extraDisabled} />
  );
  const activity = game.activity;
  const call = game.attention.care ?? game.attention.sleep;
  const needsTreatment = game.health.sickness > 0 || game.health.injury > 0;
  const needsFood = game.meters.hunger < 2;
  return (
    <View style={styles.panel}>
      <View style={styles.meters}>
        <Meter label="Food" value={game.meters.hunger} />
        <Meter label="Happy" value={game.meters.happiness} />
        <Meter label="Strong" value={game.meters.strength} />
      </View>
      {outcome && <View style={styles.indicators}
        accessibilityLabel={outcome.description} accessibilityLiveRegion="polite">
        <PixelIcon size={17}
          name={outcome.result==="effective" ? "feel" :
            outcome.result==="partial" ? "status" :
            outcome.result==="refused" || outcome.result==="missed" ? "clear" : "attention"}
          color={outcome.result==="effective" ? T.bright : T.warning} />
        <Text style={s.muted}>
          {outcome.result==="effective" ? "✓" : outcome.result==="partial" ? "◒" :
            outcome.result==="refused" || outcome.result==="missed" ? "×" : "·"}
        </Text>
        <Text style={[s.muted,{flexShrink:1}]}>{outcome.description}</Text>
      </View>}
      {(call || needsTreatment || game.waste > 0 || game.attention.discipline) && (
        <View style={styles.indicators} accessibilityRole="alert">
          <PixelIcon name="attention" color={T.warning} size={16}/>
          <Text style={[s.muted, {color:T.warning,flexShrink:1}]}>
            {game.attention.sleep ? "Lights needed" : game.attention.discipline ? "Respond to call" : needsTreatment ? "Treatment needed" : game.waste > 0 ? "Clean habitat" : "Care needed"}
          </Text>
        </View>
      )}
      {game.grace && (
        <View accessibilityRole="alert" style={styles.warning}>
          <Text style={[s.text, { color: T.warning }]}>
            {game.grace.cause === "old age" ? "Time together" : "Recovery time"}{" "}
            {Math.ceil(game.grace.remainingActiveMs / 60000)} min
          </Text>
          <Text style={s.text}>
            {game.grace.cause === "old age"
              ? "Your pet has reached the end of its life. You have some time to say goodbye."
              : `${game.grace.cause}. Feed, clean and treat your pet.`}{" "}
            This timer continues in every foreground view.
          </Text>
        </View>
      )}
      {unsaved && (
        <Text accessibilityRole="alert" style={[s.text, { color: T.warning }]}>
          Not saved yet. You can keep caring for your pet; export a copy from More.
        </Text>
      )}
      {game.dead ? (
        <Action label="Create a new pet" icon="birth" onPress={onNewPet} showLabel />
      ) : activity ? (
        <View style={styles.activity}>
          <Text style={s.bright}>{activity.prompt}</Text>
          <Text accessibilityLiveRegion="polite" style={s.text}>{careGamePresentation(game, 0).cue}</Text>
          {"targets" in activity && (
            <>
              <View style={styles.indicators} accessibilityLabel={`Round ${activity.round + 1} of ${activity.rounds}, score ${activity.score}`}>
                {Array.from({length:activity.rounds},(_,i)=><Text key={i} style={s.text}>{i < activity.round ? "●" : "○"}</Text>)}
                <Text style={s.muted}> {activity.score}/{activity.rounds}</Text>
              </View>
              {activity.last && <Text style={s.muted}>{activity.last}</Text>}
              <View style={styles.choices}>
                {activity.choices.map(choice => action(choice.charAt(0).toUpperCase() + choice.slice(1), choiceIcon(choice), { type: "choose", choice }))}
              </View>
            </>
          )}
          <Action label="Back to pet" icon="undo" onPress={() => onCommand({type:"cancel"})} showLabel />
        </View>
      ) : menu === "food" ? (
        <View style={styles.choices} accessibilityLabel="Choose food">
          {action("Meal","food",{type:"feed",food:"meal"})}
          {action("Protein","status",{type:"feed",food:"protein"})}
          {action("Snack","feel",{type:"feed",food:"snack"})}
        </View>
      ) : menu === "games" ? (
        <View style={styles.choices} accessibilityLabel="Choose an actual game">
          {action("Training","high",{type:"start-game",game:"training"})}
          {action("Direction","left",{type:"start-game",game:"direction"})}
          {action("Numbers","numbers",{type:"start-game",game:"numbers"})}
          {action("CPU battle","battle",{type:"battle"}, !["juvenile","adult","advanced"].includes(game.stage))}
        </View>
      ) : menu === "attention" ? (
        <View style={styles.activity}>
          {call ? (
            <Text accessibilityRole="alert" style={s.text}>
              {game.attention.sleep ? "Bedtime: turn off the lights." : game.attention.discipline ? "Discipline call." : "Care call: restore your empty meters."}
              {" "}{call.missed ? "Care call missed." : `${Math.max(0,Math.ceil((call.atMs+GAME_RULES.callMs-game.clock.nowMs)/60000))} minutes to respond.`}
            </Text>
          ) : <Text style={s.muted}>No active care call.</Text>}
          <View style={styles.choices}>
            {game.attention.sleep && <Action label="Lights off" icon="rest" disabled={disabled} onPress={() => onCommand({type:"lights",on:false})} showLabel />}
            {game.attention.discipline && action("Discipline","attention",{type:"discipline"})}
            {needsFood && action("Meal","food",{type:"feed",food:"meal"})}
            {needsTreatment && action("Medicine","health",{type:"medicine"})}
            {game.waste > 0 && action("Clean","clean",{type:"clean"})}
          </View>
        </View>
      ) : (
        <View style={styles.activity} accessibilityLabel="Pet status and history">
          <Text style={s.text}>Weight {game.meters.weight} · energy {Math.floor(game.meters.energy)}%</Text>
          <Meter label="Discip" value={game.meters.discipline} />
          <Text style={s.text}>Care misses {game.stats.careMistakes} · training {game.stats.training}</Text>
          <Text style={s.text}>Battles {game.stats.wins}/{game.stats.battles} won · overfeeds {game.stats.overfeeds}</Text>
          <Text accessibilityLiveRegion="polite" style={s.text}>{game.message}</Text>
          {game.history.slice(-4).reverse().map((item,i)=><Text key={i} style={s.muted}>{item.atHour.toFixed(1)}h · {item.message}</Text>)}
        </View>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  rail: { flexDirection:"row",gap:6,alignItems:"stretch",justifyContent:"space-between" },
  panel: { gap:8, borderTopWidth:1,borderColor:T.line,paddingTop:8 },
  meters: {flexDirection:"row",flexWrap:"wrap",justifyContent:"space-between",gap:4},
  meter: {fontSize:14,lineHeight:19,flexShrink:1},
  indicators: {flexDirection:"row",gap:6,alignItems:"center",flexWrap:"wrap"},
  choices: {flexDirection:"row",gap:7,flexWrap:"wrap"},
  button: { minHeight:44,minWidth:44,flexGrow:1,borderWidth:1,borderColor:T.line,backgroundColor:T.bg,paddingHorizontal:9,paddingVertical:8,alignItems:"center",justifyContent:"center",gap:3 },
  optionLabel: {fontSize:13,textAlign:"center",flexShrink:1},
  selected: {backgroundColor:T.bright,borderColor:T.bright},
  activity:{borderWidth:1,borderColor:T.line,padding:10,gap:8},
  warning:{borderWidth:1,borderColor:T.warning,padding:8,gap:5}
});
