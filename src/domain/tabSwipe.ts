/** Swipe left / right on the home tabs moves to the next / previous tab. */
export const TAB_SWIPE_ORDER = ['index', 'favorites', 'bag', 'averages'] as const;
export type HomeTab = (typeof TAB_SWIPE_ORDER)[number];

const TAB_HREF: Record<HomeTab, '/' | '/favorites' | '/bag' | '/averages'> = {
  index: '/',
  favorites: '/favorites',
  bag: '/bag',
  averages: '/averages',
};

/** Horizontal travel before the tab swipe claims the touch from taps / vertical scroll. */
export const TAB_SWIPE_CLAIM_PX = 12;
/** Release past this distance, or a quick flick past the short one, changes tab. */
export const TAB_SWIPE_TRIGGER_PX = 60;
export const TAB_SWIPE_FLICK_PX = 30;
export const TAB_SWIPE_FLICK_VX = 0.4;

export function tabHref(tab: HomeTab): '/' | '/favorites' | '/bag' | '/averages' {
  return TAB_HREF[tab];
}

/** Clearly sideways, so vertical scrolling is left alone. */
export function tabSwipeClaims(args: { dx: number; dy: number }): boolean {
  return Math.abs(args.dx) > TAB_SWIPE_CLAIM_PX && Math.abs(args.dx) > 2 * Math.abs(args.dy);
}

/** The tab a finished swipe lands on, or null to stay put. */
export function tabSwipeTarget(args: { tab: HomeTab; dx: number; dy: number; vx: number }): HomeTab | null {
  const { dx, dy, vx } = args;
  if (Math.abs(dx) <= Math.abs(dy)) return null;
  const far = Math.abs(dx) >= TAB_SWIPE_TRIGGER_PX;
  const flick = Math.abs(dx) >= TAB_SWIPE_FLICK_PX && Math.abs(vx) >= TAB_SWIPE_FLICK_VX;
  if (!far && !flick) return null;
  const i = TAB_SWIPE_ORDER.indexOf(args.tab);
  // Finger moving left brings in the tab to the right, like a page.
  const next = dx < 0 ? i + 1 : i - 1;
  return TAB_SWIPE_ORDER[next] ?? null;
}
