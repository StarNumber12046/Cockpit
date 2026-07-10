import { Pressable, StyleSheet, Text, View } from "react-native";
import { FaIcon, type FaIconName } from "./FaIcon";
import { colors, radius, spacing } from "../constants/theme";

type Props = {
  onAlerts: () => void;
  onTracked: () => void;
  onRecenter: () => void;
  alertCount?: number;
  trackedCount?: number;
};

export function MapChromeActions({
  onAlerts,
  onTracked,
  onRecenter,
  alertCount = 0,
  trackedCount = 0,
}: Props) {
  return (
    <View style={styles.row}>
      <ChromeIconButton
        icon="exclamation-triangle"
        onPress={onAlerts}
        badge={alertCount}
        tone="danger"
        accessibilityLabel="Alerts"
      />
      <ChromeIconButton
        icon="bell"
        onPress={onTracked}
        badge={trackedCount}

        accessibilityLabel="Tracked flights"
      />
      <ChromeIconButton
        icon="location-arrow"
        onPress={onRecenter}
        accessibilityLabel="Re-center on location"
      />
    </View>
  );
}

function ChromeIconButton({
  icon,
  onPress,
  badge = 0,
  tone = "default",
  accessibilityLabel,
}: {
  icon: FaIconName;
  onPress: () => void;
  badge?: number;
  tone?: "default" | "danger";
  accessibilityLabel: string;
}) {
  const showBadge = badge > 0;
  const iconColor = tone === "danger" ? colors.danger : "#ffffff";

  return (
    <Pressable
      style={({ pressed }) => [styles.btn, pressed ? styles.btnPressed : null]}
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
      hitSlop={4}
    >
      <FaIcon name={icon} size={18} color={iconColor} />
      {showBadge ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>
            {badge > 99 ? "99+" : String(badge)}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  btn: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  btnPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.96 }],
  },
  badge: {
    position: "absolute",
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: radius.full,
    backgroundColor: colors.danger,
    borderWidth: 1,
    borderColor: colors.bgCard,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  badgeText: {
    color: colors.accentForeground,
    fontSize: 10,
    fontWeight: "800",
  },
});
