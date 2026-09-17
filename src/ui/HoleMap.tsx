import { Component, type ErrorInfo, type ReactNode, useEffect, useMemo, useRef } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import MapView, { Marker, Polygon, Polyline } from 'react-native-maps';
import type { OsmFeature, OsmGolfKind, OsmOverlay } from '@/src/course/types';
import { featuresForHole } from '@/src/course/osmOverlay';
import { COPY } from '@/src/domain/playerCopy';
import type { GpsFix, Shot } from '@/src/domain/types';
import type { YardsToGreenResult } from '@/src/sensing/yardsToGreen';
import { hasClosedGpsTrail, hasGpsStart } from '@/src/domain/shotSource';
import { FmbRow } from './FmbRow';
import { YardsToGreenBadge } from './YardsToGreenBadge';
import { colors, type } from './theme';

type Coord = { latitude: number; longitude: number };

type Props = {
  holeNumber: number;
  shots: Shot[];
  userFix: GpsFix | null;
  green: { lat: number; lng: number } | null;
  yardsToGreen: YardsToGreenResult;
  fmb?: { f: string; m: string; b: string } | null;
  osmOverlay?: OsmOverlay | null;
  onDropGreenEstimate?: (coord: { lat: number; lng: number }) => void;
  onPlacePoint?: (coord: { lat: number; lng: number }) => void;
  placedFrom?: { lat: number; lng: number } | null;
  placedTo?: { lat: number; lng: number } | null;
  placeHint?: string | null;
  fullBleed?: boolean;
  style?: StyleProp<ViewStyle>;
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
  fairway: { fill: 'transparent', stroke: 'rgba(200, 245, 66, 0.85)', width: 2 },
  green: { fill: 'transparent', stroke: '#7DCF7A', width: 3 },
  tee: { fill: 'transparent', stroke: '#F5C542', width: 2 },
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
  yardsToGreen,
  hasFix,
  hasGreen,
}: {
  holeNumber: number;
  yardsToGreen?: YardsToGreenResult;
  hasFix?: boolean;
  hasGreen?: boolean;
}) {
  return (
    <View style={styles.fallback}>
      <Text style={styles.holeBadgeText}>Hole {holeNumber}</Text>
      {yardsToGreen ? (
        <YardsToGreenBadge result={yardsToGreen} hasFix={hasFix} hasGreen={hasGreen} />
      ) : null}
      <Text style={styles.fallbackMsg}>{hasGreen ? COPY.waitingOnLocation : COPY.longPressGreen}</Text>
    </View>
  );
}

function NativeHoleMap({
  holeNumber,
  shots,
  userFix,
  green,
  yardsToGreen,
  fmb,
  osmOverlay,
  onDropGreenEstimate,
  onPlacePoint,
  placedFrom,
  placedTo,
  placeHint,
  fullBleed,
  style,
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
    if (placedFrom) out.push(toCoord(placedFrom.lat, placedFrom.lng));
    if (placedTo) out.push(toCoord(placedTo.lat, placedTo.lng));
    for (const feature of osmFeatures) {
      for (const point of feature.coordinates) {
        out.push(toCoord(point.lat, point.lng));
      }
    }
    return out;
  }, [shots, green, userFix, osmFeatures, placedFrom, placedTo]);

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
      edgePadding: { top: 72, right: 36, bottom: 48, left: 36 },
      animated: true,
    });
  }, [coords]);

  if (!region) {
    return (
      <TrailFallback
        holeNumber={holeNumber}
        yardsToGreen={yardsToGreen}
        hasFix={Boolean(userFix)}
        hasGreen={Boolean(green)}
      />
    );
  }

  return (
    <View style={[fullBleed ? styles.bleed : styles.wrap, style]}>
      <MapView
        ref={mapRef}
        style={styles.map}
        mapType="satellite"
        initialRegion={region}
        showsUserLocation={Boolean(userFix)}
        showsMyLocationButton={false}
        rotateEnabled={false}
        pitchEnabled={false}
        onPress={(event) => {
          if (!onPlacePoint) return;
          const { latitude, longitude } = event.nativeEvent.coordinate;
          onPlacePoint({ lat: latitude, lng: longitude });
        }}
        onLongPress={(event) => {
          const { latitude, longitude } = event.nativeEvent.coordinate;
          onDropGreenEstimate?.({ lat: latitude, lng: longitude });
        }}>
        {osmFeatures.map((feature, index) => {
          const styleOsm = OSM_STYLE[feature.kind];
          const coordinates = feature.coordinates.map((point) => toCoord(point.lat, point.lng));
          if (feature.kind === 'hole') {
            return (
              <Polyline
                key={`osm-hole-${index}`}
                coordinates={coordinates}
                strokeColor={styleOsm.stroke}
                strokeWidth={styleOsm.width}
                lineDashPattern={[8, 6]}
              />
            );
          }
          return (
            <Polygon
              key={`osm-${feature.kind}-${index}`}
              coordinates={coordinates}
              fillColor={styleOsm.fill}
              strokeColor={styleOsm.stroke}
              strokeWidth={styleOsm.width}
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
            description={shot.endedAt ? `${shot.distanceYards ?? '—'} yd` : 'In play'}
            pinColor={shot.endedAt ? 'tomato' : 'yellow'}
            anchor={{ x: 0.5, y: 1 }}
          />
        ))}
        {placedFrom ? (
          <Marker
            coordinate={toCoord(placedFrom.lat, placedFrom.lng)}
            title="From"
            pinColor="tomato"
          />
        ) : null}
        {placedTo ? (
          <Marker
            coordinate={toCoord(placedTo.lat, placedTo.lng)}
            title="Landed"
            pinColor="green"
          />
        ) : null}
        {green ? (
          <Marker
            coordinate={toCoord(green.lat, green.lng)}
            title="Green"
            pinColor="green"
          />
        ) : null}
      </MapView>
      <View pointerEvents="none" style={styles.toGreen}>
        <YardsToGreenBadge
          compact
          result={yardsToGreen}
          hasFix={Boolean(userFix)}
          hasGreen={Boolean(green)}
        />
        {fmb ? (
          <View style={{ marginTop: 6 }}>
            <FmbRow f={fmb.f} m={fmb.m} b={fmb.b} />
          </View>
        ) : null}
      </View>
      {!green && !placeHint ? <Text style={styles.hint}>{COPY.longPressGreen}</Text> : null}
      {placeHint ? <Text style={styles.hint}>{placeHint}</Text> : null}
    </View>
  );
}

export function HoleMap(props: Props) {
  const fallback = (
    <TrailFallback
      holeNumber={props.holeNumber}
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
  bleed: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: colors.bgElevated,
  },
  map: { flex: 1 },
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
    fontSize: type.tiny,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  fallback: {
    minHeight: 160,
    flex: 1,
    backgroundColor: colors.bgElevated,
    padding: 12,
    gap: 6,
    justifyContent: 'center',
  },
  fallbackMsg: { color: colors.muted, fontSize: type.meta, lineHeight: 20 },
});
