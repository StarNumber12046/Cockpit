import { useMemo } from "react";
import {
  FlatList,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useQuery } from "convex/react";
import { isEmergencySquawk } from "@cockpit/shared";
import { api } from "../../lib/convex";
import { useFr24Flights } from "../../hooks/useFr24Flights";
import { SeverityChip } from "../../components/SeverityChip";
import { LoadingState } from "../../components/LoadingState";
import { EmptyState } from "../../components/EmptyState";
import { colors, radius, spacing, typography } from "../../constants/theme";

export default function AlertsScreen() {
  const alerts = useQuery(api.alerts.list, { limit: 50 });
  const { flights } = useFr24Flights({ pollMs: 30_000 });

  const liveSquawks = useMemo(
    () =>
      flights.filter((f) => isEmergencySquawk(f.squawk)).map((f) => ({
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
    <View style={styles.screen}>
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

      <FlatList
        data={alerts}
        keyExtractor={(item) => item._id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <EmptyState
            title="No alerts"
            message="Run seed.populate in Convex for demo alerts, or wait for correlated events."
          />
        }
        ListHeaderComponent={
          <Text style={[styles.section, styles.listHeader]}>Convex alerts</Text>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
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
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  list: {
    paddingBottom: spacing.xxl,
  },
  listHeader: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  section: {
    ...typography.caption,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    color: colors.textDim,
  },
  chipRow: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginBottom: spacing.sm,
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
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
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
