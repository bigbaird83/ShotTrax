import { requireOptionalNativeModule } from 'expo';

export type WatchBridgeNative = {
  isSupported: () => boolean;
  isReachable: () => boolean;
  pushClubListJson: (json: string) => Promise<void>;
  pushWatchMessageJson?: (json: string) => Promise<void>;
  replyClubPick: (token: string, json: string) => Promise<void>;
  addListener: (
    event: string,
    listener: (event: { token?: string; json?: string; reachable?: boolean }) => void,
  ) => { remove: () => void };
};

export function getWatchBridgeNative(): WatchBridgeNative | null {
  try {
    return requireOptionalNativeModule<WatchBridgeNative>('WatchBridge');
  } catch {
    return null;
  }
}
