import { MIN_TYPED_CLUBS_FOR_FILL } from './carryFill';
import { isPutterClubId, typicalCarrySeedForClub } from './defaultBag';

export const BAG_CUSTOMIZE_SETTING_KEY = 'bag_customize_prompt';

export function bagCustomizeSeenValue(): '1' {
  return '1';
}

export function bagCustomizeSkipValue(): 'skip' {
  return 'skip';
}

/** One first-run prompt. Skip-to-play or finishing 3 typed marks it seen — not every later launch. */
export function shouldPromptBagCustomize(seen: string | null | undefined): boolean {
  return seen !== bagCustomizeSeenValue() && seen !== bagCustomizeSkipValue();
}

export function bagSetupIsFirstRunOnly(): true {
  return true;
}

/** Start 9/18 is never blocked by bag setup. Course + tee stay the start gate. */
export function bagSetupBlocksStart(): false {
  return false;
}

export function countTypedCarries(
  clubs: readonly { id: string; typicalCarryYards?: number | null }[],
): number {
  return clubs.filter((club) => !isPutterClubId(club.id) && typicalCarrySeedForClub(club) != null)
    .length;
}

export function canFinishBagCarrySetup(typedCount: number): boolean {
  return typedCount >= MIN_TYPED_CLUBS_FOR_FILL;
}

export function bagCarrySetupNeedsTypedClubs(): typeof MIN_TYPED_CLUBS_FOR_FILL {
  return MIN_TYPED_CLUBS_FOR_FILL;
}
