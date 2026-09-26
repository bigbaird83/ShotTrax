import type { LatLng } from './latLng';
import type { GpsFix } from './types';
import { planLiveGpsToPin, type LiveGpsToPin } from './yardsToGreen';

/**
 * Hide phone-map yardage overlays when trusted live yards are under this.
 * At 100 the overlays stay up if they were already showing.
 */
export const YARDAGE_OVERLAY_HIDE_BELOW_YD = 100;

/**
 * After the overlays are hidden, show them again only at this distance or
 * farther, so they do not flicker while the player stands around 100 yards.
 */
export const YARDAGE_OVERLAY_SHOW_AT_YD = 105;

/**
 * A phone fix older than this is stale. Overlay hiding does not use it.
 * A last sample must not stand in for a live reading.
 */
export const YARDAGE_OVERLAY_LIVE_FIX_MAX_AGE_MS = 30_000;

/**
 * Epoch ms when `fix` stops counting as live for overlay hiding.
 * Null when there is no fix or the timestamp is not a real sample time.
 */
export function yardageOverlayFixFreshUntilMs(
  fix: { timestamp: number } | null | undefined,
): number | null {
  if (!fix) return null;
  const stamp = fix.timestamp;
  if (typeof stamp !== 'number' || !Number.isFinite(stamp) || stamp <= 0) return null;
  return stamp + YARDAGE_OVERLAY_LIVE_FIX_MAX_AGE_MS;
}

function liveFixIsFresh(fix: GpsFix | null | undefined, nowMs: number): boolean {
  const freshUntil = yardageOverlayFixFreshUntilMs(fix);
  if (freshUntil == null) return false;
  if (typeof nowMs !== 'number' || !Number.isFinite(nowMs)) return false;
  const ageMs = nowMs - (fix as GpsFix).timestamp;
  if (!Number.isFinite(ageMs) || ageMs < 0) return false;
  return nowMs <= freshUntil;
}

/** Same number the yards card shows: good or soft, not the over-600 dash. */
function liveYardsMatchCard(live: LiveGpsToPin): live is LiveGpsToPin & { yards: number } {
  if (live.unavailable) return false;
  if (live.quality !== 'good' && live.quality !== 'soft') return false;
  return live.yards != null && Number.isFinite(live.yards) && live.yards >= 0;
}

/**
 * Whether the phone hole map should hide its yardage overlays.
 *
 * Overlays: the 100 / 150 / 200 yard arcs and their labels, and the
 * player-to-target and target-to-green lines with their yard chips.
 *
 * The distance is `planLiveGpsToPin` — the yards card's live GPS reading
 * to the same green pin. No fix, a stale fix, or a reading the card would
 * not show as a number leaves the overlays up. Course yardage, a previous
 * mark, and a last-known sample are not a distance.
 *
 * Hysteresis: hide below {@link YARDAGE_OVERLAY_HIDE_BELOW_YD}, and after
 * that show again only at {@link YARDAGE_OVERLAY_SHOW_AT_YD} or more.
 * `hidden` is the previous decision. It is ignored when this sample is
 * not a fresh trusted reading.
 */
export function phoneHoleMapYardageOverlaysHidden(args: {
  fix: GpsFix | null | undefined;
  green: LatLng | null | undefined;
  nowMs: number;
  hidden: boolean;
}): boolean {
  if (!liveFixIsFresh(args.fix, args.nowMs)) return false;
  const live = planLiveGpsToPin({ fix: args.fix ?? null, green: args.green ?? null });
  if (!liveYardsMatchCard(live)) return false;
  if (args.hidden) return live.yards < YARDAGE_OVERLAY_SHOW_AT_YD;
  return live.yards < YARDAGE_OVERLAY_HIDE_BELOW_YD;
}
