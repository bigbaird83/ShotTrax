/** Club picker Back / Home. Neither tap selects a club or marks a shot. */

export type ClubPickLeaveAction = 'back' | 'home';

export type ClubPickLeavePlan = {
  selectClub: false;
  mark: false;
  savesGps: false;
  closesPendingShot: false;
  dest: 'hole' | 'rounds';
  keepRoundInProgress: true;
};

export function planClubPickLeave(action: ClubPickLeaveAction): ClubPickLeavePlan {
  return {
    selectClub: false,
    mark: false,
    savesGps: false,
    closesPendingShot: false,
    dest: action === 'home' ? 'rounds' : 'hole',
    keepRoundInProgress: true,
  };
}

/** Signal Lab: Back / Home never run acceptFix. */
export function clubPickLeaveRunsAcceptFix(_action: ClubPickLeaveAction): false {
  return false;
}

/** Destinations for Back (hole) and Home (Rounds list). Round stays in progress. */
export function clubPickLeaveHref(args: {
  action: ClubPickLeaveAction;
  roundId: string;
  holeNumber: number;
}): '/' | `/round/${string}/hole/${number}` {
  const plan = planClubPickLeave(args.action);
  if (plan.dest === 'rounds') return '/';
  return `/round/${args.roundId}/hole/${args.holeNumber}`;
}
