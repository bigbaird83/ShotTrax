import { requireOptionalNativeModule } from 'expo';

export type WatchBridgeNative = {
  isSupported: () => boolean;
  isReachable: () => boolean;
  pushClubListJson: (json: string) => Promise<void>;
  pushWatchMessageJson?: (json: string) => Promise<void>;
  /** Watch Home (favorites + nearby). Rides in the application context next to clubList. */
  pushWatchHomeJson?: (json: string) => Promise<void>;
  replyClubPick: (token: string, json: string) => Promise<void>;
  /**
   * Read-only WatchConnectivity snapshot. Missing on a binary built before this
   * getter. Does not activate the session or send anything.
   */
  readLinkStatus?: () => {
    supported?: boolean;
    activated?: boolean;
    paired?: boolean;
    reachable?: boolean;
    remainingComplicationTransfers?: number;
    lastSentAtMs?: number;
  };
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
