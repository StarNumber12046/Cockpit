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
import { isEmergencySquawk } from "@cockpit/shared";
import { HUB } from "../constants/config";
import { DARK_MAP_STYLE, radiusToLatitudeDelta } from "../constants/mapStyle";
import { colors, radius, spacing, typography } from "../constants/theme";
import { useSmoothedFlights } from "../hooks/useSmoothedFlights";
import { useUserLocation } from "../hooks/useUserLocation";
import {
  buildTrailSegments,
  type TrailPointLike,
} from "../lib/altitudeColor";
import { AIRCRAFT_ICON_SIZE, AircraftIcon } from "./AircraftIcon";
import { AircraftMarker, isValidMapCoordinate } from "./AircraftMarker";
import { AircraftTrail } from "./AircraftTrail";
import { BADGE_ABOVE_PLANE, CallsignBadge } from "./CallsignBadge";

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

/**
 * Soft cap for map glyphs. Android snapshots each Marker child to a bitmap —
 * too many at once OOM the ~256MB heap (AIRMapMarker coordinate update fails).
 */
const MAX_MARKERS = Platform.OS === "android" ? 50 : 160;
/** Ramp concurrent Android markers so first-paint bitmaps are not simultaneous. */
const MARKER_RAMP_STEP = Platform.OS === "android" ? 12 : MAX_MARKERS;
const MARKER_RAMP_MS = 80;

/**
 * Hide callsign badges when zoomed out past this latitude span (degrees).
 * Default hub view is ~1.6°; labels stay on at metro scale and drop for
 * regional / country views where they would crowd the map.
 */
const CALLSIGN_MAX_LAT_DELTA = 2.0;

function callsignsVisibleAtZoom(region: Region): boolean {
  return region.latitudeDelta <= CALLSIGN_MAX_LAT_DELTA;
}

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

/** Equirectangular project lat/lon → screen px for the current map region. */
function projectToScreen(
  lat: number,
  lon: number,
  region: Region,
  size: { w: number; h: number },
): { x: number; y: number } {
  const halfLat = region.latitudeDelta / 2;
  const halfLon = region.longitudeDelta / 2;
  const x =
    ((lon - (region.longitude - halfLon)) / region.longitudeDelta) * size.w;
  const y =
    ((region.latitude + halfLat - lat) / region.latitudeDelta) * size.h;
  return { x, y };
}

/**
 * Live map of FR24 aircraft. Native MapView on iOS/Android;
 * projected canvas fallback on web (react-native-maps is weak there).
 *
 * Architecture (native):
 *  - Map Markers = plane glyphs only (rotation works, simple snapshot)
 *  - Callsign badges = absolute RN overlay projected from region
 *    (Text/Image work normally — no Marker bitmap clipping)
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
  const [markersEnabled, setMarkersEnabled] = useState(false);
  /** Progressive cap so Android does not snapshot every marker at once. */
  const [markerCap, setMarkerCap] = useState(
    Platform.OS === "android" ? MARKER_RAMP_STEP : MAX_MARKERS,
  );
  /** Live camera region — drives badge overlay projection. */
  const [region, setRegion] = useState<Region | null>(null);
  const [mapSize, setMapSize] = useState({ w: 0, h: 0 });
  /** Hide overlay labels while the camera is moving — avoids snappy lag vs tiles. */
  const [cameraMoving, setCameraMoving] = useState(false);
  const regionRef = useRef<Region | null>(null);
  const regionRafRef = useRef<number | null>(null);
  const moveEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Smooth poll snaps so planes/badges glide instead of teleporting.
  const smoothed = useSmoothedFlights(flights);

  useEffect(() => {
    if (bootRegion && !region) {
      setRegion(bootRegion);
      regionRef.current = bootRegion;
    }
  }, [bootRegion, region]);

  useEffect(() => {
    if (!mapReady) return;
    const task = InteractionManager.runAfterInteractions(() => {
      requestAnimationFrame(() => setMarkersEnabled(true));
    });
    return () => task.cancel();
  }, [mapReady]);

  // Stagger Android marker mounts to avoid a simultaneous bitmap-snapshot spike.
  useEffect(() => {
    if (!markersEnabled || Platform.OS !== "android") return;
    if (markerCap >= MAX_MARKERS) return;
    const t = setTimeout(() => {
      setMarkerCap((n) => Math.min(MAX_MARKERS, n + MARKER_RAMP_STEP));
    }, MARKER_RAMP_MS);
    return () => clearTimeout(t);
  }, [markersEnabled, markerCap]);

  useEffect(() => {
    if (!bootRegion) return;
    onRegionChangeRef.current?.(bootRegion);
  }, [bootRegion]);

  useEffect(() => {
    return () => {
      if (regionRafRef.current != null) {
        cancelAnimationFrame(regionRafRef.current);
      }
      if (moveEndTimerRef.current) clearTimeout(moveEndTimerRef.current);
    };
  }, []);

  const visibleFlights = useMemo(() => {
    if (!markersEnabled) return [];
    const valid = smoothed.filter((f) =>
      isValidMapCoordinate(f.latitude, f.longitude),
    );
    const cap = Math.min(MAX_MARKERS, markerCap);
    if (valid.length <= cap) return valid;
    const selected = selectedId
      ? valid.find((f) => f.fr24Id === selectedId)
      : undefined;
    const rest = valid
      .filter((f) => f.fr24Id !== selectedId)
      .slice(0, cap - (selected ? 1 : 0));
    return selected ? [selected, ...rest] : rest;
  }, [smoothed, markersEnabled, selectedId, markerCap]);

  const onMapLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setMapSize({ w: width, h: height });
  };

  /** Coalesce camera events to one React update per frame. */
  const scheduleRegionPaint = (next: Region) => {
    regionRef.current = next;
    if (regionRafRef.current != null) return;
    regionRafRef.current = requestAnimationFrame(() => {
      regionRafRef.current = null;
      if (regionRef.current) setRegion(regionRef.current);
    });
  };

  if (!bootRegion) {
    return (
      <View style={styles.map}>
        <View style={styles.mapBoot}>
          <Text style={styles.mapBootText}>Finding your location…</Text>
        </View>
      </View>
    );
  }

  const activeRegion = region ?? bootRegion;
  const zoomAllowsCallsigns = callsignsVisibleAtZoom(activeRegion);
  const showBadgeLayer =
    markersEnabled && mapSize.w > 0 && !cameraMoving;

  return (
    <View style={styles.map} onLayout={onMapLayout}>
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
        onRegionChange={(next) => {
          setCameraMoving(true);
          scheduleRegionPaint(next);
          // Fallback if complete doesn't fire (some Android builds).
          if (moveEndTimerRef.current) clearTimeout(moveEndTimerRef.current);
          moveEndTimerRef.current = setTimeout(() => {
            setCameraMoving(false);
          }, 180);
        }}
        onRegionChangeComplete={(next) => {
          if (moveEndTimerRef.current) clearTimeout(moveEndTimerRef.current);
          regionRef.current = next;
          setRegion(next);
          setCameraMoving(false);
          onRegionChangeRef.current?.(next);
        }}
      >
        {selectedId ? <AircraftTrail points={trail} /> : null}
        {visibleFlights.map((flight) => (
          <AircraftMarker
            key={flight.fr24Id}
            flight={flight}
            selected={flight.fr24Id === selectedId}
            onPress={onSelectFlight}
          />
        ))}
      </MapView>

      {/* Callsign badges: normal RN views, not Marker children */}
      {showBadgeLayer ? (
        <View style={styles.badgeOverlay} pointerEvents="box-none">
          {visibleFlights.map((flight) => {
            const selected = flight.fr24Id === selectedId;
            const emergency = isEmergencySquawk(flight.squawk);
            // Zoomed out: only keep selected / emergency labels.
            if (!zoomAllowsCallsigns && !selected && !emergency) {
              return null;
            }
            const { x, y } = projectToScreen(
              flight.latitude,
              flight.longitude,
              activeRegion,
              mapSize,
            );
            // Skip far off-screen (saves work; generous margin for long labels).
            if (
              x < -80 ||
              y < -60 ||
              x > mapSize.w + 80 ||
              y > mapSize.h + 40
            ) {
              return null;
            }
            // Fixed hit box centered on plane; badge is intrinsically sized inside.
            const hitW = 150;
            return (
              <Pressable
                key={`badge-${flight.fr24Id}`}
                onPress={() => onSelectFlight(flight)}
                style={[
                  styles.badgeAnchor,
                  {
                    left: x - hitW / 2,
                    top: y - BADGE_ABOVE_PLANE - 32,
                    width: hitW,
                    zIndex: selected ? 20 : emergency ? 15 : 10,
                  },
                ]}
              >
                <CallsignBadge
                  flight={flight}
                  selected={selected}
                  emergency={emergency}
                />
              </Pressable>
            );
          })}
        </View>
      ) : null}

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
  const smoothed = useSmoothedFlights(flights);

  useEffect(() => {
    if (!bootRegion) return;
    onRegionChangeRef.current?.(bootRegion);
  }, [bootRegion]);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize({ w: width, h: height });
  };

  const project = (lat: number, lon: number) =>
    projectToScreen(lat, lon, region, size);

  const metersToPx = (meters: number) => {
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
                  transform: [{ translateY: -1.5 }, { rotate: `${angle}deg` }],
                },
              ]}
            />
          );
        });
      })}
      {smoothed.map((flight) => {
        const { x, y } = project(flight.latitude, flight.longitude);
        if (x < -40 || y < -40 || x > size.w + 40 || y > size.h + 40) {
          return null;
        }
        const selected = flight.fr24Id === selectedId;
        const emergency = isEmergencySquawk(flight.squawk);
        const tint = emergency
          ? colors.danger
          : selected
            ? colors.accent
            : flight.onGround
              ? colors.textDim
              : colors.success;
        // SVG nose points up; rotation is true heading (no emoji −45° offset).
        const rotate = `${((flight.heading % 360) + 360) % 360}deg`;
        const showLabel =
          callsignsVisibleAtZoom(region) || selected || emergency;
        const half = AIRCRAFT_ICON_SIZE / 2;
        return (
          <Pressable
            key={flight.fr24Id}
            onPress={() => onSelectFlight(flight)}
            style={[styles.webMarkerWrap, { left: x, top: y }]}
          >
            {showLabel ? (
              <View style={styles.webBadgeLift}>
                <CallsignBadge
                  flight={flight}
                  selected={selected}
                  emergency={emergency}
                />
              </View>
            ) : null}
            <View
              style={[
                styles.webPlane,
                {
                  left: -half,
                  top: -half,
                  width: AIRCRAFT_ICON_SIZE,
                  height: AIRCRAFT_ICON_SIZE,
                  transform: [{ rotate }],
                },
              ]}
            >
              <AircraftIcon
                aircraftCode={flight.aircraftCode}
                color={tint}
                size={AIRCRAFT_ICON_SIZE}
              />
            </View>
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
  /** Full-map layer for callsign pills; below Live traffic chrome (zIndex 50). */
  badgeOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 5,
    elevation: 5,
  },
  /** Centered hit box above the plane; badge lays out intrinsically inside. */
  badgeAnchor: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "flex-end",
    height: 34,
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
  webMarkerWrap: {
    position: "absolute",
    width: 0,
    height: 0,
    alignItems: "center",
    overflow: "visible",
    zIndex: 2,
  },
  webBadgeLift: {
    position: "absolute",
    bottom: BADGE_ABOVE_PLANE,
    alignItems: "center",
  },
  webPlane: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
});
