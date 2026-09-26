import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import {
  HISTORY_LONG_PRESS_DELETE_MS,
  HISTORY_SWIPE_DELETE_PX,
  HISTORY_SWIPE_EDIT_PX,
  HISTORY_SWIPE_REVEAL_PX,
  historySwipeRestOffset,
  historySwipeSnap,
} from '@/src/domain/roundHistory';
import { COPY } from '@/src/domain/playerCopy';
import { useColors } from './ColorThemeProvider';
import { hapticWarn } from './haptics';
import { type, type ColorPalette } from './theme';

export function HistorySwipeRow({
  open,
  onOpen,
  onClose,
  onPress,
  onEdit,
  onDelete,
  rowStyle,
  children,
}: {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onPress: () => void;
  onEdit: () => void;
  onDelete: () => void;
  rowStyle?: ViewStyle;
  children: ReactNode;
}) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const x = useRef(new Animated.Value(0)).current;
  const openRef = useRef(open);
  openRef.current = open;
  const callbacks = useRef({ onOpen, onClose });
  callbacks.current = { onOpen, onClose };

  useEffect(() => {
    Animated.spring(x, {
      toValue: historySwipeRestOffset(open),
      useNativeDriver: true,
      bounciness: 0,
      speed: 20,
    }).start();
  }, [open, x]);

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        Math.abs(gesture.dx) > 12 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
      // Tab swipe asks on every move while this row is the responder. Refuse so the row keeps the touch.
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_, gesture) => {
        const base = openRef.current ? -HISTORY_SWIPE_REVEAL_PX : 0;
        const next = Math.max(-HISTORY_SWIPE_REVEAL_PX, Math.min(0, base + gesture.dx));
        x.setValue(next);
      },
      onPanResponderRelease: (_, gesture) => {
        const snap = historySwipeSnap({
          dx: gesture.dx,
          dy: gesture.dy,
          open: openRef.current,
        });
        if (snap === 'open') callbacks.current.onOpen();
        else callbacks.current.onClose();
        Animated.spring(x, {
          toValue: historySwipeRestOffset(snap === 'open'),
          useNativeDriver: true,
          bounciness: 0,
          speed: 20,
        }).start();
      },
      onPanResponderTerminate: (_, gesture) => {
        const snap = historySwipeSnap({
          dx: gesture.dx,
          dy: gesture.dy,
          open: openRef.current,
        });
        if (snap === 'open') callbacks.current.onOpen();
        else callbacks.current.onClose();
        Animated.spring(x, {
          toValue: historySwipeRestOffset(snap === 'open'),
          useNativeDriver: true,
          bounciness: 0,
          speed: 20,
        }).start();
      },
    }),
  ).current;

  return (
    <View style={styles.wrap}>
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={COPY.edit}
          onPress={onEdit}
          style={styles.edit}>
          <Text style={styles.editText}>{COPY.edit}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={COPY.deleteRound}
          onPress={onDelete}
          style={styles.delete}>
          <Text style={styles.deleteText}>✕</Text>
        </Pressable>
      </View>
      <Animated.View style={{ transform: [{ translateX: x }] }} {...pan.panHandlers}>
        <Pressable
          accessibilityRole="button"
          accessibilityActions={[{ name: 'longpress', label: COPY.deleteRound }]}
          onAccessibilityAction={(event) => {
            if (event.nativeEvent.actionName === 'longpress') onDelete();
          }}
          onPress={onPress}
          onLongPress={() => {
            hapticWarn();
            onDelete();
          }}
          delayLongPress={HISTORY_LONG_PRESS_DELETE_MS}
          style={rowStyle}>
          {children}
        </Pressable>
      </Animated.View>
    </View>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    wrap: { overflow: 'hidden', borderRadius: 16 },
    actions: {
      position: 'absolute',
      right: 0,
      top: 0,
      bottom: 0,
      width: HISTORY_SWIPE_REVEAL_PX,
      flexDirection: 'row',
    },
    edit: {
      width: HISTORY_SWIPE_EDIT_PX,
      backgroundColor: colors.bgElevated,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 8,
      borderWidth: 1,
      borderColor: colors.line,
    },
    editText: { color: colors.cream, fontSize: type.button, fontWeight: '800' },
    delete: {
      width: HISTORY_SWIPE_DELETE_PX,
      backgroundColor: colors.red,
      alignItems: 'center',
      justifyContent: 'center',
    },
    deleteText: { color: colors.cream, fontSize: 22, fontWeight: '800' },
  });
}
