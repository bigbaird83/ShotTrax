import { StyleSheet, Text } from 'react-native';
import { COPY } from '@/src/domain/playerCopy';
import { Screen } from '@/src/ui/Screen';
import { colors, type } from '@/src/ui/theme';

export default function SettingsScreen() {
  return (
    <Screen>
      <Text style={styles.title}>{COPY.settings}</Text>
      <Text style={styles.lede}>{COPY.settingsStub}</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.cream, fontSize: type.hole, fontWeight: '900' },
  lede: { color: colors.muted, fontSize: type.body, lineHeight: 22 },
});
