import { useEffect, useRef } from 'react';
import { useDb } from '@/src/db/DbProvider';
import { getActiveRound } from '@/src/db/repo';
import { startWatchClubBridge } from './watchClub';
import { pushWatchHomeFromCache, rememberPhoneFix, setWatchHomeContext } from './watchHome';
import { setWatchNearbyContext } from './watchNearby';
import { useLiveFix } from './useLiveFix';

/** Stored phone location is refreshed at most this often (one settings write). */
const PHONE_FIX_SAVE_INTERVAL_MS = 60_000;

/** Home / root: keep a phone-fix context. The nearby search runs only when the
 * Watch asks (Watch Home). Favorites changes re-push Watch Home from cache. */
export function useWatchNearbyStart(): void {
  const { db, bump, revision } = useDb();
  const fix = useLiveFix(true);
  const fixRef = useRef(fix);
  fixRef.current = fix;
  const dbRef = useRef(db);
  dbRef.current = db;
  const bumpRef = useRef(bump);
  bumpRef.current = bump;
  const savedFixAtRef = useRef(0);

  useEffect(() => {
    startWatchClubBridge();
    setWatchNearbyContext({
      db,
      bump: () => bumpRef.current(),
      phoneFix: () => fixRef.current,
      hasActiveRound: () => Boolean(getActiveRound(dbRef.current)),
    });
    setWatchHomeContext({
      db,
      bump: () => bumpRef.current(),
      phoneFix: () => fixRef.current,
    });
    return () => {
      setWatchNearbyContext(null);
      setWatchHomeContext(null);
    };
  }, [db]);

  // Keep the phone's last known location for Watch Search nearby, so a Watch
  // with no GPS of its own never dead-ends on a pocketed phone.
  useEffect(() => {
    if (!fix) return;
    const now = Date.now();
    if (now - savedFixAtRef.current < PHONE_FIX_SAVE_INTERVAL_MS) return;
    savedFixAtRef.current = now;
    rememberPhoneFix(db, fix);
  }, [db, fix]);

  // Every favorite star / unstar on the phone bumps the DB revision.
  // Re-push Watch Home (deduped, no network) so the Watch updates live.
  useEffect(() => {
    void pushWatchHomeFromCache();
  }, [db, revision]);
}
