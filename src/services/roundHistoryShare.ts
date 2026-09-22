import { InteractionManager, Share } from 'react-native';
import { roundHistoryShareTitle } from '../domain/roundTransfer';

function waitForShareHost(run: () => void): void {
  InteractionManager.runAfterInteractions(() => {
    requestAnimationFrame(run);
  });
}

/** Share sheet carries the rounds JSON. No account, no live-board URL. */
export async function presentRoundHistoryShare(json: string): Promise<boolean> {
  const title = roundHistoryShareTitle();
  let url: string | undefined;
  try {
    const { File, Paths } = await import('expo-file-system');
    const file = new File(Paths.cache, 'shottrax-rounds.json');
    file.write(json);
    const uri = file.uri;
    url = uri.startsWith('file:') ? uri : `file://${uri}`;
  } catch {
    url = undefined;
  }
  try {
    await new Promise<void>((resolve, reject) => {
      waitForShareHost(() => {
        const content = url ? { title, message: json, url } : { title, message: json };
        Share.share(content).then(() => resolve(), reject);
      });
    });
    return true;
  } catch {
    return false;
  }
}
