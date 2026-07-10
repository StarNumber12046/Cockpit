import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { FaIcon } from "./FaIcon";
import { colors, radius, spacing, typography } from "../constants/theme";

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

type SearchHit = {
  id: string;
  fr24Id?: string;
  label: string;
  detail?: string;
  type?: string;
};

type ResultsProps = {
  hits: SearchHit[];
  busyId: string | null;
  onSelect: (item: SearchHit) => void;
  actionLabel?: (item: SearchHit) => string;
};

export function FlightSearchResults({
  hits,
  busyId,
  onSelect,
  actionLabel,
}: ResultsProps) {
  if (hits.length === 0) return null;

  return (
    <ScrollView
      style={styles.results}
      contentContainerStyle={styles.resultsContent}
      nestedScrollEnabled
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator
    >
      <Text style={styles.resultsLabel}>Search results (live)</Text>
      {hits.map((item) => {
        const key = item.fr24Id ?? item.id;
        const busy = busyId === key;
        return (
          <Pressable
            key={key}
            style={styles.hit}
            onPress={() => onSelect(item)}
          >
            <Text style={styles.hitLabel} numberOfLines={1}>
              {item.label}
            </Text>
            <Text style={styles.hitMeta} numberOfLines={2}>
              {item.detail ?? item.type}
            </Text>
            <Text style={styles.hitAction}>
              {busy ? "…" : actionLabel ? actionLabel(item) : "Track"}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
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
    maxHeight: 220,
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
    padding: spacing.md,
  },
  hitLabel: {
    ...typography.subtitle,
    fontSize: 15,
    flexShrink: 1,
  },
  hitMeta: {
    ...typography.caption,
    flexShrink: 1,
  },
  hitAction: {
    ...typography.caption,
    color: colors.highlight,
    marginTop: 4,
    fontWeight: "600",
  },
});
