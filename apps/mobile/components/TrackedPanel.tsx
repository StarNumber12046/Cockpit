import { Pressable, StyleSheet, Text, View } from "react-native";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { api } from "../lib/convex";
import { EmptyState } from "./EmptyState";
import { LoadingState } from "./LoadingState";
import { colors, radius, spacing, typography } from "../constants/theme";

type TrackedDoc = NonNullable<ReturnType<typeof useQuery<typeof api.tracked.list>>>[number];

type Props = {
  onOpenFlight?: (item: TrackedDoc) => void;
};

export function TrackedPanel({ onOpenFlight }: Props) {
  const { isAuthenticated } = useConvexAuth();
  const router = useRouter();
  const tracked = useQuery(api.tracked.list);
  const removeTracked = useMutation(api.tracked.remove);

  if (!isAuthenticated) {
    return (
      <View style={styles.authPrompt}>
        <Text style={styles.authTitle}>Sign in to track flights</Text>
        <Text style={styles.authBody}>
          Track flights to receive ACARS alerts and monitor them in the background.
        </Text>
        <Pressable
          style={({ pressed }) => [styles.authBtn, pressed && styles.authBtnPressed]}
          onPress={() => router.push("/sign-in")}
          accessibilityRole="button"
        >
          <Text style={styles.authBtnLabel}>Sign in</Text>
        </Pressable>
      </View>
    );
  }

  if (tracked === undefined) {
    return <LoadingState label="Loading tracked flights…" />;
  }

  if (tracked.length === 0) {
    return (
      <EmptyState
        title="Nothing tracked yet"
        message="Search for a live flight on the map and track it from the flight sheet."
      />
    );
  }

  return (
    <View style={styles.root}>
      {tracked.map((item) => (
        <View key={item._id} style={styles.card}>
          <Pressable
            style={styles.cardMain}
            onPress={() => onOpenFlight?.(item)}
            disabled={!item.fr24Id}
          >
            <Text style={styles.title}>
              {item.label || item.callsign || item.flightNumber}
            </Text>
            <Text style={styles.meta}>
              {item.flightNumber}
              {item.fr24Id ? ` · ${item.fr24Id}` : " · no live id"}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => void removeTracked({ id: item._id })}
            hitSlop={8}
          >
            <Text style={styles.remove}>Remove</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.sm,
  },
  authPrompt: {
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    alignItems: "center",
  },
  authTitle: {
    ...typography.subtitle,
    textAlign: "center",
  },
  authBody: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: spacing.md,
  },
  authBtn: {
    marginTop: spacing.sm,
    height: 44,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.md,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  authBtnPressed: {
    opacity: 0.85,
  },
  authBtnLabel: {
    ...typography.subtitle,
    fontWeight: "600",
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.md,
  },
  cardMain: {
    flex: 1,
    gap: 2,
  },
  title: {
    ...typography.subtitle,
  },
  meta: {
    ...typography.caption,
  },
  remove: {
    ...typography.caption,
    color: colors.danger,
    fontWeight: "600",
  },
});