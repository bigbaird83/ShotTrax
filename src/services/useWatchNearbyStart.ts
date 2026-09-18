import { useEffect, useRef } from 'react';
import { useDb } from '@/src/db/DbProvider';
import { getActiveRound } from '@/src/db/repo';
import { startWatchClubBridge } from './watchClub';
import { setWatchNearbyContext } from './watchNearby';
import { useLiveFix } from './useLiveFix';

/** Home / root: keep a phone-fix context. Do not push the nearby list until
 * the Watch taps Select course. */
export function useWatchNearbyStart(): void {
  const { db, bump } = useDb();
  const fix = useLiveFix(true);
  const fixRef = useRef(fix);
  fixRef.current = fix;
  const dbRef = useRef(db);
  dbRef.current = db;
  const bumpRef = useRef(bump);
  bumpRef.current = bump;

  useEffect(() => {
    startWatchClubBridge();
    setWatchNearbyContext({
      db,
      bump: () => bumpRef.current(),
      phoneFix: () => fixRef.current,
      hasActiveRound: () => Boolean(getActiveRound(dbRef.current)),
    });
    return () => setWatchNearbyContext(null);
  }, [db]);
}
