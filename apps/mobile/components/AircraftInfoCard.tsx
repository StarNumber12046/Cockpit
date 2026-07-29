import { useMemo } from "react";
import {
  Image,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Svg, { Path, G, SvgXml } from "react-native-svg";
import { type Fr24FlightDetails } from "@cockpit/fr24";
import { colors, radius, spacing, typography } from "../constants/theme";

// ── Engine lookup ──────────────────────────────────────────────────────────
const ENGINE_MAP: Record<string, string> = {
  B738: "CFM56 SERIES",
  B737: "CFM56 SERIES",
  B739: "CFM56 SERIES",
  B736: "CFM56 SERIES",
  B37M: "CFM LEAP-1B",
  B38M: "CFM LEAP-1B",
  B39M: "CFM LEAP-1B",
  B752: "RB211 / PW2000",
  B753: "RB211 / PW2000",
  B763: "PW4000 / CF6 / RB211",
  B764: "PW4000 / CF6",
  B772: "PW4000 / GE90 / Trent 800",
  B773: "PW4000 / GE90 / Trent 800",
  B77W: "GE90-115B",
  B788: "GEnx / Trent 1000",
  B789: "GEnx / Trent 1000",
  B781: "GEnx / Trent 1000",
  A320: "IAE V2500 / CFM56",
  A319: "IAE V2500 / CFM56",
  A321: "IAE V2500 / CFM56",
  A20N: "CFM LEAP-1A / PW1100G",
  A21N: "CFM LEAP-1A / PW1100G",
  A19N: "CFM LEAP-1A / PW1100G",
  A332: "CF6 / PW4000 / Trent 700",
  A333: "CF6 / PW4000 / Trent 700",
  A339: "Trent 7000",
  A343: "CFM56-5C",
  A346: "Trent 500",
  A359: "Trent XWB",
  A35K: "Trent XWB",
  E190: "CF34-10E",
  E195: "CF34-10E",
  E170: "CF34-8E",
  E175: "CF34-8E",
  CRJ7: "CF34-8C",
  CRJ9: "CF34-8C",
  CRJ2: "CF34-1A",
  DH8D: "PW120 SERIES",
  AT45: "PW127",
  AT72: "PW127",
  SF34: "CT7",
  C208: "PT6A",
  PC12: "PT6A",
};

function lookupEngine(aircraftCode: string | undefined | null): string {
  if (!aircraftCode) return "—";
  const code = aircraftCode.trim().toUpperCase();
  return ENGINE_MAP[code] || "—";
}

// ── 737 silhouette SVG ─────────────────────────────────────────────────────
const AIRCRAFT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 200">
  <!-- Fuselage -->
  <path d="M70,110 Q50,110 40,105 Q30,100 28,95 L25,90 Q22,86 22,84 Q22,82 25,80 L28,78 Q30,74 40,70 Q50,66 70,66 L470,66 Q510,66 530,72 Q548,78 556,86 Q564,92 568,96 Q570,100 566,102 Q562,105 546,110 Q526,114 490,115 Q470,116 70,116 Z" fill="#FFFFFF" stroke="#D0D0D0" stroke-width="0.5"/>
  <!-- Cockpit windows -->
  <path d="M552,85 Q560,80 564,85 Q566,91 562,94 Q556,98 552,93 Z" fill="#88CCFF" opacity="0.6"/>
  <!-- Cabin windows -->
  ${[85,105,125,145,165,185,205,225,245,265,285,305,325,345,365,385,405,425,445].map(cx => `<path d="M${cx},79 Q${cx-4},79 ${cx-4},82 Q${cx-4},85 ${cx},85 Q${cx+4},85 ${cx+4},82 Q${cx+4},79 ${cx},79 Z" fill="#B0C4DE" opacity="0.45"/>`).join('')}
  <!-- United lettering -->
  <text x="220" y="90" fill="#0033A0" font-size="16" font-weight="700" font-family="sans-serif">UNITED</text>
  <!-- Vertical stabilizer -->
  <path d="M470,66 Q480,38 500,24 Q520,12 530,15 Q540,18 545,25 Q550,35 550,50 Q550,60 545,66 Z" fill="#0033A0"/>
  <!-- Tail globe -->
  <path d="M515,36 Q522,28 530,32 Q538,36 535,44 Q532,52 524,50 Q516,48 515,40 Z" fill="none" stroke="#FFFFFF" stroke-width="1.5" opacity="0.8"/>
  <path d="M510,40 Q522,30 535,38 Q540,43 535,48 Q525,54 513,46" fill="none" stroke="#FFFFFF" stroke-width="1" opacity="0.5"/>
  <!-- Horizontal stabilizer -->
  <path d="M480,110 Q500,110 530,106 Q550,103 560,106 L558,110 Q540,114 520,116 Q500,117 480,116 Z" fill="#D0D0D0"/>
  <!-- Wings -->
  <path d="M210,108 Q200,128 190,153 Q185,166 188,170 Q192,172 210,170 Q250,166 280,163 Q300,161 310,160 Q320,158 325,156 Q330,153 330,150 Q325,143 300,138 Q270,133 230,126 Q210,122 200,116 Z" fill="#E0E0E0" stroke="#C0C0C0" stroke-width="0.5"/>
  <path d="M200,73 Q190,53 185,38 Q182,28 185,26 Q188,24 205,26 Q240,30 275,36 Q300,40 315,43 Q325,46 328,48 Q330,51 326,53 Q320,56 300,58 Q270,62 240,65 Q220,67 205,71 Z" fill="#E8E8E8" stroke="#C0C0C0" stroke-width="0.5"/>
  <!-- Winglets -->
  <path d="M328,48 Q335,46 338,42 Q340,38 338,36 Q335,34 330,38 Q326,42 326,46 Z" fill="#0033A0"/>
  <path d="M185,26 Q180,23 178,20 Q176,16 178,14 Q180,12 184,15 Q188,18 188,23 Z" fill="#0033A0"/>
  <!-- Engines -->
  <path d="M250,128 Q255,124 270,124 Q285,124 290,128 Q295,132 295,136 Q295,140 290,144 Q285,148 270,148 Q255,148 250,144 Q245,140 245,136 Q245,132 250,128 Z" fill="#B0B0B0" stroke="#909090" stroke-width="0.5"/>
  <path d="M240,58 Q245,55 258,55 Q270,55 274,58 Q278,61 278,64 Q278,67 274,70 Q270,73 258,73 Q245,73 240,70 Q236,67 236,64 Q236,61 240,58 Z" fill="#C0C0C0" stroke="#A0A0A0" stroke-width="0.5"/>
  <!-- Landing gear -->
  <line x1="270" y1="148" x2="266" y2="166" stroke="#808080" stroke-width="3"/>
  <line x1="250" y1="148" x2="246" y2="166" stroke="#808080" stroke-width="3"/>
  <ellipse cx="258" cy="166" rx="4" ry="3" fill="#606060"/>
  <ellipse cx="254" cy="166" rx="4" ry="3" fill="#606060"/>
  <line x1="546" y1="115" x2="544" y2="158" stroke="#808080" stroke-width="2"/>
  <ellipse cx="540" cy="158" rx="4" ry="3" fill="#606060"/>
  <ellipse cx="546" cy="158" rx="4" ry="3" fill="#606060"/>
</svg>`;

function AircraftSilhouette() {
  return (
    <View style={styles.silhouetteWrap}>
      <SvgXml xml={AIRCRAFT_SVG} width="100%" height="100%" />
    </View>
  );
}

// ── Props ───────────────────────────────────────────────────────────────────

type Props = {
  /** Registration / tail number */
  registration?: string | null;
  /** ICAO aircraft type code (B738, A320, etc.) */
  aircraftCode?: string | null;
  /** Full model text (e.g. "Boeing 737NG 824/W") */
  modelText?: string | null;
  /** Airline name */
  airlineName?: string | null;
  /** Aircraft photo URI (from FR24 / Planespotters) */
  photoUri?: string | null;
  /** Constructor / line number or other identifier to show top-right */
  lineNumber?: string | null;
};

// ── Component ───────────────────────────────────────────────────────────────

export function AircraftInfoCard({
  registration,
  aircraftCode,
  modelText,
  airlineName,
  photoUri,
  lineNumber,
}: Props) {
  const engine = useMemo(() => lookupEngine(aircraftCode), [aircraftCode]);

  const displayModel = modelText || aircraftCode || "Unknown Aircraft";
  const displayReg = registration || "—";
  const displayType = aircraftCode || "—";
  const displayOperator = airlineName || "—";
  const displayEngine = engine;

  return (
    <View style={styles.card}>
      {/* ── Header ──────────────────────────────────── */}
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Text style={styles.modelTitle} numberOfLines={1}>
            {displayModel}
          </Text>
        </View>
        {lineNumber ? (
          <Text style={styles.lineNumber}>{lineNumber}</Text>
        ) : null}
      </View>

      {/* ── Info row ────────────────────────────────── */}
      <View style={styles.infoRow}>
        <View style={styles.infoItem}>
          <Text style={styles.infoLabel}>Tail No.</Text>
          <Text style={styles.infoValue}>{displayReg}</Text>
        </View>
        <View style={styles.infoItem}>
          <Text style={styles.infoLabel}>ICAO T</Text>
          <Text style={styles.infoValue}>{displayType}</Text>
        </View>
      </View>

      {/* ── Aircraft image ──────────────────────────── */}
      {photoUri ? (
        <View style={styles.imageWrap}>
          <Image
            source={{ uri: photoUri }}
            style={styles.aircraftImage}
            resizeMode="contain"
            accessibilityLabel="Aircraft photo"
          />
        </View>
      ) : (
        <AircraftSilhouette />
      )}

      {/* ── Footer ──────────────────────────────────── */}
      <View style={styles.footerRow}>
        <View style={styles.footerItem}>
          <Text style={styles.footerLabel}>Engines</Text>
          <Text style={styles.footerValue}>{displayEngine}</Text>
        </View>
        <View style={styles.footerItem}>
          <Text style={styles.footerLabel}>Operator</Text>
          <Text style={styles.footerValue}>{displayOperator}</Text>
        </View>
      </View>
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#000000",
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: "#1A1A1A",
  },

  // Header
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  headerLeft: {
    flex: 1,
    marginRight: spacing.sm,
  },
  modelTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: 0.3,
  },
  lineNumber: {
    fontSize: 14,
    fontWeight: "500",
    color: "#AAAAAA",
    marginTop: 4,
  },

  // Info row
  infoRow: {
    flexDirection: "row",
    gap: spacing.xl * 2,
  },
  infoItem: {
    gap: 2,
  },
  infoLabel: {
    fontSize: 11,
    fontWeight: "500",
    color: "#888888",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: 0.3,
  },

  // Image area
  imageWrap: {
    width: "100%",
    aspectRatio: 3,
    backgroundColor: "#000000",
    borderRadius: radius.md,
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
  },
  aircraftImage: {
    width: "100%",
    height: "100%",
  },
  silhouetteWrap: {
    width: "100%",
    aspectRatio: 3,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#000000",
    borderRadius: radius.md,
    overflow: "hidden",
  },

  // Footer
  footerRow: {
    flexDirection: "row",
    gap: spacing.xl * 2,
    paddingTop: spacing.xs,
  },
  footerItem: {
    gap: 2,
  },
  footerLabel: {
    fontSize: 11,
    fontWeight: "500",
    color: "#888888",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  footerValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
    letterSpacing: 0.2,
  },
});
