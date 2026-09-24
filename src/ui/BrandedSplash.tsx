import { useEventListener } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import * as SplashScreen from 'expo-splash-screen';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Image, Pressable, StyleSheet, View } from 'react-native';
import { SHOTTRAXX_BRAND } from '@/src/domain/playerCopy';
import { SPLASH_BG, SPLASH_RESIZE_MODE } from '@/src/domain/splashLetterbox';
import { SPLASH_SAFETY_MS, planSplashDismiss, type SplashDismissEvent } from '@/src/domain/splashDismiss';

/** Owner open clip, 3.0s, portrait. Contain on the sampled field — never cover. */
const OPEN_CLIP = require('../../assets/splash/splash-open-first-3s-v2.mp4') as number;
/** First frame of the 3s clip — Expo native splash, pre-video, and Reduce Motion. */
const OPEN_STILL = require('../../assets/splash/splash-first-frame-v2.png');

const REDUCE_MOTION_MS = 400;

void SplashScreen.preventAutoHideAsync().catch(() => {});

type Props = {
  onDone: () => void;
};

function hideNativeSplash() {
  void SplashScreen.hideAsync().catch(() => {});
}

/**
 * Full-screen overlay after the static Expo splash. Cold start only.
 * The audio track is removed. Playback is muted (volume 0) and mixWithOthers
 * so it does not pause other audio. Tap skips. 5s safety timeout.
 */
export function BrandedSplash({ onDone }: Props) {
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const dismissingRef = useRef(false);
  const notifiedRef = useRef(false);
  const opacity = useRef(new Animated.Value(1)).current;
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);

  const notify = useCallback(() => {
    if (notifiedRef.current) return;
    notifiedRef.current = true;
    hideNativeSplash();
    onDoneRef.current();
  }, []);

  const dismiss = useCallback(
    (event: SplashDismissEvent) => {
      const plan = planSplashDismiss(event, dismissingRef.current);
      if (!plan.dismiss) return;
      dismissingRef.current = true;
      hideNativeSplash();
      if (plan.fadeMs <= 0) {
        notify();
        return;
      }
      Animated.timing(opacity, {
        toValue: 0,
        duration: plan.fadeMs,
        useNativeDriver: true,
      }).start(() => notify());
      setTimeout(notify, plan.fadeMs + 80);
    },
    [notify, opacity],
  );

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
    const timeout = setTimeout(() => dismiss('timeout'), SPLASH_SAFETY_MS);
    return () => clearTimeout(timeout);
  }, [dismiss]);

  if (reduceMotion === null) {
    // Native Expo splash stays up — no JS black frame while we pick a path.
    return null;
  }

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[styles.wrap, StyleSheet.absoluteFill, { opacity }]}>
      {reduceMotion ? (
        <StillSplash onDismiss={dismiss} />
      ) : (
        <VideoSplash onDismiss={dismiss} />
      )}
    </Animated.View>
  );
}

function SplashFrame({ children, onSkip }: { children?: ReactNode; onSkip: () => void }) {
  return (
    <View
      pointerEvents="auto"
      accessibilityRole="image"
      accessibilityLabel={SHOTTRAXX_BRAND}
      style={StyleSheet.absoluteFill}>
      <Image source={OPEN_STILL} style={StyleSheet.absoluteFill} resizeMode={SPLASH_RESIZE_MODE} />
      {children}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Skip splash"
        onPress={onSkip}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

function StillSplash({ onDismiss }: { onDismiss: (event: SplashDismissEvent) => void }) {
  useEffect(() => {
    hideNativeSplash();
    const timeout = setTimeout(() => onDismiss('end'), REDUCE_MOTION_MS);
    return () => clearTimeout(timeout);
  }, [onDismiss]);

  return <SplashFrame onSkip={() => onDismiss('tap')} />;
}

function VideoSplash({ onDismiss }: { onDismiss: (event: SplashDismissEvent) => void }) {
  const startedRef = useRef(false);
  const player = useVideoPlayer(OPEN_CLIP, (instance) => {
    instance.loop = false;
    instance.muted = true;
    instance.volume = 0;
    instance.audioMixingMode = 'mixWithOthers';
    // Decode under the native splash. hideAsync runs on the first frame.
    instance.play();
  });

  useEventListener(player, 'playToEnd', () => onDismiss('end'));
  useEventListener(player, 'statusChange', ({ status, error }) => {
    if (status === 'error' || error) onDismiss('error');
  });

  return (
    <SplashFrame onSkip={() => onDismiss('tap')}>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit={SPLASH_RESIZE_MODE}
        nativeControls={false}
        playsInline
        allowsPictureInPicture={false}
        allowsVideoFrameAnalysis={false}
        fullscreenOptions={{ enable: false }}
        onFirstFrameRender={() => {
          hideNativeSplash();
          if (startedRef.current) return;
          startedRef.current = true;
        }}
      />
    </SplashFrame>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: SPLASH_BG,
    zIndex: 1000,
  },
});
