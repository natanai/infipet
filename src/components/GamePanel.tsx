import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { GAME_RULES, type GameCommand, type GameState } from "../gameplay";
import { T, terminal as s } from "../theme";

function Action({
  label,
  onPress,
  disabled = false,
  selected = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  selected?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        selected && styles.selected,
        pressed && { borderColor: T.bright },
        disabled && { opacity: 0.35 },
      ]}
    >
      <Text style={[s.text, selected && { color: T.bg }]}>{label}</Text>
    </Pressable>
  );
}
function Meter({ label, value }: { label: string; value: number }) {
  return (
    <Text
      style={[s.text, styles.meter]}
      accessibilityLabel={`${label} ${value} of 4`}
    >
      {label.padEnd(6)} [{"|".repeat(value)}
      {".".repeat(4 - value)}]
    </Text>
  );
}
/** Actual care actions; the evolution Lab has no authority over this state. */
export function GamePanel({
  game,
  disabled,
  unsaved,
  onCommand,
  onNewPet,
}: {
  game: GameState;
  disabled: boolean;
  unsaved: boolean;
  onCommand: (command: GameCommand) => void;
  onNewPet: () => void;
}) {
  const [tab, setTab] = useState<"care" | "games" | "status">("care");
  const blocked = disabled || game.dead || game.stage === "egg";
  const action = (
    label: string,
    command: GameCommand,
    extraDisabled = false,
  ) => (
    <Action
      key={label}
      label={label}
      onPress={() => onCommand(command)}
      disabled={blocked || extraDisabled}
    />
  );
  const activity = game.activity;
  const clockMinute =
    (((Math.floor(game.clock.nowMs / 60000) + game.clock.utcOffsetMinutes) %
      1440) +
      1440) %
    1440;
  const clock = `${String(Math.floor(clockMinute / 60)).padStart(2, "0")}:${String(clockMinute % 60).padStart(2, "0")}`;
  return (
    <View style={styles.panel}>
      <View style={styles.row}>
        <Meter label="Food" value={game.meters.hunger} />
        <Meter label="Happy" value={game.meters.happiness} />
        <Meter label="Strong" value={game.meters.strength} />
        <Text style={[s.muted, styles.meter]}>
          {clock} · {game.sleeping ? "Asleep" : "Awake"}
        </Text>
      </View>
      {(game.attention.care || game.attention.sleep) && (
        <Text accessibilityRole="alert" style={[s.text, { color: T.warning }]}>
          {game.attention.sleep
            ? "Bedtime: turn off the lights."
            : "Attention: restore the empty care meters."}
          {(() => {
            const call = game.attention.care ?? game.attention.sleep;
            return call && !call.missed
              ? ` ${Math.max(0, Math.ceil((call.atMs + GAME_RULES.callMs - game.clock.nowMs) / 60000))} min to respond.`
              : " Care call missed.";
          })()}
        </Text>
      )}
      {(game.health.sickness > 0 ||
        game.health.injury > 0 ||
        game.waste > 0 ||
        game.attention.discipline) && (
        <Text style={[s.text, { color: T.warning }]}>
          {[
            game.health.sickness > 0 && "Sick: give medicine",
            game.health.injury > 0 && "Injured: give medicine",
            game.waste > 0 && `Waste ${game.waste}/4`,
            game.attention.discipline &&
              "Calling with full meters: discipline needed",
          ]
            .filter(Boolean)
            .join(" · ")}
        </Text>
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
      {!activity && (
        <Text accessibilityLiveRegion="polite" style={s.text}>
          {game.message}
        </Text>
      )}
      {unsaved && (
        <Text style={[s.text, { color: T.warning }]}>
          Not saved yet. You can keep caring for your pet; export a copy from More.
        </Text>
      )}
      {game.dead ? (
        <Action label="Create a new pet" onPress={onNewPet} />
      ) : activity ? (
        <View style={styles.activity}>
          <Text style={s.bright}>{activity.prompt}</Text>
          {"targets" in activity && (
            <>
              <Text style={s.muted}>
                Round {activity.round + 1}/{activity.rounds} · score{" "}
                {activity.score}
                {activity.last ? ` · ${activity.last}` : ""}
              </Text>
              <View style={styles.row}>
                {activity.choices.map((choice) =>
                  action(choice.charAt(0).toUpperCase() + choice.slice(1), {
                    type: "choose",
                    choice,
                  }),
                )}
              </View>
            </>
          )}
          {action("Back to pet", { type: "cancel" })}
        </View>
      ) : (
        <>
          <View style={styles.row}>
            {(["care", "games", "status"] as const).map((item) => (
              <Action
                key={item}
                label={item.charAt(0).toUpperCase() + item.slice(1)}
                onPress={() => setTab(item)}
                selected={tab === item}
              />
            ))}
          </View>
          {tab === "care" && (
            <View style={styles.row}>
              {action("Meal", { type: "feed", food: "meal" })}
              {action("Protein", { type: "feed", food: "protein" })}
              {action("Snack", { type: "feed", food: "snack" })}
              {action("Clean", { type: "clean" })}
              {action("Medicine", { type: "medicine" })}
              {action(game.lightsOn ? "Lights off" : "Lights on", {
                type: "lights",
                on: !game.lightsOn,
              })}
              {action("Discipline", { type: "discipline" })}
            </View>
          )}
          {tab === "games" && (
            <View style={{ gap: 8 }}>
              <View style={styles.row}>
                {action("Training", { type: "start-game", game: "training" })}
                {action("Direction", { type: "start-game", game: "direction" })}
                {action("Numbers", { type: "start-game", game: "numbers" })}
                {action(
                  "CPU battle",
                  { type: "battle" },
                  !["juvenile", "adult", "advanced"].includes(game.stage),
                )}
              </View>
              <Text style={s.muted}>
                Battles unlock at juvenile. Care, training and battle results
                shape later growth.
              </Text>
            </View>
          )}
          {tab === "status" && (
            <View style={{ gap: 6 }}>
              <Text style={s.text}>
                Weight {game.meters.weight} · energy{" "}
                {Math.floor(game.meters.energy)}%
              </Text>
              <Meter label="Discip" value={game.meters.discipline} />
              <Text style={s.text}>
                Care misses {game.stats.careMistakes} · training{" "}
                {game.stats.training}
              </Text>
              <Text style={s.text}>
                Battles {game.stats.wins}/{game.stats.battles} won · overfeeds{" "}
                {game.stats.overfeeds}
              </Text>
              {game.history
                .slice(-4)
                .reverse()
                .map((item, i) => (
                  <Text key={i} style={s.muted}>
                    {item.atHour.toFixed(1)}h · {item.message}
                  </Text>
                ))}
            </View>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: 10, paddingTop: 10, borderTopWidth: 1, borderColor: T.line },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 7, alignItems: "center" },
  meter: { width: "48%", fontSize: 15, lineHeight: 19 },
  button: {
    minHeight: 42,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: T.line,
    backgroundColor: T.bg,
    justifyContent: "center",
  },
  selected: { backgroundColor: T.bright },
  activity: { borderWidth: 1, borderColor: T.line, padding: 10, gap: 10 },
  warning: { borderWidth: 1, borderColor: T.warning, padding: 8, gap: 5 },
});
