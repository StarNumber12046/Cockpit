import { useEffect, useMemo, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import type { Fr24Flight } from "@cockpit/fr24";
import { formatFlightLabel } from "@cockpit/shared";
import { colors } from "../constants/theme";
import {
  airlineLogoCandidates,
  resolveAirlineIata,
  resolveAirlineIcao,
} from "../lib/media";

type Props = {
  flight: Fr24Flight;
  selected?: boolean;
  emergency?: boolean;
};

/**
 * Callsign pill rendered as a normal RN view (not inside a map Marker).
 * Safe for Text + remote Image — Android Marker snapshots are not used.
 */
export function CallsignBadge({ flight, selected, emergency }: Props) {
  const label = formatFlightLabel(flight);
  const chip = airlineChip(flight);

  const logoUris = useMemo(
    () =>
      airlineLogoCandidates({
        airlineIcao: flight.airlineIcao,
        flightNumber: flight.flightNumber,
        callsign: flight.callsign,
      }),
    [flight.airlineIcao, flight.flightNumber, flight.callsign],
  );

  const [logoIndex, setLogoIndex] = useState(0);
  const logoKey = logoUris.join("|");
  useEffect(() => {
    setLogoIndex(0);
  }, [logoKey]);

  const logoUri = logoUris[logoIndex] ?? null;

  return (
    <View
      style={[
        styles.badge,
        selected ? styles.badgeSelected : null,
        emergency ? styles.badgeHot : null,
      ]}
    >
      <View style={styles.logoPlate}>
        {logoUri ? (
          <Image
            source={{ uri: logoUri }}
            style={styles.logo}
            resizeMode="contain"
            onError={() => {
              setLogoIndex((i) =>
                i + 1 < logoUris.length ? i + 1 : logoUris.length,
              );
            }}
          />
        ) : (
          <Text style={styles.chipText} allowFontScaling={false}>
            {chip}
          </Text>
        )}
      </View>
      <Text style={styles.callsign} allowFontScaling={false} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function airlineChip(flight: Fr24Flight): string {
  const iata = resolveAirlineIata({
    airlineIcao: flight.airlineIcao,
    flightNumber: flight.flightNumber,
    callsign: flight.callsign,
  });
  if (iata) return iata;
  const icao = resolveAirlineIcao({
    airlineIcao: flight.airlineIcao,
    callsign: flight.callsign,
  });
  if (icao) return icao.slice(0, 3);
  return formatFlightLabel(flight).slice(0, 2) || "??";
}

/** Vertical gap from plane center up to badge bottom. */
export const BADGE_ABOVE_PLANE = 22;

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
  logoPlate: {
    width: 20,
    height: 20,
    borderRadius: 4,
    backgroundColor: "#F4F7FC",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 6,
    overflow: "hidden",
  },
  logo: {
    width: 16,
    height: 16,
  },
  chipText: {
    color: "#0B1220",
    fontSize: 8,
    lineHeight: 10,
    fontWeight: "800",
    letterSpacing: 0.2,
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
