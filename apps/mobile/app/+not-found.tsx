import { Link, Stack } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { colors, spacing, typography } from "../constants/theme";

/** Custom 404 — avoids expo-router default Unmatched → /_sitemap path. */
export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: "Not found" }} />
      <View style={styles.wrap}>
        <Text style={styles.title}>Screen not found</Text>
        <Text style={styles.body}>That route is not part of Cockpit v1.</Text>
        <Link href="/" style={styles.link}>
          <Text style={styles.linkText}>Back to Live</Text>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    gap: spacing.sm,
  },
  title: {
    ...typography.title,
  },
  body: {
    ...typography.caption,
    textAlign: "center",
  },
  link: {
    marginTop: spacing.md,
  },
  linkText: {
    ...typography.subtitle,
    color: colors.accent,
  },
});
