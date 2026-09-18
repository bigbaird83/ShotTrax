import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, type } from './theme';

export type ClubStripItem = {
  id: string;
  label: string;
};

type Props = {
  items: ClubStripItem[];
  pickId: string | null;
  onPick: (id: string) => void;
  disabled?: boolean;
  compact?: boolean;
};

const PILL_RATIO = 0.62;
const GAP = 8;

/** Sideways carry strip. Peek shorter left / longer right. Tap marks; swipe does not. */
export function ClubStrip({ items, pickId, onPick, disabled, compact }: Props) {
  const scrollRef = useRef<ScrollView>(null);
  const [width, setWidth] = useState(0);
  const pillWidth = Math.max(compact ? 72 : 96, width * PILL_RATIO);
  const openIndex = Math.max(
    0,
    items.findIndex((item) => item.id === pickId),
  );

  useEffect(() => {
    if (width <= 0 || items.length === 0) return;
    scrollRef.current?.scrollTo({
      x: openIndex * (pillWidth + GAP),
      animated: false,
    });
  }, [items, openIndex, pickId, pillWidth, width]);

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
          contentContainerStyle={{
            paddingHorizontal: Math.max(0, (width - pillWidth) / 2),
            gap: GAP,
            alignItems: 'center',
          }}>
          {items.map((item) => {
            const pick = item.id === pickId;
            return (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                disabled={disabled}
                onPress={() => onPick(item.id)}
                style={[
                  styles.pill,
                  compact && styles.pillCompact,
                  { width: pillWidth },
                  pick && styles.pillPick,
                ]}>
                <Text
                  numberOfLines={1}
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
  wrap: { width: '100%', height: 52 },
  wrapCompact: { height: 40 },
  pill: {
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgElevated,
    paddingHorizontal: 8,
  },
  pillCompact: { height: 36, borderRadius: 10 },
  pillPick: { borderColor: colors.lime, borderWidth: 2, backgroundColor: '#1C3A24' },
  label: { color: colors.cream, fontWeight: '800', fontSize: type.chip },
  labelCompact: { fontSize: type.tiny },
  labelPick: { color: colors.lime, fontWeight: '900' },
});
