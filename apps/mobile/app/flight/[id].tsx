import { useEffect, useMemo, useState } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useMutation, useQuery } from "convex/react";
import {
  formatFlightLabel,
  formatRoute,
  formatTimestamp,
  keysFromFlight,
  type CorrelationKeys,
} from "@cockpit/shared";
import { api } from "../../lib/convex";
import type { Fr24Flight } from "@cockpit/fr24";
import { useFr24Detail } from "../../hooks/useFr24Detail";
import { LoadingState } from "../../components/LoadingState";
import { EmptyState } from "../../components/EmptyState";
import { ErrorBanner } from "../../components/ErrorBanner";
import { SeverityChip } from "../../components/SeverityChip";
import { FlightDetailBody } from "../../components/FlightDetailBody";
import { colors, radius, spacing, typography } from "../../constants/theme";
import {
  airlineLogoCandidates,
  resolveAircraftPhoto,
  type AircraftPhoto,
} from "../../lib/media";

export default function FlightDetailScreen() {
  const params = useLocalSearchParams<{
    id: string;
    callsign?: string;
    flightNumber?: string;
    icao24?: string;
    airlineIcao?: string;
    registration?: string;
  }>();

  const fr24Id = params.id;
  const { detail, loading, error, refresh } = useFr24Detail(fr24Id);

  const keys: CorrelationKeys = useMemo(() => {
    const fromDetail = keysFromFlight({
      fr24Id,
      icao24: params.icao24 || detail?.aircraft?.hex || undefined,
      callsign:
        params.callsign || detail?.identification?.callsign || undefined,
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

  const alerts = useQuery(api.alerts.listForFlight, queryArgs);
  const addTracked = useMutation(api.tracked.add);

  const [photo, setPhoto] = useState<AircraftPhoto | null>(null);
  const [photoLoading, setPhotoLoading] = useState(false);

  const title = formatFlightLabel({
    callsign: keys.callsign,
    flightNumber: keys.flightNumber,
    fr24Id,
  });

  const origin =
    detail?.airport?.origin?.code?.iata ?? detail?.airport?.origin?.code?.icao;
  const dest =
    detail?.airport?.destination?.code?.iata ??
    detail?.airport?.destination?.code?.icao;
  const statusText = detail?.status?.text;

  const logoUris = useMemo(
    () =>
      airlineLogoCandidates({
        airlineIcao:
          detail?.airline?.code?.icao || params.airlineIcao || undefined,
        airlineIata: detail?.airline?.code?.iata || undefined,
        flightNumber:
          detail?.identification?.number?.default ||
          params.flightNumber ||
          undefined,
        callsign:
          detail?.identification?.callsign || params.callsign || undefined,
      }),
    [detail, params.airlineIcao, params.callsign, params.flightNumber],
  );
  const [logoIndex, setLogoIndex] = useState(0);
  const logoKey = logoUris.join("|");
  useEffect(() => {
    setLogoIndex(0);
  }, [logoKey]);
  const logoUri = logoUris[logoIndex] ?? null;

  const registration =
    detail?.aircraft?.registration || params.registration || undefined;

  useEffect(() => {
    let cancelled = false;
    setPhoto(null);

    const icao24 = keys.icao24;
    const reg = detail?.aircraft?.registration || params.registration;
    if (loading) {
      if (!icao24 && !reg) return;
    }

    setPhotoLoading(true);
    void resolveAircraftPhoto({
      detail: loading ? undefined : detail,
      icao24,
      registration: reg,
    }).then((result) => {
      if (!cancelled) {
        setPhoto(result);
        setPhotoLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [detail, keys.icao24, loading, params.registration]);

  const onTrack = async () => {
    await addTracked({
      fr24Id,
      flightNumber: keys.flightNumber || keys.callsign || fr24Id,
      callsign: keys.callsign,
      label: title,
    });
  };

  const sheetFlight = useMemo((): Fr24Flight => {
    const lastTrail = detail?.trail?.[detail.trail.length - 1];
    return {
      fr24Id,
      callsign: keys.callsign ?? "",
      flightNumber: keys.flightNumber ?? "",
      icao24: keys.icao24 ?? "",
      airlineIcao: detail?.airline?.code?.icao || params.airlineIcao || "",
      registration: registration ?? "",
      aircraftCode: detail?.aircraft?.model?.code ?? "",
      originAirportIata: origin ?? "",
      destinationAirportIata: dest ?? "",
      altitude: lastTrail?.alt ?? 0,
      groundSpeed: lastTrail?.spd ?? 0,
      verticalSpeed: 0,
      heading: lastTrail?.hd ?? 0,
      time: lastTrail?.ts ?? 0,
      onGround: false,
      squawk: "",
      latitude: lastTrail?.lat ?? 0,
      longitude: lastTrail?.lng ?? 0,
    };
  },
    [
      detail,
      dest,
      fr24Id,
      keys.callsign,
      keys.flightNumber,
      keys.icao24,
      origin,
      params.airlineIcao,
      registration,
    ],
  );

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {error ? (
        <ErrorBanner message={error} onRetry={() => void refresh()} />
      ) : null}

      {photo?.uri ? (
        <View style={styles.photoWrap}>
          <Image
            source={{ uri: photo.uri }}
            style={styles.aircraftPhoto}
            resizeMode="cover"
            accessibilityLabel={
              registration
                ? `Photo of aircraft ${registration}`
                : "Aircraft photo"
            }
          />
          {photo.photographer ? (
            <Text style={styles.photoCredit} numberOfLines={1}>
              Photo · {photo.photographer}
            </Text>
          ) : null}
        </View>
      ) : photoLoading ? (
        <View style={styles.photoPlaceholder}>
          <Text style={styles.photoPlaceholderText}>
            Loading aircraft photo…
          </Text>
        </View>
      ) : null}

      <View style={styles.hero}>
        <View style={styles.heroTitleRow}>
          {logoUri ? (
            <View style={styles.airlineLogoBox}>
              <Image
                source={{ uri: logoUri }}
                style={styles.airlineLogo}
                resizeMode="contain"
                accessibilityLabel="Airline logo"
                onError={() => {
                  setLogoIndex((i) =>
                    i + 1 < logoUris.length ? i + 1 : logoUris.length,
                  );
                }}
              />
            </View>
          ) : null}
          <View style={styles.heroText}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.route}>{formatRoute(origin, dest)}</Text>
          </View>
        </View>
        {statusText ? <Text style={styles.status}>{statusText}</Text> : null}
        <Text style={styles.meta}>FR24 · {fr24Id}</Text>
        {keys.icao24 ? (
          <Text style={styles.meta}>ICAO24 · {keys.icao24}</Text>
        ) : null}
        <Pressable style={styles.trackBtn} onPress={() => void onTrack()}>
          <Text style={styles.trackBtnText}>Track this flight</Text>
        </Pressable>
      </View>

      <View style={styles.section}>
        <FlightDetailBody
          flight={sheetFlight}
          detail={detail}
          detailLoading={loading}
          detailError={error}
          onRefreshDetail={() => void refresh()}
        />
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

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    paddingBottom: spacing.xxl,
  },
  photoWrap: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    borderRadius: radius.lg + 2,
    overflow: "hidden",
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
  },
  aircraftPhoto: {
    width: "100%",
    height: 200,
  },
  photoCredit: {
    ...typography.caption,
    color: colors.textDim,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  photoPlaceholder: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    height: 120,
    borderRadius: radius.lg + 2,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bgCard,
  },
  photoPlaceholderText: {
    ...typography.caption,
    color: colors.textDim,
  },
  hero: {
    padding: spacing.lg,
    gap: 4,
  },
  heroTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  heroText: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  airlineLogoBox: {
    width: 52,
    height: 52,
    borderRadius: radius.md + 2,
    backgroundColor: "#F4F7FC",
    borderWidth: 1,
    borderColor: colors.border,
    padding: 6,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  airlineLogo: {
    width: "100%",
    height: "100%",
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
});