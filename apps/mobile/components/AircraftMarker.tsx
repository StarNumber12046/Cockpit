import { memo, useEffect, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { Marker } from "react-native-maps";
import type { Fr24Flight } from "@cockpit/fr24";
import { isEmergencySquawk } from "@cockpit/shared";
import { colors } from "../constants/theme";
import { AIRCRAFT_ICON_SIZE, AircraftIcon } from "./AircraftIcon";

type Props = {
  flight: Fr24Flight;
  selected?: boolean;
  onPress?: (flight: Fr24Flight) => void;
};

/**
 * Plane glyph only — ICAO-type SVG silhouette (no circle). Callsign badges are
 * a screen overlay (Android Marker bitmaps clip Text).
 */
/** Hit box fits scaled heavies (~1.25×) without clipping the silhouette. */
const HIT = Math.ceil(AIRCRAFT_ICON_SIZE * 1.35) + 4;
/**
 * Android snapshots Marker children to bitmaps while tracksViewChanges is true.
 * Keep this short — many markers enabling together can OOM the heap.
 */
const TRACK_MS = Platform.OS === "android" ? 250 : 600;

/** Native maps reject non-finite lat/lon and can crash the property update. */
export function isValidMapCoordinate(
  latitude: number,
  longitude: number,
): boolean {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180
  );
}

function AircraftMarkerInner({ flight, selected, onPress }: Props) {
  const emergency = isEmergencySquawk(flight.squawk);
  const tint = emergency
    ? colors.danger
    : selected
      ? colors.success
      : flight.onGround
        ? colors.textDim
        : "#FFFFFF";

  // Silhouette nose points up (north); rotate by true heading degrees.
  const rotation = ((flight.heading % 360) + 360) % 360;
  const coordsValid = isValidMapCoordinate(flight.latitude, flight.longitude);

  const [tracksViewChanges, setTracksViewChanges] = useState(true);
  useEffect(() => {
    if (!coordsValid) return;
    setTracksViewChanges(true);
    const t = setTimeout(() => setTracksViewChanges(false), TRACK_MS);
    return () => clearTimeout(t);
  }, [coordsValid, selected, emergency, flight.onGround, tint, flight.aircraftCode]);

  // Never push non-finite coords to AIRMapMarker — native update can OOM/crash.
  if (!coordsValid) return null;

  return (
    <Marker
      coordinate={{
        latitude: flight.latitude,
        longitude: flight.longitude,
      }}
      rotation={rotation}
      flat
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={tracksViewChanges}
      stopPropagation
      zIndex={selected ? 10 : emergency ? 5 : 1}
      onPress={(e) => {
        e.stopPropagation();
        onPress?.(flight);
      }}
      identifier={flight.fr24Id}
    >
      <View style={styles.hit} collapsable={false}>
        <AircraftIcon
          aircraftCode={flight.aircraftCode}
          color={tint}
          size={AIRCRAFT_ICON_SIZE}
        />
      </View>
    </Marker>
  );
}

export const AircraftMarker = memo(
  AircraftMarkerInner,
  (a, b) =>
    a.selected === b.selected &&
    a.flight.fr24Id === b.flight.fr24Id &&
    a.flight.latitude === b.flight.latitude &&
    a.flight.longitude === b.flight.longitude &&
    a.flight.heading === b.flight.heading &&
    a.flight.squawk === b.flight.squawk &&
    a.flight.onGround === b.flight.onGround &&
    a.flight.aircraftCode === b.flight.aircraftCode,
);

const styles = StyleSheet.create({
  hit: {
    width: HIT,
    height: HIT,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
});
