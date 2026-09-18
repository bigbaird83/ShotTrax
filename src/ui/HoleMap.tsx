import { Component, type ErrorInfo, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import MapView, { Marker, Polygon, Polyline } from 'react-native-maps';
import type { OsmFeature, OsmGolfKind, OsmOverlay } from '@/src/course/types';
import { featuresForHole, resolveOverlayTee } from '@/src/course/osmOverlay';
import type { GpsFix, Shot } from '@/src/domain/types';
import type { YardsToGreenResult } from '@/src/sensing/yardsToGreen';
import {
  applyHoleMapCamera,
  holeCameraFramedAfterApply,
  holeCameraHeading,
  holeFrameRegion,
  holeMapShowsUserLocation,
  holeNativeCamera,
  regionIsHoleFrame,
} from '@/src/domain/holeCamera';
import { planDragShotLines } from '@/src/domain/placeToDrag';
import { COPY, showWaitingOnLocationLine } from '@/src/domain/playerCopy';
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
  /** Tee or last landing. Never a house tap, phone, or puck. */
  lineFrom?: { lat: number; lng: number } | null;
  /** Course green center only. Never a tree pin or puck. */
  lineGreen?: { lat: number; lng: number } | null;
  onPlaceToDrag?: (coord: { lat: number; lng: number }) => void;
  /** To pin is live: one finger moves the pin. Two fingers pan and pinch. */
  freezePan?: boolean;
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
  /** Parent hides the dock until the hole — not the house — is on screen. */
  onFrameReady?: (ready: boolean) => void;
  /** Play may show a phone pin. Add shot never does. */
  showPhonePin?: boolean;
  /** Play / edit may reveal Legal and compass after a tap. Add shot never does. */
  allowMapsChrome?: boolean;
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
  hideYardsOverlay,
}: {
  holeNumber: number;
  yardsToGreen?: YardsToGreenResult;
  hasFix?: boolean;
  hasGreen?: boolean;
  hideYardsOverlay?: boolean;
}) {
  const yardsOnCard = Boolean(yardsToGreen && yardsToGreen.yards != null && Number.isFinite(yardsToGreen.yards));
  const waiting = showWaitingOnLocationLine({
    yards: yardsToGreen?.yards ?? null,
    quality: yardsToGreen?.quality,
    hasFix,
    hasGreen,
  });
  return (
    <View style={styles.fallback}>
      <Text style={styles.holeBadgeText}>Hole {holeNumber}</Text>
      {yardsToGreen && !hideYardsOverlay ? (
        <YardsToGreenBadge result={yardsToGreen} hasFix={hasFix} hasGreen={hasGreen} />
      ) : null}
      {!hideYardsOverlay && !yardsOnCard && waiting ? (
        <Text style={styles.fallbackMsg}>{COPY.waitingOnLocation}</Text>
      ) : null}
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
  lineFrom,
  lineGreen,
  onPlaceToDrag,
  freezePan,
  placeHint,
  fullBleed,
  style,
  framePoints,
  lockFrame,
  heading,
  frameEpoch,
  hideYardsOverlay,
  onFrameReady,
  showPhonePin,
  allowMapsChrome = true,
}: Props) {
  const mapRef = useRef<MapView | null>(null);
  const framedOnce = useRef(false);
  const pendingLocked = useRef(false);
  const [holeCameraReady, setHoleCameraReady] = useState(false);
  const [mapsChrome, setMapsChrome] = useState(false);
  const panStart = useRef<{ x: number; y: number } | null>(null);
  const toPinLive = Boolean(freezePan || onPlaceToDrag);
  const [mapOwnsGesture, setMapOwnsGesture] = useState(false);

  const revealMapsChrome = () => {
    if (allowMapsChrome) setMapsChrome(true);
  };

  const movedRef = useRef(false);

  const coordFromTouch = (event: GestureResponderEvent, kind: 'drag' | 'tap') => {
    const map = mapRef.current as
      | (MapView & {
          coordinateForPoint?: (point: { x: number; y: number }) => Promise<{
            latitude: number;
            longitude: number;
          }>;
        })
      | null;
    if (!map || typeof map.coordinateForPoint !== 'function') return;
    void map
      .coordinateForPoint({ x: event.nativeEvent.locationX, y: event.nativeEvent.locationY })
      .then((point) => {
        if (!point) return;
        const next = { lat: point.latitude, lng: point.longitude };
        if (!isValidLatLng(next)) return;
        if (kind === 'tap') {
          revealMapsChrome();
          onPlacePoint?.(next);
          return;
        }
        onPlaceToDrag?.(next);
      })
      .catch(() => undefined);
  };

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
    if (!lockFrame) return [];
    const fromParent = (framePoints ?? [])
      .map((point) => ({ lat: point.latitude, lng: point.longitude }))
      .filter((point) => isValidLatLng(point));
    if (fromParent.length >= 2) return fromParent;
    const overlayTee = resolveOverlayTee(osmOverlay ?? null, holeNumber, green);
    if (isValidLatLng(overlayTee) && isValidLatLng(green)) return [overlayTee, green];
    return fromParent;
  }, [lockFrame, framePoints, osmOverlay, holeNumber, green]);

  const holeUpCamera = useMemo(() => {
    const cameraHeading =
      heading != null && Number.isFinite(heading)
        ? heading
        : lockedPoints.length >= 2
          ? holeCameraHeading(lockedPoints[0], lockedPoints[1])
          : null;
    if (cameraHeading == null || lockedPoints.length === 0) return null;
    return holeNativeCamera(lockedPoints, cameraHeading);
  }, [lockedPoints, heading]);

  const lockedRegion = useMemo(() => {
    if (lockedPoints.length > 0) return holeFrameRegion(lockedPoints);
    // Lock-frame maps use tee + green only. Do not zoom a lone pin or the phone.
    return null;
  }, [lockedPoints]);

  const dragLines = useMemo(() => {
    if (!onPlaceToDrag || !placedTo) return { shot: null, toGreen: null };
    return planDragShotLines({
      from: lineFrom ?? null,
      drag: placedTo,
      green: lineGreen ?? null,
    });
  }, [onPlaceToDrag, lineFrom, lineGreen, placedTo]);

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
    if (framed) {
      framedOnce.current = true;
      pendingLocked.current = false;
      setHoleCameraReady(true);
    }
    return framed;
  };

  useEffect(() => {
    framedOnce.current = false;
    pendingLocked.current = true;
    if (lockFrame) setHoleCameraReady(false);
  }, [lockFrame, lockKey, heading, frameEpoch]);

  useEffect(() => {
    onFrameReady?.(lockFrame ? holeCameraReady : true);
  }, [lockFrame, holeCameraReady, onFrameReady]);

  useEffect(() => {
    if (!toPinLive) setMapOwnsGesture(false);
  }, [toPinLive]);

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
    if (framedOnce.current) {
      if (regionIsHoleFrame(region, holeCenterRef.current)) setHoleCameraReady(true);
      return;
    }
    if (regionIsHoleFrame(region, holeCenterRef.current)) {
      framedOnce.current = true;
      pendingLocked.current = false;
      setHoleCameraReady(true);
      return;
    }
    // Pin drag and two-finger pan must not move the camera. GPS neither.
    if (toPinLive) return;
    // Opening house / default GPS is not framed. A null ref is not success.
    markFramedIfLive(frameLockedMap());
  };

  if (!lockedRegion) {
    return (
      <TrailFallback
        holeNumber={holeNumber}
        yardsToGreen={yardsToGreen}
        hasFix={Boolean(userFix)}
        hasGreen={Boolean(green)}
        hideYardsOverlay={hideYardsOverlay}
      />
    );
  }

  const userDot =
    userFix && isValidLatLng({ lat: userFix.lat, lng: userFix.lng })
      ? toCoord(userFix.lat, userFix.lng)
      : null;

  const lockedCameraProps = holeUpCamera
    ? { initialCamera: holeUpCamera }
    : { initialRegion: lockedRegion };

  return (
    <View
      style={[fullBleed ? styles.bleed : styles.wrap, style]}
      onLayout={onMapLayout}
      pointerEvents={lockFrame && !holeCameraReady ? 'none' : 'auto'}
      onTouchStart={(event) => {
        if (event.nativeEvent.touches.length >= 2) setMapOwnsGesture(true);
      }}
      onTouchEnd={(event) => {
        if (event.nativeEvent.touches.length === 0) setMapOwnsGesture(false);
      }}
      onTouchCancel={() => setMapOwnsGesture(false)}>
      <MapView
        ref={mapRef}
        style={[styles.map, lockFrame && !holeCameraReady ? styles.mapHidden : null]}
        mapType="satellite"
        {...(lockFrame
          ? lockedCameraProps
          : holeUpCamera
            ? { initialCamera: holeUpCamera }
            : { initialRegion: lockedRegion })}
        showsUserLocation={
          allowMapsChrome ? Boolean(showPhonePin) && holeMapShowsUserLocation(Boolean(lockFrame)) : false
        }
        showsMyLocationButton={false}
        followsUserLocation={false}
        showsCompass={allowMapsChrome && mapsChrome}
        legalLabelInsets={
          allowMapsChrome && mapsChrome
            ? undefined
            : { top: -120, right: -120, bottom: -280, left: -120 }
        }
        zoomEnabled
        zoomTapEnabled
        scrollEnabled={mapOwnsGesture || !toPinLive}
        pitchEnabled={false}
        rotateEnabled={false}
        moveOnMarkerPress={false}
        onPanDrag={(event) => {
          if (!onPlaceToDrag || mapOwnsGesture) return;
          const { latitude, longitude } = event.nativeEvent.coordinate;
          onPlaceToDrag({ lat: latitude, lng: longitude });
        }}
        onMapReady={() => {
          if (!lockFrame) return;
          if (framedOnce.current) return;
          markFramedIfLive(frameLockedMap());
        }}
        onRegionChangeComplete={onRegionSettled}
        onPress={(event) => {
          revealMapsChrome();
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
        {(lineFrom ?? (onPlaceToDrag ? null : placedFrom)) ? (
          <Marker
            coordinate={toCoord((lineFrom ?? placedFrom)!.lat, (lineFrom ?? placedFrom)!.lng)}
            pinColor="tomato"
            tappable={false}
            tracksViewChanges={false}
          />
        ) : null}
        {placedTo ? (
          <Marker
            coordinate={toCoord(placedTo.lat, placedTo.lng)}
            pinColor="green"
            tappable={false}
            tracksViewChanges={false}
            draggable={Boolean(onPlaceToDrag) && !mapOwnsGesture}
            onDrag={(event) => {
              if (!onPlaceToDrag || mapOwnsGesture) return;
              const { latitude, longitude } = event.nativeEvent.coordinate;
              onPlaceToDrag({ lat: latitude, lng: longitude });
            }}
            onDragEnd={(event) => {
              if (!onPlaceToDrag || mapOwnsGesture) return;
              const { latitude, longitude } = event.nativeEvent.coordinate;
              onPlaceToDrag({ lat: latitude, lng: longitude });
            }}
          />
        ) : null}
        {(lineGreen ?? (onPlaceToDrag ? null : green)) ? (
          <Marker
            coordinate={toCoord((lineGreen ?? green)!.lat, (lineGreen ?? green)!.lng)}
            pinColor="green"
            tappable={false}
            tracksViewChanges={false}
          />
        ) : null}
        {showPhonePin && userDot ? (
          <Marker
            coordinate={userDot}
            anchor={{ x: 0.5, y: 0.5 }}
            tappable={false}
            tracksViewChanges={false}
          >
            <View pointerEvents="none" style={styles.userDot} />
          </Marker>
        ) : null}
        {dragLines.shot ? (
          <Polyline
            coordinates={[
              toCoord(dragLines.shot.from.lat, dragLines.shot.from.lng),
              toCoord(dragLines.shot.to.lat, dragLines.shot.to.lng),
            ]}
            strokeColor={colors.cream}
            strokeWidth={3}
            lineDashPattern={[8, 6]}
          />
        ) : null}
        {dragLines.toGreen ? (
          <Polyline
            coordinates={[
              toCoord(dragLines.toGreen.from.lat, dragLines.toGreen.from.lng),
              toCoord(dragLines.toGreen.to.lat, dragLines.toGreen.to.lng),
            ]}
            strokeColor={colors.lime}
            strokeWidth={3}
            lineDashPattern={[8, 6]}
          />
        ) : null}
        {dragLines.shot ? (
          <Marker
            coordinate={toCoord(dragLines.shot.mid.lat, dragLines.shot.mid.lng)}
            anchor={{ x: 0.5, y: 0.5 }}
            tappable={false}
            tracksViewChanges>
            <View pointerEvents="none" style={styles.lineChip}>
              <Text style={styles.lineChipValue}>{dragLines.shot.label}</Text>
            </View>
          </Marker>
        ) : null}
        {dragLines.toGreen ? (
          <Marker
            coordinate={toCoord(dragLines.toGreen.mid.lat, dragLines.toGreen.mid.lng)}
            anchor={{ x: 0.5, y: 0.5 }}
            tappable={false}
            tracksViewChanges>
            <View pointerEvents="none" style={[styles.lineChip, styles.lineChipGreen]}>
              <Text style={styles.lineChipValue}>{dragLines.toGreen.label}</Text>
            </View>
          </Marker>
        ) : null}
      </MapView>
      {toPinLive ? (
        <View
          testID="to-pin-drag-layer"
          style={styles.dragLayer}
          pointerEvents={mapOwnsGesture ? 'none' : 'auto'}
          onStartShouldSetResponder={(event) => {
            if (event.nativeEvent.touches.length !== 1) return false;
            panStart.current = { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY };
            movedRef.current = false;
            return true;
          }}
          onMoveShouldSetResponder={(event) => event.nativeEvent.touches.length === 1}
          onResponderTerminationRequest={() => true}
          onResponderMove={(event) => {
            if (event.nativeEvent.touches.length !== 1) {
              setMapOwnsGesture(true);
              return;
            }
            if (!panStart.current) return;
            const dx = event.nativeEvent.pageX - panStart.current.x;
            const dy = event.nativeEvent.pageY - panStart.current.y;
            if (dx * dx + dy * dy <= 36) return;
            movedRef.current = true;
            coordFromTouch(event, 'drag');
          }}
          onResponderRelease={(event) => {
            coordFromTouch(event, movedRef.current ? 'drag' : 'tap');
            panStart.current = null;
            movedRef.current = false;
          }}
        />
      ) : null}
      {lockFrame && !holeCameraReady ? <View pointerEvents="none" style={styles.mapCover} /> : null}
      {!allowMapsChrome ? <View pointerEvents="none" style={styles.legalCover} /> : null}
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
      hideYardsOverlay={props.hideYardsOverlay}
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
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: colors.bgElevated,
  },
  dragLayer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  lineChip: {
    backgroundColor: 'rgba(11,26,18,0.88)',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignItems: 'center',
  },
  lineChipGreen: { borderWidth: 1, borderColor: colors.lime },
  lineChipValue: { color: colors.cream, fontSize: 14, fontWeight: '900' },
  legalCover: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    width: 168,
    height: 56,
    backgroundColor: colors.bgElevated,
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
  userDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#2F80FF',
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
});
