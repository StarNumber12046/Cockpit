import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { api } from "../../lib/convex";
import { EmptyState } from "../../components/EmptyState";
import { LoadingState } from "../../components/LoadingState";
import { colors, radius, spacing, typography } from "../../constants/theme";

export default function TrackScreen() {
  const router = useRouter();
  const tracked = useQuery(api.tracked.list);
  const removeTracked = useMutation(api.tracked.remove);

  if (tracked === undefined) {
    return <LoadingState label="Loading tracked flights…" />;
  }

  return (
    <View style={styles.screen}>
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
            message="Use the search bar on the Live tab to find a flight or track a flight number."
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
  list: {
    paddingBottom: spacing.xxl,
    paddingTop: spacing.md,
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