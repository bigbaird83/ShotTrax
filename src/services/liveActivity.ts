import { useEffect } from 'react';
import { getLiveActivityNative } from '@/modules/live-activity';
import { useDb } from '../db/DbProvider';
import { getActiveRound } from '../db/repo';
import { liveActivityPayloadKey, type LiveActivityPayload } from '../domain/liveActivity';

let lastKey: string | null = null;

/**
 * Start / update the round's Lock Screen view, or end it (null). Native is
 * called only when the payload changes. No-op in Expo Go, on Android, or on a
 * build without the module.
 */
export function syncRoundLiveActivity(payload: LiveActivityPayload | null): void {
  const native = getLiveActivityNative();
  if (!native) return;
  const key = liveActivityPayloadKey(payload);
  if (key === lastKey) return;
  lastKey = key;
  if (payload == null) {
    void native.endRound().catch(() => {
      lastKey = null;
    });
    return;
  }
  void native.syncRound(JSON.stringify(payload)).catch(() => {
    lastKey = null;
  });
}

/** Root host: with no round in progress, make sure no Lock Screen round is left up. */
export function useEndLiveActivityWithoutRound(): void {
  const { db, revision } = useDb();
  useEffect(() => {
    if (!getActiveRound(db)) syncRoundLiveActivity(null);
  }, [db, revision]);
}
