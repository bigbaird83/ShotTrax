import { useEffect, useState } from 'react';
import type { GpsFix } from '../domain/types';
import { watchFixes } from './location';

/** Last real GPS sample. Reused across hole remounts so clubList can push the new hole's yards immediately. Never invented. */
let lastLiveFix: GpsFix | null = null;

export function getLastLiveFix(): GpsFix | null {
  return lastLiveFix;
}

/**
 * Live GPS for yards-to-green / Watch clubList. Same bands as phone marks —
 * never invents a coordinate. `null` until a real fix arrives (quality none).
 */
export function useLiveFix(enabled = true): GpsFix | null {
  const [fix, setFix] = useState<GpsFix | null>(() => (enabled ? lastLiveFix : null));

  useEffect(() => {
    if (!enabled) {
      setFix(null);
      return undefined;
    }
    if (lastLiveFix) setFix(lastLiveFix);
    let stop = false;
    let unsub: (() => void) | undefined;
    void watchFixes((next) => {
      lastLiveFix = next;
      if (!stop) setFix(next);
    }).then((remove) => {
      if (stop) remove();
      else unsub = remove;
    });
    return () => {
      stop = true;
      unsub?.();
    };
  }, [enabled]);

  return enabled ? fix : null;
}
