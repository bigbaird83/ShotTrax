/**
 * Round-flow integration test.
 *
 * Screens are not rendered. This repo's runner is `node:test` via tsx. There is
 * no Jest and no @testing-library/react-native, and `react-native` itself does
 * not parse under that runner. Every step is domain/store level: the same
 * functions the hole screen and Home screen call, plus the phone-side Watch
 * `puttPick` handler (`startWatchClubBridge` → `onPuttPick`).
 *
 * Course data is the bundled Cypress Creek hydrate (tee, green, par). Location
 * points are replayed through a mocked expo-location feed. Coordinates are
 * never written in this file.
 *
 * Step 4 checks Shot review through shotReviewHoleHeader and shotReviewPuttLines
 * (the same helpers app/review/[id]/shots.tsx renders). Putt rows stay off the map.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mock, test } from 'node:test';
import type { SQLiteDatabase } from 'expo-sqlite';
import { LOCAL_CATALOG_ID_PREFIX, catalogCourseDetail, catalogEntryById, catalogEntryToSummary } from '../course/catalog';
import { CYPRESS_CREEK_CABOT_AR_KEY } from '../course/hydrate';
import { applyCourseHydrateToLayout } from '../course/hydrate';
import { layoutFromTee } from '../course/layout';
import type { CourseLayoutSeed } from '../course/layout';
import {
  closeOpenShotToExistingPin,
  deletePenalty,
  deleteRound,
  finishHoleOut,
  finishHolePutts,
  getHole,
  getRound,
  insertPenalty,
  listClubs,
  listHoles,
  listPenaltiesForHole,
  listRounds,
  listShotsForHole,
  startRound,
  updatePenaltyReason,
} from '../db/repo';
import { migrate } from '../db/schema';
import { planClubStrip } from '../domain/clubStrip';
import { decideCourseCardPaint, showPlayDockForCourseCard } from '../domain/courseCardPaint';
import { isPutterClubId } from '../domain/defaultBag';
import { shotPinsForHoleCamera } from '../domain/holeCamera';
import { loggedHoleStrokes } from '../domain/holeScore';
import { scoreAfterPenalty, totalPenaltyStrokes } from '../domain/penalty';
import { formatHoleCountLine } from '../domain/penaltySteps';
import { scorecardDiff, scorecardDiffLabel } from '../domain/scorecard';
import { isValidLatLng, type LatLng } from '../domain/latLng';
import { shotReviewHoleHeader, shotReviewPuttLines } from '../domain/shotReviewLayout';
import { playHrefAfterHoleChange } from '../domain/playNav';
import { planPlayDockFinish } from '../domain/putts';
import { planPlayLayout } from '../domain/playLayout';
import {
  addPuttLength,
  emptyPuttDraft,
  holeAfterDone,
  madeItWritesPutts,
  planMadeIt,
  puttDraftAfterHoleOut,
  PUTT_LENGTHS,
  type PuttDraft,
  type PuttLengthId,
} from '../domain/putts';
import {
  formatHistoryRow,
  historyDeletePrompt,
  historyLongPressDeletes,
  pastRoundCanAddShot,
  pastRoundMarksOnly,
} from '../domain/roundHistory';
import type { Hole, Round } from '../domain/types';
import { planWatchMadeItAdvance } from '../domain/watchPuttSync';
import {
  MADE_IT_FEEDBACK,
  PHONE_UNAVAILABLE,
  penaltyPickPayload,
  puttPickPayload,
  shotUndoPayload,
  type PenaltyPickMessage,
  type PuttPickMessage,
} from '../domain/watchMessages';
import { clearWatchUnconfirmed, watchRowBMiddleSlot, type WatchUnconfirmed } from '../domain/watchPendingConfirm';
import { watchLastShotId } from '../domain/watchShotUndo';
import { layoutForPlayedHoles, resolveCourseNumHoles } from '../domain/nineByTwo';

const GOOD_FIX_ACCURACY_M = 8;

type WatchListener = (event: { token?: string; json?: string }) => void;

const listeners = new Map<string, WatchListener>();
const gpsQueue: LatLng[] = [];
const pushedClubLists: unknown[] = [];
const watchReplies: { token: string; body: { ok?: boolean; feedback?: string } }[] = [];
const watchPushedMessages: { type?: string; kind?: string; id?: string; ok?: boolean }[] = [];

mock.module('react', {
  namedExports: {
    useEffect() {},
    useState(value: unknown) {
      return [typeof value === 'function' ? (value as () => unknown)() : value, () => {}];
    },
    useMemo(fn: () => unknown) {
      return fn();
    },
    useCallback(fn: unknown) {
      return fn;
    },
    useRef(value: unknown) {
      return { current: value };
    },
    createContext() {
      return {};
    },
    useContext() {
      return null;
    },
  },
});

mock.module('react-native', {
  namedExports: {
    Alert: { alert() {} },
  },
});

mock.module('expo', {
  namedExports: {
    requireOptionalNativeModule() {
      return null;
    },
  },
});

mock.module('expo-router', {
  namedExports: {
    router: { push() {}, replace() {}, setParams() {} },
    useLocalSearchParams() {
      return {};
    },
    useNavigation() {
      return {};
    },
  },
});

mock.module('expo-location', {
  namedExports: {
    Accuracy: { BestForNavigation: 6 },
    async requestForegroundPermissionsAsync() {
      return { status: 'granted' };
    },
    async getForegroundPermissionsAsync() {
      return { status: 'granted' };
    },
    async getCurrentPositionAsync() {
      const point = gpsQueue.shift();
      if (!point) {
        throw new Error('mocked GPS feed has no fixture location point');
      }
      return {
        coords: { latitude: point.lat, longitude: point.lng, accuracy: GOOD_FIX_ACCURACY_M },
        timestamp: Date.now(),
        mocked: true,
      };
    },
    async getLastKnownPositionAsync() {
      return null;
    },
    async watchPositionAsync() {
      return { remove() {} };
    },
  },
});

mock.module('expo-device', {
  namedExports: { isDevice: true },
});

mock.module('expo-haptics', {
  namedExports: {
    async selectionAsync() {},
    async notificationAsync() {},
    async impactAsync() {},
    NotificationFeedbackType: { Success: 1, Warning: 2 },
    ImpactFeedbackStyle: { Medium: 1, Light: 2 },
  },
});

mock.module('@/modules/watch-bridge', {
  namedExports: {
    getWatchBridgeNative() {
      return {
        isSupported: () => true,
        isReachable: () => true,
        async pushClubListJson(json: string) {
          pushedClubLists.push(JSON.parse(json) as unknown);
        },
        async pushWatchMessageJson(json: string) {
          watchPushedMessages.push(JSON.parse(json) as { type?: string; kind?: string; id?: string; ok?: boolean });
        },
        async replyClubPick(token: string, json: string) {
          watchReplies.push({ token, body: JSON.parse(json) as { ok?: boolean; feedback?: string } });
        },
        addListener(event: string, listener: WatchListener) {
          listeners.set(event, listener);
          return { remove() {} };
        },
      };
    },
  },
});

const DatabaseSync = (() => {
  try {
    return (require('node:sqlite') as typeof import('node:sqlite')).DatabaseSync;
  } catch {
    return null;
  }
})();

function memoryDb(): SQLiteDatabase {
  if (!DatabaseSync) throw new Error('node:sqlite unavailable');
  const raw = new DatabaseSync(':memory:');
  const args = (params?: unknown[]) => (params ?? []) as (string | number | null)[];
  const db = {
    execSync: (sql: string) => raw.exec(sql),
    runSync: (sql: string, params?: unknown[]) => raw.prepare(sql).run(...args(params)),
    getAllSync: (sql: string, params?: unknown[]) => raw.prepare(sql).all(...args(params)),
    getFirstSync: (sql: string, params?: unknown[]) => raw.prepare(sql).get(...args(params)) ?? null,
    prepareSync: (sql: string) => {
      const statement = raw.prepare(sql);
      return { executeSync: (params?: unknown[]) => statement.run(...args(params)), finalizeSync: () => {} };
    },
    withTransactionSync: (run: () => void) => {
      raw.exec('BEGIN');
      try {
        run();
        raw.exec('COMMIT');
      } catch (err) {
        raw.exec('ROLLBACK');
        throw err;
      }
    },
  };
  migrate(db as unknown as SQLiteDatabase);
  return db as unknown as SQLiteDatabase;
}

function show(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || value == null) return String(value);
  return JSON.stringify(value);
}

function check(step: number, expected: unknown, actual: unknown): void {
  const same = Object.is(expected, actual) || (typeof expected === 'object' && JSON.stringify(expected) === JSON.stringify(actual));
  if (!same) {
    throw new Error(`Step ${step}: expected ${show(expected)}, actual ${show(actual)}`);
  }
}

function modExports<T extends object>(loaded: T): T {
  const fallback = (loaded as { default?: T }).default;
  return fallback ?? loaded;
}

type ShotActions = {
  markShotWithClub: (
    db: SQLiteDatabase,
    args: {
      roundId: string;
      holeNumber: number;
      clubId: string | null;
      tee?: { lat: number; lng: number } | null;
    },
  ) => Promise<{ plan: { status: string } }>;
  closeApproachBeforePutts: (
    db: SQLiteDatabase,
    args: { roundId: string; holeNumber: number },
  ) => Promise<void>;
  takeDrop: (
    db: SQLiteDatabase,
    args: {
      roundId: string;
      holeNumber: number;
      reason: 'water' | 'ob' | 'unplayable' | 'other';
      note?: string | null;
      force?: boolean;
    },
  ) => Promise<{ plan: { status: string } }>;
  changeShotClub: (
    db: SQLiteDatabase,
    args: { roundId: string; shotId: string; clubId: string },
  ) => { status: string };
  moveShotSpot: (
    db: SQLiteDatabase,
    args: {
      roundId: string;
      holeNumber: number;
      shotId: string;
      point: LatLng;
      dropped: boolean;
      confirmed: boolean;
    },
  ) => { status: string };
};

type WatchClub = {
  setWatchClubContext: (next: {
    db: SQLiteDatabase;
    roundId: string;
    holeNumber: number;
    readOnly: boolean;
    tee?: { lat: number; lng: number } | null;
    bump: () => void;
    onPuttPick?: (msg: PuttPickMessage) => Promise<{ ok: boolean; feedback: string }>;
    labelForClub: (clubId: string) => string | null;
  }) => void;
  startWatchClubBridge: () => void;
  pushWatchMadeItAdvance: (args: { holeNumber: number; holeCount: number; lengths: PuttLengthId[] }) => Promise<void>;
};

type AppScreen =
  | { kind: 'hole'; holeNumber: number }
  | { kind: 'summary' };

function fixtureLayout(): { layout: CourseLayoutSeed; courseName: string; courseId: string } {
  const id = `${LOCAL_CATALOG_ID_PREFIX}${CYPRESS_CREEK_CABOT_AR_KEY}`;
  const entry = catalogEntryById(id);
  const detail = catalogCourseDetail(id);
  if (!entry || !detail) {
    throw new Error('No suitable course fixture with location points. Stopped without inventing coordinates.');
  }
  const summary = catalogEntryToSummary(entry);
  const base = layoutFromTee(detail, null);
  const hydrated = applyCourseHydrateToLayout(base, {
    name: summary.name,
    city: summary.city,
    state: summary.state,
    location: summary.location ?? base.location ?? null,
    courseKey: entry.courseKey,
  });
  const holeCount = detail.holeCount === 9 ? 9 : 18;
  const layout = layoutForPlayedHoles(hydrated, {
    numHoles: resolveCourseNumHoles({
      detailHoleCount: detail.holeCount,
      catalogHoleCount: entry.holeCount,
    }),
    playHoleCount: holeCount,
  });
  const hole1 = layout.holes?.find((hole) => hole.number === 1);
  if (!hole1?.teeCentroid || !hole1.greenCentroid) {
    throw new Error('No suitable course fixture with location points. Stopped without inventing coordinates.');
  }
  return { layout, courseName: summary.name, courseId: summary.id };
}

function locationPoint(layout: CourseLayoutSeed, holeNumber: number, which: 'tee' | 'green'): LatLng {
  const hole = layout.holes?.find((row) => row.number === holeNumber);
  const point = which === 'tee' ? hole?.teeCentroid : hole?.greenCentroid;
  if (!point) {
    throw new Error('No suitable course fixture with location points. Stopped without inventing coordinates.');
  }
  return point;
}

function enqueueFix(point: LatLng): void {
  gpsQueue.push(point);
}

function teeOf(hole: Hole | null): { lat: number; lng: number } | null {
  if (hole?.teeLat == null || hole.teeLng == null) return null;
  return { lat: hole.teeLat, lng: hole.teeLng };
}

function greenOf(hole: Hole | null): { lat: number; lng: number } | null {
  if (hole?.greenLat == null || hole.greenLng == null) return null;
  return { lat: hole.greenLat, lng: hole.greenLng };
}

function playingScore(db: SQLiteDatabase, roundId: string, holeNumber: number): number {
  const hole = getHole(db, roundId, holeNumber);
  const shots = hole ? listShotsForHole(db, hole.id) : [];
  if (hole?.score != null) return hole.score;
  return loggedHoleStrokes({
    shotCount: shots.length,
    putts: hole?.putts ?? 0,
    penaltyStrokes: 0,
  });
}

function postedTotal(db: SQLiteDatabase, roundId: string): number | null {
  const scored = listHoles(db, roundId).filter((hole) => hole.score != null);
  if (scored.length === 0) return null;
  return scored.reduce((sum, hole) => sum + (hole.score ?? 0), 0);
}

function shotCountFor(db: SQLiteDatabase, roundId: string): number {
  const holes = listHoles(db, roundId);
  return holes.reduce((sum, hole) => sum + listShotsForHole(db, hole.id).length, 0);
}

function clubSelectorVisible(db: SQLiteDatabase, round: Round): boolean {
  const clubs = listClubs(db, true);
  const strip = planClubStrip({ clubs });
  const layout = planPlayLayout();
  const marksOnly = pastRoundMarksOnly({ finished: Boolean(round.finishedAt), editRequested: false });
  return (
    !round.finishedAt &&
    pastRoundCanAddShot(marksOnly) &&
    layout.dockRows.includes('chips') &&
    strip.ids.length > 0
  );
}

function playDockVisible(db: SQLiteDatabase, round: Round, holeNumber: number): boolean {
  const hole = getHole(db, round.id, holeNumber);
  const paint = decideCourseCardPaint({
    tee: teeOf(hole),
    green: greenOf(hole),
    phone: null,
  });
  const shown = showPlayDockForCourseCard({
    paintMounts: paint.mount,
    mapFramed: true,
    catchUpFullScreen: false,
  });
  const finish = planPlayDockFinish({
    readOnly: Boolean(round.finishedAt),
    placing: false,
    puttsDone: hole?.puttsDone ?? false,
  });
  const layout = planPlayLayout();
  return shown && layout.dockRows.includes('actions') && finish.showHoleOut && finish.kind === 'hole_out';
}

let atTick = Date.parse('2026-09-24T12:00:00.000Z');

function nextAt(): string {
  atTick += 1;
  return new Date(atTick).toISOString();
}

test('round flow', { skip: DatabaseSync ? false : 'node:sqlite needs Node 22.5+' }, async () => {
  gpsQueue.length = 0;
  pushedClubLists.length = 0;
  listeners.clear();

  // takeDrop used to call insertPenalty inside its own BEGIN. The inner BEGIN
  // failed, the inner ROLLBACK ended the outer transaction, and the outer
  // ROLLBACK then threw "cannot rollback - no transaction is active".
  {
    const dropDb = memoryDb();
    const { layout, courseName } = fixtureLayout();
    const shotsApi = modExports(await import('../services/shotActions.ts')) as unknown as ShotActions;
    const round = startRound(dropDb, 18, courseName, layout);
    const hole = mustHole(dropDb, round.id, 1);
    enqueueFix(locationPoint(layout, 1, 'tee'));
    const dropped = await shotsApi.takeDrop(dropDb, {
      roundId: round.id,
      holeNumber: 1,
      reason: 'water',
      note: 'creek',
    });
    if (dropped.plan.status !== 'commit') {
      throw new Error(`takeDrop: expected commit, actual ${dropped.plan.status}`);
    }
    const drops = listPenaltiesForHole(dropDb, hole.id);
    if (drops.length !== 1 || drops[0]?.kind !== 'drop' || drops[0]?.reason !== 'water' || drops[0]?.strokes !== 1) {
      throw new Error(`takeDrop: expected one water drop, actual ${JSON.stringify(drops)}`);
    }
    const afterDrop = getHole(dropDb, round.id, 1);
    const expectedDropScore = (hole.score ?? hole.par ?? 0) + 1;
    if (afterDrop?.score !== expectedDropScore) {
      throw new Error(`takeDrop: expected score ${expectedDropScore}, actual ${afterDrop?.score ?? null}`);
    }

    // Menu Penalty calls insertPenalty directly — one BEGIN, not a nested one.
    const saved = insertPenalty(dropDb, {
      holeId: hole.id,
      par: hole.par,
      currentScore: afterDrop?.score ?? null,
      strokes: 2,
      reason: 'ob',
      note: null,
      kind: 'penalty',
    });
    if (saved.replay === 'deleted') {
      throw new Error('penalty: insert was treated as a deleted id');
    }
    if (saved.penalty.kind !== 'penalty' || saved.score !== expectedDropScore + 2) {
      throw new Error(`penalty: expected kind penalty and score ${expectedDropScore + 2}, actual ${saved.penalty.kind} ${saved.score}`);
    }
    const rows = listPenaltiesForHole(dropDb, hole.id);
    if (rows.length !== 2 || rows[1]?.kind !== 'penalty' || rows[1]?.reason !== 'ob') {
      throw new Error(`penalty: expected drop then penalty, actual ${JSON.stringify(rows.map((row) => row.kind))}`);
    }
    gpsQueue.length = 0;
  }

  const db = memoryDb();
  check(1, 0, listRounds(db).length);

  const { layout, courseName } = fixtureLayout();
  const shotsApi = modExports(await import('../services/shotActions.ts')) as unknown as ShotActions;
  const watchApi = modExports(await import('../services/watchClub.ts')) as unknown as WatchClub;
  watchApi.startWatchClubBridge();
  assert.equal(typeof listeners.get('onPuttPick'), 'function');
  assert.equal(typeof listeners.get('onClubPick'), 'function');
  await watchPenaltyRound(shotsApi, watchApi);
  gpsQueue.length = 0;

  const holeScreen = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  const madeStart = holeScreen.indexOf('const applyMadeIt');
  const madeItFn = holeScreen.slice(madeStart, holeScreen.indexOf('useWatchClubList(', madeStart));
  assert.match(madeItFn, /planMadeIt/);
  assert.match(madeItFn, /finishHolePutts|saveDraft/);
  assert.match(madeItFn, /finishHoleOut/);
  assert.match(madeItFn, /pushWatchMadeItAdvance/);
  assert.match(madeItFn, /holeAfterDone/);
  assert.match(madeItFn, /madeItWritesPutts\(/);
  assert.match(madeItFn, /clearPuttDraft\(\)/);
  const homeScreen = readFileSync(new URL('../../app/(tabs)/index.tsx', import.meta.url), 'utf8');
  assert.match(homeScreen, /historyDeletePrompt/);
  assert.match(homeScreen, /deleteRound\(db, round\.id\)/);
  const reviewScreen = readFileSync(new URL('../../app/review/[id]/shots.tsx', import.meta.url), 'utf8');
  assert.match(reviewScreen, /shotReviewPuttLines\(hole\)/);
  assert.match(reviewScreen, /shotReviewHoleHeader\(hole\)/);
  assert.match(reviewScreen, /shotPinsForHoleCamera\(shots\)/);
  assert.match(reviewScreen, /shots=\{shots\}/);

  const round = startRound(db, 18, courseName, layout);
  const clubs = listClubs(db, true).filter((club) => !isPutterClubId(club.id));
  if (clubs.length < 2) {
    throw new Error(`Step 2: expected at least 2 clubs, actual ${clubs.length}`);
  }
  const clubA = clubs[0]!;
  const clubB = clubs.find((club) => club.id !== clubA.id)!;

  const session: {
    holeNumber: number;
    screen: AppScreen;
    puttOpen: boolean;
    puttDraft: PuttDraft;
    roundComplete: boolean;
    hook: ((work: Promise<unknown>) => void) | null;
  } = {
    holeNumber: 1,
    screen: { kind: 'hole', holeNumber: 1 },
    puttOpen: false,
    puttDraft: emptyPuttDraft(),
    roundComplete: false,
    hook: null,
  };

  // Same decisions as HoleScreen.onWatchPuttPick / applyMadeIt. The screen is
  // not mounted; this is the puttPick consumer the Watch handler calls.
  const onPuttPick = async (msg: PuttPickMessage): Promise<{ ok: boolean; feedback: string }> => {
    const live = getRound(db, round.id);
    if (!live || live.finishedAt) return { ok: false, feedback: PHONE_UNAVAILABLE };
    const target = session.puttOpen ? session.holeNumber : session.holeNumber;
    if (msg.action === 'add' && msg.lengthId) {
      session.puttDraft = addPuttLength(session.puttDraft, msg.lengthId);
      session.puttOpen = true;
      return { ok: true, feedback: 'putts' };
    }
    if (msg.action === 'undo') {
      return { ok: false, feedback: PHONE_UNAVAILABLE };
    }
    if (msg.action === 'made') {
      const pending = msg.lengthId ?? null;
      const draft = session.puttDraft;
      const rowNow = getHole(db, round.id, target);
      if (!madeItWritesPutts(Boolean(rowNow?.puttsDone))) {
        session.puttOpen = false;
        session.puttDraft = puttDraftAfterHoleOut();
        const lengths = (rowNow?.puttLengths ?? []).filter((id): id is PuttLengthId =>
          PUTT_LENGTHS.some((length) => length.id === id),
        );
        return advanceAfterMade(target, lengths);
      }
      if (session.puttOpen || pending || draft.lengths.length > 0 || draft.putts > 0) {
        const planned = planMadeIt(draft, pending);
        finishHolePutts(db, mustHole(db, round.id, target).id, planned.putts, planned.lengths);
        session.puttOpen = false;
        session.puttDraft = puttDraftAfterHoleOut();
        return advanceAfterMade(target, planned.lengths);
      }
      const row = getHole(db, round.id, target);
      if (!row || row.puttsDone) return { ok: false, feedback: PHONE_UNAVAILABLE };
      const pin = greenOf(row);
      closeOpenShotToExistingPin(db, row.id, pin);
      await shotsApi.closeApproachBeforePutts(db, { roundId: round.id, holeNumber: target });
      finishHoleOut(db, row.id);
      return advanceAfterMade(target, row.puttLengths.filter((id): id is PuttLengthId => PUTT_LENGTHS.some((row) => row.id === id)));
    }
    return { ok: false, feedback: PHONE_UNAVAILABLE };
  };

  async function advanceAfterMade(target: number, lengths: PuttLengthId[]): Promise<{ ok: true; feedback: string }> {
    const live = getRound(db, round.id);
    const holeCount = live?.holeCount ?? 18;
    const plan = planWatchMadeItAdvance({
      holeNumber: target,
      holeCount,
      lengths,
      last: null,
    });
    await watchApi.pushWatchMadeItAdvance({ holeNumber: target, holeCount, lengths });
    const dest = holeAfterDone(target, holeCount);
    if (dest.kind === 'summary' || plan.clubList.roundComplete) {
      session.screen = { kind: 'summary' };
      session.roundComplete = plan.clubList.roundComplete === true;
      session.puttOpen = false;
      session.puttDraft = emptyPuttDraft();
      return { ok: true, feedback: MADE_IT_FEEDBACK };
    }
    session.holeNumber = dest.holeNumber;
    session.screen = { kind: 'hole', holeNumber: dest.holeNumber };
    session.puttOpen = false;
    session.puttDraft = emptyPuttDraft();
    return { ok: true, feedback: MADE_IT_FEEDBACK };
  }

  function bindWatch(): void {
    const hole = getHole(db, round.id, session.holeNumber);
    watchApi.setWatchClubContext({
      db,
      roundId: round.id,
      holeNumber: session.holeNumber,
      readOnly: false,
      tee: teeOf(hole),
      bump() {},
      onPuttPick: (msg) => {
        const work = onPuttPick(msg);
        session.hook?.(work);
        return work;
      },
      labelForClub: (clubId) => clubs.find((club) => club.id === clubId)?.shortName ?? null,
    });
  }

  async function sendMadeIt(lengthId?: PuttLengthId): Promise<void> {
    bindWatch();
    const listener = listeners.get('onPuttPick');
    if (!listener) throw new Error('Watch onPuttPick listener is not registered');
    let settled: Promise<void> = Promise.resolve();
    session.hook = (work) => {
      settled = work.then(
        () => undefined,
        () => undefined,
      );
    };
    listener({
      token: `round-flow-${atTick}`,
      json: JSON.stringify(puttPickPayload({ action: 'made', at: nextAt(), lengthId })),
    });
    await new Promise<void>((resolve, reject) => {
      setImmediate(() => {
        settled.then(resolve, reject);
      });
    });
  }

  async function mark(clubId: string, point: LatLng): Promise<void> {
    enqueueFix(point);
    const hole = mustHole(db, round.id, session.holeNumber);
    const { plan } = await shotsApi.markShotWithClub(db, {
      roundId: round.id,
      holeNumber: session.holeNumber,
      clubId,
      tee: teeOf(hole),
    });
    if (plan.status !== 'commit') {
      throw new Error(`mark did not commit (${plan.status})`);
    }
  }

  // Step 1 — start on the fixture course, hole 1.
  {
    const step = 1;
    check(step, 1, session.holeNumber);
    check(step, 0, playingScore(db, round.id, 1));
    check(step, true, clubSelectorVisible(db, round));
    check(step, true, playDockVisible(db, round, 1));
    check(step, 0, listShotsForHole(db, mustHole(db, round.id, 1).id).length);
    check(step, courseName, getRound(db, round.id)?.courseName ?? null);
  }

  // Step 2 — pick a club and mark a shot from the fixture tee.
  {
    const step = 2;
    await mark(clubA.id, locationPoint(layout, 1, 'tee'));
    const shots = listShotsForHole(db, mustHole(db, round.id, 1).id);
    check(step, 1, shots.length);
    check(step, clubA.id, shots[0]?.clubId ?? null);
    check(step, 1, playingScore(db, round.id, 1));
  }

  // Step 3 — a different club, second shot, from the fixture green.
  {
    const step = 3;
    await mark(clubB.id, locationPoint(layout, 1, 'green'));
    const shots = listShotsForHole(db, mustHole(db, round.id, 1).id);
    check(step, 2, shots.length);
    check(step, clubA.id, shots[0]?.clubId ?? null);
    check(step, clubB.id, shots[1]?.clubId ?? null);
    check(step, 2, playingScore(db, round.id, 1));
  }

  // Step 4 — Hole Out with 2 putts. Score is shots + putts. Shot rows stay 2.
  {
    const step = 4;
    const before = postedTotal(db, round.id);
    const bucketA = PUTT_LENGTHS[0]!.id;
    const bucketB = PUTT_LENGTHS[1]!.id;
    const onePutt = addPuttLength(emptyPuttDraft(), bucketA);
    const planned = planMadeIt(onePutt, bucketB);
    const hole = mustHole(db, round.id, 1);
    closeOpenShotToExistingPin(db, hole.id, greenOf(hole));
    await shotsApi.closeApproachBeforePutts(db, { roundId: round.id, holeNumber: 1 });
    finishHolePutts(db, hole.id, planned.putts, planned.lengths);
    session.puttDraft = puttDraftAfterHoleOut();
    session.puttOpen = false;
    const shots = listShotsForHole(db, hole.id);
    const closed = getHole(db, round.id, 1);
    check(step, 2, planned.putts);
    check(step, 4, closed?.score ?? null);
    check(step, 2, shots.length);
    check(step, clubA.id, shots[0]?.clubId ?? null);
    check(step, clubB.id, shots[1]?.clubId ?? null);
    const total = postedTotal(db, round.id);
    check(step, 4, total);
    if (before === total) {
      throw new Error(`Step ${step}: expected round total updated, actual ${show(total)}`);
    }
    if (!closed) {
      throw new Error(`Step ${step}: expected a closed hole, actual null`);
    }
    const puttLines = shotReviewPuttLines(closed);
    const expectedPuttLines = planned.lengths.map((id, index) => {
      const label = PUTT_LENGTHS.find((row) => row.id === id)?.label;
      return `Putt ${index + 1} · ${label ?? id}`;
    });
    check(step, expectedPuttLines, puttLines);
    check(step, 2, puttLines.length);
    const header = shotReviewHoleHeader(closed);
    if (!header.includes('2 putts')) {
      throw new Error(`Step ${step}: expected Shot review header to include 2 putts, actual ${show(header)}`);
    }
    const pins = shotPinsForHoleCamera(shots);
    const shotsOnMap = shots.filter((shot) => {
      const start = { lat: shot.startLat ?? Number.NaN, lng: shot.startLng ?? Number.NaN };
      const end = { lat: shot.endLat ?? Number.NaN, lng: shot.endLng ?? Number.NaN };
      return isValidLatLng(start) || isValidLatLng(end);
    });
    check(step, 2, shotsOnMap.length);
    const endpoints = shots.reduce((count, shot) => {
      const start = { lat: shot.startLat ?? Number.NaN, lng: shot.startLng ?? Number.NaN };
      const end = { lat: shot.endLat ?? Number.NaN, lng: shot.endLng ?? Number.NaN };
      return count + (isValidLatLng(start) ? 1 : 0) + (isValidLatLng(end) ? 1 : 0);
    }, 0);
    check(step, endpoints, pins.length);

    // Edit a saved shot: cancel leaves it, club change keeps the pins, moving
    // the spot updates this shot and the next one. Putts and score stay.
    const clubC = clubs.find((club) => club.id !== clubA.id && club.id !== clubB.id);
    if (!clubC) throw new Error(`Step ${step}: expected a third club`);
    const editHole = mustHole(db, round.id, 1);
    const beforeEdit = listShotsForHole(db, editHole.id);
    const target = beforeEdit[0];
    const follower = beforeEdit[1];
    if (!target?.endLat || target.endLng == null || !follower) {
      throw new Error(`Step ${step}: expected a stored spot on the first shot`);
    }
    if (follower.startLat !== target.endLat || follower.startLng !== target.endLng) {
      throw new Error(`Step ${step}: expected the next shot to measure from the first shot`);
    }
    const beforeDist = target.distanceYards;
    const beforeNext = follower.distanceYards;
    const cancelled = shotsApi.moveShotSpot(db, {
      roundId: round.id,
      holeNumber: 1,
      shotId: target.id,
      point: { lat: target.endLat + 0.01, lng: target.endLng },
      dropped: false,
      confirmed: false,
    });
    check(step, 'cancel', cancelled.status);
    const afterCancel = listShotsForHole(db, editHole.id);
    check(step, target.endLat, afterCancel[0]?.endLat ?? null);
    check(step, target.clubId, afterCancel[0]?.clubId ?? null);
    check(step, beforeDist, afterCancel[0]?.distanceYards ?? null);
    check(step, beforeNext, afterCancel[1]?.distanceYards ?? null);
    const clubbed = shotsApi.changeShotClub(db, {
      roundId: round.id,
      shotId: target.id,
      clubId: clubC.id,
    });
    check(step, 'commit', clubbed.status);
    const droppedPoint = { lat: target.endLat + 0.01, lng: target.endLng + 0.01 };
    const moved = shotsApi.moveShotSpot(db, {
      roundId: round.id,
      holeNumber: 1,
      shotId: target.id,
      point: droppedPoint,
      dropped: true,
      confirmed: true,
    });
    check(step, 'commit', moved.status);
    const afterEdit = listShotsForHole(db, editHole.id);
    check(step, clubC.id, afterEdit[0]?.clubId ?? null);
    check(step, droppedPoint.lat, afterEdit[0]?.endLat ?? null);
    check(step, droppedPoint.lng, afterEdit[0]?.endLng ?? null);
    check(step, droppedPoint.lat, afterEdit[1]?.startLat ?? null);
    check(step, droppedPoint.lng, afterEdit[1]?.startLng ?? null);
    check(step, target.startLat, afterEdit[0]?.startLat ?? null);
    check(step, follower.endLat, afterEdit[1]?.endLat ?? null);
    if (afterEdit[0]?.distanceYards === beforeDist) {
      throw new Error(`Step ${step}: expected the moved shot's distance to change`);
    }
    if (afterEdit[1]?.distanceYards === beforeNext) {
      throw new Error(`Step ${step}: expected the next shot's distance to change`);
    }
    const editedHole = getHole(db, round.id, 1);
    check(step, 4, editedHole?.score ?? null);
    check(step, 2, editedHole?.putts ?? null);
    check(step, 2, afterEdit.length);
  }

  // Step 5 — Watch Made it after Hole Out. Hole 1 stays 4 strokes / 2 putts,
  // and the phone lands on hole 2 with the dock up.
  await sendMadeIt();
  {
    const step = 5;
    check(step, 2, session.holeNumber);
    check(step, 'hole', session.screen.kind);
    check(step, playHrefAfterHoleChange(round.id, 2), playHrefAfterHoleChange(round.id, session.holeNumber));
    const live = getRound(db, round.id);
    check(step, true, live ? playDockVisible(db, live, session.holeNumber) : false);
    const hole1 = getHole(db, round.id, 1);
    check(step, 4, hole1?.score ?? null);
    check(step, 2, hole1?.putts ?? null);
  }

  // Step 6 — fewest steps through the rest of the round. Hole 2 is closed with
  // one Made it so holes 3–17 can be played the same way, then Made it on 18.
  {
    const step = 6;
    for (let holeNumber = 2; holeNumber <= 17; holeNumber += 1) {
      check(step, holeNumber, session.holeNumber);
      await sendMadeIt(PUTT_LENGTHS[0]!.id);
    }
    check(step, 18, session.holeNumber);
    await sendMadeIt(PUTT_LENGTHS[0]!.id);
    check(step, 'summary', session.screen.kind);
    check(step, true, session.roundComplete);
    const lastList = pushedClubLists[pushedClubLists.length - 1] as { roundComplete?: boolean } | undefined;
    check(step, true, lastList?.roundComplete === true);
    check(step, 'Round complete', session.roundComplete ? 'Round complete' : null);

    const holes = listHoles(db, round.id);
    const hole1 = holes.find((hole) => hole.number === 1);
    const hole1Shots = hole1 ? listShotsForHole(db, hole1.id).length : 0;
    // Later holes: one Watch Made it, no shots → 1 stroke each.
    // Hole 1 stays at the step 4 total (shots + the 2 putts).
    let later = 0;
    for (const hole of holes) {
      if (hole.number === 1) continue;
      const shots = listShotsForHole(db, hole.id);
      check(step, 0, shots.length);
      check(step, 1, hole.putts);
      check(step, 1, hole.score ?? null);
      later += 1;
    }
    const entered = hole1Shots + (hole1?.putts ?? 0) + later;
    const homeRounds = listRounds(db);
    check(step, 1, homeRounds.length);
    check(step, round.id, homeRounds[0]?.id ?? null);
    check(step, courseName, homeRounds[0]?.courseName ?? null);
    const scored = holes.filter((hole) => hole.score != null);
    const homeTotal = scored.reduce((sum, hole) => sum + (hole.score ?? 0), 0);
    check(step, entered, scored.length ? homeTotal : null);
    const history = formatHistoryRow({
      startedAt: homeRounds[0]!.startedAt,
      courseName: homeRounds[0]!.courseName,
      teeName: homeRounds[0]!.teeName,
      score: scored.length ? homeTotal : null,
    });
    check(step, String(entered), history.score);
  }

  // Step 7 — hard-press delete: cancel keeps the round, confirm removes it.
  {
    const step = 7;
    check(step, true, historyLongPressDeletes());
    const prompt = historyDeletePrompt();
    check(step, true, prompt.cancelIsDefault);
    const shotsBefore = shotCountFor(db, round.id);
    if (shotsBefore < 1) {
      throw new Error(`Step ${step}: expected shots in storage, actual ${shotsBefore}`);
    }
    const respondToHardPress = (choice: 'cancel' | 'delete') => {
      if (!prompt.cancelIsDefault) return;
      if (choice === 'cancel') return;
      deleteRound(db, round.id);
    };
    respondToHardPress('cancel');
    check(step, round.id, getRound(db, round.id)?.id ?? null);
    check(step, 1, listRounds(db).length);
    check(step, shotsBefore, shotCountFor(db, round.id));

    respondToHardPress('delete');
    check(step, 0, listRounds(db).length);
    check(step, null, getRound(db, round.id));
    check(step, 0, shotCountFor(db, round.id));
    check(step, 0, listHoles(db, round.id).length);
  }
});

async function watchPenaltyRound(shotsApi: ShotActions, watchApi: WatchClub): Promise<void> {
  gpsQueue.length = 0;
  const db = memoryDb();
  const { layout, courseName } = fixtureLayout();
  const listener = listeners.get('onClubPick');
  if (!listener) throw new Error('Watch onClubPick listener is not registered');

  const round = startRound(db, 18, courseName, layout);
  const clubs = listClubs(db, true).filter((club) => !isPutterClubId(club.id));
  const clubA = clubs[0];
  const clubB = clubs.find((club) => club.id !== clubA?.id);
  if (!clubA || !clubB) throw new Error('expected two clubs');

  async function mark(clubId: string, point: LatLng): Promise<void> {
    enqueueFix(point);
    const hole = mustHole(db, round.id, 1);
    const { plan } = await shotsApi.markShotWithClub(db, {
      roundId: round.id,
      holeNumber: 1,
      clubId,
      tee: teeOf(hole),
    });
    if (plan.status !== 'commit') throw new Error(`mark did not commit (${plan.status})`);
  }

  await mark(clubA.id, locationPoint(layout, 1, 'tee'));
  await mark(clubB.id, locationPoint(layout, 1, 'green'));
  const shots = listShotsForHole(db, mustHole(db, round.id, 1).id);
  const last = shots.reduce((best, shot) => (shot.seq >= best.seq ? shot : best));
  const before = mustHole(db, round.id, 1);
  if (before.par == null) throw new Error('fixture hole has no par');

  watchApi.setWatchClubContext({
    db,
    roundId: round.id,
    holeNumber: 1,
    readOnly: false,
    tee: teeOf(before),
    bump() {},
    labelForClub: (clubId) => clubs.find((club) => club.id === clubId)?.shortName ?? null,
  });

  async function settle(): Promise<void> {
    for (let i = 0; i < 8; i += 1) {
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
  }

  async function sendPenalty(pick: PenaltyPickMessage, token: string): Promise<void> {
    listener?.({ token, json: JSON.stringify(pick) });
    await settle();
  }

  function confirmsFor(id: string, kind: 'penalty' | 'undo'): number {
    return watchPushedMessages.filter((row) => row.type === 'watchConfirm' && row.kind === kind && row.id === id && row.ok === true).length;
  }

  function replyOk(token: string): boolean | undefined {
    const rows = watchReplies.filter((row) => row.token === token);
    return rows.at(-1)?.body.ok;
  }

  const reasons = ['water', 'ob', 'unplayable', 'other'] as const;
  let score = before.score;
  for (const reason of reasons) {
    score = scoreAfterPenalty(score, before.par, 1);
    const pick = penaltyPickPayload({
      id: `round-flow-${reason}`,
      reason,
      at: `2026-09-26T15:00:0${reasons.indexOf(reason)}.000Z`,
      holeNumber: 1,
    });
    await sendPenalty(pick, `penalty-${reason}`);
    const hole = mustHole(db, round.id, 1);
    if (hole.score !== score) {
      throw new Error(`penalty ${reason}: expected score ${score}, actual ${hole.score ?? null}`);
    }
    const row = listPenaltiesForHole(db, hole.id).find((penalty) => penalty.id === pick.id);
    if (!row || row.strokes !== 1 || row.kind !== 'penalty' || row.reason !== reason) {
      throw new Error(`penalty ${reason}: expected one ${reason} stroke, actual ${JSON.stringify(row ?? null)}`);
    }
    if (row.afterShotId !== last.id || row.afterShotSeq !== last.seq) {
      throw new Error(`penalty ${reason}: expected after ${last.id}#${last.seq}, actual ${row.afterShotId}#${row.afterShotSeq ?? null}`);
    }
    if (replyOk(`penalty-${reason}`) !== true) {
      throw new Error(`penalty ${reason}: phone reply was not ok`);
    }
    if (confirmsFor(pick.id, 'penalty') < 1) {
      throw new Error(`penalty ${reason}: phone saved the stroke but did not confirm the id`);
    }
  }

  let watchQueue: WatchUnconfirmed[] = reasons.map((reason) => ({ type: 'penaltyPick', id: `round-flow-${reason}` }));
  if (watchRowBMiddleSlot(watchQueue) !== 'Retry') {
    throw new Error('a penalty still in the unconfirmed queue should show Retry');
  }
  for (const reason of reasons) {
    watchQueue = clearWatchUnconfirmed(watchQueue, { kind: 'penalty', id: `round-flow-${reason}`, ok: true });
  }
  if (watchRowBMiddleSlot(watchQueue) !== 'Undo') {
    throw new Error('confirmed penalties should put Undo back in the middle slot');
  }

  const afterOne = listPenaltiesForHole(db, before.id);
  if (afterOne.length !== 4 || totalPenaltyStrokes(afterOne) !== 4) {
    throw new Error(`expected four penalty strokes, actual ${JSON.stringify(afterOne.map((row) => row.reason))}`);
  }
  const holeNow = mustHole(db, round.id, 1);
  if (formatHoleCountLine({ shotCount: 2, penaltyStrokes: 1, puttCount: 2 }) !== '2 shots · 1 penalty · 2 putts') {
    throw new Error('expected the phone hole line to count one penalty between shots and putts');
  }
  const liveLine = formatHoleCountLine({
    shotCount: shots.length,
    penaltyStrokes: totalPenaltyStrokes(afterOne),
    puttCount: holeNow.putts,
    omitZeroPutts: true,
  });
  if (liveLine !== '2 shots · 4 penalties') {
    throw new Error(`expected the live hole line to include the penalties, actual ${liveLine}`);
  }
  const diff = scorecardDiff(holeNow.score, holeNow.par);
  const beforeShown = before.score ?? before.par;
  const beforeDiff = scorecardDiff(beforeShown, before.par);
  if (diff == null || beforeDiff == null || diff !== beforeDiff + 4) {
    throw new Error(`expected to-par to include 4 penalty strokes, actual ${scorecardDiffLabel(diff)} from ${scorecardDiffLabel(beforeDiff)}`);
  }

  await sendPenalty(
    penaltyPickPayload({
      id: 'round-flow-water',
      reason: 'water',
      at: '2026-09-26T15:00:00.000Z',
      holeNumber: 1,
    }),
    'penalty-water-retry',
  );
  const retried = listPenaltiesForHole(db, before.id);
  if (retried.length !== 4 || mustHole(db, round.id, 1).score !== holeNow.score) {
    throw new Error(`retry added a stroke: ${retried.length} rows, score ${mustHole(db, round.id, 1).score ?? null}`);
  }
  if (replyOk('penalty-water-retry') !== true || confirmsFor('round-flow-water', 'penalty') < 2) {
    throw new Error('duplicate penalty id was not confirmed ok');
  }
  const duplicateCleared = clearWatchUnconfirmed([{ type: 'penaltyPick', id: 'round-flow-water' }], {
    kind: 'penalty',
    id: 'round-flow-water',
    ok: true,
  });
  if (watchRowBMiddleSlot(duplicateCleared) !== 'Undo') {
    throw new Error('a confirmed duplicate penalty id should clear Retry');
  }

  const shotSnap = () =>
    listShotsForHole(db, before.id).map((shot) => ({
      id: shot.id,
      seq: shot.seq,
      clubId: shot.clubId,
      distanceYards: shot.distanceYards,
    }));
  const shotsBeforeEdit = shotSnap();
  const changed = updatePenaltyReason(db, {
    penaltyId: 'round-flow-water',
    reason: 'ob',
    note: 'cart path',
  });
  if (changed.status !== 'updated' || changed.penalty.reason !== 'ob' || changed.penalty.note !== 'cart path') {
    throw new Error(`change penalty: expected OB with a note, actual ${JSON.stringify(changed)}`);
  }
  if (mustHole(db, round.id, 1).score !== holeNow.score) {
    throw new Error('change penalty moved the hole score');
  }
  await sendPenalty(
    penaltyPickPayload({
      id: 'round-flow-water',
      reason: 'water',
      at: '2026-09-26T15:00:00.000Z',
      holeNumber: 1,
    }),
    'penalty-water-after-edit',
  );
  const edited = listPenaltiesForHole(db, before.id).find((penalty) => penalty.id === 'round-flow-water');
  if (!edited || edited.reason !== 'ob' || edited.note !== 'cart path' || listPenaltiesForHole(db, before.id).length !== 4) {
    throw new Error(`watch duplicate reverted the edit: ${JSON.stringify(edited ?? null)}`);
  }
  if (mustHole(db, round.id, 1).score !== holeNow.score) {
    throw new Error('watch duplicate after an edit added a stroke');
  }

  const removed = deletePenalty(db, 'round-flow-water');
  if (removed.status !== 'deleted' || removed.score !== (holeNow.score ?? 0) - 1) {
    throw new Error(`delete penalty: expected score ${(holeNow.score ?? 0) - 1}, actual ${JSON.stringify(removed)}`);
  }
  if (listPenaltiesForHole(db, before.id).some((penalty) => penalty.id === 'round-flow-water')) {
    throw new Error('delete left the penalty row');
  }
  const afterDelete = mustHole(db, round.id, 1);
  const deletedLine = formatHoleCountLine({
    shotCount: shots.length,
    penaltyStrokes: totalPenaltyStrokes(listPenaltiesForHole(db, before.id)),
    puttCount: afterDelete.putts,
    omitZeroPutts: true,
  });
  if (deletedLine !== '2 shots · 3 penalties') {
    throw new Error(`expected the count line to drop one penalty, actual ${deletedLine}`);
  }
  await sendPenalty(
    penaltyPickPayload({
      id: 'round-flow-water',
      reason: 'water',
      at: '2026-09-26T15:00:00.000Z',
      holeNumber: 1,
    }),
    'penalty-water-after-delete',
  );
  if (listPenaltiesForHole(db, before.id).some((penalty) => penalty.id === 'round-flow-water')) {
    throw new Error('a delayed watch duplicate resurrected the deleted penalty');
  }
  if (mustHole(db, round.id, 1).score !== afterDelete.score) {
    throw new Error('a delayed watch duplicate added a stroke after delete');
  }

  const context = {
    db,
    roundId: round.id,
    holeNumber: 1,
    readOnly: false,
    tee: teeOf(before),
    bump() {},
    labelForClub: (clubId: string) => clubs.find((club) => club.id === clubId)?.shortName ?? null,
  };
  watchApi.setWatchClubContext(null as unknown as Parameters<WatchClub['setWatchClubContext']>[0]);
  const queued = penaltyPickPayload({
    id: 'round-flow-queued',
    reason: 'unplayable',
    at: '2026-09-26T15:10:00.000Z',
    holeNumber: 1,
  });
  await sendPenalty(queued, 'penalty-queued');
  if (confirmsFor(queued.id, 'penalty') !== 0 || replyOk('penalty-queued') !== undefined) {
    throw new Error('a penalty queued before the round screen confirmed early');
  }
  if (watchRowBMiddleSlot([{ type: 'penaltyPick', id: queued.id }]) !== 'Retry') {
    throw new Error('a queued penalty should keep Retry');
  }
  await sendPenalty(
    penaltyPickPayload({
      id: 'round-flow-water',
      reason: 'water',
      at: '2026-09-26T15:00:00.000Z',
      holeNumber: 1,
    }),
    'penalty-queued-deleted',
  );
  const waterConfirmsWhileQueued = confirmsFor('round-flow-water', 'penalty');
  watchApi.setWatchClubContext(context);
  await settle();
  if (confirmsFor(queued.id, 'penalty') < 1 || replyOk('penalty-queued') !== true) {
    throw new Error('queued penalty was saved but the phone did not confirm the id');
  }
  if (watchRowBMiddleSlot(clearWatchUnconfirmed([{ type: 'penaltyPick', id: queued.id }], { kind: 'penalty', id: queued.id, ok: true })) !== 'Undo') {
    throw new Error('confirming a queued penalty should show Undo');
  }
  if (confirmsFor('round-flow-water', 'penalty') < waterConfirmsWhileQueued + 1 || replyOk('penalty-queued-deleted') !== true) {
    throw new Error('duplicate of a deleted penalty id was not confirmed ok');
  }
  const afterQueue = listPenaltiesForHole(db, before.id);
  const queuedRow = afterQueue.find((penalty) => penalty.id === 'round-flow-queued');
  if (!queuedRow || queuedRow.reason !== 'unplayable' || queuedRow.strokes !== 1) {
    throw new Error(`queued watch penalty did not insert: ${JSON.stringify(queuedRow ?? null)}`);
  }
  if (afterQueue.filter((penalty) => penalty.id === 'round-flow-queued').length !== 1) {
    throw new Error('queued watch penalty inserted more than once');
  }
  if (queuedRow.afterShotId !== last.id || queuedRow.afterShotSeq !== last.seq) {
    throw new Error(`queued penalty was not after the last shot: ${queuedRow.afterShotId}#${queuedRow.afterShotSeq ?? null}`);
  }
  if (afterQueue.some((penalty) => penalty.id === 'round-flow-water')) {
    throw new Error('queued duplicate resurrected the deleted penalty');
  }
  if (afterQueue.length !== 4 || mustHole(db, round.id, 1).score !== holeNow.score) {
    throw new Error(
      `expected the new penalty to replace the deleted stroke, actual ${afterQueue.length} rows, score ${mustHole(db, round.id, 1).score ?? null}`,
    );
  }
  const finalLine = formatHoleCountLine({
    shotCount: shots.length,
    penaltyStrokes: totalPenaltyStrokes(afterQueue),
    puttCount: mustHole(db, round.id, 1).putts,
    omitZeroPutts: true,
  });
  if (finalLine !== '2 shots · 4 penalties') {
    throw new Error(`expected the count line to include the queued penalty, actual ${finalLine}`);
  }
  const shotsAfter = shotSnap();
  if (JSON.stringify(shotsAfter) !== JSON.stringify(shotsBeforeEdit)) {
    throw new Error(`penalty edits changed shots: ${JSON.stringify(shotsAfter)}`);
  }

  const failed = penaltyPickPayload({
    id: 'round-flow-failed',
    reason: 'ob',
    at: '2026-09-26T15:20:00.000Z',
    holeNumber: 1,
  });
  watchApi.setWatchClubContext({ ...context, readOnly: true });
  await sendPenalty(failed, 'penalty-failed');
  if (listPenaltiesForHole(db, before.id).some((penalty) => penalty.id === failed.id)) {
    throw new Error('a rejected penalty was saved');
  }
  if (replyOk('penalty-failed') !== false || confirmsFor(failed.id, 'penalty') !== 0) {
    throw new Error('a rejected penalty confirmed the id');
  }
  if (watchRowBMiddleSlot(clearWatchUnconfirmed([{ type: 'penaltyPick', id: failed.id }], { kind: 'penalty', id: failed.id, ok: false })) !== 'Retry') {
    throw new Error('a failed penalty should keep Retry');
  }

  watchApi.setWatchClubContext(context);
  const undoShotId = watchLastShotId(listShotsForHole(db, before.id));
  if (!undoShotId) throw new Error('expected a last shot to undo');
  const undo = shotUndoPayload({
    id: 'round-flow-undo',
    shotId: undoShotId,
    at: '2026-09-26T15:30:00.000Z',
    holeNumber: 1,
  });
  const shotsBeforeUndo = listShotsForHole(db, before.id).map((shot) => shot.id);
  listener?.({ token: 'undo-1', json: JSON.stringify(undo) });
  await settle();
  const shotsAfterUndo = listShotsForHole(db, before.id).map((shot) => shot.id);
  if (shotsAfterUndo.includes(undoShotId) || shotsAfterUndo.length !== shotsBeforeUndo.length - 1) {
    throw new Error(`undo did not remove only the last shot: ${JSON.stringify(shotsAfterUndo)}`);
  }
  if (replyOk('undo-1') !== true || confirmsFor(undo.id, 'undo') < 1) {
    throw new Error('confirmed undo did not ack the id');
  }
  if (watchRowBMiddleSlot(clearWatchUnconfirmed([{ type: 'shotUndo', id: undo.id }], { kind: 'undo', id: undo.id, ok: true })) !== 'Undo') {
    throw new Error('a confirmed undo should clear Retry');
  }
  listener?.({ token: 'undo-1-dup', json: JSON.stringify(undo) });
  await settle();
  if (listShotsForHole(db, before.id).map((shot) => shot.id).join() !== shotsAfterUndo.join()) {
    throw new Error('duplicate undo removed another shot');
  }
  if (replyOk('undo-1-dup') !== true || confirmsFor(undo.id, 'undo') < 2) {
    throw new Error('duplicate undo id was not confirmed ok');
  }

  watchApi.setWatchClubContext(null as unknown as Parameters<WatchClub['setWatchClubContext']>[0]);
  gpsQueue.length = 0;
}

function mustHole(db: SQLiteDatabase, roundId: string, holeNumber: number): Hole {
  const hole = getHole(db, roundId, holeNumber);
  if (!hole) throw new Error(`missing hole ${holeNumber}`);
  return hole;
}
