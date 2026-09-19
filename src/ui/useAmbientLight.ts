import { useMemo } from 'react';
import { readAmbientLight } from '@/src/sensing/ambientLight';
import type { AmbientLightReading } from '@/src/domain/playTheme';

export function useAmbientLight(): AmbientLightReading {
  return useMemo(() => readAmbientLight(), []);
}
