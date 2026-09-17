/**
 * Watch motion and mic-based shot detect stay out of scope.
 * Voice club pick maps speech to a club; the UI marks GPS immediately (no confirm sheet).
 * Putts are never auto-detected from GPS or leaving the green.
 */
export const WATCH_ASSIST = false;
export const MIC_SHOT_ASSIST = false;
export const PUTT_ASSIST = false;
export const AUTO_PUTTS_FROM_GPS = false;
export const AUTO_PUTTS_FROM_LEAVE_GREEN = false;
