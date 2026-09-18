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

/**
 * Live shot yards while the to pin is dragged. Haversine from THIS shot's
 * from pin to the finger — never the phone, never the previous shot, never
 * the house. Preview only; nothing is stored.
 */
export function liveShotYardsFromThisFromPin(args: {
  from: LatLng | null;
  drag: LatLng | null;
  phone?: LatLng | null;
  previousFrom?: LatLng | null;
}): number | null {
  void args.phone;
  void args.previousFrom;
  if (!isValidLatLng(args.from) || !isValidLatLng(args.drag)) return null;
  const yards = roundYards(haversineYards(args.from, args.drag));
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
 * Live to-green while dragging. Haversine from the fingertip to the green
 * center. No green, or over 600 → null (shown as —). Never the phone.
 */
export function liveToGreenYardsFromFinger(args: {
  drag: LatLng | null;
  green: LatLng | null;
  phone?: LatLng | null;
}): number | null {
  void args.phone;
  if (!isValidLatLng(args.drag) || !isValidLatLng(args.green)) return null;
  const yards = roundYards(haversineYards(args.drag, args.green));
  if (!Number.isFinite(yards) || yards > TO_GREEN_LIVE_MAX_YD) return null;
  return yards;
}

export function formatDragPreviewYards(yards: number | null): string {
  return yards != null && Number.isFinite(yards) ? `${yards} yd` : '—';
}

export type PlaceToDragPreview = {
  shotYards: number | null;
  shotLabel: string;
  /** Chip sits on the finger so yards read above it. */
  shotAt: LatLng;
  toGreenYards: number | null;
  toGreenLabel: string;
  toGreenAt: LatLng | null;
  fingerAt: LatLng;
};

/**
 * Shot yards sit above the finger (this from pin → fingertip). To-green
 * sits on the green center, not the finger. Mid-drag is a preview: no
 * save, no 20% filter, no 400-yard ask, no acceptFix, no quality band.
 */
export function planPlaceToDragPreview(args: {
  from: LatLng | null;
  drag: LatLng | null;
  green?: LatLng | null;
  phone?: LatLng | null;
  previousFrom?: LatLng | null;
}): PlaceToDragPreview | null {
  if (!isValidLatLng(args.from) || !isValidLatLng(args.drag)) return null;
  const shotYards = liveShotYardsFromThisFromPin(args);
  const toGreenYards = liveToGreenYardsFromFinger({
    drag: args.drag,
    green: args.green ?? null,
    phone: args.phone,
  });
  return {
    shotYards,
    shotLabel: formatDragPreviewYards(shotYards),
    shotAt: args.drag,
    toGreenYards,
    toGreenLabel: formatDragPreviewYards(toGreenYards),
    toGreenAt: isValidLatLng(args.green) ? args.green : null,
    fingerAt: args.drag,
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
