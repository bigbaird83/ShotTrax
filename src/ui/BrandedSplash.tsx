import { useEventListener } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import * as SplashScreen from 'expo-splash-screen';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Image, StyleSheet, View } from 'react-native';

/** Doc’s open clip, already trimmed to the first 3.0s. */
const OPEN_CLIP = require('../../assets/splash/splash-open-3s.mp4') as number;
/** First frame of the 3s clip — native Expo splash, pre-video, and Reduce Motion. */
const OPEN_STILL = require('../../assets/splash/splash-open-still.png');

const SPLASH_BG = '#000000';
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

function StillSplash({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    hideNativeSplash();
    const timeout = setTimeout(onDone, REDUCE_MOTION_MS);
    return () => clearTimeout(timeout);
  }, [onDone]);

  return (
    <View
      pointerEvents="auto"
      accessibilityRole="image"
      accessibilityLabel="ShotTraxx"
      style={[styles.wrap, StyleSheet.absoluteFill]}>
      <Image source={OPEN_STILL} style={StyleSheet.absoluteFill} resizeMode="contain" />
    </View>
  );
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
    <View
      pointerEvents="auto"
      accessibilityRole="image"
      accessibilityLabel="ShotTraxx"
      style={[styles.wrap, StyleSheet.absoluteFill]}>
      <Image source={OPEN_STILL} style={StyleSheet.absoluteFill} resizeMode="contain" />
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="contain"
        nativeControls={false}
        playsInline
        allowsPictureInPicture={false}
        allowsVideoFrameAnalysis={false}
        fullscreenOptions={{ enable: false }}
        onFirstFrameRender={hideNativeSplash}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: SPLASH_BG,
    zIndex: 1000,
  },
});
