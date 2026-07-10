import { StyleSheet, Text, View } from "react-native";
import type { Severity } from "@cockpit/shared";
import { colors, radius, spacing, typography } from "../constants/theme";

const map: Record<Severity, { bg: string; fg: string }> = {
  info: { bg: colors.accentSoft, fg: colors.text },
  warning: { bg: colors.warningSoft, fg: colors.warning },
  critical: { bg: colors.dangerSoft, fg: colors.danger },
};

export function SeverityChip({ severity }: { severity: Severity }) {
  const c = map[severity] ?? map.info;
  return (
    <View style={[styles.chip, { backgroundColor: c.bg }]}>
      <Text style={[styles.text, { color: c.fg }]}>{severity}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  text: {
    ...typography.caption,
    fontWeight: "600",
    textTransform: "uppercase",
    fontSize: 10,
  },
});
