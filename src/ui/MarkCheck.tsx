import { useEffect } from 'react';
import { StyleSheet, Text } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { colors, type } from './theme';

/** Polish F — check burst after Mark, paired with success haptics. */
export function MarkCheck({ nonce }: { nonce: number }) {
  const scale = useSharedValue(0);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (!nonce) return;
    scale.value = 0;
    opacity.value = 1;
    scale.value = withSequence(withTiming(1.15, { duration: 140 }), withTiming(1, { duration: 120 }));
    opacity.value = withSequence(withTiming(1, { duration: 80 }), withTiming(0, { duration: 520 }));
  }, [nonce, opacity, scale]);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  if (!nonce) return null;
  return (
    <Animated.View pointerEvents="none" style={[styles.wrap, style]}>
      <Text style={styles.check}>✓</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  check: {
    color: colors.bg,
    fontSize: type.yards,
    fontWeight: '900',
  },
});
