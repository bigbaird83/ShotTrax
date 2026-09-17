import type { Club } from './types';

const NUMBER_WORDS: Record<string, string> = {
  one: '1',
  two: '2',
  three: '3',
  four: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8',
  nine: '9',
  ten: '10',
};

/** Spoken nicknames for the seeded 14-club bag. Custom clubs still match on name/shortName. */
export const DEFAULT_CLUB_NICKNAMES: Record<string, string[]> = {
  club_driver: ['driver', 'the driver', 'big dog', 'big stick', '1 wood', '1w', 'one wood'],
  club_3w: ['3 wood', '3w', 'three wood', 'spoon', '3wood'],
  club_5w: ['5 wood', '5w', 'five wood', '5wood'],
  club_4h: ['4 hybrid', '4h', 'four hybrid', '4 rescue', 'hybrid', 'rescue', 'utility'],
  club_5i: ['5 iron', '5i', 'five iron', '5iron'],
  club_6i: ['6 iron', '6i', 'six iron', '6iron'],
  club_7i: ['7 iron', '7i', 'seven iron', '7iron'],
  club_8i: ['8 iron', '8i', 'eight iron', '8iron'],
  club_9i: ['9 iron', '9i', 'nine iron', '9iron'],
  club_pw: ['pitching wedge', 'pw', 'pitching', 'pitch wedge', 'p wedge'],
  club_gw: ['gap wedge', 'gw', 'approach wedge', 'aw', 'gap', 'approach'],
  club_sw: ['sand wedge', 'sw', 'sand', 'bunker wedge'],
  club_lw: ['lob wedge', 'lw', 'lob', '60 degree', '60'],
  club_putter: ['putter', 'putt', 'flat stick', 'the putter'],
};

const GENERIC_TOKENS = new Set([
  'iron',
  'wood',
  'wedge',
  'hybrid',
  'club',
  'the',
  'a',
  'an',
  'my',
  'please',
  'use',
  'hit',
  'me',
  'give',
  'i',
  'need',
  'want',
  'go',
  'with',
]);

export function normalizeUtterance(raw: string): string {
  let s = raw.toLowerCase().replace(/['’]/g, '');
  s = s.replace(/[^a-z0-9]+/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  const parts = s.split(' ').map((w) => NUMBER_WORDS[w] ?? w);
  return parts.filter(Boolean).join(' ');
}

function aliasesForClub(club: Club): string[] {
  const out = new Set<string>();
  const push = (value: string) => {
    const n = normalizeUtterance(value);
    if (n) out.add(n);
  };
  push(club.name);
  push(club.shortName);
  push(club.name.replace(/\s+/g, ''));
  push(club.shortName.replace(/\s+/g, ''));

  const compact = club.shortName.replace(/\s+/g, '').toLowerCase();
  if (/^\d+[iwh]$/.test(compact)) {
    const n = compact.slice(0, -1);
    const kind = compact.slice(-1);
    if (kind === 'i') push(`${n} iron`);
    if (kind === 'w') push(`${n} wood`);
    if (kind === 'h') push(`${n} hybrid`);
  }

  for (const nick of DEFAULT_CLUB_NICKNAMES[club.id] ?? []) {
    push(nick);
  }
  return [...out];
}

type Scored = { club: Club; score: number };

function scoreAlias(utterance: string, alias: string): number {
  if (!alias) return 0;
  if (utterance === alias) return 200 + alias.length;
  if (utterance.includes(` ${alias} `) || utterance.startsWith(`${alias} `) || utterance.endsWith(` ${alias}`)) {
    return 120 + alias.length;
  }
  if (utterance.includes(alias) && alias.length >= 3) return 90 + alias.length;
  return 0;
}

/**
 * Map a speech transcript to an enabled bag club.
 * Returns null when nothing distinctive matches (caller keeps tap targets).
 * Matching does not mark; the UI applies the club immediately (no confirm sheet).
 */
export function matchSpokenClub(transcript: string, clubs: Club[]): Club | null {
  const utterance = normalizeUtterance(transcript);
  if (!utterance) return null;

  const distinctive = utterance
    .split(' ')
    .filter((t) => t && !GENERIC_TOKENS.has(t))
    .join(' ');

  const scored: Scored[] = [];
  for (const club of clubs) {
    if (!club.enabled) continue;
    let best = 0;
    for (const alias of aliasesForClub(club)) {
      best = Math.max(best, scoreAlias(utterance, alias));
      if (distinctive && distinctive !== utterance) {
        best = Math.max(best, scoreAlias(distinctive, alias));
      }
    }
    if (best > 0) scored.push({ club, score: best });
  }

  if (scored.length === 0) return null;
  scored.sort((a, b) => b.score - a.score || a.club.loftRank - b.club.loftRank);
  const top = scored[0];
  const tied = scored.filter((s) => s.score === top.score);
  if (tied.length > 1) return null;
  return top.club;
}

/** Phrases to bias the recognizer toward bag clubs. */
export function speechContextualStrings(clubs: Club[]): string[] {
  const out = new Set<string>();
  for (const club of clubs) {
    if (!club.enabled) continue;
    out.add(club.name);
    out.add(club.shortName);
    for (const nick of DEFAULT_CLUB_NICKNAMES[club.id] ?? []) {
      out.add(nick);
    }
  }
  return [...out];
}
