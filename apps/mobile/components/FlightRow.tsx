import { Pressable, StyleSheet, Text, View, type ViewStyle, type TextStyle } from "react-native";
import type { Fr24Flight } from "@cockpit/fr24";
import {
  formatAltitude,
  formatFlightLabel,
  formatRoute,
  formatSpeed,
  isEmergencySquawk,
} from "@cockpit/shared";
import { colors, radius, spacing, typography } from "../constants/theme";

type Props = {
  flight: Fr24Flight;
  onPress?: () => void;
};

export function FlightRow({ flight, onPress }: Props) {
  const emergency = isEmergencySquawk(flight.squawk);
  const label = formatFlightLabel(flight);
  const route = formatRoute(flight.originAirportIata, flight.destinationAirportIata);

  const rowStyle: ViewStyle[] = [styles.row];
  if (emergency) rowStyle.push(styles.emergency);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [...rowStyle, pressed ? styles.pressed : null]}
    >
      <View style={styles.left}>
        <Text style={styles.callsign} numberOfLines={1}>
          {label}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {route}
          {flight.aircraftCode ? ` · ${flight.aircraftCode}` : ""}
          {flight.registration ? ` · ${flight.registration}` : ""}
        </Text>
      </View>
      <View style={styles.right}>
        <Text style={styles.alt}>{formatAltitude(flight.altitude)}</Text>
        <Text style={styles.spd}>{formatSpeed(flight.groundSpeed)}</Text>
        {flight.squawk ? (
          <Text style={[styles.squawk, emergency ? styles.squawkHot : null]}>
            {flight.squawk}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    gap: spacing.md,
  } satisfies ViewStyle,
  pressed: {
    opacity: 0.85,
  } satisfies ViewStyle,
  emergency: {
    borderColor: colors.danger,
    backgroundColor: colors.dangerSoft,
  } satisfies ViewStyle,
  left: {
    flex: 1,
    gap: 4,
  } satisfies ViewStyle,
  right: {
    alignItems: "flex-end",
    gap: 2,
    minWidth: 72,
  } satisfies ViewStyle,
  callsign: {
    fontSize: typography.subtitle.fontSize,
    fontWeight: typography.subtitle.fontWeight,
    color: colors.text,
  } satisfies TextStyle,
  meta: {
    fontSize: typography.caption.fontSize,
    fontWeight: typography.caption.fontWeight,
    color: colors.textMuted,
  } satisfies TextStyle,
  alt: {
    fontSize: typography.mono.fontSize,
    fontWeight: typography.mono.fontWeight,
    color: colors.accent,
    fontVariant: typography.mono.fontVariant,
  } satisfies TextStyle,
  spd: {
    fontSize: typography.caption.fontSize,
    fontWeight: typography.caption.fontWeight,
    color: colors.textMuted,
  } satisfies TextStyle,
  squawk: {
    fontSize: typography.caption.fontSize,
    fontWeight: typography.caption.fontWeight,
    color: colors.textDim,
  } satisfies TextStyle,
  squawkHot: {
    color: colors.danger,
    fontWeight: "700",
  } satisfies TextStyle,
});
