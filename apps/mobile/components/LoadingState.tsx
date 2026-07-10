import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { colors, spacing, typography } from "../constants/theme";

type Props = {
  label?: string;
};

export function LoadingState({ label = "Loading…" }: Props) {
  return (
    <View style={styles.wrap}>
      <ActivityIndicator color={colors.accentForeground} size="large" />
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    minHeight: 160,
    gap: spacing.md,
  },
  label: {
    ...typography.caption,
  },
});
