import { requireOptionalNativeModule } from 'expo';

export type LiveActivityNative = {
  isSupported: () => boolean;
  syncRound: (json: string) => Promise<boolean>;
  endRound: () => Promise<void>;
};

/** Null in Expo Go, on Android, and on a binary built before this module. */
export function getLiveActivityNative(): LiveActivityNative | null {
  try {
    return requireOptionalNativeModule<LiveActivityNative>('ShotTraxxLiveActivity');
  } catch {
    return null;
  }
}
