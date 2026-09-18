import { Component, type ErrorInfo, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import MapView, { Marker, Polygon, Polyline } from 'react-native-maps';
import type { OsmFeature, OsmGolfKind, OsmOverlay } from '@/src/course/types';
import { featuresForHole } from '@/src/course/osmOverlay';
import type { GpsFix, Shot } from '@/src/domain/types';
import type { YardsToGreenResult } from '@/src/sensing/yardsToGreen';
import {
  applyHoleMapCamera,
  holeCameraFramedAfterApply,
  holeFrameRegion,
  holeMapShowsUserLocation,
  holeNativeCamera,
  regionIsHoleFrame,
} from '@/src/domain/holeCamera';
import { planPlaceToDragPreview } from '@/src/domain/placeToDrag';
import { COPY } from '@/src/domain/playerCopy';
import { isValidLatLng } from '@/src/domain/latLng';
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
  onShotPress?: (shotId: string) => void;
  placedFrom?: { lat: number; lng: number } | null;
  placedTo?: { lat: number; lng: number } | null;
  onPlaceToDrag?: (coord: { lat: number; lng: number }) => void;
  placeHint?: string | null;
  fullBleed?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Frame once to these points. Never includes the phone fix. */
  framePoints?: Coord[] | null;
  lockFrame?: boolean;
  /** Tee-to-green camera heading. Null = do not rotate. Does not rewrite pins. */
  heading?: number | null;
  /** Changes when Add shot takes the screen so the hole is framed again. */
  frameEpoch?: string;
  /** Play header already shows to-green. Keep the map badge for Add shot. */
  hideYardsOverlay?: boolean;
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
  onShotPress,
  placedFrom,
  placedTo,
  onPlaceToDrag,
  placeHint,
  fullBleed,
  style,
  framePoints,
  lockFrame,
  heading,
  frameEpoch,
  hideYardsOverlay,
}: Props) {
  const mapRef = useRef<MapView | null>(null);
  const framedOnce = useRef(false);
  const pendingLocked = useRef(false);
  const [holeCameraReady, setHoleCameraReady] = useState(false);

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
    if (placedFrom) out.push(toCoord(placedFrom.lat, placedFrom.lng));
    if (placedTo) out.push(toCoord(placedTo.lat, placedTo.lng));
    for (const feature of osmFeatures) {
      for (const point of feature.coordinates) {
        out.push(toCoord(point.lat, point.lng));
      }
    }
    return out;
  }, [shots, green, osmFeatures, placedFrom, placedTo]);

  const lockedPoints = useMemo(() => {
    if (!lockFrame || !framePoints || framePoints.length === 0) return [];
    return framePoints
      .map((point) => ({ lat: point.latitude, lng: point.longitude }))
      .filter((point) => isValidLatLng(point));
  }, [lockFrame, framePoints]);

  const holeUpCamera = useMemo(() => {
    if (heading == null || !Number.isFinite(heading) || lockedPoints.length === 0) return null;
    return holeNativeCamera(lockedPoints, heading);
  }, [lockedPoints, heading]);

  const lockedRegion = useMemo(() => {
    if (lockedPoints.length > 0) return holeFrameRegion(lockedPoints);
    // Lock frame with no hole points: do not invent a phone/house region.
    if (lockFrame) return null;
    const fallback = coords[0];
    if (!fallback) return null;
    return {
      latitude: fallback.latitude,
      longitude: fallback.longitude,
      latitudeDelta: 0.004,
      longitudeDelta: 0.004,
    };
  }, [lockedPoints, lockFrame, coords]);

  const dragPreview = useMemo(() => {
    if (!onPlaceToDrag || !placedFrom || !placedTo) return null;
    return planPlaceToDragPreview({
      from: placedFrom,
      drag: placedTo,
      green,
      phone: userFix,
    });
  }, [onPlaceToDrag, placedFrom, placedTo, green, userFix]);

  const lockedCameraRef = useRef(holeUpCamera);
  lockedCameraRef.current = holeUpCamera;
  const lockedRegionRef = useRef(lockedRegion);
  lockedRegionRef.current = lockedRegion;
  const holeCenter = useMemo(() => {
    if (holeUpCamera) {
      return { lat: holeUpCamera.center.latitude, lng: holeUpCamera.center.longitude };
    }
    if (lockedRegion) return { lat: lockedRegion.latitude, lng: lockedRegion.longitude };
    return null;
  }, [holeUpCamera, lockedRegion]);
  const holeCenterRef = useRef(holeCenter);
  holeCenterRef.current = holeCenter;

  const lockKey = lockFrame
    ? `${(framePoints ?? []).map((point) => `${point.latitude},${point.longitude}`).join('|')}|h:${heading ?? 'none'}|e:${frameEpoch ?? ''}`
    : '';

  const applyLockedCamera = () =>
    applyHoleMapCamera(mapRef.current, lockedCameraRef.current, lockedRegionRef.current);

  const frameLockedMap = () => {
    if (lockedPoints.length === 0 && !lockedRegion) return false;
    pendingLocked.current = true;
    return applyLockedCamera();
  };

  const markFramedIfLive = (applied: boolean) => {
    const framed = holeCameraFramedAfterApply(applied);
    if (framed) framedOnce.current = true;
    return framed;
  };

  useEffect(() => {
    framedOnce.current = false;
    pendingLocked.current = true;
    if (lockFrame) setHoleCameraReady(false);
  }, [lockFrame, lockKey, heading, frameEpoch]);

  useEffect(() => {
    if (lockFrame) {
      if (framedOnce.current) return;
      markFramedIfLive(frameLockedMap());
      return;
    }
    if (coords.length < 2) return;
    mapRef.current?.fitToCoordinates(coords, {
      edgePadding: { top: 72, right: 36, bottom: 48, left: 36 },
      animated: true,
    });
  }, [coords, framePoints, lockFrame, heading, holeUpCamera, lockedRegion, frameEpoch]);

  const onMapLayout = (event: LayoutChangeEvent) => {
    if (!lockFrame) return;
    const { width, height } = event.nativeEvent.layout;
    if (width < 80 || height < 80) return;
    if (framedOnce.current) return;
    markFramedIfLive(frameLockedMap());
  };

  const onRegionSettled = (region: { latitude: number; longitude: number }) => {
    if (!lockFrame) return;
    if (regionIsHoleFrame(region, holeCenterRef.current)) {
      framedOnce.current = true;
      pendingLocked.current = false;
      setHoleCameraReady(true);
      return;
    }
    // House / default GPS region is not framed. Do not stick. Re-apply the hole.
    framedOnce.current = false;
    pendingLocked.current = true;
    markFramedIfLive(frameLockedMap());
  };

  if (!lockedRegion) {
    return (
      <TrailFallback
        holeNumber={holeNumber}
        yardsToGreen={yardsToGreen}
        hasFix={Boolean(userFix)}
        hasGreen={Boolean(green)}
      />
    );
  }

  const userDot =
    userFix && isValidLatLng({ lat: userFix.lat, lng: userFix.lng })
      ? toCoord(userFix.lat, userFix.lng)
      : null;

  const lockedCameraProps = holeUpCamera
    ? holeCameraReady
      ? { initialCamera: holeUpCamera }
      : { camera: holeUpCamera }
    : holeCameraReady
      ? { initialRegion: lockedRegion }
      : { region: lockedRegion };

  return (
    <View
      style={[fullBleed ? styles.bleed : styles.wrap, style]}
      onLayout={onMapLayout}
      pointerEvents={lockFrame && !holeCameraReady ? 'none' : 'auto'}>
      <MapView
        ref={mapRef}
        style={[styles.map, lockFrame && !holeCameraReady ? styles.mapHidden : null]}
        mapType="satellite"
        {...(lockFrame
          ? lockedCameraProps
          : holeUpCamera
            ? { initialCamera: holeUpCamera }
            : { initialRegion: lockedRegion })}
        showsUserLocation={holeMapShowsUserLocation(Boolean(lockFrame))}
        showsMyLocationButton={false}
        followsUserLocation={false}
        zoomEnabled
        scrollEnabled
        pitchEnabled={false}
        rotateEnabled={false}
        onMapReady={() => {
          if (!lockFrame) return;
          if (framedOnce.current) {
            applyLockedCamera();
            return;
          }
          markFramedIfLive(frameLockedMap());
        }}
        onRegionChangeComplete={onRegionSettled}
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
            onPress={() => onShotPress?.(shot.id)}
          />
        ))}
        {closed.map((shot) => (
          <Marker
            key={`end-${shot.id}`}
            coordinate={toCoord(shot.endLat, shot.endLng)}
            title={`Shot ${shot.seq}`}
            description={`${shot.distanceYards ?? '—'} yd`}
            pinColor="green"
            anchor={{ x: 0.5, y: 1 }}
            onPress={() => onShotPress?.(shot.id)}
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
            draggable={Boolean(onPlaceToDrag)}
            onDrag={(event) => {
              if (!onPlaceToDrag) return;
              const { latitude, longitude } = event.nativeEvent.coordinate;
              onPlaceToDrag({ lat: latitude, lng: longitude });
            }}
            onDragEnd={(event) => {
              if (!onPlaceToDrag) return;
              const { latitude, longitude } = event.nativeEvent.coordinate;
              onPlaceToDrag({ lat: latitude, lng: longitude });
            }}
          />
        ) : null}
        {green ? (
          <Marker
            coordinate={toCoord(green.lat, green.lng)}
            title="Green"
            pinColor="green"
          />
        ) : null}
        {lockFrame && userDot ? (
          <Marker
            coordinate={userDot}
            anchor={{ x: 0.5, y: 0.5 }}
            tappable={false}
            tracksViewChanges={false}
          >
            <View pointerEvents="none" style={styles.userDot} />
          </Marker>
        ) : null}
        {dragPreview ? (
          <Marker
            coordinate={toCoord(dragPreview.shotAt.lat, dragPreview.shotAt.lng)}
            anchor={{ x: 0.5, y: 0.5 }}
            tappable={false}
            tracksViewChanges>
            <View pointerEvents="none" style={styles.dragChip}>
              <Text style={styles.dragChipKicker}>{COPY.shot}</Text>
              <Text style={styles.dragChipValue}>{dragPreview.shotLabel}</Text>
            </View>
          </Marker>
        ) : null}
        {dragPreview?.toGreenAt ? (
          <Marker
            coordinate={toCoord(dragPreview.toGreenAt.lat, dragPreview.toGreenAt.lng)}
            anchor={{ x: 0.5, y: 0.5 }}
            tappable={false}
            tracksViewChanges>
            <View pointerEvents="none" style={[styles.dragChip, styles.dragChipGreen]}>
              <Text style={styles.dragChipKicker}>{COPY.toGreen}</Text>
              <Text style={styles.dragChipValue}>{dragPreview.toGreenLabel}</Text>
            </View>
          </Marker>
        ) : null}
      </MapView>
      {lockFrame && !holeCameraReady ? <View pointerEvents="none" style={styles.mapCover} /> : null}
      {!placeHint && !hideYardsOverlay ? (
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
      ) : null}
      {!green && !placeHint ? <Text style={styles.hint}>{COPY.longPressGreen}</Text> : null}
      {placeHint ? <Text style={[styles.hint, styles.placeHint]}>{placeHint}</Text> : null}
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
  mapHidden: { opacity: 0 },
  mapCover: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.bgElevated,
  },
  dragChip: {
    backgroundColor: 'rgba(11,26,18,0.88)',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignItems: 'center',
  },
  dragChipGreen: { borderWidth: 1, borderColor: colors.lime },
  dragChipKicker: {
    color: colors.lime,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  dragChipValue: { color: colors.cream, fontSize: 14, fontWeight: '900' },
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
  placeHint: {
    fontSize: type.body,
    fontWeight: '800',
    paddingVertical: 12,
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
  userDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#2F80FF',
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
});
