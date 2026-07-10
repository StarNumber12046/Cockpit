/** Google Maps JSON style for dark aviation UI (Android / Google provider). */
export const DARK_MAP_STYLE: Array<{
  elementType?: string;
  featureType?: string;
  stylers: Array<Record<string, string>>;
}> = [
  // Default geometry — used as a baseline before feature-specific rules.
  { elementType: "geometry", stylers: [{ color: "#152033" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#9aabc8" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0b1220" }] },
  {
    featureType: "administrative",
    elementType: "geometry.stroke",
    stylers: [{ color: "#3a4d6e" }],
  },
  {
    featureType: "administrative.country",
    elementType: "geometry.stroke",
    stylers: [{ color: "#4a6288" }, { weight: "1.2" }],
  },
  {
    featureType: "administrative.province",
    elementType: "geometry.stroke",
    stylers: [{ color: "#2e3f5c" }],
  },
  {
    featureType: "administrative.land_parcel",
    stylers: [{ visibility: "off" }],
  },
  // Land mass — lighter slate so continents read clearly against water.
  {
    featureType: "landscape",
    elementType: "geometry",
    stylers: [{ color: "#1a2740" }],
  },
  {
    featureType: "landscape.natural",
    elementType: "geometry",
    stylers: [{ color: "#18243a" }],
  },
  {
    featureType: "landscape.man_made",
    elementType: "geometry",
    stylers: [{ color: "#1c2a44" }],
  },
  {
    featureType: "poi",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#243552" }],
  },
  {
    featureType: "road",
    elementType: "geometry.stroke",
    stylers: [{ color: "#152033" }],
  },
  {
    featureType: "road",
    elementType: "labels",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "transit",
    stylers: [{ visibility: "off" }],
  },
  // Water — deep near-black blue for strong land/sea separation.
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#050b14" }],
  },
  {
    featureType: "water",
    elementType: "labels.text.fill",
    stylers: [{ color: "#4a5a78" }],
  },
];

/** Approximate latitudeDelta for hub radius (meters → degrees). */
export function radiusToLatitudeDelta(radiusMeters: number): number {
  return (radiusMeters / 111_320) * 2.2;
}
