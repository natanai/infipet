import { StyleSheet } from "react-native";

// Matched to natanai/pre-programmed/src/styles.css, including its VGA font.
export const T = {
  bg: "#000000",
  panel: "#060606",
  text: "#AAAAAA",
  bright: "#DDDDDD",
  muted: "#777777",
  line: "#444444",
  dark: "#222222",
  warning: "#C7AD72",
  cyan: "#18D7E8",
  red: "#FF2B1C",
};
export const terminal = StyleSheet.create({
  text: { fontFamily: "DOS", fontSize: 16, lineHeight: 19, color: T.text },
  muted: { fontFamily: "DOS", fontSize: 16, lineHeight: 19, color: T.muted },
  bright: { fontFamily: "DOS", fontSize: 16, lineHeight: 19, color: T.bright },
  label: { fontFamily: "DOS", fontSize: 16, color: T.muted, marginBottom: 8 },
  button: {
    borderWidth: 1,
    borderColor: T.line,
    paddingVertical: 9,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: T.bg,
  },
  active: { backgroundColor: T.bright, borderColor: T.bright },
  input: {
    fontFamily: "DOS",
    fontSize: 16,
    lineHeight: 20,
    color: T.bright,
    borderWidth: 1,
    borderColor: T.line,
    backgroundColor: T.bg,
    padding: 9,
    minWidth: 0,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
});
