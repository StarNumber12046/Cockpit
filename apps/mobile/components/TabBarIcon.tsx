import { Text, type TextStyle } from "react-native";
import { colors } from "../constants/theme";

/**
 * Text-based tab icons — no vector-font / Expo schema dependency.
 * Works even when `expo start --offline` can't resolve manifest assets.
 */
const GLYPHS = {
  live: "✈",
  alerts: "⚠",
  track: "◎",
} as const;

export type TabBarIconName = keyof typeof GLYPHS;

type Props = {
  name: TabBarIconName;
  focused: boolean;
  size?: number;
};

export function TabBarIcon({ name, focused, size = 20 }: Props) {
  const style: TextStyle = {
    fontSize: size,
    color: focused ? colors.accent : colors.textDim,
    fontWeight: focused ? "700" : "500",
    textAlign: "center",
    width: size + 8,
    lineHeight: size + 4,
  };
  return <Text style={style}>{GLYPHS[name]}</Text>;
}
