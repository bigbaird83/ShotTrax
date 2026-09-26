/**
 * Hide phone-map yardage overlays when the yards card reads under this.
 * At 100 the overlays stay up if they were already showing.
 */
export const YARDAGE_OVERLAY_HIDE_BELOW_YD = 100;

/**
 * After the overlays are hidden, show them again only when the yards card
 * reads this distance or farther, so they do not flicker around 100 yards.
 */
export const YARDAGE_OVERLAY_SHOW_AT_YD = 105;

/**
 * The yards card's live reading (`planLiveGpsToPin`). This module does not
 * measure again: the number and the trust gate are already on this value.
 * Good or soft with a finite yard count is a reading. Anything else is the
 * dash (no fix, poor GPS, no saved green, or past the card's cap).
 */
export type YardsCardLive = {
  yards: number | null;
  quality: string;
  unavailable?: boolean;
};

function cardReadsYards(live: YardsCardLive | null | undefined): number | null {
  if (!live || live.unavailable) return null;
  if (live.quality !== 'good' && live.quality !== 'soft') return null;
  if (live.yards == null || !Number.isFinite(live.yards) || live.yards < 0) return null;
  return live.yards;
}

/**
 * Whether the phone hole map should hide its yardage overlays.
 *
 * `live` is the same value the yards card displays. Hide when that reading
 * is under {@link YARDAGE_OVERLAY_HIDE_BELOW_YD}. After hiding, show again
 * only at {@link YARDAGE_OVERLAY_SHOW_AT_YD} or more. A dash on the card
 * leaves the overlays as they are (rings stay hidden when there is no
 * trusted fix or no saved green, from the ring planner).
 * `hidden` is the previous decision. It is ignored when the card has no reading.
 */
export function phoneHoleMapYardageOverlaysHidden(args: {
  live: YardsCardLive | null | undefined;
  hidden: boolean;
}): boolean {
  const yards = cardReadsYards(args.live);
  if (yards == null) return false;
  if (args.hidden) return yards < YARDAGE_OVERLAY_SHOW_AT_YD;
  return yards < YARDAGE_OVERLAY_HIDE_BELOW_YD;
}
