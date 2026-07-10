/** Dark aviation-style palette for Cockpit v1. */
export const colors = {
  bg: "#0B1220",
  bgElevated: "#121A2B",
  bgCard: "#162033",
  border: "#243049",
  borderSubtle: "#1A2438",
  text: "#E8EEF9",
  textMuted: "#8B9BB8",
  textDim: "#5C6B86",
  accent: "#000000",
  accentForeground: "#FFFFFF",
  accentSoft: "rgba(0, 0, 0, 0.1)",
  /** Readable emphasis on dark surfaces (replaces blue accent text). */
  highlight: "#D6DCE8",
  success: "#3DDC97",
  warning: "#F5A623",
  danger: "#FF5C5C",
  dangerSoft: "rgba(255, 92, 92, 0.15)",
  warningSoft: "rgba(245, 166, 35, 0.15)",
  squawk: "#FF7A45",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  full: 999,
} as const;

const FONT = "RobotoFlex";

export const typography = {
  title: { fontFamily: FONT, fontSize: 22, fontWeight: "700" as const, color: colors.text },
  subtitle: { fontFamily: FONT, fontSize: 16, fontWeight: "600" as const, color: colors.text },
  body: { fontFamily: FONT, fontSize: 14, fontWeight: "400" as const, color: colors.text },
  caption: {
    fontFamily: FONT,
    fontSize: 12,
    fontWeight: "400" as const,
    color: colors.textMuted,
  },
  mono: {
    fontFamily: FONT,
    fontSize: 13,
    fontWeight: "500" as const,
    color: colors.text,
    fontVariant: ["tabular-nums"] as "tabular-nums"[],
  },
};
