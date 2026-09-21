import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { normalizeShareBoardCode } from '@/src/domain/liveBoard';
import { COPY } from '@/src/domain/playerCopy';
import { BigButton } from '@/src/ui/BigButton';
import { Screen } from '@/src/ui/Screen';
import { useColors } from '@/src/ui/ColorThemeProvider';
import { type ColorPalette } from '@/src/ui/theme';

export default function JoinLiveBoardScreen() {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const onOpen = () => {
    const token = normalizeShareBoardCode(code);
    if (!token) {
      setError(COPY.liveBoardCodeHint);
      return;
    }
    setError(null);
    router.push(`/s/${token}`);
  };

  return (
    <Screen>
      <Text style={styles.kicker}>{COPY.liveBoard}</Text>
      <Text style={styles.title}>{COPY.liveBoardWatch}</Text>
      <Text style={styles.muted}>{COPY.liveBoardLede}</Text>
      <TextInput
        autoCapitalize="characters"
        autoCorrect={false}
        placeholder={COPY.liveBoardCodeHint}
        placeholderTextColor={colors.muted}
        value={code}
        onChangeText={setCode}
        style={styles.input}
      />
      {error ? <Text style={styles.warn}>{error}</Text> : null}
      <View>
        <BigButton label={COPY.liveBoard} onPress={onOpen} />
      </View>
    </Screen>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    kicker: { color: colors.muted, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
    title: { color: colors.cream, fontSize: 28, fontWeight: '900' },
    muted: { color: colors.muted, fontSize: 16 },
    warn: { color: colors.orange, fontSize: 14, fontWeight: '700' },
    input: {
      minHeight: 56,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 14,
      paddingHorizontal: 14,
      color: colors.cream,
      fontSize: 22,
      fontWeight: '800',
      letterSpacing: 2,
      backgroundColor: colors.bgElevated,
    },
  });
}
