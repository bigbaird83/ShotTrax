import { useEffect, useRef } from 'react';
import { useDb } from '@/src/db/DbProvider';
import { getActiveRound } from '@/src/db/repo';
import { startWatchClubBridge } from './watchClub';
import { setWatchNearbyContext, pushWatchNearbyCourses } from './watchNearby';
import { useLiveFix } from './useLiveFix';

/** Home / root: push nearby courses from the phone fix and open a Watch-started round. */
export function useWatchNearbyStart(): void {
  const { db, bump, revision } = useDb();
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

  const searchKeyRef = useRef('');

  useEffect(() => {
    searchKeyRef.current = '';
  }, [revision]);

  useEffect(() => {
    if (getActiveRound(db)) return;
    const key = fix ? `${fix.lat.toFixed(3)},${fix.lng.toFixed(3)}` : 'none';
    if (key === searchKeyRef.current) return;
    searchKeyRef.current = key;
    void pushWatchNearbyCourses();
  }, [db, revision, fix?.lat, fix?.lng]);
}
