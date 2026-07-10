import { Pressable, StyleSheet, Text, View } from "react-native";
import { useMutation, useQuery } from "convex/react";
import { api } from "../lib/convex";
import { EmptyState } from "./EmptyState";
import { LoadingState } from "./LoadingState";
import { colors, radius, spacing, typography } from "../constants/theme";

type TrackedDoc = NonNullable<ReturnType<typeof useQuery<typeof api.tracked.list>>>[number];

type Props = {
  onOpenFlight?: (item: TrackedDoc) => void;
};

export function TrackedPanel({ onOpenFlight }: Props) {
  const tracked = useQuery(api.tracked.list);
  const removeTracked = useMutation(api.tracked.remove);

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