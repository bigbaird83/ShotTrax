/**
 * Watch motion and mic-based shot detect stay out of scope.
 * Voice club pick is not in this IPA.
 * Putts are never auto-detected from GPS or leaving the green.
 * TF 44: detection stays v0 manual. Watch = club select + Watch GPS only.
 */
export const WATCH_ASSIST = false;
export const MIC_SHOT_ASSIST = false;
export const PUTT_ASSIST = false;
export const AUTO_PUTTS_FROM_GPS = false;
export const AUTO_PUTTS_FROM_LEAVE_GREEN = false;
/** Catch-up Placed shots: two map taps + haversine. Never acceptFix / soft / good. */
export const PLACED_SHOT_USES_ACCEPT_FIX = false;
