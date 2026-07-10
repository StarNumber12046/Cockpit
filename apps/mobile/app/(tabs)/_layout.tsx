import { Tabs } from "expo-router";
import { Text } from "react-native";
import { colors } from "../../constants/theme";
import { TabBarIcon, type TabBarIconName } from "../../components/TabBarIcon";

function TabLabel({ label, focused }: { label: string; focused: boolean }) {
  return (
    <Text
      style={{
        fontSize: 11,
        fontWeight: focused ? "700" : "500",
        color: focused ? colors.accent : colors.textDim,
      }}
    >
      {label}
    </Text>
  );
}

function makeIcon(name: TabBarIconName) {
  return function Icon({ focused }: { focused: boolean }) {
    return <TabBarIcon name={name} focused={focused} />;
  };
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.bgElevated },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: "600" },
        headerShadowVisible: false,
        tabBarStyle: {
          backgroundColor: colors.bgElevated,
          borderTopColor: colors.border,
        },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textDim,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Live",
          headerShown: false,
          tabBarLabel: ({ focused }) => (
            <TabLabel label="Live" focused={focused} />
          ),
          tabBarIcon: makeIcon("live"),
        }}
      />
      <Tabs.Screen
        name="alerts"
        options={{
          title: "Alerts",
          tabBarLabel: ({ focused }) => (
            <TabLabel label="Alerts" focused={focused} />
          ),
          tabBarIcon: makeIcon("alerts"),
        }}
      />
      <Tabs.Screen
        name="track"
        options={{
          title: "Track",
          tabBarLabel: ({ focused }) => (
            <TabLabel label="Track" focused={focused} />
          ),
          tabBarIcon: makeIcon("track"),
        }}
      />
    </Tabs>
  );
}
