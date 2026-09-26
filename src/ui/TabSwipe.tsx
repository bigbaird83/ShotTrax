import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { tabHref, tabSwipeClaims, tabSwipeTarget, type HomeTab } from '@/src/domain/tabSwipe';

/** Wraps a home tab so a sideways swipe moves to the neighbouring tab. */
export function TabSwipe({ tab, children }: { tab: HomeTab; children: ReactNode }) {
  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => tabSwipeClaims(g),
        onPanResponderRelease: (_e, g) => {
          const next = tabSwipeTarget({ tab, dx: g.dx, dy: g.dy, vx: g.vx });
          if (next) router.navigate(tabHref(next));
        },
      }),
    [tab],
  );
  return (
    <View style={styles.fill} {...pan.panHandlers}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
