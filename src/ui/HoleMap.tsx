import { Component, type ErrorInfo, type ReactNode, useEffect, useMemo, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polygon, Polyline } from 'react-native-maps';
import type { OsmFeature, OsmGolfKind, OsmOverlay } from '@/src/course/types';
import { featuresForHole } from '@/src/course/osmOverlay';
import type { GpsFix, Shot } from '@/src/domain/types';
import type { YardsToGreenResult } from '@/src/sensing/yardsToGreen';
import { hasClosedGpsTrail, hasGpsStart } from '@/src/domain/shotSource';
import { YardsToGreenBadge } from './YardsToGreenBadge';
import { colors } from './theme';

type Coord = { latitude: number; longitude: number };

type Props = {
  holeNumber: number;
  shots: Shot[];
  userFix: GpsFix | null;
  green: { lat: number; lng: number } | null;
  yardsToGreen: YardsToGreenResult;
  /** Part 2 OSM polygons. Ignored while null — never invents an overlay. */
  osmOverlay?: OsmOverlay | null;
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

const OSM_DRAW_ORDER: OsmGolfKind[] = ['fairway', 'tee', 'green', 'hole'];

const OSM_STYLE: Record<OsmGolfKind, { fill?: string; stroke: string; width: number }> = {
  fairway: { fill: 'rgba(200, 245, 66, 0.16)', stroke: 'rgba(200, 245, 66, 0.75)', width: 1 },
  green: { fill: 'rgba(125, 207, 122, 0.42)', stroke: '#7DCF7A', width: 2 },
  tee: { fill: 'rgba(245, 197, 66, 0.38)', stroke: '#F5C542', width: 1 },
  hole: { stroke: '#F4F1E8', width: 2 },
};

function overlayFeatures(overlay: OsmOverlay | null | undefined, holeNumber: number): OsmFeature[] {
  if (!overlay) return [];
  const scoped = featuresForHole(overlay, holeNumber);
  return [...scoped].sort(
    (a, b) => OSM_DRAW_ORDER.indexOf(a.kind) - OSM_DRAW_ORDER.indexOf(b.kind),
  );
}

function TrailFallback({
  holeNumber,
  shots,
  message,
  yardsToGreen,
  hasFix,
  hasGreen,
}: {
  holeNumber: number;
  shots: Shot[];
  message: string;
  yardsToGreen?: YardsToGreenResult;
  hasFix?: boolean;
  hasGreen?: boolean;
}) {
  const closed = shots.filter(hasClosedGpsTrail);
  return (
    <View style={styles.fallback}>
      <Text style={styles.holeBadgeText}>HOLE {holeNumber}</Text>
      {yardsToGreen ? (
        <YardsToGreenBadge result={yardsToGreen} hasFix={hasFix} hasGreen={hasGreen} />
      ) : null}
      <Text style={styles.fallbackMsg}>{message}</Text>
      {closed.length === 0 ? (
        <Text style={styles.meta}>No closed-shot trails yet.</Text>
      ) : (
        closed.map((shot) => (
          <Text key={shot.id} style={styles.meta}>
            {shot.seq}: {shot.startLat.toFixed(5)}, {shot.startLng.toFixed(5)} → {shot.endLat.toFixed(5)},{' '}
            {shot.endLng.toFixed(5)}
          </Text>
        ))
      )}
    </View>
  );
}

function NativeHoleMap({
  holeNumber,
  shots,
  userFix,
  green,
  yardsToGreen,
  osmOverlay,
  onDropGreenEstimate,
}: Props) {
  const mapRef = useRef<MapView | null>(null);

  const closed = useMemo(() => shots.filter(hasClosedGpsTrail), [shots]);
  const osmFeatures = useMemo(
    () => overlayFeatures(osmOverlay ?? null, holeNumber),
    [osmOverlay, holeNumber],
  );

  const coords = useMemo(() => {
    const out: Coord[] = [];
    for (const shot of shots) {
      if (!hasGpsStart(shot)) continue;
      out.push(toCoord(shot.startLat, shot.startLng));
      if (shot.endLat != null && shot.endLng != null) {
        out.push(toCoord(shot.endLat, shot.endLng));
      }
    }
    if (green) out.push(toCoord(green.lat, green.lng));
    if (userFix) out.push(toCoord(userFix.lat, userFix.lng));
    for (const feature of osmFeatures) {
      for (const point of feature.coordinates) {
        out.push(toCoord(point.lat, point.lng));
      }
    }
    return out;
  }, [shots, green, userFix, osmFeatures]);

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
        yardsToGreen={yardsToGreen}
        hasFix={Boolean(userFix)}
        hasGreen={Boolean(green)}
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
        {osmFeatures.map((feature, index) => {
          const style = OSM_STYLE[feature.kind];
          const coordinates = feature.coordinates.map((point) => toCoord(point.lat, point.lng));
          if (feature.kind === 'hole') {
            return (
              <Polyline
                key={`osm-hole-${index}`}
                coordinates={coordinates}
                strokeColor={style.stroke}
                strokeWidth={style.width}
                lineDashPattern={[8, 6]}
              />
            );
          }
          return (
            <Polygon
              key={`osm-${feature.kind}-${index}`}
              coordinates={coordinates}
              fillColor={style.fill}
              strokeColor={style.stroke}
              strokeWidth={style.width}
            />
          );
        })}
        {closed.map((shot, index) => (
          <Polyline
            key={shot.id}
            coordinates={[
              toCoord(shot.startLat, shot.startLng),
              toCoord(shot.endLat, shot.endLng),
            ]}
            strokeColor={index === closed.length - 1 ? colors.lime : '#F4F1E8'}
            strokeWidth={index === closed.length - 1 ? 5 : 3}
          />
        ))}
        {shots.filter(hasGpsStart).map((shot) => (
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
            title="Green"
            description="GPS/map pin or course centroid — never invented"
            pinColor="green"
          />
        ) : null}
      </MapView>
      <View pointerEvents="none" style={styles.holeBadge}>
        <Text style={styles.holeBadgeKicker}>SCORECARD</Text>
        <Text style={styles.holeBadgeText}>HOLE {holeNumber}</Text>
      </View>
      <View pointerEvents="none" style={styles.toGreen}>
        <YardsToGreenBadge
          compact
          result={yardsToGreen}
          hasFix={Boolean(userFix)}
          hasGreen={Boolean(green)}
        />
      </View>
      <Text style={styles.hint}>
        {osmFeatures.length > 0
          ? 'OSM green/fairway/tee/hole where mapped. Long-press to drop a green pin. No invented polygons.'
          : 'Closed-shot trails only. Long-press to drop a green pin. OSM overlay is empty here — nothing invented.'}
      </Text>
    </View>
  );
}

export function HoleMap(props: Props) {
  const fallback = (
    <TrailFallback
      holeNumber={props.holeNumber}
      shots={props.shots}
      message="Map native module unavailable. Use a development build, or Expo Go on a device. Trails list closed shots below."
      yardsToGreen={props.yardsToGreen}
      hasFix={Boolean(props.userFix)}
      hasGreen={Boolean(props.green)}
    />
  );

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
  toGreen: {
    position: 'absolute',
    top: 10,
    right: 10,
    maxWidth: '58%',
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
