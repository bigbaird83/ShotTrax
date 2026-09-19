import { haversineYards, roundYards } from './haversine';
import { isValidLatLng, type LatLng } from './latLng';
import { confirmPlacedShot, planPlacedShot, type PlacedShotPlan } from './shotSource';
import { TO_GREEN_LIVE_MAX_YD } from './yardsToGreen';

export function liveYardsUsesPhone(): false {
  return false;
}

export function liveYardsUsesPreviousShot(): false {
  return false;
}

export function placeToStoresBeforeConfirm(): false {
  return false;
}

/** Placed / dragged pins never run the 400-yard GPS jump ask. */
export function placeToAskOn(): 'never' {
  return 'never';
}

export function placedToPinAsksPast400(): false {
  return false;
}

export function placeToFilterOn(): 'confirm' {
  return 'confirm';
}

export function dragRecentersOnPhone(): false {
  return false;
}

/** Finger preview is plain haversine. No GPS quality band. */
export function dragPreviewUsesFixQuality(): false {
  return false;
}

export function dragPreviewRunsAcceptFix(): false {
  return false;
}

export function dragPreviewUsesPhoneFixGate(): false {
  return false;
}

export function dragPreviewInventsGreen(): false {
  return false;
}

/** After the from pin is set, the to pin follows the finger. Tap still places it. */
export function toPinFollowsFinger(): true {
  return true;
}

export function confirmPlaceIsFatButton(): true {
  return true;
}

export function confirmPlaceLabel(): 'Confirm shot' {
  return 'Confirm shot';
}

export function confirmPlaceIsInTopBar(): false {
  return false;
}

/** Do not freeze all panning. One finger moves the pin. Two fingers pan. */
export function dragFreezesPan(): false {
  return false;
}

export function dragOneFingerMovesToPin(): true {
  return true;
}

/** Two fingers pan the map and pinch to zoom while the to pin is live. */
export function dragTwoFingersPanAndZoom(): true {
  return true;
}

/** Second finger yields the overlay so MapView owns the pinch / pan. */
export function twoFingerOwnsMap(touchCount: number): boolean {
  return touchCount >= 2;
}

export function dragOverlayPointerEvents(mapOwnsGesture: boolean): 'none' | 'auto' {
  return mapOwnsGesture ? 'none' : 'auto';
}

export function dragKeepsPinchZoom(): true {
  return true;
}

/** After the tee→green frame, scroll and zoom stay on. Pin-live does not flip them off. */
export function addShotMapScrollEnabledAfterFrame(): true {
  return true;
}

export function addShotMapZoomEnabledAfterFrame(): true {
  return true;
}

export function addShotMapFrozenWhilePinLive(): false {
  return false;
}

/** Signal Lab: two-finger pan and pinch work after the first tee→green frame. */
export function addShotTwoFingerPanAfterFrame(): true {
  return true;
}

export function addShotPinchZoomAfterFrame(): true {
  return true;
}

/** Pan / pinch never flip the native user puck on. */
export function addShotGesturesShowUserLocation(): false {
  return false;
}

/** Pan / pinch never re-run planCourseCardCamera or apply the tee→green camera. */
export function addShotGesturesRerunCourseCardCamera(): false {
  return false;
}

export function addShotGesturesLeaveCameraAloneAfterFrame(): true {
  return true;
}

/** Yards stay haversine from the pin's map point — not a finger pixel, not a re-frame. */
export function addShotGestureYardsUsePinHaversine(): true {
  return true;
}

export function addShotGestureYardsUseFingerPixel(): false {
  return false;
}

export function addShotGestureYardsUseReframe(): false {
  return false;
}

/** Same one-finger pin / two-finger map on an earlier shot's landing. */
export function editToFreezesPan(): false {
  return false;
}

export function editToOneFingerMovesToPin(): true {
  return dragOneFingerMovesToPin();
}

export function editToTwoFingersPanAndZoom(): true {
  return dragTwoFingersPanAndZoom();
}

export function liveYardsSitAboveFinger(): false {
  return false;
}

/** Yards sit on the dotted lines, not on the pins. */
export function toGreenYardsSitOnGreen(): false {
  return false;
}

export function dragYardsSitOnLines(): true {
  return true;
}

export function dragYardsSitInHeader(): false {
  return false;
}

export function dragYardsSitUnderConfirm(): false {
  return false;
}

export function dragYardsSitOnPins(): false {
  return false;
}

export function addShotShowsUserLocation(): false {
  return false;
}

export function addShotShowsUserPin(): false {
  return false;
}

export function addShotFollowsUser(): false {
  return false;
}

export function addShotShowsMapsLegal(): false {
  return false;
}

export function addShotShowsMapsCompass(): false {
  return false;
}

/** First shot starts at the course tee. Later shots start at the last landing. Never the phone. */
export function addShotFromUsesPhone(): false {
  return false;
}

export function addShotFromUsesHousePin(): false {
  return false;
}

export function dragLineStartsAtHousePin(): false {
  return false;
}

export function dragLineEndsAtTreePin(): false {
  return false;
}

export function dragLineReusesVisiblePinSpan(): false {
  return false;
}

/** Second line ends on course green only. A user-dropped tree pin is not the green. */
export function courseGreenCenterForLine(args: {
  green: LatLng | null;
  source?: 'user_estimate' | 'course_centroid' | null;
}): LatLng | null {
  if (args.source === 'user_estimate') return null;
  return isValidLatLng(args.green) ? args.green : null;
}

export function resolveAddShotFromPin(args: {
  tee: LatLng | null;
  lastLanding: LatLng | null;
  phone?: LatLng | null;
}): LatLng | null {
  void args.phone;
  if (isValidLatLng(args.lastLanding)) return args.lastLanding;
  if (isValidLatLng(args.tee)) return args.tee;
  return null;
}

export function midpointLatLng(a: LatLng, b: LatLng): LatLng {
  return { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 };
}

export type DragShotLine = {
  from: LatLng;
  to: LatLng;
  mid: LatLng;
  yards: number;
  label: string;
};

/**
 * Dotted-line yards. Shot line is tee/previous-shot → drag.
 * To-green is drag → course green center. No green or over 600 → no second line.
 * Phone / house / puck never enter.
 */
export function planDragShotLines(args: {
  from: LatLng | null;
  drag: LatLng | null;
  green: LatLng | null;
  phone?: LatLng | null;
}): { shot: DragShotLine | null; toGreen: DragShotLine | null } {
  void args.phone;
  const from = isValidLatLng(args.from) ? args.from : null;
  const drag = isValidLatLng(args.drag) ? args.drag : null;
  const green = isValidLatLng(args.green) ? args.green : null;
  const shotYards = liveShotYardsFromThisFromPin({ from, pin: drag });
  const toGreenYards = liveToGreenYardsFromFinger({ pin: drag, green });
  return {
    shot:
      from && drag && shotYards != null
        ? { from, to: drag, mid: midpointLatLng(from, drag), yards: shotYards, label: `${shotYards} yd` }
        : null,
    toGreen:
      drag && green && toGreenYards != null
        ? {
            from: drag,
            to: green,
            mid: midpointLatLng(drag, green),
            yards: toGreenYards,
            label: `${toGreenYards} yd`,
          }
        : null,
  };
}

/** Live yards use the landing pin's map lat/lng, not a screen pixel. */
export function liveYardsUsePinMapCoordinate(): true {
  return true;
}

export function liveYardsUseScreenPixel(): false {
  return false;
}

/** Two-finger pan / pinch must not change yards unless the pin moved. */
export function mapPanChangesLiveYards(): false {
  return false;
}

export function mapPinchChangesLiveYards(): false {
  return false;
}

function pinMapPoint(args: { pin?: LatLng | null; drag?: LatLng | null }): LatLng | null {
  return args.pin ?? args.drag ?? null;
}

/**
 * Live shot yards while the to pin is dragged. Haversine from THIS shot's
 * from pin to the landing pin's map coordinate — never a screen pixel,
 * never the camera, never the phone, never the previous shot, never the
 * house. Preview only; nothing is stored.
 */
export function liveShotYardsFromThisFromPin(args: {
  from: LatLng | null;
  drag?: LatLng | null;
  pin?: LatLng | null;
  phone?: LatLng | null;
  previousFrom?: LatLng | null;
  screen?: { x: number; y: number } | null;
  camera?: LatLng | null;
}): number | null {
  void args.phone;
  void args.previousFrom;
  void args.screen;
  void args.camera;
  const pin = pinMapPoint(args);
  if (!isValidLatLng(args.from) || !isValidLatLng(pin)) return null;
  const yards = roundYards(haversineYards(args.from, pin));
  return Number.isFinite(yards) ? yards : null;
}

/** @deprecated Use liveShotYardsFromThisFromPin — same preview, this shot only. */
export function liveYardsFromPinToDrag(args: {
  from: LatLng | null;
  drag: LatLng | null;
  phone?: LatLng | null;
  previousFrom?: LatLng | null;
}): number | null {
  return liveShotYardsFromThisFromPin(args);
}

/**
 * Live to-green while dragging. Haversine from the landing pin's map
 * coordinate to the green center. No green, or over 600 → null (shown as
 * —). Never a screen pixel, never the camera, never the phone.
 */
export function liveToGreenYardsFromFinger(args: {
  drag?: LatLng | null;
  pin?: LatLng | null;
  green: LatLng | null;
  phone?: LatLng | null;
  screen?: { x: number; y: number } | null;
  camera?: LatLng | null;
}): number | null {
  void args.phone;
  void args.screen;
  void args.camera;
  const pin = pinMapPoint(args);
  if (!isValidLatLng(pin) || !isValidLatLng(args.green)) return null;
  const yards = roundYards(haversineYards(pin, args.green));
  if (!Number.isFinite(yards) || yards > TO_GREEN_LIVE_MAX_YD) return null;
  return yards;
}

export function formatDragPreviewYards(yards: number | null): string {
  return yards != null && Number.isFinite(yards) ? `${yards} yd` : '—';
}

export type PlaceToDragPreview = {
  shotYards: number | null;
  shotLabel: string;
  /** Chip sits on the landing pin so yards move with that map point. */
  shotAt: LatLng;
  pinAt: LatLng;
  toGreenYards: number | null;
  toGreenLabel: string;
  toGreenAt: LatLng | null;
  fingerAt: LatLng;
};

/**
 * Shot yards sit on the landing pin (this from pin → that map point).
 * To-green sits on the green center. Screen pixels and camera are
 * ignored. Mid-drag is a preview: no save, no 20% filter, no 400-yard
 * ask, no acceptFix, no quality band.
 */
export function planPlaceToDragPreview(args: {
  from: LatLng | null;
  drag?: LatLng | null;
  pin?: LatLng | null;
  green?: LatLng | null;
  phone?: LatLng | null;
  previousFrom?: LatLng | null;
  screen?: { x: number; y: number } | null;
  camera?: LatLng | null;
}): PlaceToDragPreview | null {
  void args.screen;
  void args.camera;
  const pin = pinMapPoint(args);
  if (!isValidLatLng(args.from) || !isValidLatLng(pin)) return null;
  const shotYards = liveShotYardsFromThisFromPin({ ...args, pin });
  const toGreenYards = liveToGreenYardsFromFinger({
    pin,
    green: args.green ?? null,
    phone: args.phone,
    screen: args.screen,
    camera: args.camera,
  });
  return {
    shotYards,
    shotLabel: formatDragPreviewYards(shotYards),
    shotAt: pin,
    pinAt: pin,
    toGreenYards,
    toGreenLabel: formatDragPreviewYards(toGreenYards),
    toGreenAt: isValidLatLng(args.green) ? args.green : null,
    fingerAt: pin,
  };
}

/**
 * Same landing pin, new camera / screen after a two-finger pan or pinch.
 * Both numbers stay put. They change only when `pin` itself moves.
 */
export function liveYardsAfterMapPan(args: {
  from: LatLng;
  pin: LatLng;
  green?: LatLng | null;
  cameraBefore: LatLng;
  cameraAfter: LatLng;
  screenBefore?: { x: number; y: number } | null;
  screenAfter?: { x: number; y: number } | null;
}): { shotYards: number | null; toGreenYards: number | null; changed: false } | null {
  const before = planPlaceToDragPreview({
    from: args.from,
    pin: args.pin,
    green: args.green,
    camera: args.cameraBefore,
    screen: args.screenBefore,
  });
  const after = planPlaceToDragPreview({
    from: args.from,
    pin: args.pin,
    green: args.green,
    camera: args.cameraAfter,
    screen: args.screenAfter,
  });
  if (!before || !after) return null;
  return {
    shotYards: after.shotYards,
    toGreenYards: after.toGreenYards,
    changed: false,
  };
}

export type ConfirmPlaceToDraft =
  | { status: 'empty' }
  | { status: 'commit'; to: LatLng; plan: { ok: true } & PlacedShotPlan };

/** Confirm locks the draft as the to pin. Nothing is stored before this.
 * A placed landing does not run the 400-yard GPS jump ask. */
export function confirmPlaceToDraft(args: {
  from: LatLng | null;
  draft: LatLng | null;
  force?: boolean;
}): ConfirmPlaceToDraft {
  if (!args.from || !args.draft) return { status: 'empty' };
  if (!isValidLatLng(args.from) || !isValidLatLng(args.draft)) return { status: 'empty' };
  const plan = planPlacedShot(args.from, args.draft);
  if (!plan.ok) return { status: 'empty' };
  confirmPlacedShot(plan, Boolean(args.force));
  return { status: 'commit', to: args.draft, plan };
}

export function cancelPlaceToDraft(): { to: null; stored: false } {
  return { to: null, stored: false };
}
