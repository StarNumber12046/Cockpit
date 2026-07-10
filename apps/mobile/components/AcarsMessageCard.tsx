import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useMutation, useQuery } from "convex/react";
import { formatTimestamp } from "@cockpit/shared";
import { api } from "../lib/convex";
import { SeverityChip } from "./SeverityChip";
import { colors, radius, spacing, typography } from "../constants/theme";

type AcarsMessage = {
  _id: string;
  category: string;
  label?: string;
  raw: string;
  decoded?: string;
  severity: "info" | "warning" | "critical";
  source?: string;
  registration?: string;
  timestamp: number;
};

type Props = {
  message: AcarsMessage;
};

/**
 * Tappable ACARS card: expands and requests a server-side AI explanation
 * that streams into Convex and appears live via useQuery.
 */
export function AcarsMessageCard({ message }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const requestExplain = useMutation(api.acarsExplain.request);
  const messageId = message._id as Parameters<
    typeof requestExplain
  >[0]["messageId"];

  // Always subscribe so cached ready state shows a badge without re-fetch.
  const explanation = useQuery(api.acarsExplain.getForMessage, { messageId });

  const kickOff = useCallback(
    async (force = false) => {
      setRequesting(true);
      setLocalError(null);
      try {
        await requestExplain({ messageId, force });
      } catch (err) {
        setLocalError(
          err instanceof Error ? err.message : "Failed to request explanation",
        );
      } finally {
        setRequesting(false);
      }
    },
    [messageId, requestExplain],
  );

  const status = explanation?.status;
  const hasReady = status === "ready" && Boolean(explanation?.text);
  const streaming =
    requesting || status === "pending" || status === "streaming";

  const onToggle = () => {
    if (expanded) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
    // Only hit the server when we don't already have a finished answer.
    if (!hasReady) {
      void kickOff(false);
    }
  };

  const showExplainPanel =
    expanded &&
    (Boolean(explanation?.text) ||
      streaming ||
      status === "error" ||
      Boolean(localError));

  const badgeLabel = hasReady
    ? "AI"
    : status === "error"
      ? "!"
      : streaming && expanded
        ? "…"
        : null;

  return (
    <View style={styles.card}>
      <Pressable
        onPress={onToggle}
        style={({ pressed }) => [
          styles.mainTap,
          pressed && styles.mainTapPressed,
        ]}
        accessibilityRole="button"
        accessibilityHint="Tap to explain this ACARS message with AI"
      >
        <View style={styles.rowBetween}>
          <Text style={styles.cardTitle}>
            {message.category}
            {message.label ? ` · ${message.label}` : ""}
          </Text>
          <View style={styles.rightMeta}>
            {badgeLabel ? (
              <View
                style={[
                  styles.badge,
                  status === "error" && styles.badgeError,
                  hasReady && styles.badgeReady,
                ]}
              >
                <Text style={styles.badgeText}>{badgeLabel}</Text>
              </View>
            ) : null}
            <SeverityChip severity={message.severity} />
          </View>
        </View>

        <Text style={styles.body} selectable>
          {message.raw}
        </Text>

        {message.decoded ? (
          <Text style={styles.decoded}>{message.decoded}</Text>
        ) : null}

        <View style={styles.footer}>
          <Text style={styles.meta}>
            {message.source === "airframes" ? "Airframes · " : ""}
            {message.registration ? `${message.registration} · ` : ""}
            {formatTimestamp(message.timestamp)}
          </Text>
        </View>
      </Pressable>

      {showExplainPanel ? (
        <View style={styles.explainBox}>
          <View style={styles.explainHeader}>
            <Text style={styles.explainTitle}>AI explanation</Text>
            {streaming ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : null}
            {hasReady ? (
              <Pressable onPress={() => void kickOff(true)} hitSlop={8}>
                <Text style={styles.regenerate}>Regenerate</Text>
              </Pressable>
            ) : null}
          </View>

          {localError || status === "error" ? (
            <View style={styles.errorRow}>
              <Text style={styles.errorText}>
                {localError ||
                  explanation?.error ||
                  "Explanation failed. Check GROQ_API_KEY on Convex."}
              </Text>
              <Pressable onPress={() => void kickOff(true)} hitSlop={8}>
                <Text style={styles.regenerate}>Retry</Text>
              </Pressable>
            </View>
          ) : null}

          {explanation?.text ? (
            <Text style={styles.explainText} selectable>
              {explanation.text}
              {status === "streaming" ? "▍" : ""}
            </Text>
          ) : streaming ? (
            <Text style={styles.explainPlaceholder}>Explaining...</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
    overflow: "hidden",
  },
  mainTap: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  mainTapPressed: {
    backgroundColor: colors.bgElevated,
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.sm,
  },
  rightMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: radius.full,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  badgeReady: {
    borderWidth: 0,
  },
  badgeError: {
    borderColor: colors.danger,
    backgroundColor: colors.dangerSoft,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.accentForeground,
  },
  cardTitle: {
    ...typography.subtitle,
    flex: 1,
  },
  body: {
    ...typography.body,
    color: colors.textMuted,
  },
  decoded: {
    ...typography.caption,
    color: colors.textDim,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.sm,
  },
  meta: {
    ...typography.caption,
    flex: 1,
  },
  hint: {
    ...typography.caption,
    color: "#ffffff",
    fontWeight: "600",
  },
  explainBox: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    gap: spacing.sm,
    backgroundColor: colors.accentSoft,
  },
  explainHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  explainTitle: {
    ...typography.caption,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: colors.textDim,
    flex: 1,
  },
  regenerate: {
    ...typography.caption,
    color: colors.accentForeground,
    fontWeight: "600",
  },
  explainText: {
    ...typography.body,
    color: colors.text,
    lineHeight: 20,
  },
  explainPlaceholder: {
    ...typography.caption,
    color: colors.textDim,
    fontStyle: "italic",
  },
  modelMeta: {
    ...typography.caption,
    color: colors.textDim,
  },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  errorText: {
    ...typography.caption,
    color: colors.danger,
    flex: 1,
  },
});
