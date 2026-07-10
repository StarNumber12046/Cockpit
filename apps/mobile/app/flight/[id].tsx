import { useMemo } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useMutation, useQuery } from "convex/react";
import {
  formatAltitude,
  formatFlightLabel,
  formatRoute,
  formatTimestamp,
  keysFromFlight,
  type CorrelationKeys,
} from "@cockpit/shared";
import { api } from "../../lib/convex";
import { useFr24Detail } from "../../hooks/useFr24Detail";
import { LoadingState } from "../../components/LoadingState";
import { EmptyState } from "../../components/EmptyState";
import { ErrorBanner } from "../../components/ErrorBanner";
import { SeverityChip } from "../../components/SeverityChip";
import { colors, radius, spacing, typography } from "../../constants/theme";

export default function FlightDetailScreen() {
  const params = useLocalSearchParams<{
    id: string;
    callsign?: string;
    flightNumber?: string;
    icao24?: string;
  }>();

  const fr24Id = params.id;
  const { detail, loading, error, refresh } = useFr24Detail(fr24Id);

  const keys: CorrelationKeys = useMemo(() => {
    const fromDetail = keysFromFlight({
      fr24Id,
      icao24:
        params.icao24 ||
        (detail?.aircraft as { hex?: string } | undefined)?.hex,
      callsign:
        params.callsign ||
        detail?.identification?.callsign ||
        undefined,
      flightNumber:
        params.flightNumber ||
        detail?.identification?.number?.default ||
        undefined,
    });
    return fromDetail;
  }, [detail, fr24Id, params.callsign, params.flightNumber, params.icao24]);

  const queryArgs = useMemo(
    () => ({
      fr24Id: keys.fr24Id,
      icao24: keys.icao24,
      callsign: keys.callsign,
      flightNumber: keys.flightNumber,
    }),
    [keys],
  );

  const acars = useQuery(api.acars.listForFlight, queryArgs);
  const alerts = useQuery(api.alerts.listForFlight, queryArgs);
  const addTracked = useMutation(api.tracked.add);

  const title = formatFlightLabel({
    callsign: keys.callsign,
    flightNumber: keys.flightNumber,
    fr24Id,
  });

  const origin =
    detail?.airport?.origin?.code?.iata ??
    detail?.airport?.origin?.code?.icao;
  const dest =
    detail?.airport?.destination?.code?.iata ??
    detail?.airport?.destination?.code?.icao;
  const trailLen = detail?.trail?.length ?? 0;
  const statusText = detail?.status?.text;

  const onTrack = async () => {
    await addTracked({
      fr24Id,
      flightNumber: keys.flightNumber || keys.callsign || fr24Id,
      callsign: keys.callsign,
      label: title,
    });
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {error ? <ErrorBanner message={error} onRetry={() => void refresh()} /> : null}

      <View style={styles.hero}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.route}>{formatRoute(origin, dest)}</Text>
        {statusText ? <Text style={styles.status}>{statusText}</Text> : null}
        <Text style={styles.meta}>FR24 · {fr24Id}</Text>
        {keys.icao24 ? <Text style={styles.meta}>ICAO24 · {keys.icao24}</Text> : null}
        <Pressable style={styles.trackBtn} onPress={() => void onTrack()}>
          <Text style={styles.trackBtnText}>Track this flight</Text>
        </Pressable>
      </View>

      {loading ? (
        <LoadingState label="Loading FR24 detail…" />
      ) : (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Live detail</Text>
          <View style={styles.card}>
            <Row
              label="Aircraft"
              value={
                detail?.aircraft?.model?.text ||
                detail?.aircraft?.model?.code ||
                "—"
              }
            />
            <Row label="Registration" value={detail?.aircraft?.registration || "—"} />
            <Row label="Airline" value={detail?.airline?.name || "—"} />
            <Row label="Trail points" value={String(trailLen)} />
            {detail?.trail?.[detail.trail.length - 1] ? (
              <>
                <Row
                  label="Last alt"
                  value={formatAltitude(detail.trail[detail.trail.length - 1]?.alt)}
                />
                <Row
                  label="Last fix"
                  value={formatTimestamp(detail.trail[detail.trail.length - 1]?.ts)}
                />
              </>
            ) : null}
          </View>
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>ACARS</Text>
        {acars === undefined ? (
          <LoadingState label="Loading ACARS…" />
        ) : acars.length === 0 ? (
          <EmptyState
            title="No ACARS for this identity"
            message="Seed demo data (UAL123, AA456, DL789, DEMO1) or wait for correlated messages."
          />
        ) : (
          acars.map((msg: (typeof acars)[number]) => (
            <View key={msg._id} style={styles.card}>
              <View style={styles.rowBetween}>
                <Text style={styles.cardTitle}>{msg.category}</Text>
                <SeverityChip severity={msg.severity} />
              </View>
              <Text style={styles.body}>{msg.decoded || msg.raw}</Text>
              <Text style={styles.meta}>{formatTimestamp(msg.timestamp)}</Text>
            </View>
          ))
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Alerts</Text>
        {alerts === undefined ? (
          <LoadingState label="Loading alerts…" />
        ) : alerts.length === 0 ? (
          <EmptyState title="No correlated alerts" />
        ) : (
          alerts.map((a: (typeof alerts)[number]) => (
            <View key={a._id} style={styles.card}>
              <View style={styles.rowBetween}>
                <Text style={styles.cardTitle}>{a.title}</Text>
                <SeverityChip severity={a.severity} />
              </View>
              <Text style={styles.body}>{a.body}</Text>
              <Text style={styles.meta}>
                {a.type} · {formatTimestamp(a.createdAt)}
              </Text>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.kv}>
      <Text style={styles.k}>{label}</Text>
      <Text style={styles.v}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    paddingBottom: spacing.xxl,
  },
  hero: {
    padding: spacing.lg,
    gap: 4,
  },
  title: {
    ...typography.title,
  },
  route: {
    ...typography.subtitle,
    color: colors.accent,
  },
  status: {
    ...typography.body,
    color: colors.success,
    marginTop: 4,
  },
  meta: {
    ...typography.caption,
  },
  trackBtn: {
    marginTop: spacing.md,
    alignSelf: "flex-start",
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  trackBtnText: {
    color: colors.bg,
    fontWeight: "700",
  },
  section: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  sectionTitle: {
    ...typography.caption,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    color: colors.textDim,
  },
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.sm,
  },
  cardTitle: {
    ...typography.subtitle,
    flex: 1,
  },
  body: {
    ...typography.body,
    color: colors.textMuted,
  },
  kv: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  k: {
    ...typography.caption,
  },
  v: {
    fontSize: typography.mono.fontSize,
    fontWeight: typography.mono.fontWeight,
    color: colors.text,
    fontVariant: typography.mono.fontVariant,
    flexShrink: 1,
    textAlign: "right",
  },
});
