import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type {
  Fr24Flight,
  Fr24FlightDetails,
  Fr24SearchResultItem,
} from "@cockpit/fr24";
import { FaIcon } from "./FaIcon";
import { colors, radius, spacing, typography } from "../constants/theme";
import {
  airlineLogoCandidates,
  airlineLogoSourceKey,
  resolveAirlineChip,
} from "../lib/media";
import { resolveSearchHitDisplay } from "../lib/searchHitDisplay";

type Props = {
  query: string;
  onChangeQuery: (value: string) => void;
  loading?: boolean;
};

export function FlightSearchBar({
  query,
  onChangeQuery,
  loading = false,
}: Props) {
  return (
    <View style={styles.field}>
      <View style={styles.iconSlot}>
        {loading ? (
          <ActivityIndicator color={colors.accent} size="small" />
        ) : (
          <FaIcon name="search" size={16} color={colors.text} />
        )}
      </View>
      <TextInput
        value={query}
        onChangeText={onChangeQuery}
        placeholder="Search flights, airports"
        placeholderTextColor={colors.textDim}
        style={styles.input}
        autoCapitalize="characters"
        autoCorrect={false}
        returnKeyType="search"
      />
    </View>
  );
}

type ResultsProps = {
  hits: Fr24SearchResultItem[];
  flights?: Fr24Flight[];
  detailsById?: Record<string, Fr24FlightDetails>;
  busyId: string | null;
  onSelect: (item: Fr24SearchResultItem) => void;
};

function SearchHitRow({
  item,
  onMapFlight,
  detail,
  busy,
  onPress,
}: {
  item: Fr24SearchResultItem;
  onMapFlight?: Fr24Flight;
  detail?: Fr24FlightDetails;
  busy: boolean;
  onPress: () => void;
}) {
  const display = useMemo(
    () => resolveSearchHitDisplay(item, onMapFlight, detail),
    [item, onMapFlight, detail],
  );

  const logoSources = useMemo(
    () => airlineLogoCandidates(display.identity, detail?.airline),
    [display.identity, detail?.airline],
  );

  const [logoIndex, setLogoIndex] = useState(0);
  const logoKey = airlineLogoSourceKey(logoSources);
  useEffect(() => {
    setLogoIndex(0);
  }, [logoKey]);

  const logoSource = logoSources[logoIndex] ?? null;
  const chip = resolveAirlineChip(display.identity);

  return (
    <Pressable style={styles.hit} onPress={onPress}>
      <View style={styles.hitRow}>
        {logoSource ? (
          <View style={styles.logoShell}>
            <Image
              source={{
                uri: logoSource.uri,
                headers: logoSource.headers,
              }}
              style={styles.logo}
              resizeMode="contain"
              onError={() => {
                setLogoIndex((i) =>
                  i + 1 < logoSources.length ? i + 1 : logoSources.length,
                );
              }}
            />
          </View>
        ) : (
          <View style={styles.chipPlate}>
            <Text style={styles.chipText} allowFontScaling={false}>
              {chip}
            </Text>
          </View>
        )}

        <View style={styles.hitBody}>
          <Text style={styles.hitCallsign} numberOfLines={1}>
            <Text style={styles.hitCallsignLabel}>{display.callsign}</Text>
            {display.aircraftCode ? (
              <>
                <Text style={styles.hitMetaDot}> · </Text>
                <Text style={styles.hitAircraftCode}>
                  {display.aircraftCode}
                </Text>
              </>
            ) : null}
          </Text>
          {display.airline || display.altitudeText ? (
            <Text style={styles.hitMeta} numberOfLines={1}>
              {display.airline ? (
                <Text style={styles.hitAirline}>{display.airline}</Text>
              ) : null}
              {display.airline && display.altitudeText ? (
                <Text style={styles.hitMetaDot}> · </Text>
              ) : null}
              {display.altitudeText ? (
                <Text style={styles.hitAltitude}>{display.altitudeText}</Text>
              ) : null}
            </Text>
          ) : null}
        </View>

        <View style={styles.hitAction}>
          {busy ? (
            <ActivityIndicator color={colors.textDim} size="small" />
          ) : (
            <FaIcon name="angle-right" size={18} color={colors.textDim} />
          )}
        </View>
      </View>
    </Pressable>
  );
}

function dedupeSearchHits(hits: Fr24SearchResultItem[]): Fr24SearchResultItem[] {
  const seen = new Set<string>();
  const unique: Fr24SearchResultItem[] = [];
  for (const item of hits) {
    const id = item.fr24Id ?? item.id;
    const dedupeKey = id || `${item.type}:${item.label}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    unique.push(item);
  }
  return unique;
}

export function FlightSearchResults({
  hits,
  flights = [],
  detailsById = {},
  busyId,
  onSelect,
}: ResultsProps) {
  const uniqueHits = useMemo(() => dedupeSearchHits(hits), [hits]);
  if (uniqueHits.length === 0) return null;

  return (
    <View style={styles.results}>
      <View style={styles.resultsContent}>
        <Text style={styles.resultsLabel}>Search results (live)</Text>
        {uniqueHits.map((item, index) => {
          const lookupKey = item.fr24Id ?? item.id;
          const rowKey = lookupKey
            ? `${lookupKey}-${index}`
            : `search-hit-${index}`;
          const busy = lookupKey != null && busyId === lookupKey;
          const onMapFlight = lookupKey
            ? flights.find((f) => f.fr24Id === lookupKey)
            : undefined;
          return (
            <SearchHitRow
              key={rowKey}
              item={item}
              onMapFlight={onMapFlight}
              detail={lookupKey ? detailsById[lookupKey] : undefined}
              busy={busy}
              onPress={() => onSelect(item)}
            />
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.full,
    paddingLeft: spacing.lg,
    paddingRight: spacing.sm,
    minHeight: 44,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  input: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
    color: colors.text,
    fontSize: 16,
    fontWeight: 500,
  },
  iconSlot: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  results: {
    backgroundColor: "rgba(18, 26, 43, 0.92)",
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  resultsContent: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  resultsLabel: {
    ...typography.caption,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    color: colors.textDim,
  },
  hit: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
  },
  hitRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm + 2,
  },
  logoShell: {
    width: 32,
    height: 32,
    borderRadius: 8,
    overflow: "hidden",
    flexShrink: 0,
  },
  logo: {
    width: "100%",
    height: "100%",
  },
  chipPlate: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "#F4F7FC",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    flexShrink: 0,
  },
  chipText: {
    color: "#0B1220",
    fontSize: 9,
    lineHeight: 11,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  hitBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  hitCallsign: {
    fontSize: 15,
    lineHeight: 20,
  },
  hitCallsignLabel: {
    ...typography.subtitle,
    fontSize: 15,
    fontWeight: "700",
  },
  hitAircraftCode: {
    color: colors.textDim,
    fontSize: 11,
    fontWeight: "400",
  },
  hitMeta: {
    fontSize: typography.caption.fontSize,
    lineHeight: 16,
  },
  hitAirline: {
    color: colors.text,
    fontWeight: "400",
  },
  hitMetaDot: {
    color: colors.textDim,
    fontSize: 11,
  },
  hitAltitude: {
    color: colors.textDim,
    fontSize: 11,
    fontWeight: "400",
  },
  hitAction: {
    width: 24,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
});