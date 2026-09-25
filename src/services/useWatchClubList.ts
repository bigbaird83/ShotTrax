import { useEffect, useRef } from 'react';
import { nextWatchLiveYtgSnapshot, type WatchLiveYtgSnapshot } from '../domain/watchComplication';
import type { WatchGreenFields } from '../domain/watchLive';
import { clubListPushKey, watchSuggestYardsToSend, type WatchSuggestSent } from '../domain/watchMessages';
import {
  buildClubList,
  pushWatchClubList,
  setWatchClubContext,
  startWatchClubBridge,
  type WatchClubContext,
} from './watchClub';

const stack: WatchClubContext[] = [];

function pushCtx(ctx: WatchClubContext) {
  stack.push(ctx);
  setWatchClubContext(ctx);
}

function popCtx(ctx: WatchClubContext) {
  const index = stack.lastIndexOf(ctx);
  if (index >= 0) stack.splice(index, 1);
  setWatchClubContext(stack[stack.length - 1] ?? null);
}

export function useWatchClubList(
  ctx: WatchClubContext,
  list: {
    top3: { id: string; shortName: string }[];
    bag: { id: string; shortName: string }[];
    holeNumber: number;
    yardsToGreen: number | null;
    yardsQuality: 'good' | 'soft' | 'forced' | 'none';
    lastClubId?: string | null;
    selectedClubId?: string | null;
    /** Live hole-map yards (`planLiveGpsToPin`). Omitted leaves the Watch header unchanged. */
    complication?: { yards: number | null; quality: string; atMs?: number | null } | null;
    /** False on a finished round. Omitted means the round is live. */
    roundLive?: boolean;
    teeLengthYards?: number | null;
    green?: WatchGreenFields | null;
    clubCarry?: Record<string, number | null | undefined> | null;
  },
): void {
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;
  const holdRef = useRef<WatchLiveYtgSnapshot | null>(null);
  const restKeyRef = useRef('');
  const suggestSentRef = useRef<WatchSuggestSent | null>(null);
  // Walking in: new top-3 set/order or a ≥5 yd move pushes; smaller drift keeps the last yards.
  const fresh = buildClubList({ ...list, complication: undefined });
  const suggest: WatchSuggestSent = {
    holeNumber: fresh.holeNumber,
    top3: fresh.top3,
    yardsToGreen: fresh.yardsToGreen,
    yardsQuality: fresh.yardsQuality,
  };
  const suggestYards = watchSuggestYardsToSend({ previous: suggestSentRef.current, next: suggest });
  suggestSentRef.current = { ...suggest, yardsToGreen: suggestYards };
  const restKey = clubListPushKey(
    buildClubList({ ...list, yardsToGreen: suggestYards, complication: undefined }),
  );
  const decision = list.complication
    ? nextWatchLiveYtgSnapshot({
        previous: holdRef.current,
        holeNumber: list.holeNumber,
        live: list.complication,
        nowMs: Date.now(),
        force: restKey !== restKeyRef.current,
      })
    : null;
  if (decision?.commit) {
    holdRef.current = decision.snapshot;
    restKeyRef.current = restKey;
  }
  const payload = buildClubList({
    ...list,
    yardsToGreen: suggestYards,
    complication: decision
      ? { yards: decision.snapshot.yards, quality: decision.snapshot.quality }
      : list.complication,
  });
  // Push clubList on hole change / fix quality change / bag rank change (plus labels / Same club).
  const json = `${clubListPushKey(payload)}\0${payload.lastClubId ?? ''}\0${payload.selectedClubId ?? ''}`;

  useEffect(() => {
    startWatchClubBridge();
    const adapter: WatchClubContext = {
      get db() {
        return ctxRef.current.db;
      },
      get roundId() {
        return ctxRef.current.roundId;
      },
      get holeNumber() {
        return ctxRef.current.holeNumber;
      },
      get tee() {
        return ctxRef.current.tee ?? null;
      },
      get readOnly() {
        return ctxRef.current.readOnly;
      },
      get openShotHoles() {
        return ctxRef.current.openShotHoles;
      },
      bump: () => ctxRef.current.bump(),
      onMarked: () => ctxRef.current.onMarked?.(),
      onPutter: () => ctxRef.current.onPutter?.(),
      onLeave: (action) => ctxRef.current.onLeave?.(action),
      onPuttPick: (msg) => ctxRef.current.onPuttPick?.(msg) ?? { ok: false, feedback: 'Phone unavailable' },
      onSelectClub: (clubId) => ctxRef.current.onSelectClub?.(clubId),
      labelForClub: (clubId) => ctxRef.current.labelForClub(clubId),
    };
    pushCtx(adapter);
    return () => popCtx(adapter);
  }, [ctx.roundId, ctx.holeNumber]);

  useEffect(() => {
    void pushWatchClubList(payload);
    // payload is represented by json
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [json]);
}
