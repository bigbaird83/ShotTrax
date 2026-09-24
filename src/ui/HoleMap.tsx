import { router } from 'expo-router';
import { Component, type ErrorInfo, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import MapView, { Marker, Polygon, Polyline } from 'react-native-maps';
import type { OsmFeature, OsmGolfKind, OsmOverlay } from '@/src/course/types';
import { featuresForHole, osmFeatureRendersAsLine } from '@/src/course/osmOverlay';
import type { GpsFix, Shot } from '@/src/domain/types';
import type { YardsToGreenResult } from '@/src/sensing/yardsToGreen';
import {
  applyHoleMapCamera,
  holeCameraFramedAfterApply,
  holeCameraHeading,
  holeFrameRegion,
  holeMapFrameReadyReport,
  holeMapRevealWhenCourseFramePlanned,
  holeMapUserLocationVisible,
  holeNativeCamera,
  regionIsHoleFrame,
} from '@/src/domain/holeCamera';
import {
  holeMapBoxIsPaintable,
  holeMapPaintKey,
  holeMapRegionIsPaintable,
  holeMapShouldMount,
  holeMapShowsCover,
  holeNativeCameraIsPaintable,
} from '@/src/domain/mapPaint';
import {
  ADD_SHOT_PATH_DOT_PX,
  ADD_SHOT_TO_PIN_HIT_H,
  ADD_SHOT_TO_PIN_HIT_W,
  addShotPathDotFollowsPin,
  addShotShowsPathDot,
  addShotToPinAnchor,
  addShotToPinBox,
  addShotToPinGlyph,
  addShotToPinScalesUpOnPressOrDrag,
  addShotToPinStaysCenteredOnPath,
  addShotToPinTracksViewChanges,
  addShotToPinVisualScale,
  holeMapKeepsScrollZoomOnceMounted,
  liveDragPointForLines,
  placeToDraftFromDragRelease,
  planDragShotLines,
  toPinMarkerCoordinate,
  toPinYardsRecalcOnDragMove,
} from '@/src/domain/placeToDrag';
import { requestThisCourseVisible } from '@/src/domain/courseRequest';
import { COPY, showWaitingOnLocationLine } from '@/src/domain/playerCopy';
import { appleBasemapTilesBestEffortOnly } from '@/src/course/startRoundEntry';
import { isValidLatLng } from '@/src/domain/latLng';
import { hasClosedGpsTrail, hasGpsStart } from '@/src/domain/shotSource';
import { clubMarkGpsConfidence } from '@/src/domain/gpsConfidence';
import { planDistanceRings } from '@/src/domain/distanceRings';
import { planShotTrail, shotTrailDash } from '@/src/domain/shotTrail';
import { QualityBadge } from './Badge';
import { CLUB_MARK_CONFIDENCE_LIFT_PX, GpsConfidenceChip } from './GpsConfidenceChip';
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
  /** HARD-MISS / need-pins copy. Default is the generic tee+green miss. */
  missCopy?: { title: string; detail?: string | null };
  /** Miss-card deep link. Does not invent a pin. */
  requestCourse?: { name?: string | null; city?: string | null; courseId?: string | null } | null;
};

const APPLE_TILES_BEST_EFFORT = appleBasemapTilesBestEffortOnly();

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

const OSM_DRAW_ORDER: OsmGolfKind[] = [
  'water_hazard',
  'lateral_water_hazard',
  'fairway',
  'bunker',
  'cartpath',
  'tee',
  'green',
  'hole',
];

const OSM_STYLE: Record<OsmGolfKind, { fill?: string; stroke: string; width: number }> = {
  fairway: { fill: 'transparent', stroke: 'rgba(125, 207, 122, 0.55)', width: 2 },
  green: { fill: 'transparent', stroke: '#7DCF7A', width: 3 },
  tee: { fill: 'transparent', stroke: '#F5C542', width: 2 },
  hole: { stroke: '#F4F1E8', width: 2 },
  bunker: { fill: 'rgba(228, 201, 138, 0.35)', stroke: '#E4C98A', width: 2 },
  water_hazard: { fill: 'rgba(58, 160, 216, 0.3)', stroke: '#3AA0D8', width: 2 },
  lateral_water_hazard: { fill: 'rgba(58, 160, 216, 0.3)', stroke: '#3AA0D8', width: 2 },
  cartpath: { stroke: 'rgba(244, 241, 232, 0.8)', width: 2 },
};

function distanceRingStroke(yards: number): string {
  if (yards <= 100) return 'rgba(244, 241, 232, 0.92)';
  if (yards <= 150) return 'rgba(244, 241, 232, 0.64)';
  return 'rgba(244, 241, 232, 0.42)';
}

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
  frameMiss,
  missCopy,
  requestCourse,
}: {
  holeNumber: number;
  yardsToGreen?: YardsToGreenResult;
  hasFix?: boolean;
  hasGreen?: boolean;
  hideYardsOverlay?: boolean;
  frameMiss?: boolean;
  missCopy?: { title: string; detail?: string | null };
  requestCourse?: { name?: string | null; city?: string | null; courseId?: string | null } | null;
}) {
  const yardsOnCard = Boolean(yardsToGreen && yardsToGreen.yards != null && Number.isFinite(yardsToGreen.yards));
  const waiting =
    !frameMiss &&
    !hideYardsOverlay &&
    !yardsOnCard &&
    showWaitingOnLocationLine({
      yards: yardsToGreen?.yards ?? null,
      quality: yardsToGreen?.quality,
      hasFix,
      hasGreen,
    });
  if (frameMiss) {
    return (
      <View
        style={styles.missCard}
        testID="course-card-miss"
        accessibilityHint={
          APPLE_TILES_BEST_EFFORT
            ? 'Marks and yards use your GPS and saved course paint. Map tiles are best-effort.'
            : undefined
        }>
        <Text style={styles.holeBadgeText}>Hole {holeNumber}</Text>
        <Text style={styles.missMsg}>{missCopy?.title ?? COPY.courseCardMissingFrame}</Text>
        {missCopy?.detail ? <Text style={styles.missDetail}>{missCopy.detail}</Text> : null}
        {requestThisCourseVisible({
          course: {
            name: requestCourse?.name,
            city: requestCourse?.city,
            courseKey: requestCourse?.courseId,
            courseApiId: requestCourse?.courseId,
          },
          hasTeeGreenPaint: false,
          paintKnown: true,
        }) ? (
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              router.push({
                pathname: '/request-course',
                params: {
                  name: requestCourse?.name ?? '',
                  city: requestCourse?.city ?? '',
                  courseId: requestCourse?.courseId ?? '',
                },
              })
            }>
            <Text style={styles.missDetail}>{COPY.requestThisCourse}</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }
  return (
    <View style={styles.fallback}>
      <Text style={styles.holeBadgeText}>Hole {holeNumber}</Text>
      {yardsToGreen && !hideYardsOverlay ? (
        <YardsToGreenBadge result={yardsToGreen} hasFix={hasFix} hasGreen={hasGreen} />
      ) : null}
      {waiting ? <Text style={styles.fallbackMsg}>{COPY.waitingOnLocation}</Text> : null}
    </View>
  );
}

type LatLng = { lat: number; lng: number };

/**
 * Dashed lines, yard chips, and path dot for the in-progress drag point.
 * `dragLines` end on the same point the to-pin Marker sits on.
 */
function LiveDragGeometry({
  dragLines,
  pinVisible,
}: {
  dragLines: ReturnType<typeof planDragShotLines>;
  pinVisible: boolean;
}) {
  return (
    <>
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
      {dragLines.shot && addShotPathDotFollowsPin() && addShotShowsPathDot({ pinVisible }) ? (
        <Marker
          coordinate={toCoord(dragLines.shot.to.lat, dragLines.shot.to.lng)}
          anchor={{ x: 0.5, y: 0.5 }}
          tappable={false}
          tracksViewChanges={false}>
          <View pointerEvents="none" testID="shot-path-dot" style={styles.pathDot} />
        </Marker>
      ) : null}
      {dragLines.toGreen ? (
        <Polyline
          coordinates={[
            toCoord(dragLines.toGreen.from.lat, dragLines.toGreen.from.lng),
            toCoord(dragLines.toGreen.to.lat, dragLines.toGreen.to.lng),
          ]}
          strokeColor={colors.cream}
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
    </>
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
  missCopy,
  requestCourse,
}: Props) {
  const mapRef = useRef<MapView | null>(null);
  const framedOnce = useRef(false);
  const pendingLocked = useRef(false);
  const [holeCameraReady, setHoleCameraReady] = useState(false);
  const [mapBox, setMapBox] = useState<{ width: number; height: number } | null>(null);
  const [mapsChrome, setMapsChrome] = useState(false);
  const [toPinDragOrigin, setToPinDragOrigin] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const [liveDrag, setLiveDrag] = useState<{ lat: number; lng: number } | null>(null);
  const [toPinHeld, setToPinHeld] = useState(false);
  const toPinEngaged = toPinHeld || toPinDragOrigin != null;
  const toPinLive = Boolean(freezePan || onPlaceToDrag);
  const framedForGestures = holeMapKeepsScrollZoomOnceMounted();
  // One point for the pin, the dashed line, and the yard chips.
  const dragPoint = liveDragPointForLines({ live: liveDrag, placed: placedTo ?? null });
  const toPinCoordinate = toPinMarkerCoordinate({ live: liveDrag, placedTo: placedTo ?? null });
  const dragLines = useMemo(() => {
    if (!onPlaceToDrag || !dragPoint) return { shot: null, toGreen: null };
    return planDragShotLines({
      from: lineFrom ?? null,
      drag: dragPoint,
      green: lineGreen ?? null,
    });
  }, [onPlaceToDrag, lineFrom, lineGreen, dragPoint?.lat, dragPoint?.lng]);
  const toPinGlyph = addShotToPinGlyph(addShotToPinVisualScale(toPinEngaged));
  const toPinMapCoordinate = useMemo(
    () => (toPinCoordinate ? toCoord(toPinCoordinate.lat, toPinCoordinate.lng) : null),
    [toPinCoordinate?.lat, toPinCoordinate?.lng],
  );

  useEffect(() => {
    if (!placedTo) {
      setToPinDragOrigin(null);
      setToPinHeld(false);
    }
  }, [placedTo]);

  // A new saved point replaces the live one (release saves that same point).
  useEffect(() => {
    setLiveDrag(null);
  }, [placedTo?.lat, placedTo?.lng]);

  const revealMapsChrome = () => {
    if (allowMapsChrome) setMapsChrome(true);
  };

  const distanceRings = useMemo(
    () =>
      planDistanceRings({
        center: userFix ? { lat: userFix.lat, lng: userFix.lng } : null,
        green,
        yardsToGreen,
      }),
    [userFix?.lat, userFix?.lng, green?.lat, green?.lng, yardsToGreen.yards, yardsToGreen.quality],
  );
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
    // Same camera path as Add shot: parent tee + green only.
    // A lone green is the house / pin-zoom miss. Never wait on a phone fix.
    return fromParent.length >= 2 ? fromParent : [];
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

  const holeFrameOnScreen = Boolean(holeUpCamera || lockedRegion);

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
    // Never flip holeCameraReady false on a live MapView. iOS will not
    // reattach pan/pinch after scrollEnabled/zoomEnabled bounce off→on.
    // First Add shot and after edit must keep the recognizers that attached
    // on the first sized mount — remount (delete+re-add) is not required.
  }, [lockFrame, lockKey, heading, frameEpoch]);

  const courseCardMiss = Boolean(
    lockFrame && (!lockedRegion || !holeMapRegionIsPaintable(lockedRegion)),
  );

  useEffect(() => {
    // frameEpoch is a dependency on purpose. holeCameraReady is not cleared on
    // Prev/Next or menu/scorecard return (that bounce drops iOS pan/pinch), so
    // this must re-report or the play dock stays unmounted until Home.
    onFrameReady?.(
      holeMapFrameReadyReport({
        lockFrame: Boolean(lockFrame),
        courseCardMiss,
        holeCameraReady,
      }),
    );
  }, [lockFrame, courseCardMiss, holeCameraReady, frameEpoch, onFrameReady]);

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
    const { width, height } = event.nativeEvent.layout;
    const next = { width, height };
    // Host size only — MapView mounts after the box is paint-ready so Apple
    // tiles are not asked to paint into a zero-height first layout.
    if (holeMapBoxIsPaintable(next)) {
      setMapBox((prev) =>
        prev && prev.width === width && prev.height === height ? prev : next,
      );
      // Same event as the first sized mount so MapView is born with
      // scrollEnabled/zoomEnabled on. A later ready=true does not reattach.
      setHoleCameraReady(true);
    }
    if (!lockFrame) return;
    if (!holeMapBoxIsPaintable(next)) return;
    if (framedOnce.current) return;
    if (markFramedIfLive(frameLockedMap())) return;
    // Course tee+green already planned (initialCamera/Region). Do not keep the
    // green cover up forever if setCamera is flaky — and never wait on GPS.
    if (holeFrameOnScreen && holeMapRevealWhenCourseFramePlanned()) {
      framedOnce.current = true;
      pendingLocked.current = false;
      setHoleCameraReady(true);
    }
  };

  const mapCanPaint = holeMapShouldMount(mapBox);
  const mapPaintKey = holeMapPaintKey(mapBox);
  const showMapCover = holeMapShowsCover({
    mapBox,
    hasFrame: Boolean(lockedRegion && holeMapRegionIsPaintable(lockedRegion)),
  });

  useEffect(() => {
    if (!lockFrame) return;
    if (!mapCanPaint) return;
    if (!lockedRegion || !holeMapRegionIsPaintable(lockedRegion)) return;
    // Host is sized and the course-card region is valid. Do not wait on setCamera
    // or a phone fix — and never hide MapView with opacity hide (blocks Apple tiles).
    setHoleCameraReady(true);
  }, [lockFrame, mapCanPaint, lockedRegion]);

  const revealCourseFrameIfPlanned = () => {
    if (!lockFrame) return false;
    if (framedOnce.current) return true;
    if (!holeFrameOnScreen || !holeMapRevealWhenCourseFramePlanned()) return false;
    framedOnce.current = true;
    pendingLocked.current = false;
    setHoleCameraReady(true);
    return true;
  };

  const onRegionSettled = (region: { latitude: number; longitude: number }) => {
    if (!lockFrame) return;
    // After the first tee→green frame, leave the camera alone.
    // Two-finger pan / pinch must not snap back or re-run the course-card camera.
    if (framedOnce.current) return;
    if (regionIsHoleFrame(region, holeCenterRef.current)) {
      framedOnce.current = true;
      pendingLocked.current = false;
      setHoleCameraReady(true);
      return;
    }
    // Pin drag must not count as framed. GPS neither.
    if (toPinLive) return;
    // Opening house / default GPS is not framed. A null ref is not success.
    markFramedIfLive(frameLockedMap());
  };

  if (!lockedRegion || !holeMapRegionIsPaintable(lockedRegion)) {
    return (
      <View
        collapsable={false}
        style={[fullBleed ? styles.bleed : styles.wrap, style]}
        onLayout={onMapLayout}>
        <TrailFallback
          holeNumber={holeNumber}
          yardsToGreen={yardsToGreen}
          hasFix={Boolean(userFix)}
          hasGreen={Boolean(green)}
          hideYardsOverlay={hideYardsOverlay}
          frameMiss={Boolean(lockFrame)}
          missCopy={missCopy}
          requestCourse={requestCourse}
        />
      </View>
    );
  }

  const userDot =
    userFix && isValidLatLng({ lat: userFix.lat, lng: userFix.lng })
      ? toCoord(userFix.lat, userFix.lng)
      : null;

  // Always pass a paintable initialRegion so tiles fetch even if initialCamera
  // is ignored on first paint. Reject NaN / 0,0 cameras.
  const paintCamera = holeNativeCameraIsPaintable(holeUpCamera) ? holeUpCamera : null;
  const lockedCameraProps = paintCamera
    ? { initialCamera: paintCamera, initialRegion: lockedRegion }
    : { initialRegion: lockedRegion };

  return (
    <View
      collapsable={false}
      style={[fullBleed ? styles.bleed : styles.wrap, style]}
      onLayout={onMapLayout}
      pointerEvents="box-none">
      {mapCanPaint ? (
      <MapView
        key={mapPaintKey}
        ref={mapRef}
        style={[styles.map, mapBox,]}
        mapType="satellite"
        loadingEnabled
        {...(lockFrame
          ? lockedCameraProps
          : paintCamera
            ? { initialCamera: paintCamera, initialRegion: lockedRegion }
            : { initialRegion: lockedRegion })}
        showsUserLocation={holeMapUserLocationVisible({
          lockFrame,
          showPhonePin,
          allowMapsChrome,
        })}
        showsMyLocationButton={false}
        followsUserLocation={false}
        showsCompass={allowMapsChrome && mapsChrome}
        legalLabelInsets={
          allowMapsChrome && mapsChrome
            ? undefined
            : { top: -120, right: -120, bottom: -280, left: -120 }
        }
        zoomEnabled={framedForGestures}
        zoomTapEnabled={framedForGestures}
        scrollEnabled={framedForGestures}
        pitchEnabled={false}
        rotateEnabled={false}
        moveOnMarkerPress={false}
        onMapReady={() => {
          if (!lockFrame) return;
          if (framedOnce.current) return;
          // Apply tee→green again (setCamera, else animateToRegion). initialCamera /
          // initialRegion already seeded the hole — do not wait on location permission.
          if (markFramedIfLive(frameLockedMap())) return;
          revealCourseFrameIfPlanned();
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
          if (osmFeatureRendersAsLine(feature)) {
            return (
              <Polyline
                key={`osm-line-${feature.kind}-${index}`}
                coordinates={coordinates}
                strokeColor={styleOsm.stroke}
                strokeWidth={styleOsm.width}
                {...(feature.kind === 'hole' ? { lineDashPattern: [8, 6] } : {})}
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
        {distanceRings.map((ring) => (
          <Polyline
            key={`distance-ring-${ring.yards}`}
            coordinates={ring.points.map((point) => toCoord(point.lat, point.lng))}
            strokeColor={distanceRingStroke(ring.yards)}
            strokeWidth={2}
            geodesic
          />
        ))}
        {distanceRings.map((ring) => (
          <Marker
            key={`distance-ring-label-${ring.yards}`}
            coordinate={toCoord(ring.labelAt.lat, ring.labelAt.lng)}
            anchor={{ x: 0.5, y: 0.5 }}
            tappable={false}
            tracksViewChanges={false}>
            <View pointerEvents="none" style={styles.ringLabel}>
              <Text style={styles.ringLabelText}>{ring.yards}</Text>
            </View>
          </Marker>
        ))}
        {closed.map((shot, index) => {
          const trail = planShotTrail({
            start: { lat: shot.startLat, lng: shot.startLng },
            end: { lat: shot.endLat, lng: shot.endLng },
            clubId: shot.clubId,
            distanceYards: shot.distanceYards,
            fixQuality: shot.fixQuality,
            last: index === closed.length - 1,
          });
          if (!trail) return null;
          return (
            <Polyline
              key={shot.id}
              coordinates={[toCoord(trail.from.lat, trail.from.lng), toCoord(trail.to.lat, trail.to.lng)]}
              strokeColor={trail.tint}
              strokeWidth={trail.width}
              lineDashPattern={[...shotTrailDash()]}
            />
          );
        })}
        {closed.map((shot, index) => {
          const trail = planShotTrail({
            start: { lat: shot.startLat, lng: shot.startLng },
            end: { lat: shot.endLat, lng: shot.endLng },
            clubId: shot.clubId,
            distanceYards: shot.distanceYards,
            fixQuality: shot.fixQuality,
            last: index === closed.length - 1,
          });
          if (!trail?.chip && !trail?.showQualityBadge) return null;
          return (
            <Marker
              key={`chip-${shot.id}`}
              coordinate={toCoord(trail.mid.lat, trail.mid.lng)}
              anchor={{ x: 0.5, y: 0.5 }}
              tappable={false}
              tracksViewChanges>
              <View pointerEvents="none" style={styles.lineChip}>
                {trail.chip ? <Text style={styles.lineChipValue}>{trail.chip}</Text> : null}
                {trail.showQualityBadge ? (
                  <QualityBadge quality={shot.fixQuality} source={shot.source} />
                ) : null}
              </View>
            </Marker>
          );
        })}
        {shots.filter(hasGpsStart).map((shot) => (
          <Marker
            key={`start-${shot.id}`}
            coordinate={toCoord(shot.startLat, shot.startLng)}
            title={`Shot ${shot.seq}`}
            description={shot.endedAt ? undefined : 'In play'}
            pinColor={shot.endedAt ? 'tomato' : 'yellow'}
            anchor={{ x: 0.5, y: 1 }}
            onPress={() => onShotPress?.(shot.id)}
          />
        ))}
        {shots.filter(hasGpsStart).map((shot) => {
          const confidence = clubMarkGpsConfidence(shot);
          if (!confidence) return null;
          return (
            <Marker
              key={`gps-confidence-${shot.id}`}
              coordinate={toCoord(shot.startLat, shot.startLng)}
              anchor={{ x: 0.5, y: 1 }}
              tappable={false}
              tracksViewChanges
              zIndex={2}>
              <View pointerEvents="none" collapsable={false} style={styles.confidenceOnMark}>
                <GpsConfidenceChip confidence={confidence} />
              </View>
            </Marker>
          );
        })}
        {closed.map((shot) => (
          <Marker
            key={`end-${shot.id}`}
            coordinate={toCoord(shot.endLat, shot.endLng)}
            title={`Shot ${shot.seq}`}
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
        {toPinMapCoordinate ? (
          <Marker
            // One-finger hold-drag is this Marker only — tight hit, not a
            // map-covering View. Its coordinate is the live drag point, the
            // same one the dashed line and yard chips use. The draft commits
            // on release. The pin tip stays on that path point.
            coordinate={toPinMapCoordinate}
            anchor={addShotToPinAnchor()}
            tappable={false}
            tracksViewChanges={addShotToPinTracksViewChanges({
              dragging: toPinDragOrigin != null,
            })}
            stopPropagation
            draggable={Boolean(onPlaceToDrag)}
            onDragStart={() => {
              if (addShotToPinScalesUpOnPressOrDrag()) setToPinHeld(true);
              if (!placedTo) return;
              setToPinDragOrigin(placedTo);
              setLiveDrag(placedTo);
            }}
            onDrag={(event) => {
              if (!toPinYardsRecalcOnDragMove()) return;
              const { latitude, longitude } = event.nativeEvent.coordinate;
              const point = placeToDraftFromDragRelease({ lat: latitude, lng: longitude });
              if (!point) return;
              setLiveDrag(point);
            }}
            onDragEnd={(event) => {
              setToPinHeld(false);
              setToPinDragOrigin(null);
              const { latitude, longitude } = event.nativeEvent.coordinate;
              const released = placeToDraftFromDragRelease({ lat: latitude, lng: longitude });
              // Line and pin sit on the released point; that exact point is saved.
              setLiveDrag(released);
              if (!onPlaceToDrag) return;
              if (!released) return;
              onPlaceToDrag({ lat: latitude, lng: longitude });
            }}>
            <View
              testID="to-pin-hit"
              pointerEvents="auto"
              collapsable={false}
              onTouchStart={() => {
                if (addShotToPinScalesUpOnPressOrDrag()) setToPinHeld(true);
              }}
              onTouchEnd={() => {
                if (toPinDragOrigin == null) setToPinHeld(false);
              }}
              onTouchCancel={() => {
                if (toPinDragOrigin == null) setToPinHeld(false);
              }}
              style={[
                styles.toPinHit,
                addShotToPinStaysCenteredOnPath()
                  ? {
                      width: addShotToPinBox().width,
                      height: addShotToPinBox().height,
                      justifyContent: 'flex-end',
                    }
                  : null,
              ]}>
              <View
                style={[
                  styles.toPinHead,
                  {
                    width: toPinGlyph.head,
                    height: toPinGlyph.head,
                    borderRadius: toPinGlyph.head / 2,
                  },
                ]}
              />
              <View
                style={[
                  styles.toPinStem,
                  {
                    width: toPinGlyph.stemWidth,
                    height: toPinGlyph.stemHeight,
                  },
                ]}
              />
            </View>
          </Marker>
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
        <LiveDragGeometry dragLines={dragLines} pinVisible={toPinMapCoordinate != null} />
      </MapView>
      ) : null}
      {showMapCover ? (
        <View pointerEvents="none" style={styles.mapCover} />
      ) : null}
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
      missCopy={props.missCopy}
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
    ...StyleSheet.absoluteFill,
    flex: 1,
    minHeight: 0,
    alignSelf: 'stretch',
    overflow: 'hidden',
    backgroundColor: colors.bgElevated,
  },
  map: {
    ...StyleSheet.absoluteFill,
    flex: 1,
  },
  mapCover: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: colors.bgElevated,
  },
  lineChip: {
    backgroundColor: 'rgba(11,26,18,0.88)',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignItems: 'center',
    gap: 2,
  },
  lineChipGreen: { borderWidth: 1, borderColor: colors.cream },
  lineChipValue: { color: colors.cream, fontSize: 14, fontWeight: '900' },
  ringLabel: {
    backgroundColor: 'rgba(11,26,18,0.72)',
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  ringLabelText: { color: colors.cream, fontSize: 11, fontWeight: '800' },
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
  missCard: {
    minHeight: 160,
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: 20,
    paddingVertical: 24,
    gap: 10,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.line,
  },
  missMsg: { color: colors.cream, fontSize: type.body, lineHeight: 22, fontWeight: '700' },
  missDetail: { color: colors.muted, fontSize: type.meta, lineHeight: 20, fontWeight: '700' },
  fallbackMsg: { color: colors.muted, fontSize: type.meta, lineHeight: 20 },
  userDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#2F80FF',
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  confidenceOnMark: {
    alignItems: 'center',
    paddingBottom: CLUB_MARK_CONFIDENCE_LIFT_PX,
  },
  toPinHit: {
    width: ADD_SHOT_TO_PIN_HIT_W,
    height: ADD_SHOT_TO_PIN_HIT_H,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  toPinHead: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.good,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  toPinStem: {
    width: 3,
    height: 16,
    marginTop: -2,
    backgroundColor: colors.good,
  },
  pathDot: {
    width: ADD_SHOT_PATH_DOT_PX,
    height: ADD_SHOT_PATH_DOT_PX,
    borderRadius: ADD_SHOT_PATH_DOT_PX / 2,
    backgroundColor: colors.cream,
    borderWidth: 3,
    borderColor: colors.good,
  },
});
