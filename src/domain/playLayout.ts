/**
 * Play screen: map fills the hole down to a short two-row dock.
 * Header is a thin overlay. Add shot still takes the full screen.
 */

export const PLAY_MAP_MIN_RATIO = 0.6;

export const PLAY_DOCK_ACTIONS = ['same_club', 'add_shot', 'scorecard', 'prev', 'next'] as const;
export type PlayDockAction = (typeof PLAY_DOCK_ACTIONS)[number];

export type PlayLayout = {
  map: 'fill';
  mapMinRatio: typeof PLAY_MAP_MIN_RATIO;
  header: 'overlay';
  headerItems: readonly ['menu', 'hole', 'to-green', 'shots'];
  dockRows: readonly ['chips', 'actions'];
  dockActions: readonly PlayDockAction[];
  allClubs: 'chip';
  sayClub: 'chip';
  sameClub: 'short';
  shotLine: 'header';
  insertPlus: 'header';
  emptyMiddle: false;
};

export function planPlayLayout(): PlayLayout {
  return {
    map: 'fill',
    mapMinRatio: PLAY_MAP_MIN_RATIO,
    header: 'overlay',
    headerItems: ['menu', 'hole', 'to-green', 'shots'],
    dockRows: ['chips', 'actions'],
    dockActions: PLAY_DOCK_ACTIONS,
    allClubs: 'chip',
    sayClub: 'chip',
    sameClub: 'short',
    shotLine: 'header',
    insertPlus: 'header',
    emptyMiddle: false,
  };
}

export function playMapMinRatio(): number {
  return PLAY_MAP_MIN_RATIO;
}

export function playDockRowCount(): 2 {
  return 2;
}

export function playHeaderEatsMap(): false {
  return false;
}

export function playShowsFatAllClubs(): false {
  return false;
}

export function playShowsFatSayClub(): false {
  return false;
}

export function playChipRowIncludes(): readonly ['suggested', 'all_clubs', 'say_club'] {
  return ['suggested', 'all_clubs', 'say_club'];
}

export function playShowsTallSameClub(): false {
  return false;
}

export function playEmptyMiddle(): false {
  return false;
}

/** Play map uses the same tee-to-green lock as Add shot, before Add shot opens. */
export function playUsesAddShotCamera(): true {
  return true;
}
