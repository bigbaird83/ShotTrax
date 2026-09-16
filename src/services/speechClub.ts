import { requireOptionalNativeModule, type EventSubscription } from 'expo-modules-core';

type SpeechResultEvent = {
  isFinal?: boolean;
  results?: { transcript?: string }[];
};

type SpeechErrorEvent = {
  error?: string;
  message?: string;
};

type SpeechNative = {
  start: (options: Record<string, unknown>) => void;
  stop: () => void;
  abort: () => void;
  requestPermissionsAsync: () => Promise<{ granted: boolean }>;
  isRecognitionAvailable?: () => boolean;
  addListener: (event: string, listener: (event: unknown) => void) => EventSubscription;
};

export function getSpeechNative(): SpeechNative | null {
  try {
    return requireOptionalNativeModule<SpeechNative>('ExpoSpeechRecognition');
  } catch {
    return null;
  }
}

export function speechRecognitionAvailable(): boolean {
  return getSpeechNative() != null;
}

export type ClubSpeechSession = {
  stop: () => void;
};

/**
 * Listen for a club name. Does not mark a shot — caller must still confirm.
 * Missing native module (Expo Go without the speech plugin) degrades to a message.
 */
export async function startClubSpeech(args: {
  contextualStrings: string[];
  onTranscript: (text: string, isFinal: boolean) => void;
  onError: (message: string) => void;
  onEnd: () => void;
}): Promise<ClubSpeechSession | null> {
  const native = getSpeechNative();
  if (!native) {
    args.onError(
      'Voice club pick needs a development build with expo-speech-recognition. Tap a club instead.',
    );
    args.onEnd();
    return null;
  }

  const perm = await native.requestPermissionsAsync();
  if (!perm.granted) {
    args.onError('Microphone and speech recognition are needed to say a club. You can still tap.');
    args.onEnd();
    return null;
  }

  const subs: EventSubscription[] = [];
  const stop = () => {
    while (subs.length) {
      subs.pop()?.remove();
    }
    try {
      native.stop();
    } catch {
      try {
        native.abort();
      } catch {
        /* native module may already be gone */
      }
    }
  };

  subs.push(
    native.addListener('result', (raw) => {
      const event = raw as SpeechResultEvent;
      const isFinal = Boolean(event.isFinal);
      for (const row of event.results ?? []) {
        if (row.transcript) args.onTranscript(row.transcript, isFinal);
      }
    }),
    native.addListener('error', (raw) => {
      const event = raw as SpeechErrorEvent;
      const code = event.error ?? '';
      if (code === 'aborted' || code === 'no-speech') {
        args.onEnd();
        return;
      }
      args.onError(event.message ?? event.error ?? 'Could not hear a club name.');
    }),
    native.addListener('end', () => {
      args.onEnd();
    }),
  );

  native.start({
    lang: 'en-US',
    interimResults: true,
    continuous: false,
    maxAlternatives: 5,
    addsPunctuation: false,
    contextualStrings: args.contextualStrings.slice(0, 40),
  });

  return { stop };
}
