import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  Image,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import type { Fr24Flight, Fr24FlightDetails } from "@cockpit/fr24";
import {
  airlineIdentityFromFr24,
  airlineLogoCandidates,
  airlineLogoSourceKey,
  fr24LogotypeSourcesFromAirline,
  resolveAirlineChip,
} from "../lib/media";
import {
  airlineLogoCandidatesWithCache,
  forgetAirlineLogo,
  getAirlineLogoCacheVersion,
  rememberAirlineLogo,
  subscribeAirlineLogoCache,
} from "../lib/airlineLogoCache";

type Fr24DetailLike = Pick<Fr24FlightDetails, "airline"> | Fr24FlightDetails | null | undefined;

type Props = {
  flight: Fr24Flight;
  /** FR24 clickhandler payload — full detail preferred so logotype URLs are found. */
  detail?: Fr24DetailLike;
  size: number;
  borderRadius?: number;
  chipBackground?: string;
  style?: StyleProp<ViewStyle>;
  chipStyle?: StyleProp<ViewStyle>;
  emergency?: boolean;
  emergencyStyle?: StyleProp<ViewStyle>;
  /** Remounts the native Image (e.g. when a sheet re-opens). */
  remountKey?: string | number;
};

/**
 * Shared airline logo: flightaware → kiwi/avs → FR24 CDN, with text chip fallback.
 */
export function AirlineLogo({
  flight,
  detail,
  size,
  borderRadius,
  chipBackground = "#F4F7FC",
  style,
  chipStyle,
  emergency,
  emergencyStyle,
  remountKey,
}: Props) {
  const identity = useMemo(
    () => airlineIdentityFromFr24(flight, detail),
    [
      flight.airlineIcao,
      flight.flightNumber,
      detail?.airline?.code?.iata,
      detail?.airline?.code?.icao,
      detail?.airline?.id,
      detail?.airline?.url,
    ],
  );
  const chip = resolveAirlineChip(identity);
  const cacheVersion = useSyncExternalStore(
    subscribeAirlineLogoCache,
    getAirlineLogoCacheVersion,
  );

  const detailScanKey = airlineLogoSourceKey(
    fr24LogotypeSourcesFromAirline(detail),
  );

  const logoSources = useMemo(
    () =>
      airlineLogoCandidatesWithCache(
        identity,
        airlineLogoCandidates(identity, detail),
      ),
    [
      identity.airlineIcao,
      identity.airlineIata,
      identity.flightNumber,
      detail?.airline?.code?.iata,
      detail?.airline?.code?.icao,
      detail?.airline?.id,
      detail?.airline?.url,
      detailScanKey,
      cacheVersion,
    ],
  );

  const [logoIndex, setLogoIndex] = useState(0);
  const logoKey = airlineLogoSourceKey(logoSources);

  useEffect(() => {
    setLogoIndex(0);
  }, [logoKey, remountKey]);

  const logoSource = logoSources[logoIndex] ?? null;
  const radius = borderRadius ?? Math.max(4, Math.round(size * 0.3));
  const chipFontSize = Math.max(8, Math.round(size * 0.38));

  if (!logoSource) {
    return (
      <View
        style={[
          styles.chip,
          {
            width: size,
            height: size,
            borderRadius: radius,
            backgroundColor: chipBackground,
          },
          emergency ? emergencyStyle : null,
          style,
          chipStyle,
        ]}
      >
        <Text
          style={[styles.chipText, { fontSize: chipFontSize }]}
          allowFontScaling={false}
        >
          {chip}
        </Text>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.logoShell,
        { width: size, height: size, borderRadius: radius },
        emergency ? emergencyStyle : null,
        style,
      ]}
    >
      <Image
        key={
          remountKey != null
            ? `${remountKey}-${logoSource.uri}`
            : logoSource.uri
        }
        source={{
          uri: logoSource.uri,
          headers: logoSource.headers,
        }}
        style={styles.logo}
        resizeMode="contain"
        onLoad={() => {
          rememberAirlineLogo(identity, logoSource);
        }}
        onError={() => {
          forgetAirlineLogo(identity, logoSource);
          setLogoIndex((i) =>
            i + 1 < logoSources.length ? i + 1 : logoSources.length,
          );
        }}
        accessibilityLabel={`${chip} airline logo`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  logoShell: {
    overflow: "hidden",
  },
  logo: {
    width: "100%",
    height: "100%",
  },
  chip: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  chipText: {
    color: "#0B1220",
    fontWeight: "800",
    letterSpacing: 0.2,
  },
});