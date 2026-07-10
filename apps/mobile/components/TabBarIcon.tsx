import { FaIcon, type FaIconName } from "./FaIcon";
import { colors } from "../constants/theme";

export type TabBarIconName = "live" | "alerts" | "track";

const ICONS: Record<TabBarIconName, FaIconName> = {
  live: "map",
  alerts: "exclamation-triangle",
  track: "bell",
};

type Props = {
  name: TabBarIconName;
  focused: boolean;
  size?: number;
};

export function TabBarIcon({ name, focused, size = 20 }: Props) {
  const color = focused ? colors.accent : colors.textDim;

  return <FaIcon name={ICONS[name]} size={size} color={color} />;
}