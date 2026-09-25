import { InteractionManager, Share } from 'react-native';
import {
  CSV_SHARE_CLOSE_DELAY_MS,
  CSV_SHARE_TIMEOUT_MS,
  shareCsvSheets,
  waitForShareSheetToClose,
  type CsvShareOutcome,
} from '../domain/csvShareSequence';
import { csvExportSheetTitle } from '../domain/playerCopy';
import { roundHistoryShareTitle } from '../domain/roundTransfer';

function waitForShareHost(run: () => void): void {
  InteractionManager.runAfterInteractions(() => {
    requestAnimationFrame(run);
  });
}

/**
 * Share sheet carries one file (Save to Files, Mail, Messages).
 * No account, no live-board URL. False when the sheet could not open.
 */
async function shareCacheFile(filename: string, contents: string, title: string = roundHistoryShareTitle()): Promise<boolean> {
  let url: string | undefined;
  try {
    const { File, Paths } = await import('expo-file-system');
    const file = new File(Paths.cache, filename);
    if (file.exists) file.delete();
    file.write(contents);
    const uri = file.uri;
    url = uri.startsWith('file:') ? uri : `file://${uri}`;
  } catch {
    url = undefined;
  }
  try {
    await new Promise<void>((resolve, reject) => {
      waitForShareHost(() => {
        // With a file the sheet offers Save to Files; without one, fall back to the text.
        const content = url ? { title, url } : { title, message: contents };
        // iOS ignores title. The file name is what the sheet shows, so CSV
        // passes the "1 of 2" label as the filename. subject is the Mail label.
        const options = title === roundHistoryShareTitle() ? undefined : { subject: title };
        Share.share(content, options).then(() => resolve(), reject);
      });
    });
    return true;
  } catch {
    return false;
  }
}

export async function presentRoundHistoryShare(json: string, filename: string): Promise<boolean> {
  return shareCacheFile(filename, json);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * rounds.csv and shots.csv, one after the other. The share sheet takes a single
 * file, so both use the same Save to Files path from one export.
 * The second sheet waits until the first has dismissed. A sheet that never
 * settles fails after CSV_SHARE_TIMEOUT_MS. `isCancelled` skips the rest
 * when the player has left the screen.
 */
export async function presentRoundCsvShare(
  files: readonly { filename: string; contents: string }[],
  options?: { isCancelled?: () => boolean },
): Promise<CsvShareOutcome> {
  return shareCsvSheets({
    sheets: files.map((file, index) => {
      const title = csvExportSheetTitle(index + 1, files.length, file.filename);
      return {
        title,
        open: () => shareCacheFile(title, file.contents, title),
      };
    }),
    afterClose: () =>
      waitForShareSheetToClose({
        runAfterInteractions: (task) => {
          InteractionManager.runAfterInteractions(task);
        },
        frame: (task) => {
          requestAnimationFrame(task);
        },
        delayMs: CSV_SHARE_CLOSE_DELAY_MS,
        delay,
      }),
    timeoutMs: CSV_SHARE_TIMEOUT_MS,
    isCancelled: options?.isCancelled,
  });
}

/**
 * System document picker for a .json rounds file. Null when the player
 * cancels. Throws when the file cannot be read.
 */
export type PickedRoundHistoryFile = {
  /** Display name from the picker, when it has one. Used to spot a .csv. */
  name: string | null;
  text: string;
};

export async function pickRoundHistoryFile(): Promise<PickedRoundHistoryFile | null> {
  const { getDocumentAsync } = await import('expo-document-picker');
  const result = await getDocumentAsync({
    type: ['application/json', 'public.json', 'text/plain'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled) return null;
  const asset = result.assets?.[0];
  if (!asset) return null;
  const { File } = await import('expo-file-system');
  const text = await new File(asset.uri).text();
  const name = typeof asset.name === 'string' && asset.name.trim() ? asset.name.trim() : null;
  return { name, text };
}
