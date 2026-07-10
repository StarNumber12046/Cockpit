import { useEffect, useMemo, useRef, useState } from "react";
import {
  InteractionManager,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from "react-native";
import MapView, { PROVIDER_DEFAULT, type Region } from "react-native-maps";
import type { Fr24Flight } from "@cockpit/fr24";
import { formatFlightLabel, isEmergencySquawk } from "@cockpit/shared";
import { HUB } from "../constants/config";
import { DARK_MAP_STYLE, radiusToLatitudeDelta } from "../constants/mapStyle";
import { colors, radius, spacing, typography } from "../constants/theme";
import { useUserLocation } from "../hooks/useUserLocation";
import {
  buildTrailSegments,
  type TrailPointLike,
} from "../lib/altitudeColor";
import { AircraftMarker } from "./AircraftMarker";
import { AircraftTrail } from "./AircraftTrail";

export type MapRegion = Region;

/** iOS-style user location blue (web overlay). */
const USER_BLUE = "#007AFF";
const USER_BLUE_SOFT = "rgba(0, 122, 255, 0.18)";
const USER_BLUE_RING = "rgba(0, 122, 255, 0.35)";

/** Give GPS a moment before falling back to the default hub. */
const LOCATION_BOOT_TIMEOUT_MS = 6_000;

type Props = {
  flights: Fr24Flight[];
  selectedId?: string | null;
  /** Past positions for the selected aircraft (from FR24 detail trail). */
  trail?: TrailPointLike[] | null;
  onSelectFlight: (flight: Fr24Flight | null) => void;
  /** Fires when the visible map region settles (pan/zoom end) or on first layout. */
  onRegionChange?: (region: Region) => void;
};

/** Soft cap so Android does not die snapshotting a huge custom-marker fleet. */
const MAX_MARKERS = Platform.OS === "android" ? 80 : 160;

function hubRegion(): Region {
  return regionAround(HUB.latitude, HUB.longitude, HUB.radiusMeters);
}

/** Map span around a point, matching the default hub zoom. */
function regionAround(
  latitude: number,
  longitude: number,
  radiusMeters: number = HUB.radiusMeters,
): Region {
  const latitudeDelta = radiusToLatitudeDelta(radiusMeters);
  const cosLat = Math.max(Math.cos((latitude * Math.PI) / 180), 0.2);
  return {
    latitude,
    longitude,
    latitudeDelta,
    longitudeDelta: latitudeDelta / cosLat,
  };
}

/**
 * Live map of FR24 aircraft. Native MapView on iOS/Android;
 * projected canvas fallback on web (react-native-maps is weak there).
 */
export function FlightMap({
  flights,
  selectedId,
  trail,
  onSelectFlight,
  onRegionChange,
}: Props) {
  if (Platform.OS === "web") {
    return (
      <WebFlightMap
        flights={flights}
        selectedId={selectedId}
        trail={trail}
        onSelectFlight={onSelectFlight}
        onRegionChange={onRegionChange}
      />
    );
  }

  return (
    <NativeFlightMap
      flights={flights}
      selectedId={selectedId}
      trail={trail}
      onSelectFlight={onSelectFlight}
      onRegionChange={onRegionChange}
    />
  );
}

/**
 * Resolve startup camera: prefer user fix, else hub after timeout / deny / error.
 * Frozen once chosen so pan/zoom is not yanked by later GPS updates.
 */
function useBootRegion(
  coords: { latitude: number; longitude: number } | null,
  status: "pending" | "granted" | "denied" | "error",
): Region | null {
  const [bootRegion, setBootRegion] = useState<Region | null>(null);

  useEffect(() => {
    if (bootRegion) return;

    if (coords) {
      setBootRegion(
        regionAround(coords.latitude, coords.longitude, HUB.radiusMeters),
      );
      return;
    }

    if (status === "denied" || status === "error") {
      setBootRegion(hubRegion());
      return;
    }

    const timer = setTimeout(() => {
      setBootRegion(hubRegion());
    }, LOCATION_BOOT_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [bootRegion, coords, status]);

  return bootRegion;
}

function NativeFlightMap({
  flights,
  selectedId,
  trail,
  onSelectFlight,
  onRegionChange,
}: Props) {
  const mapRef = useRef<MapView>(null);
  const onRegionChangeRef = useRef(onRegionChange);
  onRegionChangeRef.current = onRegionChange;
  const { permitted: userLocationPermitted, coords, status } =
    useUserLocation(true);
  const bootRegion = useBootRegion(coords, status);
  const [mapReady, setMapReady] = useState(false);
  /** Defer marker mount until after first paint / map ready (avoids Android freeze). */
  const [markersEnabled, setMarkersEnabled] = useState(false);

  useEffect(() => {
    if (!mapReady) return;
    const task = InteractionManager.runAfterInteractions(() => {
      // One more frame so MapView finishes its native layout.
      requestAnimationFrame(() => setMarkersEnabled(true));
    });
    return () => task.cancel();
  }, [mapReady]);

  // Publish the startup viewport so the feed matches the map before any pan.
  useEffect(() => {
    if (!bootRegion) return;
    onRegionChangeRef.current?.(bootRegion);
  }, [bootRegion]);

  const visibleFlights = useMemo(() => {
    if (!markersEnabled) return [];
    if (flights.length <= MAX_MARKERS) return flights;
    // Prefer selected + first N so the list stays stable-ish across polls.
    const selected = selectedId
      ? flights.find((f) => f.fr24Id === selectedId)
      : undefined;
    const rest = flights
      .filter((f) => f.fr24Id !== selectedId)
      .slice(0, MAX_MARKERS - (selected ? 1 : 0));
    return selected ? [selected, ...rest] : rest;
  }, [flights, markersEnabled, selectedId]);

  if (!bootRegion) {
    return (
      <View style={styles.map}>
        <View style={styles.mapBoot}>
          <Text style={styles.mapBootText}>Finding your location…</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.map}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        provider={PROVIDER_DEFAULT}
        initialRegion={bootRegion}
        customMapStyle={DARK_MAP_STYLE}
        userInterfaceStyle="dark"
        mapType="standard"
        showsUserLocation={userLocationPermitted}
        showsMyLocationButton={false}
        showsCompass={false}
        showsScale={false}
        showsTraffic={false}
        showsBuildings={false}
        showsIndoors={false}
        toolbarEnabled={false}
        moveOnMarkerPress={false}
        liteMode={false}
        onMapReady={() => {
          setMapReady(true);
          console.log("[cockpit] map ready");
        }}
        onRegionChangeComplete={(region) => {
          onRegionChangeRef.current?.(region);
        }}
      >
        {selectedId ? <AircraftTrail points={trail} /> : null}
        {visibleFlights.map((flight) => {
          const selected = flight.fr24Id === selectedId;
          return (
            <AircraftMarker
              key={flight.fr24Id}
              flight={flight}
              selected={selected}
              onPress={onSelectFlight}
            />
          );
        })}
      </MapView>
      {!mapReady ? (
        <View style={styles.mapBoot} pointerEvents="none">
          <Text style={styles.mapBootText}>Loading map…</Text>
        </View>
      ) : !markersEnabled ? (
        <View style={styles.mapBootLight} pointerEvents="none">
          <Text style={styles.mapBootText}>Placing aircraft…</Text>
        </View>
      ) : null}
    </View>
  );
}

/** Simple lat/lon projection for web / fallback — no map tiles. */
function WebFlightMap({
  flights,
  selectedId,
  trail,
  onSelectFlight,
  onRegionChange,
}: Props) {
  const [size, setSize] = useState({ w: 1, h: 1 });
  const onRegionChangeRef = useRef(onRegionChange);
  onRegionChangeRef.current = onRegionChange;
  const { coords: userCoords, status } = useUserLocation(true);
  const bootRegion = useBootRegion(userCoords, status);
  const region = bootRegion ?? hubRegion();

  useEffect(() => {
    if (!bootRegion) return;
    onRegionChangeRef.current?.(bootRegion);
  }, [bootRegion]);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize({ w: width, h: height });
  };

  const project = (lat: number, lon: number) => {
    const halfLat = region.latitudeDelta / 2;
    const halfLon = region.longitudeDelta / 2;
    const x =
      ((lon - (region.longitude - halfLon)) / region.longitudeDelta) * size.w;
    const y =
      ((region.latitude + halfLat - lat) / region.latitudeDelta) * size.h;
    return { x, y };
  };

  const metersToPx = (meters: number) => {
    // ~111_320 m per degree latitude.
    const deg = meters / 111_320;
    return (deg / region.latitudeDelta) * size.h;
  };

  const trailSegments = useMemo(
    () => (selectedId ? buildTrailSegments(trail) : []),
    [selectedId, trail],
  );

  if (!bootRegion) {
    return (
      <View style={styles.webMap}>
        <View style={styles.mapBoot}>
          <Text style={styles.mapBootText}>Finding your location…</Text>
        </View>
      </View>
    );
  }

  const userProjected = userCoords
    ? project(userCoords.latitude, userCoords.longitude)
    : null;
  const accuracyPx =
    userCoords?.accuracy != null && userCoords.accuracy > 0
      ? Math.min(Math.max(metersToPx(userCoords.accuracy), 18), 120)
      : 28;

  return (
    <View style={styles.webMap} onLayout={onLayout}>
      <View style={styles.webGrid} pointerEvents="none" />
      <View style={styles.webHub} pointerEvents="none">
        <Text style={styles.webHubText}>Your location</Text>
      </View>
      {userProjected ? (
        <View
          pointerEvents="none"
          style={[
            styles.webUserHalo,
            {
              left: userProjected.x - accuracyPx,
              top: userProjected.y - accuracyPx,
              width: accuracyPx * 2,
              height: accuracyPx * 2,
              borderRadius: accuracyPx,
            },
          ]}
        >
          <View style={styles.webUserDot} />
        </View>
      ) : null}
      {trailSegments.map((seg, segIdx) => {
        const projected = seg.coordinates.map((c) =>
          project(c.latitude, c.longitude),
        );
        // Draw consecutive edges as thin Views rotated between points.
        return projected.slice(1).map((end, i) => {
          const start = projected[i]!;
          const dx = end.x - start.x;
          const dy = end.y - start.y;
          const len = Math.hypot(dx, dy);
          if (len < 1) return null;
          const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
          return (
            <View
              key={`trail-${segIdx}-${i}`}
              pointerEvents="none"
              style={[
                styles.webTrailSeg,
                {
                  left: start.x,
                  top: start.y,
                  width: len,
                  backgroundColor: seg.color,
                  transform: [
                    { translateY: -1.5 },
                    { rotate: `${angle}deg` },
                  ],
                },
              ]}
            />
          );
        });
      })}
      {flights.map((flight) => {
        const { x, y } = project(flight.latitude, flight.longitude);
        if (x < -20 || y < -20 || x > size.w + 20 || y > size.h + 20) {
          return null;
        }
        const selected = flight.fr24Id === selectedId;
        const emergency = isEmergencySquawk(flight.squawk);
        const tint = emergency
          ? colors.danger
          : selected
            ? colors.accent
            : colors.success;
        const rotate = `${((flight.heading % 360) + 360) % 360 - 45}deg`;
        return (
          <Pressable
            key={flight.fr24Id}
            onPress={() => onSelectFlight(flight)}
            style={[
              styles.webMarker,
              {
                left: x - 14,
                top: y - 14,
                borderColor: tint,
              },
              selected ? styles.webMarkerSelected : null,
            ]}
          >
            <View style={{ transform: [{ rotate }] }}>
              <Text style={[styles.webPlane, { color: tint }]}>✈</Text>
            </View>
            {selected ? (
              <Text style={styles.webLabel} numberOfLines={1}>
                {formatFlightLabel(flight)}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  mapBoot: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(11, 18, 32, 0.55)",
  },
  mapBootLight: {
    position: "absolute",
    bottom: spacing.xxl,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  mapBootText: {
    ...typography.caption,
    color: colors.textMuted,
    backgroundColor: "rgba(18, 26, 43, 0.92)",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    overflow: "hidden",
  },
  webMap: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#071018",
    overflow: "hidden",
  },
  webGrid: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#0b1220",
    opacity: 0.95,
    borderWidth: 1,
    borderColor: colors.border,
  },
  webHub: {
    position: "absolute",
    top: spacing.xl * 2,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  webHubText: {
    ...typography.caption,
    color: colors.textDim,
    backgroundColor: "rgba(11,18,32,0.8)",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    overflow: "hidden",
  },
  webUserHalo: {
    position: "absolute",
    backgroundColor: USER_BLUE_SOFT,
    borderWidth: 1,
    borderColor: USER_BLUE_RING,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  webUserDot: {
    width: 14,
    height: 14,
    borderRadius: radius.full,
    backgroundColor: USER_BLUE,
    borderWidth: 2.5,
    borderColor: "#FFFFFF",
    shadowColor: USER_BLUE,
    shadowOpacity: 0.55,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
  },
  webTrailSeg: {
    position: "absolute",
    height: 3,
    borderRadius: 1.5,
    transformOrigin: "0 50%",
    zIndex: 0,
  },
  webMarker: {
    position: "absolute",
    width: 28,
    height: 28,
    borderRadius: radius.full,
    borderWidth: 1.5,
    backgroundColor: "rgba(11, 18, 32, 0.9)",
    alignItems: "center",
    justifyContent: "center",
  },
  webMarkerSelected: {
    width: 34,
    height: 34,
    borderWidth: 2,
    backgroundColor: colors.accentSoft,
    zIndex: 2,
  },
  webPlane: {
    fontSize: 14,
  },
  webLabel: {
    position: "absolute",
    top: -20,
    width: 80,
    left: -23,
    textAlign: "center",
    color: colors.text,
    fontSize: 10,
    fontWeight: "700",
  },
});
