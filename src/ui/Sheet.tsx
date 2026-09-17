import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, tapTarget, type } from './theme';

type Props = {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
};

/** Layout O — full-screen course / tee / bag / drop sheets. */
export function FullSheet({ visible, title, onClose, children }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={styles.bar}>
          <Text style={styles.title}>{title}</Text>
          <Pressable onPress={onClose} style={styles.done} accessibilityRole="button">
            <Text style={styles.doneLabel}>Done</Text>
          </Pressable>
        </View>
        <View style={styles.body}>{children}</View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
  doneLabel: { color: colors.lime, fontSize: type.button, fontWeight: '800' },
  body: { flex: 1 },
});
