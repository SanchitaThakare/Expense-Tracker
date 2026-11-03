import { requireOptionalNativeModule } from 'expo';

export type SpeechLanguage = 'mr-IN' | 'hi-IN' | 'en-IN';

export type SpeechFailureCode =
  | 'missing-native-module'
  | 'unavailable'
  | 'permission'
  | 'no-speech'
  | 'network'
  | 'failed';

type SpeechResultEvent = {
  results?: { transcript?: string }[];
  isFinal?: boolean;
};

type SpeechErrorEvent = {
  message?: string;
  error?: string;
};

type SpeechNative = {
  isRecognitionAvailable: () => boolean;
  requestPermissionsAsync: () => Promise<{ granted: boolean }>;
  start: (options: {
    lang: string;
    interimResults: boolean;
    continuous: boolean;
    contextualStrings?: string[];
  }) => void;
  stop: () => void;
  abort: () => void;
  addListener: (
    event: string,
    listener: (payload: SpeechResultEvent & SpeechErrorEvent) => void,
  ) => { remove: () => void };
};

const MODULE_NAME = 'ExpoSpeechRecognition';

export class SpeechCaptureError extends Error {
  readonly code: SpeechFailureCode;

  constructor(code: SpeechFailureCode, message: string) {
    super(message);
    this.name = 'SpeechCaptureError';
    this.code = code;
  }
}

const MISSING_MODULE_MESSAGE =
  'ExpoSpeechRecognition is not in this app binary. Expo Go does not include it. Install the Android development build with npx expo run:android, then start it with npx expo start --dev-client. You can type the phrase until that build is on the phone.';

let activeStop: (() => void) | null = null;
let activeAbort: (() => void) | null = null;
let sessionOpen = false;

function getSpeech(): SpeechNative | null {
  return requireOptionalNativeModule<SpeechNative>(MODULE_NAME);
}

export function isSpeechModuleLinked(): boolean {
  return getSpeech() != null;
}

export function stopListening(): void {
  activeStop?.();
}

export function cancelListening(): void {
  activeAbort?.();
}

export async function capturePhrase(
  lang: SpeechLanguage,
  onPartial: (transcript: string) => void,
): Promise<string> {
  const speech = getSpeech();
  if (!speech) {
    throw new SpeechCaptureError('missing-native-module', MISSING_MODULE_MESSAGE);
  }

  let available = false;
  try {
    available = speech.isRecognitionAvailable();
  } catch (error) {
    throw new SpeechCaptureError(
      'unavailable',
      error instanceof Error ? error.message : 'Speech recognition could not be checked on this phone.',
    );
  }
  if (!available) {
    throw new SpeechCaptureError(
      'unavailable',
      'This phone has no speech recognizer. Install or enable the Google app, then try again. You can still type the phrase.',
    );
  }

  const permission = await speech.requestPermissionsAsync();
  if (!permission.granted) {
    throw new SpeechCaptureError(
      'permission',
      'Microphone permission is required. Allow it for Expense Tracker in Android settings, or type the phrase.',
    );
  }
  if (sessionOpen) {
    throw new SpeechCaptureError('failed', 'Speech recognition is already running.');
  }
  sessionOpen = true;

  return new Promise((resolve, reject) => {
    let transcript = '';
    let settled = false;
    let grace: ReturnType<typeof setTimeout> | undefined;
    const subscriptions: { remove: () => void }[] = [];

    const finish = (action: () => void) => {
      if (settled) return;
      settled = true;
      sessionOpen = false;
      activeStop = null;
      activeAbort = null;
      clearTimeout(timer);
      if (grace) clearTimeout(grace);
      subscriptions.forEach((subscription) => subscription.remove());
      action();
    };

    const timer = setTimeout(() => {
      try {
        speech.stop();
      } catch {
        finish(() =>
          reject(new SpeechCaptureError('no-speech', 'No speech was heard. Try again or type the phrase.')),
        );
        return;
      }
      grace = setTimeout(() => {
        finish(() =>
          reject(new SpeechCaptureError('no-speech', 'No speech was heard. Try again or type the phrase.')),
        );
      }, 2500);
    }, 15000);

    activeStop = () => {
      try {
        speech.stop();
      } catch (error) {
        finish(() =>
          reject(
            new SpeechCaptureError(
              'failed',
              error instanceof Error ? error.message : 'Speech recognition could not be stopped.',
            ),
          ),
        );
      }
    };
    activeAbort = () => {
      try {
        speech.abort();
      } catch {
        finish(() => reject(new SpeechCaptureError('failed', 'Speech recognition was cancelled.')));
      }
    };

    subscriptions.push(
      speech.addListener('result', (event) => {
        const text = event.results?.[0]?.transcript?.trim() ?? '';
        if (!text) return;
        transcript = text;
        onPartial(text);
        if (event.isFinal) finish(() => resolve(text));
      }),
      speech.addListener('error', (event) => {
        const code =
          event.error === 'not-allowed'
            ? 'permission'
            : event.error === 'no-speech'
              ? 'no-speech'
              : event.error === 'network'
                ? 'network'
                : 'failed';
        const message =
          event.error === 'network'
            ? 'The speech service needs a network connection. Check Wi-Fi or mobile data, or type the phrase.'
            : event.error === 'not-allowed'
              ? 'Microphone permission was denied. Allow it in Android settings, or type the phrase.'
              : event.message || event.error || 'Speech recognition failed.';
        finish(() => reject(new SpeechCaptureError(code, message)));
      }),
      speech.addListener('end', () => {
        if (transcript) finish(() => resolve(transcript));
        else finish(() => reject(new SpeechCaptureError('no-speech', 'No speech was heard. Try again or type the phrase.')));
      }),
    );

    try {
      speech.start({
        lang,
        interimResults: true,
        continuous: false,
        contextualStrings: ['Rahul', 'rupaye', 'dile', 'wapas', 'parat', 'aaj'],
      });
    } catch (error) {
      finish(() =>
        reject(
          new SpeechCaptureError(
            'failed',
            error instanceof Error ? error.message : 'Speech recognition did not start.',
          ),
        ),
      );
    }
  });
}
