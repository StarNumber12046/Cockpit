import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useQuery } from "convex/react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../../lib/convex";
import {
  getBoundsFromRegion,
  type BoundsString,
  type Fr24Flight,
} from "@cockpit/fr24";
import { useFr24Detail } from "../../hooks/useFr24Detail";
import { useFr24Flights } from "../../hooks/useFr24Flights";
import { useSquawkReporter } from "../../hooks/useSquawkReporter";
import { useFr24Search } from "../../hooks/useFr24Search";
import { useSearchHitDetails } from "../../hooks/useSearchHitDetails";
import { FlightMap, type FlightMapHandle, type MapRegion } from "../../components/FlightMap";
import { FlightSheet } from "../../components/FlightSheet";
import { ChromeSheet } from "../../components/ChromeSheet";
import { AlertsPanel } from "../../components/AlertsPanel";
import { TrackedPanel } from "../../components/TrackedPanel";
import { MapChromeActions } from "../../components/MapChromeActions";
import { ErrorBanner } from "../../components/ErrorBanner";
import {
  FlightSearchBar,
  FlightSearchResults,
} from "../../components/FlightSearchBar";
import { colors, radius, spacing, typography } from "../../constants/theme";
import {
  normalizeTrailPoints,
  type TrailPointLike,
} from "../../lib/altitudeColor";
import { searchHitCoordinates } from "../../lib/searchCoords";
import { isValidMapCoordinate } from "../../components/AircraftMarker";

/** Ignore tiny region noise so pan jitter does not thrash the FR24 feed. */
const REGION_EPSILON = 1e-5;
/** Debounce after pan/zoom settles before swapping feed bounds. */
const BOUNDS_DEBOUNCE_MS = 350;
/** Debounce FR24 search while typing. */
const SEARCH_DEBOUNCE_MS = 300;

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
  const insets = useSafeAreaInsets();
  const { results, loading: searchLoading, error: searchError, search, clear } =
    useFr24Search();
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [trackedOpen, setTrackedOpen] = useState(false);
  const mapRef = useRef<FlightMapHandle>(null);
  const alerts = useQuery(api.alerts.list, { limit: 50 });
  const tracked = useQuery(api.tracked.list);
  /** null until the map publishes its startup region (user location or hub). */
  const [bounds, setBounds] = useState<BoundsString | null>(null);
  const lastRegionRef = useRef<MapRegion | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, []);

  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    const trimmed = query.trim();
    if (!trimmed) {
      clear();
      return;
    }
    searchDebounceRef.current = setTimeout(() => {
      void search(trimmed);
    }, SEARCH_DEBOUNCE_MS);
  }, [query, search, clear]);

  const { flights, loading, error, refresh } =
    useFr24Flights({
      bounds: bounds ?? undefined,
      enabled: bounds != null,
    });
  useSquawkReporter(flights, bounds != null);
  const [selected, setSelected] = useState<Fr24Flight | null>(null);
  const [offMapFlightId, setOffMapFlightId] = useState<string | null>(null);
  const [offMapFlightNumber, setOffMapFlightNumber] = useState<string>("");
  const [offMapCallsign, setOffMapCallsign] = useState<string>("");

  useEffect(() => {
    console.log(
      `[cockpit] live map: ${flights.length} flights` +
        (loading ? " (loading)" : "") +
        (error ? ` error=${error}` : ""),
    );
  }, [flights.length, loading, error]);

  const flyToCoords = useCallback((latitude: number, longitude: number) => {
    if (!isValidMapCoordinate(latitude, longitude)) return;
    mapRef.current?.flyTo(latitude, longitude);
  }, []);

  const onOffMapLocationReady = useCallback(
    (latitude: number, longitude: number) => {
      flyToCoords(latitude, longitude);
    },
    [flyToCoords],
  );

  const onSelectSearchHit = (item: {
    fr24Id?: string;
    id: string;
    label: string;
    callsign?: string;
    flightNumber?: string;
    lat?: number;
    lon?: number;
    raw?: unknown;
  }) => {
    const fr24Id = item.fr24Id ?? item.id;
    const key = fr24Id;
    setBusyId(key);
    const onMap = flights.find((f) => f.fr24Id === fr24Id);
    if (onMap) {
      setSelected(onMap);
      setOffMapFlightId(null);
      flyToCoords(onMap.latitude, onMap.longitude);
      setQuery("");
      clear();
      setBusyId(null);
      return;
    }

    const coords = searchHitCoordinates(item);
    if (coords) {
      flyToCoords(coords.lat, coords.lon);
    }

    setQuery("");
    clear();
    setBusyId(null);
    setOffMapFlightId(fr24Id);
    const flightNumber = (item.flightNumber ?? item.label)
      .replace(/\s+/g, "")
      .toUpperCase();
    const callsign = (item.callsign ?? item.label)
      .replace(/\s+/g, "")
      .toUpperCase();
    setOffMapFlightNumber(flightNumber);
    setOffMapCallsign(callsign);
  };

  // Keep sheet in sync if the selected flight moves on poll refresh.
  const selectedLive = useMemo(() => {
    if (!selected) return null;
    return flights.find((f) => f.fr24Id === selected.fr24Id) ?? selected;
  }, [flights, selected]);

  // After flying to an off-map search hit, select it once the feed includes it.
  useEffect(() => {
    if (!offMapFlightId || selected?.fr24Id === offMapFlightId) return;
    const found = flights.find((f) => f.fr24Id === offMapFlightId);
    if (!found) return;
    setSelected(found);
    setOffMapFlightId(null);
  }, [flights, offMapFlightId, selected?.fr24Id]);

  // FR24 detail payload includes past positions (`trail`) for the selected aircraft.
  const {
    detail: selectedDetail,
    loading: detailLoading,
    error: detailError,
    refresh: refreshDetail,
  } = useFr24Detail(selectedLive?.fr24Id);

  // Past-position trail only (no origin→aircraft route line).
  const selectedTrail = useMemo((): TrailPointLike[] | null => {
    if (!selectedLive) return null;
    return normalizeTrailPoints(selectedDetail?.trail as unknown[] | undefined, {
      lat: selectedLive.latitude,
      lng: selectedLive.longitude,
      alt: selectedLive.altitude,
    });
  }, [selectedDetail?.trail, selectedLive]);

  const liveHits = results.live;
  const showSearchResults = query.trim().length > 0 && liveHits.length > 0;
  const searchHitDetails = useSearchHitDetails(
    liveHits,
    flights,
    showSearchResults,
  );

  useEffect(() => {
    if (!showSearchResults) return;
    setAlertsOpen(false);
    setTrackedOpen(false);
  }, [showSearchResults]);
  const alertCount = alerts?.length ?? 0;
  const trackedCount = tracked?.length ?? 0;

  const closeSearch = useCallback(() => {
    setQuery("");
    clear();
  }, [clear]);

  const openAlerts = () => {
    setTrackedOpen(false);
    closeSearch();
    setAlertsOpen(true);
  };

  const openTracked = () => {
    setAlertsOpen(false);
    closeSearch();
    setTrackedOpen(true);
  };

  const onOpenTrackedFlight = (item: {
    fr24Id?: string;
    callsign?: string;
    flightNumber?: string;
  }) => {
    if (!item.fr24Id) return;
    setTrackedOpen(false);
    setAlertsOpen(false);
    const onMap = flights.find((f) => f.fr24Id === item.fr24Id);
    if (onMap) {
      setSelected(onMap);
      setOffMapFlightId(null);
      flyToCoords(onMap.latitude, onMap.longitude);
      return;
    }
    setOffMapFlightId(item.fr24Id);
    setOffMapFlightNumber(item.flightNumber ?? "");
    setOffMapCallsign(item.callsign ?? "");
  };

  return (
    <View style={styles.screen}>
      <FlightMap
        ref={mapRef}
        flights={flights}
        selectedId={selectedLive?.fr24Id}
        trail={selectedTrail}
        selectedDetail={selectedDetail}
        onSelectFlight={(f) => { setSelected(f); setOffMapFlightId(null); }}
        onRegionChange={onRegionChange}
      />

      <View
        style={[styles.chrome, { paddingTop: Math.max(insets.top, spacing.sm) }]}
        pointerEvents="box-none"
      >
        <FlightSearchBar
          query={query}
          onChangeQuery={setQuery}
          loading={searchLoading}
        />

        <MapChromeActions
          onAlerts={openAlerts}
          onTracked={openTracked}
          onRecenter={() => mapRef.current?.recenterOnUser()}
          alertCount={alertCount}
          trackedCount={trackedCount}
        />

        {searchError ? (
          <ErrorBanner
            message={searchError}
            onRetry={() => void search(query.trim())}
          />
        ) : null}

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
        visible={selectedLive != null || offMapFlightId != null}
        onClose={() => { setSelected(null); setOffMapFlightId(null); }}
        detail={selectedDetail}
        detailLoading={detailLoading}
        detailError={detailError}
        onRefreshDetail={() => void refreshDetail()}
        offMapFlightId={offMapFlightId ?? undefined}
        offMapFlightNumber={offMapFlightNumber}
        offMapCallsign={offMapCallsign}
        onOffMapLocationReady={onOffMapLocationReady}
      />

      <ChromeSheet
        visible={alertsOpen}
        title="Alerts"
        onClose={() => setAlertsOpen(false)}
      >
        <AlertsPanel flights={flights} onOpenFlight={onOpenTrackedFlight} />
      </ChromeSheet>

      <ChromeSheet
        visible={trackedOpen}
        title="Tracked flights"
        onClose={() => setTrackedOpen(false)}
      >
        <TrackedPanel onOpenFlight={onOpenTrackedFlight} />
      </ChromeSheet>

      <ChromeSheet
        visible={showSearchResults}
        title="Search"
        onClose={closeSearch}
      >
        <FlightSearchResults
          hits={liveHits}
          flights={flights}
          detailsById={searchHitDetails}
          busyId={busyId}
          onSelect={onSelectSearchHit}
        />
      </ChromeSheet>
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
