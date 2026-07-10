import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  Animated,
  Dimensions,
  Easing,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radius, spacing, typography } from "../constants/theme";

const SWIPE_CLOSE_DISTANCE = 64;
const SWIPE_CLOSE_VELOCITY = 0.55;
const SHEET_OFFSCREEN = 360;
const SHEET_TOP_OFFSET = 320;

type Props = {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
};

/**
 * Map-overlay bottom sheet for alerts, tracked flights, etc.
 * Swipe down to dismiss — matches the aircraft sheet chrome.
 */
export function ChromeSheet({
  visible,
  title,
  onClose,
  children,
  contentContainerStyle,
}: Props) {
  const insets = useSafeAreaInsets();
  const screenHeight = Dimensions.get("window").height;
  const sheetHeight = screenHeight - SHEET_TOP_OFFSET;

  const progress = useRef(new Animated.Value(1)).current;
  const dragY = useRef(new Animated.Value(0)).current;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (visible) {
      dragY.setValue(0);
      Animated.spring(progress, {
        toValue: 0,
        useNativeDriver: true,
        friction: 9,
        tension: 80,
      }).start();
    } else {
      Animated.timing(progress, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }
  }, [visible, progress, dragY]);

  const dismiss = useCallback(() => {
    Animated.parallel([
      Animated.timing(dragY, {
        toValue: SHEET_OFFSCREEN,
        duration: 200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(progress, {
        toValue: 1,
        duration: 200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => {
      dragY.setValue(0);
      onCloseRef.current();
    });
  }, [dragY, progress]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_evt, g) =>
          g.dy > 8 && g.dy > Math.abs(g.dx) * 1.2,
        onPanResponderMove: (_evt, g) => {
          if (g.dy > 0) dragY.setValue(g.dy);
        },
        onPanResponderRelease: (_evt, g) => {
          if (
            g.dy > SWIPE_CLOSE_DISTANCE ||
            g.vy > SWIPE_CLOSE_VELOCITY
          ) {
            dismiss();
            return;
          }
          Animated.spring(dragY, {
            toValue: 0,
            useNativeDriver: true,
            friction: 8,
            tension: 90,
          }).start();
        },
        onPanResponderTerminate: () => {
          Animated.spring(dragY, {
            toValue: 0,
            useNativeDriver: true,
            friction: 8,
          }).start();
        },
      }),
    [dismiss, dragY],
  );

  if (!visible) return null;

  const sheetTranslate = Animated.add(
    progress.interpolate({
      inputRange: [0, 1],
      outputRange: [0, SHEET_OFFSCREEN],
    }),
    dragY,
  );

  return (
    <View style={styles.root} pointerEvents="box-none">
      <Animated.View
        style={[
          styles.sheet,
          {
            height: sheetHeight,
            paddingBottom: Math.max(insets.bottom, spacing.lg),
            transform: [{ translateY: sheetTranslate }],
          },
        ]}
        {...panResponder.panHandlers}
      >
        <View style={styles.handle} />
        <Text style={styles.title}>{title}</Text>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, contentContainerStyle]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator
        >
          {children}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
    zIndex: 25,
  },
  sheet: {
    backgroundColor: colors.bgElevated,
    borderTopLeftRadius: radius.lg + 4,
    borderTopRightRadius: radius.lg + 4,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    shadowColor: "#000",
    shadowOpacity: 0.45,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: -6 },
    elevation: 16,
    overflow: "hidden",
  },
  handle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: spacing.md,
  },
  title: {
    ...typography.subtitle,
    fontSize: 18,
    marginBottom: spacing.md,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: spacing.xl,
    gap: spacing.sm,
  },
});