import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useQuery } from "convex/react";
import { isEmergencySquawk } from "@cockpit/shared";
import type { Fr24Flight } from "@cockpit/fr24";
import { api } from "../lib/convex";
import { SeverityChip } from "./SeverityChip";
import { LoadingState } from "./LoadingState";
import { EmptyState } from "./EmptyState";
import { colors, radius, spacing, typography } from "../constants/theme";

type Props = {
  flights?: Fr24Flight[];
};

export function AlertsPanel({ flights = [] }: Props) {
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
              <View key={s.id} style={styles.squawkChip}>
                <Text style={styles.squawkText}>
                  {s.callsign} · {s.squawk}
                </Text>
              </View>
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
          <View key={item._id} style={styles.card}>
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
          </View>
        ))
      )}
    </View>
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