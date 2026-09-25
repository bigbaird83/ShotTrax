import { InteractionManager, Share } from 'react-native';
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
async function shareCacheFile(filename: string, contents: string): Promise<boolean> {
  const title = roundHistoryShareTitle();
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
        Share.share(content).then(() => resolve(), reject);
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

/**
 * rounds.csv and shots.csv, one after the other. The share sheet takes a single
 * file, so both use the same Save to Files path from one export.
 */
export async function presentRoundCsvShare(
  files: readonly { filename: string; contents: string }[],
): Promise<boolean> {
  if (files.length === 0) return false;
  for (const file of files) {
    const ok = await shareCacheFile(file.filename, file.contents);
    if (!ok) return false;
  }
  return true;
}

/**
 * System document picker for a .json rounds file. Null when the player
 * cancels. Throws when the file cannot be read.
 */
export async function pickRoundHistoryFile(): Promise<string | null> {
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
  return new File(asset.uri).text();
}
