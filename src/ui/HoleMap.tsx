import { Component, type ErrorInfo, type ReactNode, useEffect, useMemo, useRef } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import type { GpsFix, Shot } from '@/src/domain/types';
import { colors } from './theme';

type Coord = { latitude: number; longitude: number };

type Props = {
  holeNumber: number;
  shots: Shot[];
  userFix: GpsFix | null;
  green: { lat: number; lng: number } | null;
  onDropGreenEstimate?: (coord: { lat: number; lng: number }) => void;
};

class MapGuard extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }
  componentDidCatch(_error: Error, _info: ErrorInfo): void {}
  render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function toCoord(lat: number, lng: number): Coord {
  return { latitude: lat, longitude: lng };
}

function TrailFallback({
  holeNumber,
  shots,
  message,
}: {
  holeNumber: number;
  shots: Shot[];
  message: string;
}) {
  const closed = shots.filter((s) => s.endLat != null && s.endLng != null);
  return (
    <View style={styles.fallback}>
      <Text style={styles.holeBadgeText}>HOLE {holeNumber}</Text>
      <Text style={styles.fallbackMsg}>{message}</Text>
      {closed.length === 0 ? (
        <Text style={styles.meta}>No closed-shot trails yet.</Text>
      ) : (
        closed.map((shot) => (
          <Text key={shot.id} style={styles.meta}>
            {shot.seq}: {shot.startLat.toFixed(5)}, {shot.startLng.toFixed(5)} → {shot.endLat?.toFixed(5)},{' '}
            {shot.endLng?.toFixed(5)}
          </Text>
        ))
      )}
    </View>
  );
}

function NativeHoleMap({ holeNumber, shots, userFix, green, onDropGreenEstimate }: Props) {
  const mapRef = useRef<MapView | null>(null);

  const closed = useMemo(
    () => shots.filter((s) => s.endLat != null && s.endLng != null && s.endedAt != null),
    [shots],
  );

  const coords = useMemo(() => {
    const out: Coord[] = [];
    for (const shot of shots) {
      out.push(toCoord(shot.startLat, shot.startLng));
      if (shot.endLat != null && shot.endLng != null) {
        out.push(toCoord(shot.endLat, shot.endLng));
      }
    }
    if (green) out.push(toCoord(green.lat, green.lng));
    if (userFix) out.push(toCoord(userFix.lat, userFix.lng));
    return out;
  }, [shots, green, userFix]);

  const region = useMemo(() => {
    const c = coords[0] ?? (userFix ? toCoord(userFix.lat, userFix.lng) : null);
    if (!c) return null;
    return {
      latitude: c.latitude,
      longitude: c.longitude,
      latitudeDelta: 0.004,
      longitudeDelta: 0.004,
    };
  }, [coords, userFix]);

  useEffect(() => {
    if (coords.length < 2) return;
    mapRef.current?.fitToCoordinates(coords, {
      edgePadding: { top: 48, right: 36, bottom: 36, left: 36 },
      animated: true,
    });
  }, [coords]);

  if (!region) {
    return (
      <TrailFallback
        holeNumber={holeNumber}
        shots={shots}
        message="Waiting for a real GPS fix to center the map. ShotTrax does not invent coordinates."
      />
    );
  }

  return (
    <View style={styles.wrap}>
      <MapView
        ref={mapRef}
        style={styles.map}
        mapType="satellite"
        initialRegion={region}
        showsUserLocation={Boolean(userFix)}
        showsMyLocationButton={false}
        rotateEnabled={false}
        pitchEnabled={false}
        onLongPress={(event) => {
          const { latitude, longitude } = event.nativeEvent.coordinate;
          onDropGreenEstimate?.({ lat: latitude, lng: longitude });
        }}>
        {closed.map((shot, index) => (
          <Polyline
            key={shot.id}
            coordinates={[
              toCoord(shot.startLat, shot.startLng),
              toCoord(shot.endLat as number, shot.endLng as number),
            ]}
            strokeColor={index === closed.length - 1 ? colors.lime : '#F4F1E8'}
            strokeWidth={index === closed.length - 1 ? 5 : 3}
          />
        ))}
        {shots.map((shot) => (
          <Marker
            key={`start-${shot.id}`}
            coordinate={toCoord(shot.startLat, shot.startLng)}
            title={`Shot ${shot.seq}`}
            description={shot.endedAt ? `${shot.distanceYards ?? '—'} yd` : 'Open'}
            pinColor={shot.endedAt ? 'tomato' : 'yellow'}
            anchor={{ x: 0.5, y: 1 }}
          />
        ))}
        {green ? (
          <Marker
            coordinate={toCoord(green.lat, green.lng)}
            title="Green estimate"
            description="User pin — not a licensed course green"
            pinColor="green"
          />
        ) : null}
      </MapView>
      <View pointerEvents="none" style={styles.holeBadge}>
        <Text style={styles.holeBadgeKicker}>SCORECARD</Text>
        <Text style={styles.holeBadgeText}>HOLE {holeNumber}</Text>
      </View>
      <Text style={styles.hint}>
        Closed-shot trails only. Long-press to drop a green estimate. No course polygons.
      </Text>
    </View>
  );
}

export function HoleMap(props: Props) {
  const fallback = (
    <TrailFallback
      holeNumber={props.holeNumber}
      shots={props.shots}
      message={
        Platform.OS === 'web'
          ? 'Satellite map is iOS/Android (react-native-maps). Trails still list closed shots.'
          : 'Map native module unavailable. Use a development build, or Expo Go on a device. Trails list closed shots below.'
      }
    />
  );

  if (Platform.OS === 'web') return fallback;

  return (
    <MapGuard fallback={fallback}>
      <NativeHoleMap {...props} />
    </MapGuard>
  );
}

const styles = StyleSheet.create({
  wrap: {
    height: 236,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.bgElevated,
  },
  map: { flex: 1 },
  holeBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: 'rgba(11,26,18,0.82)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  holeBadgeKicker: {
    color: colors.lime,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  holeBadgeText: {
    color: colors.cream,
    fontSize: 18,
    fontWeight: '900',
  },
  hint: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(11,26,18,0.78)',
    color: colors.cream,
    fontSize: 11,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  fallback: {
    minHeight: 160,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.bgElevated,
    padding: 12,
    gap: 6,
  },
  fallbackMsg: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  meta: { color: colors.cream, fontSize: 13 },
});
