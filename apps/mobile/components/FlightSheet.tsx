import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Easing,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Svg, { Path } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useRouter } from "expo-router";
import type { Fr24Flight, Fr24FlightDetails } from "@cockpit/fr24";
import {
  formatAltitude,
  formatFlightLabel,
  formatRoute,
  formatSpeed,
  isEmergencySquawk,
  parseFlightStartedAtMs,
} from "@cockpit/shared";
import { colors, radius, spacing, typography } from "../constants/theme";
import { api } from "../lib/convex";
import { AirlineLogo } from "./AirlineLogo";
import { normalizeTrailPoints } from "../lib/altitudeColor";
import { lastMinuteSeries } from "../lib/trailMetrics";
import { isValidMapCoordinate } from "./AircraftMarker";
import { useFr24Detail } from "../hooks/useFr24Detail";
import { FaIcon } from "./FaIcon";
import { FlightDetailBody } from "./FlightDetailBody";
import { MetricSparkline } from "./MetricSparkline";

type Props = {
  flight: Fr24Flight | null;
  visible: boolean;
  onClose: () => void;
  detail?: Fr24FlightDetails | null;
  detailLoading?: boolean;
  detailError?: string | null;
  onRefreshDetail?: () => void;
  /** When a flight is not on the live map, provide its fr24Id to fetch detail independently. */
  offMapFlightId?: string;
  offMapFlightNumber?: string;
  offMapCallsign?: string;
  /** Called when an off-map flight's coordinates become available so the map can fly to it. */
  onOffMapLocationReady?: (lat: number, lng: number) => void;
  /** Called when the off-map detail fetch fails (flight may no longer exist). */
  onOffMapDetailError?: (fr24Id: string) => void;
};

const SWIPE_CLOSE_DISTANCE = 64;
const SWIPE_CLOSE_VELOCITY = 0.55;
const SWIPE_OPEN_DISTANCE = 48;
const SWIPE_OPEN_VELOCITY = 0.45;
const SWIPE_COLLAPSE_DISTANCE = 40;
const SWIPE_COLLAPSE_VELOCITY = 0.4;
/** Approx sheet height used to slide off-screen. */
const SHEET_OFFSCREEN = 360;
/** Expanded sheet top sits this many px below the screen top (map stays visible above). */
const EXPANDED_TOP_OFFSET = 320;
const DEFAULT_PEEK_HEIGHT = 260;

/** Build a short FlightDeck-style status line from live ADS-B fields. */
export function buildFlightNarrative(flight: Fr24Flight): string {
  const label = formatFlightLabel(flight);
  const route = formatRoute(
    flight.originAirportIata,
    flight.destinationAirportIata,
  );
  const alt = formatAltitude(flight.altitude);
  const spd = formatSpeed(flight.groundSpeed);
  const vs = flight.verticalSpeed;

  if (flight.onGround) {
    return `${label} is on the ground (${route}). Ground speed ${spd}.`;
  }

  let phase: string;
  if (vs > 400) phase = `Climbing through ${alt}`;
  else if (vs < -400) phase = `Descending through ${alt}`;
  else phase = `Level at ${alt}`;

  const dest = flight.destinationAirportIata?.trim().toUpperCase();
  const destClause = dest ? ` toward ${dest}` : "";
  const typeClause = flight.aircraftCode
    ? ` ${flight.aircraftCode}`
    : " aircraft";

  return `${phase} ${destClause}${
    flight.squawk ? `, squawking ${flight.squawk}` : ""
  }.`.replace(/\s+/g, " ");
}

/**
 * FlightDeck-style bottom sheet overlaid on the map (not a full-screen Modal).
 * - Swipe up → expand in-place (live detail + ACARS below the peek)
 * - Swipe down → collapse, or dismiss when peek / strong fling
 * - Touches outside the sheet pass through so the map stays controllable
 *   while a plane is tracked (no backdrop dismiss).
 */
export function FlightSheet({
  flight,
  visible,
  onClose,
  detail = null,
  detailLoading = false,
  detailError = null,
  onRefreshDetail,
  offMapFlightId,
  offMapFlightNumber,
  offMapCallsign,
  onOffMapLocationReady,
  onOffMapDetailError,
}: Props) {
  const insets = useSafeAreaInsets();
  const { isAuthenticated } = useConvexAuth();
  const router = useRouter();

  // When no live flight object but we have a fr24Id, fetch detail independently.
  const offMap = useFr24Detail(!flight && offMapFlightId ? offMapFlightId : null);
  const resolvedDetail = flight ? detail : offMap.detail;
  const resolvedLoading = flight ? detailLoading : offMap.loading;
  const resolvedError = flight ? detailError : offMap.error;
  const resolvedRefresh = flight ? onRefreshDetail : offMap.refresh;

  const lastReportedErrorRef = useRef<string | null>(null);
  useEffect(() => {
    lastReportedErrorRef.current = null;
  }, [offMapFlightId]);
  useEffect(() => {
    if (!offMapFlightId || flight || !offMap.error) return;
    if (lastReportedErrorRef.current === offMapFlightId) return;
    lastReportedErrorRef.current = offMapFlightId;
    onOffMapDetailError?.(offMapFlightId);
  }, [offMapFlightId, flight, offMap.error, onOffMapDetailError]);
  const screenHeight = Dimensions.get("window").height;
  const expandedHeight = screenHeight - EXPANDED_TOP_OFFSET;
  const emergency = flight ? isEmergencySquawk(flight.squawk) : false;

  // 0 = open (rest), 1 = fully off-screen below
  const progress = useRef(new Animated.Value(1)).current;
  // 0 = peek, 1 = expanded near top
  const expand = useRef(new Animated.Value(0)).current;
  const dragY = useRef(new Animated.Value(0)).current;
  const expandRef = useRef(0);
  const scrollYRef = useRef(0);
  const scrollRef = useRef<ScrollView>(null);

  const visibleRef = useRef(visible);
  const onCloseRef = useRef(onClose);
  const flightRef = useRef(flight);
  const peekHeightRef = useRef(DEFAULT_PEEK_HEIGHT);
  const expandedHeightRef = useRef(expandedHeight);

  visibleRef.current = visible;
  onCloseRef.current = onClose;
  flightRef.current = flight;
  expandedHeightRef.current = expandedHeight;

  const [peekHeight, setPeekHeight] = useState(DEFAULT_PEEK_HEIGHT);
  const [expanded, setExpanded] = useState(false);
  const [openGeneration, setOpenGeneration] = useState(0);

  // Keep last non-null flight so exit animation still has content.
  const lastFlight = useRef<Fr24Flight | null>(flight);
  if (flight) lastFlight.current = flight;

  // For off-map flights, build a skeleton Fr24Flight from detail data.
  const offMapSkeleton = useMemo((): Fr24Flight | null => {
    if (flight || !offMapFlightId || !resolvedDetail) return null;
    const d = resolvedDetail;
    const trailPoints = normalizeTrailPoints(
      d.trail as unknown[] | undefined,
    );
    const current = trailPoints?.length
      ? trailPoints[trailPoints.length - 1]
      : null;
    const origin =
      d.airport?.origin?.code?.iata ?? d.airport?.origin?.code?.icao ?? "";
    const dest =
      d.airport?.destination?.code?.iata ??
      d.airport?.destination?.code?.icao ??
      "";
    return {
      fr24Id: offMapFlightId,
      callsign: offMapCallsign || d.identification?.callsign || "",
      flightNumber:
        offMapFlightNumber || d.identification?.number?.default || "",
      icao24: d.aircraft?.hex || "",
      airlineIcao: d.airline?.code?.icao || "",
      registration: d.aircraft?.registration || "",
      aircraftCode: d.aircraft?.model?.code || "",
      originAirportIata: origin,
      destinationAirportIata: dest,
      altitude: current?.alt ?? 0,
      groundSpeed: 0,
      verticalSpeed: 0,
      heading: 0,
      time: current?.ts ?? 0,
      onGround: false,
      squawk: "",
      latitude: current?.lat ?? 0,
      longitude: current?.lng ?? 0,
    };
  }, [flight, offMapFlightId, offMapCallsign, offMapFlightNumber, resolvedDetail]);

  const display = flight ?? offMapSkeleton ?? lastFlight.current;

  // Fly the map to the off-map flight's location when coordinates become available.
  useEffect(() => {
    if (!flight && offMapSkeleton && onOffMapLocationReady) {
      const { latitude, longitude } = offMapSkeleton;
      if (isValidMapCoordinate(latitude, longitude)) {
        onOffMapLocationReady(latitude, longitude);
      }
    }
  }, [flight, offMapSkeleton, onOffMapLocationReady]);

  const syncExpandedState = (raw: number) => {
    const value = Math.max(0, Math.min(1, raw));
    expandRef.current = value;
    const nextExpanded = value > 0.5;
    setExpanded((prev) => (prev === nextExpanded ? prev : nextExpanded));
  };

  const applyExpandProgress = (raw: number) => {
    const value = Math.max(0, Math.min(1, raw));
    syncExpandedState(value);
    expand.setValue(value);
  };

  useEffect(() => {
    const id = expand.addListener(({ value }) => {
      syncExpandedState(value);
    });
    return () => expand.removeListener(id);
  }, [expand]);

  useEffect(() => {
    if (visible) {
      setOpenGeneration((g) => g + 1);
      dragY.setValue(0);
      applyExpandProgress(0);
      scrollYRef.current = 0;
      Animated.spring(progress, {
        toValue: 0,
        useNativeDriver: false,
        friction: 9,
        tension: 80,
      }).start(() => {
        scrollRef.current?.scrollTo({ y: 0, animated: false });
      });
    } else {
      expand.stopAnimation();
      applyExpandProgress(0);
      scrollYRef.current = 0;
      dragY.setValue(0);
      Animated.timing(progress, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
    }
  }, [visible, progress, dragY, expand]);

  const narrative = useMemo(
    () => (display ? buildFlightNarrative(display) : ""),
    [display],
  );

  const tracked = useQuery(api.tracked.list);
  const addTracked = useMutation(api.tracked.add);
  const removeTracked = useMutation(api.tracked.remove);

  const snapExpand = (toValue: 0 | 1) => {
    expandRef.current = toValue;
    setExpanded(toValue === 1);
    Animated.spring(expand, {
      toValue,
      useNativeDriver: false,
      friction: 9,
      tension: 80,
    }).start();
    Animated.spring(dragY, {
      toValue: 0,
      useNativeDriver: false,
      friction: 8,
      tension: 90,
    }).start();
    if (toValue === 0) {
      scrollYRef.current = 0;
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    }
  };

  const dismissSheet = () => {
    Animated.parallel([
      Animated.timing(dragY, {
        toValue: SHEET_OFFSCREEN,
        duration: 200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
      Animated.timing(progress, {
        toValue: 1,
        duration: 200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
      Animated.timing(expand, {
        toValue: 0,
        duration: 180,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
    ]).start(() => {
      dragY.setValue(0);
      applyExpandProgress(0);
      onCloseRef.current();
    });
  };

  const label = display ? formatFlightLabel(display) : "";
  const origin = display?.originAirportIata?.trim().toUpperCase() || "???";
  const destination =
    display?.destinationAirportIata?.trim().toUpperCase() || "???";
  const trackedEntry = useMemo(() => {
    if (!tracked || !display) return null;
    const flightNumber = (display.flightNumber || label)
      .replace(/\s+/g, "")
      .toUpperCase();
    return (
      tracked.find((row) => {
        if (display.fr24Id && row.fr24Id) {
          return row.fr24Id === display.fr24Id;
        }
        return row.flightNumber === flightNumber;
      }) ?? null
    );
  }, [tracked, display, label]);

  const isTracked = trackedEntry != null;

  const onToggleTrack = useCallback(() => {
    if (!display) return;
    if (!isAuthenticated) {
      router.push("/sign-in");
      return;
    }
    if (trackedEntry) {
      void removeTracked({ id: trackedEntry._id });
      return;
    }
    void addTracked({
      fr24Id: display.fr24Id,
      icao24: display.icao24 || undefined,
      flightNumber: display.flightNumber || label,
      callsign: display.callsign,
      label,
      flightStartedAt: resolvedDetail ? parseFlightStartedAtMs(resolvedDetail) : undefined,
    });
  }, [addTracked, isAuthenticated, resolvedDetail, display, label, removeTracked, router, trackedEntry]);

  const speedSeries = useMemo(
    () =>
      display
        ? lastMinuteSeries(
            resolvedDetail?.trail,
            {
              alt: display.altitude,
              spd: display.groundSpeed,
              ts: display.time,
            },
            "spd",
          )
        : [0, 0],
    [resolvedDetail?.trail, display],
  );

  const altitudeSeries = useMemo(
    () =>
      display
        ? lastMinuteSeries(
            resolvedDetail?.trail,
            {
              alt: display.altitude,
              spd: display.groundSpeed,
              ts: display.time,
            },
            "alt",
          )
        : [0, 0],
    [resolvedDetail?.trail, display],
  );

  const speedValue =
    display?.groundSpeed != null && Number.isFinite(display.groundSpeed)
      ? String(Math.round(display.groundSpeed))
      : "—";
  const altitudeValue =
    display?.altitude != null && Number.isFinite(display.altitude)
      ? String(Math.round(display.altitude).toLocaleString())
      : "—";

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_evt, g) =>
          Math.abs(g.dy) > 8 && Math.abs(g.dy) > Math.abs(g.dx) * 1.2,
        onPanResponderMove: (_evt, g) => {
          const isExpanded = expandRef.current > 0.5;
          const peek = peekHeightRef.current;
          const full = expandedHeightRef.current;
          const lift = full - peek;

          if (g.dy > 0) {
            if (isExpanded) {
              // Dragging down from expanded: resist then allow collapse motion.
              const collapseDy = Math.min(g.dy, lift);
              applyExpandProgress(Math.max(0, 1 - collapseDy / lift));
              dragY.setValue(0);
            } else {
              dragY.setValue(g.dy);
            }
          } else {
            if (isExpanded) {
              dragY.setValue(g.dy * 0.2);
            } else {
              const expandDy = Math.min(-g.dy, lift);
              applyExpandProgress(Math.min(1, expandDy / lift));
              dragY.setValue(0);
            }
          }
        },
        onPanResponderRelease: (_evt, g) => {
          const isExpanded = expandRef.current > 0.5;
          const shouldOpen =
            g.dy < -SWIPE_OPEN_DISTANCE || g.vy < -SWIPE_OPEN_VELOCITY;
          const shouldClose =
            g.dy > SWIPE_CLOSE_DISTANCE || g.vy > SWIPE_CLOSE_VELOCITY;
          const shouldCollapse =
            g.dy > SWIPE_COLLAPSE_DISTANCE || g.vy > SWIPE_COLLAPSE_VELOCITY;

          if (!isExpanded && shouldOpen) {
            snapExpand(1);
            return;
          }

          if (isExpanded && shouldClose && scrollYRef.current <= 4) {
            dismissSheet();
            return;
          }

          if (isExpanded && shouldCollapse && scrollYRef.current <= 4) {
            snapExpand(0);
            return;
          }

          if (!isExpanded && shouldClose) {
            dismissSheet();
            return;
          }

          // Snap to nearest expand state based on current progress.
          if (expandRef.current >= 0.45) {
            snapExpand(1);
          } else {
            snapExpand(0);
          }
        },
        onPanResponderTerminate: () => {
          if (expandRef.current >= 0.45) {
            snapExpand(1);
          } else {
            snapExpand(0);
          }
        },
      }),
    [dragY, expand, progress],
  );

  if (!visible || (!display && !offMapFlightId)) return null;

  // Bottom-anchored sheet: grow height to expand upward. Do NOT also translateY —
  // that double-counts lift and shoots the sheet off the top of the screen.
  const sheetHeight = expand.interpolate({
    inputRange: [0, 1],
    outputRange: [peekHeight, expandedHeight],
  });

  const sheetTranslate = Animated.add(
    progress.interpolate({
      inputRange: [0, 1],
      outputRange: [0, SHEET_OFFSCREEN],
    }),
    dragY,
  );

  return (
    <View style={styles.root} pointerEvents="box-none">
      <Animated.View
        style={[
          styles.sheet,
          emergency ? styles.sheetHot : null,
          {
            height: sheetHeight,
            paddingBottom: Math.max(insets.bottom, spacing.lg),
            transform: [{ translateY: sheetTranslate }],
          },
        ]}
      >
        <View
          {...panResponder.panHandlers}
          onLayout={(e) => {
            const peekContent = Math.ceil(e.nativeEvent.layout.height);
            const bottomPad = Math.max(insets.bottom, spacing.lg);
            const h = peekContent + bottomPad;
            if (Math.abs(h - peekHeightRef.current) > 2) {
              peekHeightRef.current = h;
              setPeekHeight(h);
            }
          }}
        >
          <View style={styles.handle} />

          {!display ? (
            <View style={styles.peekBlock}>
              <Text style={styles.loadingText}>Loading flight…</Text>
            </View>
          ) : (
          <View style={styles.peekBlock}>
            <View style={styles.topRow}>
              <View style={styles.identity}>
                <AirlineLogo
                  flight={display}
                  detail={resolvedDetail}
                  size={44}
                  borderRadius={radius.md}
                  chipBackground="#F4F7FC"
                  chipStyle={styles.badgeChip}
                  emergency={emergency}
                  emergencyStyle={styles.badgeHot}
                  remountKey={openGeneration}
                />
                <View style={styles.idText}>
                  <View style={styles.titleRow}>
                    <Text style={styles.callsign} numberOfLines={1}>
                      {label}
                    </Text>
                    {display.aircraftCode ? (
                      <Text style={styles.acType} numberOfLines={1}>
                        {display.aircraftCode}
                      </Text>
                    ) : null}
                  </View>
                </View>
              </View>

              <Pressable
                onPress={onToggleTrack}
                hitSlop={10}
                style={({ pressed }) => [
                  styles.trackBtn,
                  pressed ? styles.pressed : null,
                ]}
                accessibilityRole="button"
                accessibilityLabel={
                  isTracked ? "Untrack flight" : "Track flight"
                }
              >
                <FaIcon
                  name={!isAuthenticated ? "lock" : isTracked ? "bell-slash" : "bell"}
                  size={22}
                  color={isTracked ? colors.highlight : colors.textMuted}
                />
              </Pressable>
            </View>

            <Pressable
              onPress={() => snapExpand(1)}
              style={({ pressed }) => [
                styles.body,
                pressed ? styles.pressed : null,
              ]}
            >
              <View style={styles.routeRow}>
                <View style={styles.routeCodes}>
                  <Text style={styles.airportCode}>{origin}</Text>
                  <RouteArrow />
                  <Text style={styles.airportCode}>{destination}</Text>
                  {emergency && display.squawk ? (
                    <Text style={styles.squawkHot}>SQ {display.squawk}</Text>
                  ) : null}
                </View>

                <View style={styles.liveMetrics}>
                  <View style={styles.metricGroup}>
                    <MetricSparkline
                      data={speedSeries}
                      gradientId="speed-spark"
                    />
                    <View style={styles.metricText}>
                      <Text style={styles.metricValue}>{speedValue}</Text>
                      <Text style={styles.metricUnit}>kt</Text>
                    </View>
                  </View>
                  <View style={styles.metricGroup}>
                    <MetricSparkline
                      data={altitudeSeries}
                      gradientId="alt-spark"
                    />
                    <View style={styles.metricText}>
                      <Text style={styles.metricValue}>{altitudeValue}</Text>
                      <Text style={styles.metricUnit}>ft</Text>
                    </View>
                  </View>
                </View>
              </View>

              <View style={styles.narrativeBlock}>
                <Text style={styles.nowLabel}>Now</Text>
                <Text style={styles.narrative}>{narrative}</Text>
              </View>
            </Pressable>
          </View>
          )}
        </View>

        {display ? (
        <ScrollView
          key={`${display.fr24Id}-${openGeneration}`}
          ref={scrollRef}
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={expanded}
          scrollEnabled={expanded}
          bounces={expanded}
          nestedScrollEnabled
          onScroll={(e) => {
            scrollYRef.current = e.nativeEvent.contentOffset.y;
          }}
          scrollEventThrottle={16}
          keyboardShouldPersistTaps="handled"
        >
          <FlightDetailBody
            flight={display}
            detail={resolvedDetail}
            detailLoading={resolvedLoading}
            detailError={resolvedError ?? null}
            onRefreshDetail={resolvedRefresh}
          />
        </ScrollView>
        ) : null}
      </Animated.View>
    </View>
  );
}

function RouteArrow() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24">
      <Path
        d="M5 12h12M13 7l5 5-5 5"
        stroke={colors.textDim}
        strokeWidth={2}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
    zIndex: 20,
  },
  sheet: {
    backgroundColor: colors.bgElevated,
    borderTopLeftRadius: radius.lg + 4,
    borderTopRightRadius: radius.lg + 4,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    shadowColor: "#000",
    shadowOpacity: 0.45,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: -6 },
    elevation: 16,
    overflow: "hidden",
  },
  sheetHot: {
    borderColor: colors.danger,
  },
  handle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: spacing.md,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: spacing.xl,
  },
  body: {
    gap: spacing.md,
  },
  peekBlock: {
    gap: spacing.md,
  },
  pressed: {
    opacity: 0.92,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  identity: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minWidth: 0,
  },
  trackBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
  },
  badgeChip: {
    borderWidth: 1,
    borderColor: colors.border,
    padding: 5,
  },
  badgeHot: {
    borderWidth: 2,
    borderColor: colors.danger,
  },
  idText: {
    flex: 1,
    justifyContent: "center",
    minWidth: 0,
    height: 44,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
    minWidth: 0,
    height: 44,
  },
  callsign: {
    ...typography.subtitle,
    fontSize: 40,
    fontWeight: 800,
    lineHeight: 40,
    flexShrink: 1,
  },
  acType: {
    ...typography.caption,
    color: colors.textDim,
    fontWeight: "600",
    fontSize: 24,
    lineHeight: 24,
    flexShrink: 0,
    paddingBottom: 2,
  },
  routeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  routeCodes: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs + 2,
    flexShrink: 1,
    minWidth: 0,
  },
  airportCode: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.highlight,
    letterSpacing: 0.3,
  },
  squawkHot: {
    ...typography.caption,
    color: colors.danger,
    fontWeight: "800",
    marginLeft: spacing.xs,
  },
  liveMetrics: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    flexShrink: 0,
  },
  metricGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  metricText: {
    alignItems: "flex-start",
  },
  metricValue: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.highlight,
    fontVariant: ["tabular-nums"],
    lineHeight: 20,
  },
  metricUnit: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textDim,
    lineHeight: 14,
  },
  narrativeBlock: {
    gap: 4,
    paddingTop: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  nowLabel: {
    ...typography.caption,
    color: colors.textDim,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  narrative: {
    ...typography.body,
    color: colors.textMuted,
    lineHeight: 20,
  },
  hint: {
    ...typography.caption,
    color: colors.textDim,
    textAlign: "center",
    marginTop: spacing.xs,
  },
  loadingText: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: "center",
    paddingVertical: spacing.lg,
  },
});
