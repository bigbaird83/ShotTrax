import { useEffect, useRef } from 'react';
import { nextWatchLiveYtgSnapshot, type WatchLiveYtgSnapshot } from '../domain/watchComplication';
import { clubListPushKey } from '../domain/watchMessages';
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
    complication?: { yards: number | null; quality: string } | null;
  },
): void {
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;
  const holdRef = useRef<WatchLiveYtgSnapshot | null>(null);
  const restKeyRef = useRef('');
  const restKey = clubListPushKey(buildClubList({ ...list, complication: undefined }));
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
