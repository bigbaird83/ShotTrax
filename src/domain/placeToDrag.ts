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

export function dragKeepsPinchZoom(): true {
  return true;
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

export function liveYardsSitAboveFinger(): true {
  return true;
}

/** To-green stays on the green center. Not above the finger. */
export function toGreenYardsSitOnGreen(): true {
  return true;
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
