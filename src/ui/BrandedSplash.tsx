import { useEventListener } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import * as SplashScreen from 'expo-splash-screen';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Image, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SPLASH_BG, SPLASH_RESIZE_MODE, splashLetterboxSize } from '@/src/domain/splashLetterbox';

/** Doc’s open clip, first 3.0s, muted. Square 960² — contain + black letterbox, never cover. */
const OPEN_CLIP = require('../../assets/splash/splash-open-first-3s-v2.mp4') as number;
/** First frame of the 3s clip — Expo native splash, pre-video, and Reduce Motion. */
const OPEN_STILL = require('../../assets/splash/splash-first-frame-v2.png');

const REDUCE_MOTION_MS = 400;
const FAILSAFE_MS = 4500;

void SplashScreen.preventAutoHideAsync().catch(() => {});

type Props = {
  onDone: () => void;
};

function hideNativeSplash() {
  void SplashScreen.hideAsync().catch(() => {});
}

/** JS branded open after the static Expo splash. Muted 3s Doc clip, then onDone. */
export function BrandedSplash({ onDone }: Props) {
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const finishedRef = useRef(false);
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);

  const finish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    hideNativeSplash();
    onDoneRef.current();
  }, []);

  useEffect(() => {
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (!cancelled) setReduceMotion(enabled);
      })
      .catch(() => {
        if (!cancelled) setReduceMotion(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (reduceMotion === null) return;
    const timeout = setTimeout(finish, FAILSAFE_MS);
    return () => clearTimeout(timeout);
  }, [reduceMotion, finish]);

  if (reduceMotion === null) {
    // Native Expo splash stays up — no JS black frame while we pick a path.
    return null;
  }

  if (reduceMotion) {
    return <StillSplash onDone={finish} />;
  }

  return <VideoSplash onDone={finish} />;
}

function LetterboxedSplash({ children }: { children?: ReactNode }) {
  const { width, height } = useWindowDimensions();
  const square = splashLetterboxSize(width, height);

  return (
    <View
      pointerEvents="auto"
      accessibilityRole="image"
      accessibilityLabel="ShotTraxx"
      style={[styles.wrap, StyleSheet.absoluteFill]}>
      <View style={[styles.mark, square]}>
        <Image source={OPEN_STILL} style={StyleSheet.absoluteFill} resizeMode={SPLASH_RESIZE_MODE} />
        {children}
      </View>
    </View>
  );
}

function StillSplash({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    hideNativeSplash();
    const timeout = setTimeout(onDone, REDUCE_MOTION_MS);
    return () => clearTimeout(timeout);
  }, [onDone]);

  return <LetterboxedSplash />;
}

function VideoSplash({ onDone }: { onDone: () => void }) {
  const player = useVideoPlayer(OPEN_CLIP, (instance) => {
    instance.loop = false;
    instance.muted = true;
    instance.audioMixingMode = 'mixWithOthers';
    instance.play();
  });

  useEventListener(player, 'playToEnd', onDone);
  useEventListener(player, 'statusChange', ({ status, error }) => {
    if (status === 'error' || error) onDone();
  });

  return (
    <LetterboxedSplash>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit={SPLASH_RESIZE_MODE}
        nativeControls={false}
        playsInline
        allowsPictureInPicture={false}
        allowsVideoFrameAnalysis={false}
        fullscreenOptions={{ enable: false }}
        onFirstFrameRender={hideNativeSplash}
      />
    </LetterboxedSplash>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    backgroundColor: SPLASH_BG,
    justifyContent: 'center',
    zIndex: 1000,
  },
  mark: {
    overflow: 'hidden',
  },
});
