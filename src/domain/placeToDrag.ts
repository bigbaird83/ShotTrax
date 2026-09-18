import { isValidLatLng, type LatLng } from './latLng';
import { confirmPlacedShot, planPlacedShot, type PlacedShotPlan } from './shotSource';

export function liveYardsUsesPhone(): false {
  return false;
}

export function placeToStoresBeforeConfirm(): false {
  return false;
}

export function placeToAskOn(): 'confirm' {
  return 'confirm';
}

export function dragRecentersOnPhone(): false {
  return false;
}

/**
 * Live yards while the to pin is being dragged. From the from pin to the
 * finger — never the phone, never the house.
 */
export function liveYardsFromPinToDrag(args: {
  from: LatLng | null;
  drag: LatLng | null;
  phone?: LatLng | null;
}): number | null {
  if (!args.from || !args.drag) return null;
  if (!isValidLatLng(args.from) || !isValidLatLng(args.drag)) return null;
  const plan = planPlacedShot(args.from, args.drag);
  return plan.ok ? plan.distanceYards : null;
}

export type ConfirmPlaceToDraft =
  | { status: 'empty' }
  | { status: 'needs_confirm'; yards: number }
  | { status: 'commit'; to: LatLng; plan: { ok: true } & PlacedShotPlan };

/** Confirm locks the draft tap as the to pin. Nothing is stored before this. */
export function confirmPlaceToDraft(args: {
  from: LatLng | null;
  draft: LatLng | null;
  force?: boolean;
}): ConfirmPlaceToDraft {
  if (!args.from || !args.draft) return { status: 'empty' };
  if (!isValidLatLng(args.from) || !isValidLatLng(args.draft)) return { status: 'empty' };
  const plan = planPlacedShot(args.from, args.draft);
  if (!plan.ok) return { status: 'empty' };
  const gate = confirmPlacedShot(plan, Boolean(args.force));
  if (gate.status === 'needs_confirm') return gate;
  return { status: 'commit', to: args.draft, plan };
}

export function cancelPlaceToDraft(): { to: null; stored: false } {
  return { to: null, stored: false };
}
