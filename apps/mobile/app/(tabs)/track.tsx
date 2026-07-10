import { useState } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { api } from "../../lib/convex";
import { useFr24Search } from "../../hooks/useFr24Search";
import { EmptyState } from "../../components/EmptyState";
import { LoadingState } from "../../components/LoadingState";
import { ErrorBanner } from "../../components/ErrorBanner";
import { colors, radius, spacing, typography } from "../../constants/theme";

export default function TrackScreen() {
  const router = useRouter();
  const tracked = useQuery(api.tracked.list);
  const addTracked = useMutation(api.tracked.add);
  const removeTracked = useMutation(api.tracked.remove);
  const { results, loading, error, search, clear } = useFr24Search();
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const liveHits = results.live;

  const onSearch = async () => {
    await search(query);
  };

  const onTrackLive = async (item: {
    fr24Id?: string;
    id: string;
    label: string;
  }) => {
    const key = item.fr24Id ?? item.id;
    setBusyId(key);
    try {
      await addTracked({
        fr24Id: item.fr24Id ?? item.id,
        flightNumber: item.label.replace(/\s+/g, "").toUpperCase() || "UNKNOWN",
        callsign: item.label.replace(/\s+/g, "").toUpperCase(),
        label: item.label,
      });
      clear();
      setQuery("");
    } finally {
      setBusyId(null);
    }
  };

  const onTrackManual = async () => {
    const flightNumber = query.replace(/\s+/g, "").toUpperCase();
    if (!flightNumber) return;
    setBusyId("manual");
    try {
      await addTracked({ flightNumber, callsign: flightNumber, label: flightNumber });
      setQuery("");
      clear();
    } finally {
      setBusyId(null);
    }
  };

  if (tracked === undefined) {
    return <LoadingState label="Loading tracked flights…" />;
  }

  return (
    <View style={styles.screen}>
      <View style={styles.searchBox}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search FR24 or enter flight #"
          placeholderTextColor={colors.textDim}
          style={styles.input}
          autoCapitalize="characters"
          autoCorrect={false}
          returnKeyType="search"
          onSubmitEditing={() => void onSearch()}
        />
        <View style={styles.searchActions}>
          <Pressable style={styles.btn} onPress={() => void onSearch()}>
            <Text style={styles.btnText}>{loading ? "…" : "Search"}</Text>
          </Pressable>
          <Pressable style={[styles.btn, styles.btnGhost]} onPress={() => void onTrackManual()}>
            <Text style={styles.btnGhostText}>
              {busyId === "manual" ? "…" : "Track #"}
            </Text>
          </Pressable>
        </View>
      </View>

      {error ? <ErrorBanner message={error} onRetry={() => void onSearch()} /> : null}

      {liveHits.length > 0 ? (
        <View style={styles.hits}>
          <Text style={styles.section}>Search results (live)</Text>
          {liveHits.map((item) => (
            <Pressable
              key={item.id}
              style={styles.hit}
              onPress={() => void onTrackLive(item)}
            >
              <Text style={styles.hitLabel}>{item.label}</Text>
              <Text style={styles.hitMeta}>{item.detail ?? item.type}</Text>
              <Text style={styles.hitAction}>
                {busyId === (item.fr24Id ?? item.id) ? "Adding…" : "Track"}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <FlatList
        data={tracked}
        keyExtractor={(item) => item._id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <Text style={[styles.section, styles.listHeader]}>Tracked</Text>
        }
        ListEmptyComponent={
          <EmptyState
            title="Nothing tracked yet"
            message="Search FR24 for a live flight or type a flight number and tap Track #."
          />
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Pressable
              style={styles.cardMain}
              onPress={() => {
                if (item.fr24Id) {
                  router.push({
                    pathname: "/flight/[id]",
                    params: {
                      id: item.fr24Id,
                      callsign: item.callsign ?? "",
                      flightNumber: item.flightNumber,
                    },
                  });
                }
              }}
            >
              <Text style={styles.title}>
                {item.label || item.callsign || item.flightNumber}
              </Text>
              <Text style={styles.meta}>
                {item.flightNumber}
                {item.fr24Id ? ` · ${item.fr24Id}` : " · no live id"}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => void removeTracked({ id: item._id })}
              hitSlop={8}
            >
              <Text style={styles.remove}>Remove</Text>
            </Pressable>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  searchBox: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  input: {
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    color: colors.text,
    fontSize: 16,
  },
  searchActions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  btn: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  btnText: {
    color: colors.bg,
    fontWeight: "700",
  },
  btnGhost: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: colors.border,
  },
  btnGhostText: {
    color: colors.text,
    fontWeight: "600",
  },
  hits: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    marginBottom: spacing.sm,
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
  },
  hitMeta: {
    ...typography.caption,
  },
  hitAction: {
    ...typography.caption,
    color: colors.accent,
    marginTop: 4,
    fontWeight: "600",
  },
  list: {
    paddingBottom: spacing.xxl,
  },
  listHeader: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  section: {
    ...typography.caption,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    color: colors.textDim,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    gap: spacing.md,
  },
  cardMain: {
    flex: 1,
    gap: 2,
  },
  title: {
    ...typography.subtitle,
  },
  meta: {
    ...typography.caption,
  },
  remove: {
    ...typography.caption,
    color: colors.danger,
    fontWeight: "600",
  },
});
