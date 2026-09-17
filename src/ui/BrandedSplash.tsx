import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, StyleSheet, Text, View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { colors } from './theme';

const HOLD_MS = 1100;
const FADE_MS = 280;
const REDUCE_MOTION_MS = 400;

void SplashScreen.preventAutoHideAsync().catch(() => {});

type Props = {
  onDone: () => void;
};

/** Short branded open. Brand mark: ShotTraxx. Kept under ~2s. */
export function BrandedSplash({ onDone }: Props) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.92)).current;
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const finish = () => {
      if (!cancelled) onDoneRef.current();
    };

    void SplashScreen.hideAsync().catch(() => {});

    const run = async () => {
      let reduce = false;
      try {
        reduce = await AccessibilityInfo.isReduceMotionEnabled();
      } catch {
        reduce = false;
      }
      if (cancelled) return;
      if (reduce) {
        opacity.setValue(1);
        scale.setValue(1);
        timeout = setTimeout(finish, REDUCE_MOTION_MS);
        return;
      }
      Animated.sequence([
        Animated.parallel([
          Animated.timing(opacity, { toValue: 1, duration: FADE_MS, useNativeDriver: true }),
          Animated.spring(scale, { toValue: 1, friction: 7, useNativeDriver: true }),
        ]),
        Animated.delay(HOLD_MS),
        Animated.timing(opacity, { toValue: 0, duration: FADE_MS, useNativeDriver: true }),
      ]).start(({ finished }) => {
        if (finished) finish();
      });
    };
    void run();

    return () => {
      cancelled = true;
      if (timeout) clearTimeout(timeout);
    };
  }, [opacity, scale]);

  return (
    <Animated.View
      pointerEvents="auto"
      accessibilityRole="image"
      accessibilityLabel="ShotTraxx"
      style={[styles.wrap, StyleSheet.absoluteFill, { opacity }]}>
      <Animated.View style={[styles.markWrap, { transform: [{ scale }] }]}>
        <View style={styles.mark}>
          <View style={styles.markInner} />
        </View>
        <Text style={styles.brand}>ShotTraxx</Text>
        <Text style={styles.tag}>GPS shot tracker</Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  markWrap: { alignItems: 'center', gap: 12 },
  mark: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 3,
    borderColor: colors.lime,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgElevated,
  },
  markInner: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.lime,
  },
  brand: {
    color: colors.cream,
    fontSize: 40,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  tag: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
});
