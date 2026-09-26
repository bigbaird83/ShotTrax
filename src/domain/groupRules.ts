import type { GroupGameSettings } from './groupGames';

/**
 * Plain "how it's scored" text for each group game, built from the same rules
 * planGroupGames uses. It follows the group's settings: whether net is being
 * scored, how strokes are given (off the low, or full for Stableford),
 * whether tied skins carry over, and the 9-hole halving.
 */

export type GroupGameId = 'strokePlay' | 'skins' | 'stableford' | 'matchPlay' | 'nassau';

export type GroupRulesContext = {
  /** Net is actually being scored (on, and not blocked). */
  net: boolean;
  /** Holes in the round (9 halves handicap strokes). */
  holeCount: number;
  playerCount: number;
  /** Names of the two match players, when there is a pair. */
  matchNames: readonly [string, string] | null;
};

function halving(ctx: GroupRulesContext): string {
  return ctx.holeCount === 9 ? ' On a 9-hole round, handicap strokes are halved (rounded, halves up).' : '';
}

/** How handicap strokes are placed on holes, for `holes` holes. */
function placement(holes: number): string {
  return (
    'one stroke a hole on the hardest holes first (by stroke index), ' +
    `and a second stroke on the hardest holes once someone gets more than ${holes}`
  );
}

export function describeGroupGame(
  id: GroupGameId,
  settings: Pick<GroupGameSettings, 'skinsCarry'>,
  ctx: GroupRulesContext,
): string {
  const holes = ctx.holeCount === 9 ? 9 : 18;
  switch (id) {
    case 'strokePlay':
      return ctx.net
        ? 'Every stroke counts, then handicap strokes come off. The lowest handicap in the group plays off ' +
            'scratch, so their net score is the same as their gross. Everyone else gets their handicap minus ' +
            `the lowest: ${placement(holes)}. The leaderboard ranks by net score to par over the holes each ` +
            `player has finished, so players on different holes compare fairly. Ties share a place.${halving(ctx)}`
        : 'Every stroke counts. The leaderboard ranks by score to par over the holes each player has ' +
            'finished, so players on different holes compare fairly. Ties share a place.';
    case 'skins': {
      const tie = settings.skinsCarry
        ? 'If two or more players tie for the lowest, no one wins it and the skin carries over, so the next ' +
          'hole is worth one more. Skins still tied after the last hole are not won.'
        : 'If two or more players tie for the lowest, no one wins that skin, and the next hole is worth one.';
      const net = ctx.net
        ? ` Scores are net, with strokes off the group's lowest handicap (the same strokes as the net leaderboard).${halving(ctx)}`
        : '';
      return (
        `Each hole is worth one skin. The lowest score on the hole wins it outright. ${tie} ` +
        "Holes are settled in order: if anyone's score is missing on a hole, skins wait there until it is " +
        `entered.${net}`
      );
    }
    case 'stableford':
      return (
        'Points on each hole against par: albatross 5, eagle 4, birdie 3, par 2, bogey 1, double bogey or ' +
        'worse 0. Most points wins. A hole needs a par to count.' +
        (ctx.net
          ? ` Net: each player uses their full course handicap, not strokes off the lowest: ${placement(holes)}. ` +
            `Strokes come off the score before points are counted.${halving(ctx)}`
          : '')
      );
    case 'matchPlay':
      return (
        `${who(ctx)}Hole by hole: the lower score wins the hole and equal scores halve it. The status shows ` +
        'who is up and by how many holes ("2 UP thru 7"). The match ends once the leader is up by more holes ' +
        'than are left ("3 & 2"); level after the last hole is halved.' +
        (ctx.net
          ? ' Net: the lower handicap of the two plays off scratch, and the other gets the difference between ' +
            `their handicaps: ${placement(holes)}. Other players' handicaps don't count.${halving(ctx)}`
          : '')
      );
    case 'nassau':
      return (
        `${who(ctx)}Three match-play bets between the same two players: the front 9, the back 9, and the ` +
        'full 18. Each is won like match play and can end early.' +
        (ctx.net
          ? ' Net: the lower handicap of the two plays off scratch and the other gets the difference, placed ' +
            'over all 18 holes by stroke index, so one nine can get more of the strokes than the other.'
          : '')
      );
  }
}

function who(ctx: GroupRulesContext): string {
  if (ctx.matchNames) return `${ctx.matchNames[0]} vs ${ctx.matchNames[1]}. `;
  return ctx.playerCount > 2 ? 'Pick the two players. ' : 'Two players. ';
}

/** One line for the game switch; the full text sits behind "How it's scored". */
export function describeGroupGameShort(
  id: GroupGameId,
  settings: Pick<GroupGameSettings, 'skinsCarry'>,
  ctx: GroupRulesContext,
): string {
  const pair = ctx.matchNames ? `${ctx.matchNames[0]} vs ${ctx.matchNames[1]}` : null;
  switch (id) {
    case 'strokePlay':
      return ctx.net ? 'Lowest net score to par leads, strokes off the lowest handicap.' : 'Lowest score to par leads.';
    case 'skins':
      return (
        (settings.skinsCarry ? 'Lowest score wins the hole; ties carry over.' : 'Lowest score wins the hole; ties win nothing.') +
        (ctx.net ? ' Net, strokes off the lowest handicap.' : '')
      );
    case 'stableford':
      return 'Points against par on every hole; most points wins.' + (ctx.net ? ' Net, full handicaps.' : '');
    case 'matchPlay':
      return (
        (pair ? `${pair}, hole by hole.` : ctx.playerCount > 2 ? 'Pick two players; hole by hole.' : 'Two players, hole by hole.') +
        (ctx.net ? ' Net, strokes off the lower of the two.' : '')
      );
    case 'nassau':
      return (
        (pair ? `${pair}: front 9, back 9, and overall.` : 'Front 9, back 9, and overall matches.') +
        (ctx.net ? ' Net, strokes off the lower of the two.' : '')
      );
  }
}
