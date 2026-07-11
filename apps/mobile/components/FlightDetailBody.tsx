import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Image,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useAction, useMutation, useQuery } from "convex/react";
import type { Fr24FlightDetails } from "@cockpit/fr24";
import type { Fr24Flight } from "@cockpit/fr24";
import {
  formatAltitude,
  formatTimestamp,
  keysFromFlight,
  parseFlightStartedAtMs,
  type CorrelationKeys,
} from "@cockpit/shared";
import { api } from "../lib/convex";
import {
  photoFromFr24Detail,
  resolveAircraftPhoto,
  type AircraftPhoto,
} from "../lib/media";
import { LoadingState } from "./LoadingState";
import { EmptyState } from "./EmptyState";
import { ErrorBanner } from "./ErrorBanner";
import { AcarsMessageCard } from "./AcarsMessageCard";
import { colors, radius, spacing, typography } from "../constants/theme";

type Props = {
  flight: Fr24Flight;
  detail: Fr24FlightDetails | null;
  detailLoading: boolean;
  detailError: string | null;
  onRefreshDetail?: () => void;
};

export function FlightDetailBody({
  flight,
  detail,
  detailLoading,
  detailError,
  onRefreshDetail,
}: Props) {
  const refreshAcars = useAction(api.acarsLive.refreshForFlight);
  const registerSession = useMutation(api.flightSessions.register);

  const keys: CorrelationKeys = useMemo(() => {
    return keysFromFlight({
      fr24Id: flight.fr24Id,
      icao24: flight.icao24 || detail?.aircraft?.hex || undefined,
      callsign:
        flight.callsign || detail?.identification?.callsign || undefined,
      flightNumber:
        flight.flightNumber ||
        detail?.identification?.number?.default ||
        undefined,
    });
  }, [detail, flight]);

  const queryArgs = useMemo(
    () => ({
      fr24Id: keys.fr24Id,
      icao24: keys.icao24,
      callsign: keys.callsign,
      flightNumber: keys.flightNumber,
    }),
    [keys],
  );

  const acars = useQuery(api.acars.listForFlight, queryArgs);

  const [acarsRefreshing, setAcarsRefreshing] = useState(false);
  const [acarsLiveError, setAcarsLiveError] = useState<string | null>(null);
  const [acarsLiveMeta, setAcarsLiveMeta] = useState<string | null>(null);
  const autoFetchKey = useRef<string | null>(null);

  const [aircraftPhoto, setAircraftPhoto] = useState<AircraftPhoto | null>(null);
  const [photoLoading, setPhotoLoading] = useState(false);
  const photoFetchKey = useRef<string | null>(null);

  const registration =
    detail?.aircraft?.registration || flight.registration || null;

  const canFetchAcars = Boolean(
    keys.icao24 || keys.callsign || keys.flightNumber,
  );

  const flightStartedAt = useMemo(
    () => (detail ? parseFlightStartedAtMs(detail) : undefined),
    [detail],
  );

  const sessionKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!keys.icao24 || flightStartedAt == null) return;
    const key = `${keys.icao24}|${keys.fr24Id ?? ""}|${flightStartedAt}`;
    if (sessionKeyRef.current === key) return;
    sessionKeyRef.current = key;
    void registerSession({
      icao24: keys.icao24,
      fr24Id: keys.fr24Id,
      flightStartedAt,
      callsign: keys.callsign,
      flightNumber: keys.flightNumber,
    });
  }, [
    flightStartedAt,
    keys.callsign,
    keys.flightNumber,
    keys.fr24Id,
    keys.icao24,
    registerSession,
  ]);

  const pullLiveAcars = useCallback(async () => {
    if (!canFetchAcars) return;
    setAcarsRefreshing(true);
    setAcarsLiveError(null);
    try {
      const result = await refreshAcars({
        fr24Id: keys.fr24Id,
        icao24: keys.icao24,
        callsign: keys.callsign,
        flightNumber: keys.flightNumber,
        limit: 40,
        flightStartedAt,
      });
      if (!result.ok) {
        setAcarsLiveError(result.error ?? "Live ACARS fetch failed");
        setAcarsLiveMeta(null);
      } else {
        setAcarsLiveMeta("");
      }
    } catch (err) {
      setAcarsLiveError(
        err instanceof Error ? err.message : "Live ACARS fetch failed",
      );
      setAcarsLiveMeta(null);
    } finally {
      setAcarsRefreshing(false);
    }
  }, [
    canFetchAcars,
    keys.callsign,
    keys.flightNumber,
    keys.fr24Id,
    keys.icao24,
    flightStartedAt,
    refreshAcars,
  ]);

  useEffect(() => {
    if (!canFetchAcars) return;
    const key = [
      keys.fr24Id ?? "",
      keys.icao24 ?? "",
      keys.callsign ?? "",
      keys.flightNumber ?? "",
    ].join("|");
    if (autoFetchKey.current === key) return;
    autoFetchKey.current = key;
    void pullLiveAcars();
  }, [canFetchAcars, keys, pullLiveAcars]);

  useEffect(() => {
    const cacheKey = `${keys.icao24 ?? ""}|${registration ?? ""}|${detail ? "1" : "0"}`;
    if (photoFetchKey.current === cacheKey) return;
    photoFetchKey.current = cacheKey;

    const fromDetail = photoFromFr24Detail(detail);
    if (fromDetail) {
      setAircraftPhoto(fromDetail);
      setPhotoLoading(false);
      return;
    }

    if (!keys.icao24 && !registration) {
      setAircraftPhoto(null);
      setPhotoLoading(false);
      return;
    }

    let cancelled = false;
    setAircraftPhoto(null);
    setPhotoLoading(true);
    void resolveAircraftPhoto({
      detail,
      icao24: keys.icao24,
      registration,
    }).then((photo) => {
      if (cancelled) return;
      setAircraftPhoto(photo);
      setPhotoLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [detail, keys.icao24, registration]);

  const trailLen = detail?.trail?.length ?? 0;

  return (
    <View style={styles.root}>
      {detailError ? (
        <ErrorBanner
          message={detailError}
          onRetry={onRefreshDetail ? () => void onRefreshDetail() : undefined}
        />
      ) : null}

      {detailLoading ? (
        <LoadingState label="Loading FR24 detail…" />
      ) : (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Live detail</Text>
          <View style={styles.card}>
            <Row
              label="Aircraft"
              value={
                detail?.aircraft?.model?.text ||
                detail?.aircraft?.model?.code ||
                flight.aircraftCode ||
                "—"
              }
            />
            <Row
              label="Registration"
              value={
                detail?.aircraft?.registration || flight.registration || "—"
              }
            />
            <Row label="Airline" value={detail?.airline?.name || "—"} />
            {detail?.trail?.[detail.trail.length - 1] ? (
              <>
                <Row
                  label="Altitude"
                  value={formatAltitude(detail.trail[0]?.alt)}
                />
              </>
            ) : null}
          </View>
        </View>
      )}

      {photoLoading && !aircraftPhoto ? (
        <View style={styles.photoSkeleton} accessibilityLabel="Loading aircraft photo" />
      ) : aircraftPhoto ? (
        <AircraftPhotoCard photo={aircraftPhoto} />
      ) : null}

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>ACARS</Text>
          <Pressable
            style={[
              styles.refreshBtn,
              (!canFetchAcars || acarsRefreshing) && styles.refreshBtnDisabled,
            ]}
            disabled={!canFetchAcars || acarsRefreshing}
            onPress={() => void pullLiveAcars()}
          >
            <Text style={styles.refreshBtnText}>
              {acarsRefreshing ? "Fetching…" : "Refresh live"}
            </Text>
          </Pressable>
        </View>
        {acarsLiveError ? (
          <View style={styles.acarsError}>
            <Text style={styles.acarsErrorText}>{acarsLiveError}</Text>
            <Pressable onPress={() => void pullLiveAcars()} hitSlop={8}>
              <Text style={styles.refreshBtnText}>Retry</Text>
            </Pressable>
          </View>
        ) : null}
        {acarsLiveMeta ? (
          <Text style={styles.liveMeta}>{acarsLiveMeta}</Text>
        ) : null}
        {acars === undefined ||
        (acarsRefreshing && (acars?.length ?? 0) === 0) ? (
          <LoadingState label="Loading ACARS…" />
        ) : acars.length === 0 ? (
          <EmptyState
            title="No ACARS for this identity"
            message={
              canFetchAcars
                ? "No stored or recent Airframes messages. Try Refresh live, or open a busier airframe."
                : "Need ICAO24 / callsign / flight number to search live ACARS."
            }
          />
        ) : (
          acars.map((msg: (typeof acars)[number]) => (
            <AcarsMessageCard key={msg._id} message={msg} />
          ))
        )}
      </View>
    </View>
  );
}

function AircraftPhotoCard({ photo }: { photo: AircraftPhoto }) {
  const [failed, setFailed] = useState(false);

  if (failed) return null;

  const credit = photo.photographer ? `© ${photo.photographer}` : null;

  return (
    <View style={styles.photoWrap}>
      <Image
        source={{ uri: photo.uri }}
        style={styles.photo}
        resizeMode="cover"
        onError={() => setFailed(true)}
        accessibilityLabel="Aircraft photo"
      />
      {credit ? (
        photo.link ? (
          <Pressable
            onPress={() => void Linking.openURL(photo.link!)}
            hitSlop={6}
          >
            <Text style={styles.photoCredit} numberOfLines={1}>
              {credit}
            </Text>
          </Pressable>
        ) : (
          <Text style={styles.photoCredit} numberOfLines={1}>
            {credit}
          </Text>
        )
      ) : null}
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.kv}>
      <Text style={styles.k}>{label}</Text>
      <Text style={styles.v}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.md,
    paddingTop: spacing.sm,
  },
  section: {
    gap: spacing.sm,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  sectionTitle: {
    ...typography.caption,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    color: colors.textDim,
  },
  refreshBtn: {
    backgroundColor: colors.accentSoft,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  refreshBtnDisabled: {
    opacity: 0.5,
  },
  refreshBtnText: {
    ...typography.caption,
    color: colors.highlight,
    fontWeight: "600",
  },
  liveMeta: {
    ...typography.caption,
    color: colors.success,
  },
  acarsHint: {
    ...typography.caption,
    color: colors.textDim,
  },
  acarsError: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.dangerSoft,
    borderColor: colors.danger,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  acarsErrorText: {
    ...typography.caption,
    color: colors.danger,
    flex: 1,
  },
  photoWrap: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    backgroundColor: colors.bgCard,
    gap: spacing.xs,
  },
  photo: {
    width: "100%",
    aspectRatio: 16 / 9,
    backgroundColor: colors.bgCard,
  },
  photoSkeleton: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgCard,
  },
  photoCredit: {
    ...typography.caption,
    color: colors.textDim,
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
  },
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  kv: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  k: {
    ...typography.caption,
  },
  v: {
    fontSize: typography.mono.fontSize,
    fontWeight: typography.mono.fontWeight,
    color: colors.text,
    fontVariant: typography.mono.fontVariant,
    flexShrink: 1,
    textAlign: "right",
  },
});
