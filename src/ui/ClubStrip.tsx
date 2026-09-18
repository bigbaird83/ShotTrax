import { useEffect, useRef, useState } from 'react';
import { NativeSyntheticEvent, NativeScrollEvent, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  CLUB_STRIP_GAP,
  CLUB_STRIP_SEAM_GAP,
  CLUB_STRIP_VISIBLE_PILLS,
  PHONE_WHEEL_PILL_HEIGHT,
  wrapClubStripIndex,
} from '../domain/clubStrip';
import { colors, type } from './theme';

export type ClubStripItem = {
  id: string;
  label: string;
};

type Props = {
  items: ClubStripItem[];
  pickId: string | null;
  /** First fully visible club in the opening window. Not a wrap/seam. */
  windowStart?: number;
  onPick: (id: string) => void;
  disabled?: boolean;
  compact?: boolean;
};

const LOOP_COPIES = 3;

function pillWidthForStrip(width: number, count: number, compact?: boolean): number {
  if (width <= 0) return 0;
  const visible = Math.min(CLUB_STRIP_VISIBLE_PILLS, Math.max(count, 1));
  const gaps = Math.max(0, visible - 1);
  const raw = (width - CLUB_STRIP_GAP * gaps) / visible;
  return Math.max(compact ? 56 : 72, raw);
}

/** Sideways carry wheel. Three full pills. Tap marks; swipe does not. */
export function ClubStrip({ items, pickId, windowStart = 0, onPick, disabled, compact }: Props) {
  const scrollRef = useRef<ScrollView>(null);
  const [width, setWidth] = useState(0);
  const pillWidth = pillWidthForStrip(width, items.length, compact);
  const loops = items.length > 1 ? LOOP_COPIES : 1;
  const origin = items.length > 1 ? items.length : 0;
  const start = Math.max(0, Math.min(windowStart, Math.max(items.length - 1, 0)));
  const looped = Array.from({ length: loops }, (_, copy) =>
    items.map((item, index) => ({
      ...item,
      token: `${item.id}#${copy}`,
      seamAfter: items.length > 1 && index === items.length - 1,
    })),
  ).flat();

  const gapAfter = (index: number) => {
    if (items.length <= 1) return CLUB_STRIP_GAP;
    return index % items.length === items.length - 1 ? CLUB_STRIP_SEAM_GAP : CLUB_STRIP_GAP;
  };

  const offsetForIndex = (index: number) => {
    let x = 0;
    for (let i = 0; i < index; i += 1) x += pillWidth + gapAfter(i);
    return x;
  };

  const indexForOffset = (x: number) => {
    let pos = 0;
    for (let i = 0; i < looped.length; i += 1) {
      const step = pillWidth + gapAfter(i);
      if (x < pos + step / 2) return i;
      pos += step;
    }
    return Math.max(0, looped.length - 1);
  };

  const scrollToIndex = (index: number, animated: boolean) => {
    scrollRef.current?.scrollTo({
      x: offsetForIndex(index),
      animated,
    });
  };

  useEffect(() => {
    if (width <= 0 || items.length === 0) return;
    scrollToIndex(origin + start, false);
  }, [items, start, origin, pickId, pillWidth, width]);

  const settleWrap = (x: number) => {
    if (items.length <= 1 || width <= 0) return;
    const raw = indexForOffset(x);
    const wrapped = wrapClubStripIndex(raw, items.length);
    const target = origin + wrapped;
    if (raw < items.length || raw >= items.length * 2) {
      scrollToIndex(target, false);
    }
  };

  const onWrapSettle = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    settleWrap(event.nativeEvent.contentOffset.x);
  };

  return (
    <View
      style={[styles.wrap, compact && styles.wrapCompact]}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      {width > 0 ? (
        <ScrollView
          ref={scrollRef}
          horizontal
          nestedScrollEnabled
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          onMomentumScrollEnd={onWrapSettle}
          onScrollEndDrag={onWrapSettle}
          contentContainerStyle={{
            paddingHorizontal: 0,
            alignItems: 'center',
          }}>
          {looped.map((item) => {
            const pick = item.id === pickId;
            return (
              <Pressable
                key={item.token}
                accessibilityRole="button"
                disabled={disabled}
                onPress={() => onPick(item.id)}
                style={[
                  styles.pill,
                  compact && styles.pillCompact,
                  { width: pillWidth, marginRight: item.seamAfter ? CLUB_STRIP_SEAM_GAP : CLUB_STRIP_GAP },
                  pick && styles.pillPick,
                ]}>
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                  style={[styles.label, compact && styles.labelCompact, pick && styles.labelPick]}>
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', height: PHONE_WHEEL_PILL_HEIGHT + 8 },
  wrapCompact: { height: 40 },
  pill: {
    height: PHONE_WHEEL_PILL_HEIGHT,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgElevated,
    paddingHorizontal: 6,
  },
  pillCompact: { height: 36, borderRadius: 10 },
  pillPick: { borderColor: colors.lime, borderWidth: 2, backgroundColor: '#1C3A24' },
  label: { color: colors.cream, fontWeight: '800', fontSize: type.chip },
  labelCompact: { fontSize: type.tiny },
  labelPick: { color: colors.lime, fontWeight: '900' },
});
