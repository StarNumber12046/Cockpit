import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useQuery } from "convex/react";
import { isEmergencySquawk } from "@cockpit/shared";
import type { Fr24Flight } from "@cockpit/fr24";
import { api } from "../lib/convex";
import { SeverityChip } from "./SeverityChip";
import { LoadingState } from "./LoadingState";
import { EmptyState } from "./EmptyState";
import { colors, radius, spacing, typography } from "../constants/theme";

type AlertDoc = NonNullable<ReturnType<typeof useQuery<typeof api.alerts.list>>>[number];

type OpenFlightItem = {
  fr24Id?: string;
  callsign?: string;
  flightNumber?: string;
};

type Props = {
  flights?: Fr24Flight[];
  onOpenFlight?: (item: OpenFlightItem) => void;
};

export function AlertsPanel({ flights = [], onOpenFlight }: Props) {
  const alerts = useQuery(api.alerts.list, { limit: 50 });

  const liveSquawks = useMemo(
    () =>
      flights
        .filter((f) => isEmergencySquawk(f.squawk))
        .map((f) => ({
          id: f.fr24Id,
          callsign: f.callsign || f.flightNumber || f.fr24Id,
          squawk: f.squawk,
        })),
    [flights],
  );

  if (alerts === undefined) {
    return <LoadingState label="Loading alerts…" />;
  }

  return (
    <View style={styles.root}>
      {liveSquawks.length > 0 ? (
        <View style={styles.chipRow}>
          <Text style={styles.section}>Live emergency squawks</Text>
          <View style={styles.chips}>
            {liveSquawks.map((s) => (
              <Pressable
                key={s.id}
                style={styles.squawkChip}
                onPress={() =>
                  onOpenFlight?.({
                    fr24Id: s.id,
                    callsign: s.callsign,
                  })
                }
              >
                <Text style={styles.squawkText}>
                  {s.callsign} · {s.squawk}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      <Text style={styles.section}>Convex alerts</Text>
      {alerts.length === 0 ? (
        <EmptyState
          title="No alerts"
          message="Emergency squawks and ACARS from tracked flights appear here automatically."
        />
      ) : (
        alerts.map((item) => (
          <AlertCard
            key={item._id}
            item={item}
            onPress={() =>
              onOpenFlight?.({
                fr24Id: item.fr24Id,
                callsign: item.callsign,
                flightNumber: item.flightNumber,
              })
            }
          />
        ))
      )}
    </View>
  );
}

function AlertCard({
  item,
  onPress,
}: {
  item: AlertDoc;
  onPress: () => void;
}) {
  const canOpen = Boolean(item.fr24Id);

  return (
    <Pressable
      style={[styles.card, !canOpen && styles.cardDisabled]}
      onPress={onPress}
      disabled={!canOpen}
    >
      <View style={styles.cardTop}>
        <Text style={styles.title} numberOfLines={2}>
          {item.title}
        </Text>
        <SeverityChip severity={item.severity} />
      </View>
      <Text style={styles.body}>{item.body}</Text>
      <Text style={styles.meta}>
        {item.type}
        {item.callsign ? ` · ${item.callsign}` : ""}
        {item.flightNumber ? ` · ${item.flightNumber}` : ""}
        {" · "}
        {new Date(item.createdAt).toLocaleString()}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.sm,
  },
  section: {
    ...typography.caption,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    color: colors.textDim,
  },
  chipRow: {
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  squawkChip: {
    backgroundColor: colors.dangerSoft,
    borderColor: colors.danger,
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  squawkText: {
    ...typography.caption,
    color: colors.danger,
    fontWeight: "700",
  },
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardDisabled: {
    opacity: 0.72,
  },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  title: {
    ...typography.subtitle,
    flex: 1,
  },
  body: {
    ...typography.body,
    color: colors.textMuted,
  },
  meta: {
    ...typography.caption,
  },
});