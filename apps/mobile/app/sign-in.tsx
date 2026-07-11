import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import * as AuthSession from "expo-auth-session";
import { useAuthActions } from "@convex-dev/auth/react";
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { colors, radius, spacing, typography } from "../constants/theme";
import { FaIcon } from "../components/FaIcon";

// Required for iOS OAuth redirect handling.
WebBrowser.maybeCompleteAuthSession();

type Provider = "google" | "github" | "discord";

const PROVIDERS: { id: Provider; label: string; icon: "google" | "github" | "discord" }[] = [
  { id: "google", label: "Continue with Google", icon: "google" },
  { id: "github", label: "Continue with GitHub", icon: "github" },
  { id: "discord", label: "Continue with Discord", icon: "discord" },
];

export default function SignInScreen() {
  const { signIn } = useAuthActions();
  const router = useRouter();
  const [loading, setLoading] = useState<Provider | null>(null);

  const handleSignIn = async (provider: Provider) => {
    if (loading) return;
    setLoading(provider);
    try {
      const redirectTo = AuthSession.makeRedirectUri({ scheme: "cockpit" });
      await signIn(provider, { redirectTo });
      // On success the ConvexAuthProvider will update isAuthenticated and the
      // router can navigate back. The modal dismisses automatically when the
      // parent detects the auth state change.
      if (router.canGoBack()) router.back();
    } catch (err) {
      console.warn("[sign-in] OAuth error:", err);
    } finally {
      setLoading(null);
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="light" />

      <Pressable
        style={styles.close}
        onPress={() => router.canGoBack() && router.back()}
        hitSlop={12}
        accessibilityLabel="Close"
      >
        <FaIcon name="times" size={20} color={colors.textMuted} />
      </Pressable>

      <View style={styles.content}>
        <Text style={styles.title}>Sign in to Cockpit</Text>
        <Text style={styles.subtitle}>
          Sign in to track flights and receive alerts.
        </Text>

        <View style={styles.buttons}>
          {PROVIDERS.map(({ id, label }) => (
            <Pressable
              key={id}
              style={({ pressed }) => [
                styles.btn,
                pressed && styles.btnPressed,
                loading === id && styles.btnLoading,
              ]}
              onPress={() => void handleSignIn(id)}
              disabled={loading !== null}
              accessibilityRole="button"
              accessibilityLabel={label}
            >
              {loading === id ? (
                <ActivityIndicator color={colors.text} size="small" />
              ) : (
                <Text style={styles.btnLabel}>{label}</Text>
              )}
            </Pressable>
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  close: {
    position: "absolute",
    top: spacing.xl + spacing.lg,
    right: spacing.xl,
    zIndex: 10,
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    justifyContent: "center",
    gap: spacing.md,
  },
  title: {
    ...typography.title,
    fontSize: 28,
    fontWeight: "800",
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...typography.body,
    color: colors.textMuted,
    lineHeight: 20,
    marginBottom: spacing.xl,
  },
  buttons: {
    gap: spacing.md,
  },
  btn: {
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  btnPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.98 }],
  },
  btnLoading: {
    opacity: 0.7,
  },
  btnLabel: {
    ...typography.subtitle,
    fontWeight: "600",
  },
});
