import { useEffect } from "react";
import { Stack } from "expo-router";
import { useFonts } from "expo-font";
import { StatusBar } from "expo-status-bar";
import { ConvexReactClient } from "convex/react";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { Platform, Text, View } from "react-native";
import { FontAwesomeFont } from "../lib/vectorIcons";
import RoboFlex from "../assets/fonts/RobotoFlex.ttf";
import { colors } from "../constants/theme";
import { CONVEX_URL } from "../constants/config";
import { AppErrorBoundary } from "../components/AppErrorBoundary";

// Safely load expo-secure-store.
// This native module is only present in development builds / EAS builds,
// not in plain `expo start` + Expo Go.
let secureStoreWarningShown = false;

function loadSecureStore() {
  if (Platform.OS === "web") return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require("expo-secure-store");
  } catch {
    if (!secureStoreWarningShown) {
      secureStoreWarningShown = true;
      console.warn(
        "[ConvexAuth] expo-secure-store native module not found.\n" +
          "Using in-memory storage (tokens won't survive app reload).\n" +
          "For persistent auth, use a development build:\n" +
          "  eas build --profile development --platform android"
      );
    }
    return null;
  }
}

const SecureStore = loadSecureStore();

function createInMemoryStorage() {
  const mem = new Map<string, string>();
  return {
    getItem: (key: string) => mem.get(key) ?? null,
    setItem: (key: string, value: string) => void mem.set(key, value),
    removeItem: (key: string) => void mem.delete(key),
  };
}

const hasConvexUrl = Boolean(CONVEX_URL && !CONVEX_URL.includes("placeholder"));

const convex = hasConvexUrl
  ? new ConvexReactClient(CONVEX_URL, { unsavedChangesWarning: false })
  : null;

// Always provide a storage implementation on native.
// - Real device / dev client → expo-secure-store (persistent, encrypted)
// - Plain expo start / Expo Go → in-memory fallback (session only)
const secureStorage =
  SecureStore != null
    ? {
        getItem: SecureStore.getItemAsync,
        setItem: SecureStore.setItemAsync,
        removeItem: SecureStore.deleteItemAsync,
      }
    : Platform.OS === "web"
      ? undefined
      : createInMemoryStorage();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    FontAwesome: FontAwesomeFont,
    RobotoFlex: RoboFlex,
  });

  useEffect(() => {
    // Confirms JS is running after Metro prints "Android Bundled".
    console.log("[cockpit] root layout mounted");
  }, []);

  if (!fontsLoaded) {
    return null;
  }

  if (!convex) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.bg,
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <StatusBar style="light" />
        <Text style={{ color: colors.text, fontSize: 18, fontWeight: "700", marginBottom: 8 }}>
          Convex URL missing
        </Text>
        <Text style={{ color: colors.textMuted, textAlign: "center", lineHeight: 20 }}>
          Run hosted setup:{"\n"}
          1. pnpm convex:login{"\n"}
          2. pnpm --filter @cockpit/backend setup{"\n"}
          3. pnpm sync:convex-url{"\n"}
          Then restart Expo.
        </Text>
      </View>
    );
  }

  return (
    <AppErrorBoundary>
      <ConvexAuthProvider client={convex} storage={secureStorage}>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.bgElevated },
            headerTintColor: colors.text,
            headerTitleStyle: { fontWeight: "600" },
            contentStyle: { backgroundColor: colors.bg },
            headerShadowVisible: false,
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="sign-in" options={{ headerShown: false, presentation: "modal" }} />
        </Stack>
      </ConvexAuthProvider>
    </AppErrorBoundary>
  );
}
