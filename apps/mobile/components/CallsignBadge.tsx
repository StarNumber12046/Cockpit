import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { Fr24Flight, Fr24FlightDetails } from "@cockpit/fr24";
import { formatFlightLabel } from "@cockpit/shared";
import { colors } from "../constants/theme";
import { AirlineLogo } from "./AirlineLogo";

type Props = {
  flight: Fr24Flight;
  /** FR24 clickhandler detail — pass full payload when available. */
  detail?: Pick<Fr24FlightDetails, "airline"> | Fr24FlightDetails | null;
  selected?: boolean;
  emergency?: boolean;
};

/**
 * Callsign pill rendered as a normal RN view (not inside a map Marker).
 * Safe for Text + remote Image — Android Marker snapshots are not used.
 */
export function CallsignBadge({ flight, detail, selected, emergency }: Props) {
  const label = useMemo(() => formatFlightLabel(flight), [flight]);

  return (
    <View
      style={[
        styles.badge,
        selected ? styles.badgeSelected : null,
        emergency ? styles.badgeHot : null,
      ]}
    >
      <AirlineLogo
        flight={flight}
        detail={detail}
        size={20}
        borderRadius={6}
        style={styles.logoMargin}
      />
      <Text style={styles.callsign} allowFontScaling={false} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** Vertical gap from plane center up to badge bottom. */
export const BADGE_ABOVE_PLANE = 14;

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    maxWidth: 160,
    paddingVertical: 5,
    paddingHorizontal: 7,
    borderRadius: 8,
    backgroundColor: "#0B1220",
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  badgeSelected: {
    borderColor: colors.accent,
    backgroundColor: "#121A2B",
  },
  badgeHot: {
    borderColor: colors.danger,
    backgroundColor: "#2A1218",
  },
  logoMargin: {
    marginRight: 6,
  },
  callsign: {
    color: "#E8EEF9",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
    letterSpacing: 0.3,
    flexShrink: 1,
  },
});