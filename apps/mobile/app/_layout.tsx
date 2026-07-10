import { useEffect } from "react";
import { Stack } from "expo-router";
import { useFonts } from "expo-font";
import { StatusBar } from "expo-status-bar";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { Text, View } from "react-native";
import { FontAwesomeFont } from "../lib/vectorIcons";
import RoboFlex from "../assets/fonts/RobotoFlex.ttf";
import { colors } from "../constants/theme";
import { CONVEX_URL } from "../constants/config";
import { AppErrorBoundary } from "../components/AppErrorBoundary";

const hasConvexUrl = Boolean(CONVEX_URL && !CONVEX_URL.includes("placeholder"));

const convex = hasConvexUrl
  ? new ConvexReactClient(CONVEX_URL, { unsavedChangesWarning: false })
  : null;

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
      <ConvexProvider client={convex}>
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
        </Stack>
      </ConvexProvider>
    </AppErrorBoundary>
  );
}
