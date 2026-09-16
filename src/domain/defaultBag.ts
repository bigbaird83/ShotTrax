import type { Club } from './types';

/** Standard 14-club bag. Voice aliases / top-3 ranking are deferred (P2+). */
export const DEFAULT_BAG: Omit<Club, 'enabled'>[] = [
  { id: 'club_driver', name: 'Driver', shortName: 'Dr', loftRank: 0, sortOrder: 0 },
  { id: 'club_3w', name: '3 Wood', shortName: '3W', loftRank: 1, sortOrder: 1 },
  { id: 'club_5w', name: '5 Wood', shortName: '5W', loftRank: 2, sortOrder: 2 },
  { id: 'club_4h', name: '4 Hybrid', shortName: '4H', loftRank: 3, sortOrder: 3 },
  { id: 'club_5i', name: '5 Iron', shortName: '5i', loftRank: 4, sortOrder: 4 },
  { id: 'club_6i', name: '6 Iron', shortName: '6i', loftRank: 5, sortOrder: 5 },
  { id: 'club_7i', name: '7 Iron', shortName: '7i', loftRank: 6, sortOrder: 6 },
  { id: 'club_8i', name: '8 Iron', shortName: '8i', loftRank: 7, sortOrder: 7 },
  { id: 'club_9i', name: '9 Iron', shortName: '9i', loftRank: 8, sortOrder: 8 },
  { id: 'club_pw', name: 'Pitching Wedge', shortName: 'PW', loftRank: 9, sortOrder: 9 },
  { id: 'club_gw', name: 'Gap Wedge', shortName: 'GW', loftRank: 10, sortOrder: 10 },
  { id: 'club_sw', name: 'Sand Wedge', shortName: 'SW', loftRank: 11, sortOrder: 11 },
  { id: 'club_lw', name: 'Lob Wedge', shortName: 'LW', loftRank: 12, sortOrder: 12 },
  { id: 'club_putter', name: 'Putter', shortName: 'Pt', loftRank: 13, sortOrder: 13 },
];
