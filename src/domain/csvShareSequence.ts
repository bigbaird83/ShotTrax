/**
 * Two CSV share sheets, one after the other.
 * `Share.share` settles only when the player finishes or dismisses the sheet.
 * It does not say whether the sheet was presented, so a sheet that never
 * opens looks the same as a player who is still in Save to Files.
 * The timeout is long enough for a normal save. Leaving the screen clears
 * the busy state without waiting for it.
 */
export const CSV_SHARE_TIMEOUT_MS = 180_000;

/** Pause after the sheet promise settles so the next one is not presented while the first is still dismissing. */
export const CSV_SHARE_CLOSE_DELAY_MS = 500;

export type CsvShareOutcome = 'done' | 'failed' | 'partial';

export type CsvShareSheet = {
  title: string;
  open: () => Promise<boolean>;
};

/** Resolves false when `open` rejects or does not settle within `timeoutMs`. A late settle is ignored. */
export function shareWithTimeout(open: () => Promise<boolean>, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(false);
    }, timeoutMs);
    open().then(
      (ok) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(ok);
      },
      () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(false);
      },
    );
  });
}

/**
 * Wait until interactions from the dismissed sheet finish, then one frame, then `delayMs`.
 * Call this between sheets, not after the last one.
 */
export function waitForShareSheetToClose(args: {
  runAfterInteractions: (task: () => void) => void;
  frame: (task: () => void) => void;
  delayMs: number;
  delay: (ms: number) => Promise<void>;
}): Promise<void> {
  const { runAfterInteractions, frame, delayMs, delay } = args;
  return new Promise((resolve) => {
    runAfterInteractions(() => {
      frame(() => {
        void delay(delayMs).then(() => resolve());
      });
    });
  });
}

/**
 * Opens each sheet in order. The next sheet starts only after the previous
 * one settles and `afterClose` finishes. A failure or timeout on the first
 * sheet is `failed` and skips the rest. A later failure is `partial`.
 */
export async function shareCsvSheets(args: {
  sheets: readonly CsvShareSheet[];
  afterClose: () => Promise<void>;
  timeoutMs: number;
  isCancelled?: () => boolean;
}): Promise<CsvShareOutcome> {
  const { sheets, afterClose, timeoutMs, isCancelled } = args;
  if (sheets.length === 0) return 'failed';
  for (let index = 0; index < sheets.length; index += 1) {
    if (isCancelled?.()) return index === 0 ? 'failed' : 'partial';
    const ok = await shareWithTimeout(sheets[index].open, timeoutMs);
    if (!ok) return index === 0 ? 'failed' : 'partial';
    if (index === sheets.length - 1) return 'done';
    if (isCancelled?.()) return 'partial';
    await afterClose();
  }
  return 'done';
}
