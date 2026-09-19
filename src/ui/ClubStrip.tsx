import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  NativeSyntheticEvent,
  NativeScrollEvent,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  CLUB_STRIP_GAP,
  CLUB_STRIP_PICK_LIFT_Y,
  CLUB_STRIP_PICK_SCALE,
  CLUB_STRIP_SEAM_GAP,
  CLUB_STRIP_VISIBLE_PILLS,
  PHONE_WHEEL_PILL_HEIGHT,
  PHONE_WHEEL_STRIP_HEIGHT,
  clubStripSlideUpConfirmed,
  clubStripWindowKey,
  clubStripWindowStartClamped,
  wrapClubStripIndex,
} from '../domain/clubStrip';
import { useColors } from './ColorThemeProvider';
import { type, type ColorPalette } from './theme';

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
  /** Slide the lifted center club up to mark. Swipe / scroll never marks. */
  onConfirm?: (id: string) => void;
  disabled?: boolean;
  compact?: boolean;
};

const LOOP_COPIES = 3;

function pillWidthForStrip(width: number, count: number, _compact?: boolean): number {
  if (width <= 0) return 0;
  const visible = Math.min(CLUB_STRIP_VISIBLE_PILLS, Math.max(count, 1));
  const gaps = Math.max(0, visible - 1);
  const raw = (width - CLUB_STRIP_GAP * gaps) / visible;
  // Exact fit so the third pill (often Dr) cannot clip off the right.
  return raw > 0 ? raw : 0;
}

type PillProps = {
  item: ClubStripItem & { token: string; seamAfter: boolean };
  pick: boolean;
  disabled?: boolean;
  compact?: boolean;
  pillWidth: number;
  styles: ReturnType<typeof makeStyles>;
  onPick: (id: string) => void;
  onConfirm?: (id: string) => void;
};

/** Selected / center club lifts. Slide-up on that club confirms; tap only selects. */
function ClubPill({ item, pick, disabled, compact, pillWidth, styles, onPick, onConfirm }: PillProps) {
  const extraLift = useRef(new Animated.Value(0)).current;
  const confirmRef = useRef(onConfirm);
  confirmRef.current = onConfirm;
  const responder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) => {
          if (disabled || !confirmRef.current || !pick) return false;
          return gesture.dy < -8 && Math.abs(gesture.dy) > Math.abs(gesture.dx);
        },
        onPanResponderTerminationRequest: () => false,
        onPanResponderMove: (_, gesture) => {
          extraLift.setValue(gesture.dy < 0 ? Math.max(gesture.dy, -56) : 0);
        },
        onPanResponderRelease: (_, gesture) => {
          Animated.spring(extraLift, { toValue: 0, useNativeDriver: true, friction: 7 }).start();
          if (clubStripSlideUpConfirmed(gesture.dx, gesture.dy)) confirmRef.current?.(item.id);
        },
        onPanResponderTerminate: () => {
          Animated.spring(extraLift, { toValue: 0, useNativeDriver: true, friction: 7 }).start();
        },
      }),
    [disabled, extraLift, item.id, pick],
  );

  return (
    <Animated.View
      {...responder.panHandlers}
      style={[
        pick && styles.pillLift,
        {
          transform: [{ translateY: extraLift }, { scale: pick ? CLUB_STRIP_PICK_SCALE : 1 }],
          zIndex: pick ? 4 : 0,
        },
      ]}>
      <Pressable
        accessibilityRole="button"
        accessibilityHint={onConfirm && pick ? 'Slide up to mark this club' : undefined}
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
    </Animated.View>
  );
}

/** Sideways carry wheel. Three full pills. Tap selects; swipe does not mark. */
export function ClubStrip({ items, pickId, windowStart = 0, onPick, onConfirm, disabled, compact }: Props) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const scrollRef = useRef<ScrollView>(null);
  const [width, setWidth] = useState(0);
  const pillWidth = pillWidthForStrip(width, items.length, compact);
  const loops = items.length > 1 ? LOOP_COPIES : 1;
  const origin = items.length > 1 ? items.length : 0;
  const start = clubStripWindowStartClamped(windowStart, items.length);
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

  const windowKey = clubStripWindowKey(
    items.map((item) => item.id),
    start,
  );

  useEffect(() => {
    if (width <= 0 || items.length === 0) return;
    scrollToIndex(origin + start, false);
    // Selection / label changes do not re-open the window. A new hole updates windowKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowKey, origin, pillWidth, width]);

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
            alignItems: 'flex-end',
            paddingTop: compact ? 0 : 16,
            minHeight: compact ? 40 : PHONE_WHEEL_STRIP_HEIGHT,
          }}>
          {looped.map((item) => (
            <ClubPill
              key={item.token}
              item={item}
              pick={item.id === pickId}
              disabled={disabled}
              compact={compact}
              pillWidth={pillWidth}
              styles={styles}
              onPick={onPick}
              onConfirm={onConfirm}
            />
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    wrap: { width: '100%', height: PHONE_WHEEL_STRIP_HEIGHT, overflow: 'visible' },
    wrapCompact: { height: 40 },
    pillLift: { marginTop: CLUB_STRIP_PICK_LIFT_Y },
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
    pillPick: {
      borderColor: colors.lime,
      borderWidth: 3,
      backgroundColor: colors.accentWash,
    },
    label: { color: colors.cream, fontWeight: '800', fontSize: type.chip },
    labelCompact: { fontSize: type.tiny },
    labelPick: { color: colors.lime, fontWeight: '900' },
  });
}
