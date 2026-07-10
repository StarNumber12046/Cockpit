import { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Image,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Fr24Flight } from "@cockpit/fr24";
import {
  formatAltitude,
  formatFlightLabel,
  formatRoute,
  formatSpeed,
  isEmergencySquawk,
} from "@cockpit/shared";
import { colors, radius, spacing, typography } from "../constants/theme";
import { airlineLogoCandidates } from "../lib/media";

type Props = {
  flight: Fr24Flight | null;
  visible: boolean;
  onClose: () => void;
  onOpenDetails?: (flight: Fr24Flight) => void;
};

const SWIPE_CLOSE_DISTANCE = 64;
const SWIPE_CLOSE_VELOCITY = 0.55;
const SWIPE_OPEN_DISTANCE = 48;
const SWIPE_OPEN_VELOCITY = 0.45;
/** Approx sheet height used to slide off-screen. */
const SHEET_OFFSCREEN = 360;

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
 * - Swipe up (or tap) → full detail
 * - Swipe down → dismiss
 * - Touches outside the sheet pass through so the map stays controllable
 *   while a plane is tracked (no backdrop dismiss).
 */
export function FlightSheet({
  flight,
  visible,
  onClose,
  onOpenDetails,
}: Props) {
  const insets = useSafeAreaInsets();
  const emergency = flight ? isEmergencySquawk(flight.squawk) : false;

  // 0 = open (rest), 1 = fully off-screen below
  const progress = useRef(new Animated.Value(1)).current;
  const dragY = useRef(new Animated.Value(0)).current;
  const visibleRef = useRef(visible);
  const onCloseRef = useRef(onClose);
  const onOpenDetailsRef = useRef(onOpenDetails);
  const flightRef = useRef(flight);
  visibleRef.current = visible;
  onCloseRef.current = onClose;
  onOpenDetailsRef.current = onOpenDetails;
  flightRef.current = flight;

  // Keep last non-null flight so exit animation still has content.
  const lastFlight = useRef<Fr24Flight | null>(flight);
  if (flight) lastFlight.current = flight;
  const display = flight ?? lastFlight.current;

  useEffect(() => {
    if (visible) {
      dragY.setValue(0);
      Animated.spring(progress, {
        toValue: 0,
        useNativeDriver: true,
        friction: 9,
        tension: 80,
      }).start();
    } else {
      Animated.timing(progress, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }
  }, [visible, progress, dragY]);

  const narrative = useMemo(
    () => (display ? buildFlightNarrative(display) : ""),
    [display],
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_evt, g) =>
          // Vertical pans only — taps still reach the Pressable below.
          Math.abs(g.dy) > 8 && Math.abs(g.dy) > Math.abs(g.dx) * 1.2,
        onPanResponderMove: (_evt, g) => {
          // Free drag down; slight resistance up (preview expand → detail).
          if (g.dy > 0) {
            dragY.setValue(g.dy);
          } else {
            dragY.setValue(g.dy * 0.35);
          }
        },
        onPanResponderRelease: (_evt, g) => {
          const shouldOpen =
            g.dy < -SWIPE_OPEN_DISTANCE || g.vy < -SWIPE_OPEN_VELOCITY;
          const shouldClose =
            g.dy > SWIPE_CLOSE_DISTANCE || g.vy > SWIPE_CLOSE_VELOCITY;

          if (shouldOpen) {
            const current = flightRef.current ?? lastFlight.current;
            Animated.timing(dragY, {
              toValue: -80,
              duration: 160,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }).start(() => {
              dragY.setValue(0);
              if (current) onOpenDetailsRef.current?.(current);
            });
            return;
          }

          if (shouldClose) {
            Animated.parallel([
              Animated.timing(dragY, {
                toValue: SHEET_OFFSCREEN,
                duration: 200,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
              }),
              Animated.timing(progress, {
                toValue: 1,
                duration: 200,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
              }),
            ]).start(() => {
              dragY.setValue(0);
              onCloseRef.current();
            });
            return;
          }

          Animated.spring(dragY, {
            toValue: 0,
            useNativeDriver: true,
            friction: 8,
            tension: 90,
          }).start();
        },
        onPanResponderTerminate: () => {
          Animated.spring(dragY, {
            toValue: 0,
            useNativeDriver: true,
            friction: 8,
          }).start();
        },
      }),
    [dragY, progress],
  );

  // Only mount when open — a full-screen layer left around after dismiss can
  // fight the map on Android even with pointerEvents="none".
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
            paddingBottom: Math.max(insets.bottom, spacing.lg),
            transform: [{ translateY: sheetTranslate }],
          },
        ]}
        {...panResponder.panHandlers}
      >
        <View style={styles.handle} />

        <Pressable
          onPress={() => onOpenDetails?.(display)}
          style={({ pressed }) => [
            styles.body,
            pressed ? styles.pressed : null,
          ]}
        >
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
            Swipe up for full detail · swipe down to close
          </Text>
        </Pressable>
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
  body: {
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
