import { memo, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Marker } from "react-native-maps";
import type { Fr24Flight } from "@cockpit/fr24";
import { isEmergencySquawk } from "@cockpit/shared";
import { colors } from "../constants/theme";

type Props = {
  flight: Fr24Flight;
  selected?: boolean;
  onPress?: (flight: Fr24Flight) => void;
};

/**
 * Custom map glyph. tracksViewChanges stays false most of the time so a large
 * fleet does not freeze Android on snapshot work — but we briefly re-enable it
 * after mount / appearance changes so the custom view is captured (otherwise
 * selected remounts render as blank and the aircraft "disappears").
 */
function AircraftMarkerInner({ flight, selected, onPress }: Props) {
  const emergency = isEmergencySquawk(flight.squawk);
  const tint = emergency
    ? colors.danger
    : selected
      ? colors.accent
      : flight.onGround
        ? colors.textDim
        : colors.success;

  // ✈ faces ~NE; offset so nose tracks true heading via native rotation.
  const rotation = ((flight.heading % 360) + 360) % 360 - 45;

  const [tracksViewChanges, setTracksViewChanges] = useState(true);
  useEffect(() => {
    setTracksViewChanges(true);
    const timer = setTimeout(() => setTracksViewChanges(false), 500);
    return () => clearTimeout(timer);
  }, [selected, emergency, flight.onGround, tint]);

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
        <View
          collapsable={false}
          style={[
            styles.glyph,
            { borderColor: tint },
            selected ? styles.glyphSelected : null,
            emergency ? styles.glyphHot : null,
          ]}
        >
          <Text style={[styles.plane, { color: tint }]}>✈</Text>
        </View>
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
    a.flight.callsign === b.flight.callsign &&
    a.flight.flightNumber === b.flight.flightNumber,
);

const SIZE = 36;

const styles = StyleSheet.create({
  hit: {
    width: SIZE,
    height: SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  glyph: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: 2,
    // Opaque — translucent fills often corrupt Android marker bitmaps.
    backgroundColor: "#0B1220",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  glyphSelected: {
    borderWidth: 3,
    backgroundColor: "#121A2B",
  },
  glyphHot: {
    backgroundColor: "#2A1218",
  },
  plane: {
    fontSize: 16,
    fontWeight: "700",
    includeFontPadding: false,
    textAlign: "center",
  },
});
