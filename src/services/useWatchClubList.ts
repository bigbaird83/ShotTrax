import { useEffect, useRef } from 'react';
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
  },
): void {
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;
  const payload = buildClubList(list);
  // Push clubList on hole change / fix quality change / bag rank change (plus labels / Same club).
  const json = `${clubListPushKey(payload)}\0${payload.lastClubId ?? ''}`;

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
      get readOnly() {
        return ctxRef.current.readOnly;
      },
      bump: () => ctxRef.current.bump(),
      onMarked: () => ctxRef.current.onMarked?.(),
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
