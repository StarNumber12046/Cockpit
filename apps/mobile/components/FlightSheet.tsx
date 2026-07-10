import { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Easing,
  Image,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Fr24Flight, Fr24FlightDetails } from "@cockpit/fr24";
import {
  formatAltitude,
  formatFlightLabel,
  formatRoute,
  formatSpeed,
  isEmergencySquawk,
} from "@cockpit/shared";
import { colors, radius, spacing, typography } from "../constants/theme";
import { airlineLogoCandidates } from "../lib/media";
import { FlightDetailBody } from "./FlightDetailBody";

type Props = {
  flight: Fr24Flight | null;
  visible: boolean;
  onClose: () => void;
  detail?: Fr24FlightDetails | null;
  detailLoading?: boolean;
  detailError?: string | null;
  onRefreshDetail?: () => void;
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
}: Props) {
  const insets = useSafeAreaInsets();
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

  // Keep last non-null flight so exit animation still has content.
  const lastFlight = useRef<Fr24Flight | null>(flight);
  if (flight) lastFlight.current = flight;
  const display = flight ?? lastFlight.current;

  useEffect(() => {
    const id = expand.addListener(({ value }) => {
      expandRef.current = value;
      setExpanded(value > 0.5);
    });
    return () => expand.removeListener(id);
  }, [expand]);

  useEffect(() => {
    if (visible) {
      dragY.setValue(0);
      expand.setValue(0);
      expandRef.current = 0;
      setExpanded(false);
      scrollYRef.current = 0;
      scrollRef.current?.scrollTo({ y: 0, animated: false });
      Animated.spring(progress, {
        toValue: 0,
        useNativeDriver: false,
        friction: 9,
        tension: 80,
      }).start();
    } else {
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

  const snapExpand = (toValue: 0 | 1) => {
    expandRef.current = toValue;
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
      expand.setValue(0);
      expandRef.current = 0;
      setExpanded(false);
      onCloseRef.current();
    });
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_evt, g) => {
          if (Math.abs(g.dy) <= 8 || Math.abs(g.dy) <= Math.abs(g.dx) * 1.2) {
            return false;
          }
          // When expanded and scrolled, let ScrollView handle downward pans.
          if (
            expandRef.current > 0.5 &&
            g.dy > 0 &&
            scrollYRef.current > 4
          ) {
            return false;
          }
          return true;
        },
        onPanResponderMove: (_evt, g) => {
          const isExpanded = expandRef.current > 0.5;
          const peek = peekHeightRef.current;
          const full = expandedHeightRef.current;
          const lift = full - peek;

          if (g.dy > 0) {
            if (isExpanded) {
              // Dragging down from expanded: resist then allow collapse motion.
              const collapseDy = Math.min(g.dy, lift);
              expand.setValue(Math.max(0, 1 - collapseDy / lift));
              dragY.setValue(0);
            } else {
              dragY.setValue(g.dy);
            }
          } else {
            if (isExpanded) {
              dragY.setValue(g.dy * 0.2);
            } else {
              const expandDy = Math.min(-g.dy, lift);
              expand.setValue(Math.min(1, expandDy / lift));
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

  if (!visible || !display) return null;

  const label = formatFlightLabel(display);
  const route = formatRoute(
    display.originAirportIata,
    display.destinationAirportIata,
  );
  const airlineHint =
    display.airlineIcao?.trim().toUpperCase() ||
    label.slice(0, 3).toUpperCase();
  const logoUris = airlineLogoCandidates({
    airlineIcao: display.airlineIcao,
    flightNumber: display.flightNumber,
    callsign: display.callsign,
  });

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
        {...panResponder.panHandlers}
      >
        <View
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

          <Pressable
            onPress={() => snapExpand(1)}
            style={({ pressed }) => [
              styles.body,
              pressed ? styles.pressed : null,
            ]}
          >
            <View style={styles.peekBlock}>
              <View style={styles.topRow}>
                <View style={styles.identity}>
                  <AirlineBadge
                    logoUris={logoUris}
                    fallback={airlineHint.slice(0, 3)}
                    emergency={emergency}
                  />
                  <View style={styles.idText}>
                    <View style={styles.titleRow}>
                      <Text style={styles.callsign} numberOfLines={1}>
                        {label}
                      </Text>
                      {display.aircraftCode ? (
                        <Text style={styles.acType}>{display.aircraftCode}</Text>
                      ) : null}
                    </View>
                    <Text style={styles.route} numberOfLines={1}>
                      {route}
                    </Text>
                  </View>
                </View>

                <View style={styles.metrics}>
                  {emergency && display.squawk ? (
                    <Text style={styles.squawkHot}>SQ {display.squawk}</Text>
                  ) : (
                    <Text style={styles.phase} numberOfLines={1}>
                      {display.onGround
                        ? "On ground"
                        : display.verticalSpeed < -400
                          ? "Descending"
                          : display.verticalSpeed > 400
                            ? "Climbing"
                            : "En route"}
                    </Text>
                  )}
                  <View style={styles.metricRow}>
                    <Text style={styles.metric}>
                      {formatSpeed(display.groundSpeed)}
                    </Text>
                    <Text style={styles.metricDot}>·</Text>
                    <Text style={styles.metricAccent}>
                      {formatAltitude(display.altitude)}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.narrativeBlock}>
                <Text style={styles.nowLabel}>Now</Text>
                <Text style={styles.narrative}>{narrative}</Text>
              </View>

              <Text style={styles.hint}>
                Swipe up for live detail & ACARS · swipe down to close
              </Text>
            </View>
          </Pressable>
        </View>

        <ScrollView
          ref={scrollRef}
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={expanded}
          scrollEnabled={expanded}
          bounces={expanded}
          onScroll={(e) => {
            scrollYRef.current = e.nativeEvent.contentOffset.y;
          }}
          scrollEventThrottle={16}
          keyboardShouldPersistTaps="handled"
        >
          <FlightDetailBody
            flight={display}
            detail={detail}
            detailLoading={detailLoading}
            detailError={detailError ?? null}
            onRefreshDetail={onRefreshDetail}
          />
        </ScrollView>
      </Animated.View>
    </View>
  );
}

/**
 * Airline logo badge. Tries multiple CDN URLs (gstatic → kiwi → avs → FR24)
 * because FR24 operator assets 403 Android's default okhttp User-Agent.
 */
function AirlineBadge({
  logoUris,
  fallback,
  emergency,
}: {
  logoUris: string[];
  fallback: string;
  emergency: boolean;
}) {
  const [uriIndex, setUriIndex] = useState(0);
  const key = logoUris.join("|");

  useEffect(() => {
    setUriIndex(0);
  }, [key]);

  const logoUri = logoUris[uriIndex] ?? null;
  const showLogo = Boolean(logoUri);

  return (
    <View style={[styles.badge, emergency ? styles.badgeHot : null]}>
      {showLogo ? (
        <Image
          source={{ uri: logoUri! }}
          style={styles.badgeLogo}
          resizeMode="contain"
          onError={() => {
            setUriIndex((i) => {
              // Exhaust candidates → show text fallback.
              if (i + 1 < logoUris.length) return i + 1;
              return logoUris.length; // past end → showLogo false
            });
          }}
          accessibilityLabel={`${fallback} airline logo`}
        />
      ) : (
        <Text style={styles.badgeText}>{fallback}</Text>
      )}
    </View>
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
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  identity: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minWidth: 0,
  },
  badge: {
    width: 44,
    height: 44,
    borderRadius: radius.md + 2,
    // Light plate so multi-color airline logos stay legible on dark UI.
    backgroundColor: "#F4F7FC",
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    padding: 5,
  },
  badgeHot: {
    borderColor: colors.danger,
    borderWidth: 2,
  },
  badgeLogo: {
    width: "100%",
    height: "100%",
  },
  badgeText: {
    color: colors.bg,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  idText: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: spacing.sm,
  },
  callsign: {
    ...typography.subtitle,
    fontSize: 18,
    fontWeight: "700",
  },
  acType: {
    ...typography.caption,
    color: colors.textDim,
    fontWeight: "600",
  },
  route: {
    ...typography.body,
    color: colors.accent,
    fontWeight: "600",
  },
  metrics: {
    alignItems: "flex-end",
    gap: 4,
  },
  phase: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: "600",
  },
  squawkHot: {
    ...typography.caption,
    color: colors.danger,
    fontWeight: "800",
  },
  metricRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  metric: {
    ...typography.mono,
    color: colors.textMuted,
  },
  metricDot: {
    color: colors.textDim,
  },
  metricAccent: {
    ...typography.mono,
    color: colors.accent,
    fontWeight: "700",
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
});