import type { ComponentProps } from "react";
import type { StyleProp, TextStyle } from "react-native";
import { FontAwesome } from "../lib/vectorIcons";

export type FaIconName = ComponentProps<typeof FontAwesome>["name"];

type Props = {
  name: FaIconName;
  size?: number;
  color?: string;
  style?: StyleProp<TextStyle>;
};

export function FaIcon({ name, size = 18, color = "#000000", style }: Props) {
  return (
    <FontAwesome name={name} size={size} color={color} style={style} />
  );
}