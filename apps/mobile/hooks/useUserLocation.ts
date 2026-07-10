import { useEffect, useState } from "react";
import { Platform } from "react-native";
import * as Location from "expo-location";

export type UserCoords = {
  latitude: number;
  longitude: number;
  /** Horizontal accuracy in meters when known. */
  accuracy: number | null;
};

export type UserLocationStatus =
  | "pending"
  | "granted"
  | "denied"
  | "error";

export type UseUserLocationResult = {
  status: UserLocationStatus;
  /** Permission granted; native maps can show the system blue dot. */
  permitted: boolean;
  /** First / latest fix for centering and web overlay. */
  coords: UserCoords | null;
};

function toCoords(pos: Location.LocationObject): UserCoords {
  return {
    latitude: pos.coords.latitude,
    longitude: pos.coords.longitude,
    accuracy: pos.coords.accuracy ?? null,
  };
}

/**
 * Request foreground location and resolve an initial fix.
 * Native MapView uses `showsUserLocation` once permitted (OS draws blue dot + accuracy).
 * Web keeps watching so we can draw a custom blue-dot overlay.
 */
export function useUserLocation(enabled = true): UseUserLocationResult {
  const [status, setStatus] = useState<UserLocationStatus>("pending");
  const [coords, setCoords] = useState<UserCoords | null>(null);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let sub: Location.LocationSubscription | null = null;
    let hadFix = false;

    const applyCoords = (pos: Location.LocationObject) => {
      if (cancelled) return;
      hadFix = true;
      setCoords(toCoords(pos));
    };

    const run = async () => {
      try {
        const { status: perm } =
          await Location.requestForegroundPermissionsAsync();
        if (cancelled) return;
        if (perm !== Location.PermissionStatus.GRANTED) {
          setStatus("denied");
          return;
        }
        setStatus("granted");

        // Last-known first so cold start can center without waiting on GPS.
        try {
          const last = await Location.getLastKnownPositionAsync();
          if (last) applyCoords(last);
        } catch {
          // ignore
        }

        try {
          const pos = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          applyCoords(pos);
        } catch (err) {
          console.warn("[cockpit] current position failed", err);
          if (!hadFix && !cancelled) setStatus("error");
        }

        if (Platform.OS === "web" && !cancelled) {
          sub = await Location.watchPositionAsync(
            {
              accuracy: Location.Accuracy.Balanced,
              distanceInterval: 5,
              timeInterval: 3_000,
            },
            applyCoords,
          );
        }
      } catch (err) {
        console.warn("[cockpit] location unavailable", err);
        if (!cancelled && !hadFix) setStatus("error");
      }
    };

    void run();

    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [enabled]);

  return {
    status,
    permitted: status === "granted",
    coords,
  };
}
