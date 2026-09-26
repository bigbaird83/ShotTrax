import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef } from 'react';
import { Animated, Modal, PanResponder, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from './ColorThemeProvider';
import { tapTarget, type, type ColorPalette } from './theme';

type Props = {
  visible: boolean;
  title: string;
  onClose: () => void;
  /** iOS: fires after the slide-off. Menu Share waits for this. */
  onDismiss?: () => void;
  /** Swipe right from the left edge closes the sheet, like iOS back. */
  swipeToClose?: boolean;
  children: ReactNode;
};

/** Width of the left-edge strip that starts a swipe-to-close. */
const EDGE_WIDTH = 28;

/** Layout O — full-screen course / tee / bag / drop sheets. */
export function FullSheet({ visible, title, onClose, onDismiss, swipeToClose = false, children }: Props) {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { width } = useWindowDimensions();
  const dragX = useRef(new Animated.Value(0)).current;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (visible) dragX.setValue(0);
  }, [visible, dragX]);

  const edgePan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_e, g) => g.dx > 4 && Math.abs(g.dx) > Math.abs(g.dy),
        onPanResponderTerminationRequest: () => false,
        onPanResponderMove: (_e, g) => dragX.setValue(Math.max(0, g.dx)),
        onPanResponderRelease: (_e, g) => {
          if (g.dx > width * 0.3 || (g.dx > 40 && g.vx > 0.5)) {
            Animated.timing(dragX, { toValue: width, duration: 180, useNativeDriver: true }).start(() =>
              onCloseRef.current(),
            );
          } else {
            Animated.spring(dragX, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
          }
        },
        onPanResponderTerminate: () => {
          Animated.spring(dragX, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
        },
      }),
    [dragX, width],
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
      onDismiss={onDismiss}
    >
      <Animated.View
        style={[
          styles.root,
          { paddingTop: insets.top, paddingBottom: insets.bottom, transform: [{ translateX: dragX }] },
        ]}
      >
        <View style={styles.bar}>
          <Text style={styles.title}>{title}</Text>
          <Pressable onPress={onClose} style={styles.done} accessibilityRole="button">
            <Text style={styles.doneLabel}>Done</Text>
          </Pressable>
        </View>
        <View style={styles.body}>{children}</View>
        {swipeToClose ? <View style={styles.edge} {...edgePan.panHandlers} /> : null}
      </Animated.View>
    </Modal>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    bar: {
      minHeight: tapTarget,
      paddingHorizontal: 16,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderBottomWidth: 1,
      borderBottomColor: colors.line,
    },
    title: { color: colors.cream, fontSize: type.hole, fontWeight: '900' },
    done: { minHeight: tapTarget, justifyContent: 'center', paddingHorizontal: 8 },
    doneLabel: { color: colors.cream, fontSize: type.button, fontWeight: '800' },
    body: { flex: 1 },
    edge: { position: 'absolute', left: 0, top: 0, bottom: 0, width: EDGE_WIDTH },
  });
}
