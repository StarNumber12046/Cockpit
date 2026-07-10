import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "convex/react";
import {
  getBoundsFromRegion,
  type BoundsString,
  type Fr24Flight,
} from "@cockpit/fr24";
import { isEmergencySquawk } from "@cockpit/shared";
import { api } from "../../lib/convex";
import { useFr24Detail } from "../../hooks/useFr24Detail";
import { useFr24Flights } from "../../hooks/useFr24Flights";
import { FlightMap, type MapRegion } from "../../components/FlightMap";
import { FlightSheet } from "../../components/FlightSheet";
import { ErrorBanner } from "../../components/ErrorBanner";
import { colors, radius, spacing, typography } from "../../constants/theme";
import {
  normalizeTrailPoints,
  type TrailPointLike,
} from "../../lib/altitudeColor";

/** Ignore tiny region noise so pan jitter does not thrash the FR24 feed. */
const REGION_EPSILON = 1e-5;
/** Debounce after pan/zoom settles before swapping feed bounds. */
const BOUNDS_DEBOUNCE_MS = 350;

function regionsEqual(a: MapRegion, b: MapRegion): boolean {
  return (
    Math.abs(a.latitude - b.latitude) < REGION_EPSILON &&
    Math.abs(a.longitude - b.longitude) < REGION_EPSILON &&
    Math.abs(a.latitudeDelta - b.latitudeDelta) < REGION_EPSILON &&
    Math.abs(a.longitudeDelta - b.longitudeDelta) < REGION_EPSILON
  );
}

function regionToBounds(region: MapRegion): BoundsString {
  return getBoundsFromRegion(
    region.latitude,
    region.longitude,
    region.latitudeDelta,
    region.longitudeDelta,
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  /** null until the map publishes its startup region (user location or hub). */
  const [bounds, setBounds] = useState<BoundsString | null>(null);
  const lastRegionRef = useRef<MapRegion | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onRegionChange = useCallback((region: MapRegion) => {
    const prev = lastRegionRef.current;
    if (prev && regionsEqual(prev, region)) return;
    lastRegionRef.current = region;

    // First region (boot camera): apply immediately so the feed matches startup.
    if (!prev) {
      setBounds(regionToBounds(region));
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setBounds(regionToBounds(region));
    }, BOUNDS_DEBOUNCE_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const { flights, loading, refreshing, error, lastUpdated, refresh } =
    useFr24Flights({
      bounds: bounds ?? undefined,
      enabled: bounds != null,
    });
  const [selected, setSelected] = useState<Fr24Flight | null>(null);

  const alerts = useQuery(api.alerts.list, { limit: 20 });
  const alertCount = alerts?.length ?? 0;

  useEffect(() => {
    console.log(
      `[cockpit] live map: ${flights.length} flights` +
        (loading ? " (loading)" : "") +
        (error ? ` error=${error}` : ""),
    );
  }, [flights.length, loading, error]);

  const emergencyCount = useMemo(
    () => flights.filter((f) => isEmergencySquawk(f.squawk)).length,
    [flights],
  );

  // Keep sheet in sync if the selected flight moves on poll refresh.
  const selectedLive = useMemo(() => {
    if (!selected) return null;
    return flights.find((f) => f.fr24Id === selected.fr24Id) ?? selected;
  }, [flights, selected]);

  // FR24 detail payload includes past positions (`trail`) for the selected aircraft.
  const { detail: selectedDetail } = useFr24Detail(selectedLive?.fr24Id);

  // Past-position trail only (no origin→aircraft route line).
  const selectedTrail = useMemo((): TrailPointLike[] | null => {
    if (!selectedLive) return null;
    return normalizeTrailPoints(selectedDetail?.trail as unknown[] | undefined, {
      lat: selectedLive.latitude,
      lng: selectedLive.longitude,
      alt: selectedLive.altitude,
    });
  }, [selectedDetail?.trail, selectedLive]);

  const openDetails = (flight: Fr24Flight) => {
    setSelected(null);
    router.push({
      pathname: "/flight/[id]",
      params: {
        id: flight.fr24Id,
        callsign: flight.callsign,
        flightNumber: flight.flightNumber,
        icao24: flight.icao24,
        airlineIcao: flight.airlineIcao,
        registration: flight.registration,
      },
    });
  };

  const statusLine = loading && flights.length === 0
    ? "Loading live traffic…"
    : `${flights.length} aircraft` +
      (emergencyCount > 0 ? ` · ${emergencyCount} emerg` : "") +
      (alertCount > 0 ? ` · ${alertCount} alerts` : "");

  return (
    <View style={styles.screen}>
      <FlightMap
        flights={flights}
        selectedId={selectedLive?.fr24Id}
        trail={selectedTrail}
        onSelectFlight={setSelected}
        onRegionChange={onRegionChange}
      />

      <View
        style={[styles.chrome, { paddingTop: Math.max(insets.top, spacing.sm) }]}
        pointerEvents="box-none"
      >
        <View style={styles.hud}>
          <View style={styles.hudMain}>
            <Text style={styles.hub}>Live traffic</Text>
            <Text style={styles.meta}>{statusLine}</Text>
            {lastUpdated ? (
              <Text style={styles.metaDim}>
                Updated {new Date(lastUpdated).toLocaleTimeString()}
              </Text>
            ) : loading ? (
              <Text style={styles.metaDim}>Fetching FR24 feed…</Text>
            ) : null}
          </View>
          <Pressable
            style={styles.refreshBtn}
            onPress={() => void refresh()}
            disabled={refreshing}
            hitSlop={8}
          >
            {loading && flights.length === 0 ? (
              <ActivityIndicator color={colors.accent} size="small" />
            ) : (
              <Text style={styles.refreshText}>
                {refreshing ? "…" : "↻"}
              </Text>
            )}
          </Pressable>
        </View>

        {error ? (
          <ErrorBanner message={error} onRetry={() => void refresh()} />
        ) : null}

        {!loading && flights.length === 0 && !error ? (
          <View style={styles.emptyChip}>
            <Text style={styles.emptyText}>No flights in view</Text>
          </View>
        ) : null}
      </View>

      <FlightSheet
        flight={selectedLive}
        visible={selectedLive != null}
        onClose={() => setSelected(null)}
        onOpenDetails={openDetails}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  chrome: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    // Above map badge overlay (zIndex 5) — Android elevation required too.
    zIndex: 50,
    elevation: 50,
  },
  hud: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: "rgba(18, 26, 43, 0.92)",
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  hudMain: {
    flex: 1,
    gap: 2,
  },
  hub: {
    ...typography.subtitle,
    fontSize: 15,
  },
  meta: {
    ...typography.caption,
    color: colors.textMuted,
  },
  metaDim: {
    ...typography.caption,
    color: colors.textDim,
    fontSize: 11,
  },
  refreshBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  refreshText: {
    color: colors.accent,
    fontSize: 18,
    fontWeight: "700",
  },
  emptyChip: {
    alignSelf: "center",
    backgroundColor: "rgba(18, 26, 43, 0.9)",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyText: {
    ...typography.caption,
    color: colors.textMuted,
  },
});
