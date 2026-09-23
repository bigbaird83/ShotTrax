import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { COPY } from '@/src/domain/playerCopy';
import { planShareChoices, type ShareKind } from '@/src/domain/shareChoice';
import { BigButton } from './BigButton';
import { useColors } from './ColorThemeProvider';
import { type ColorPalette } from './theme';

/** Share → Share scorecard / Share live round / Cancel, inline in the sheet. */
export function ShareChoice({
  onPick,
  variant = 'ghost',
}: {
  onPick: (kind: ShareKind) => void;
  variant?: 'secondary' | 'ghost';
}) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [open, setOpen] = useState(false);
  if (!open) {
    return <BigButton label={COPY.share} variant={variant} onPress={() => setOpen(true)} />;
  }
  return (
    <View style={styles.wrap} testID="share-choice">
      <Text style={styles.title}>{COPY.share}</Text>
      {planShareChoices().map((choice) => (
        <BigButton
          key={choice.kind}
          label={choice.label}
          variant="secondary"
          onPress={() => {
            setOpen(false);
            onPick(choice.kind);
          }}
        />
      ))}
      <BigButton label={COPY.cancel} variant="ghost" onPress={() => setOpen(false)} />
    </View>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    wrap: {
      gap: 8,
      padding: 12,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.bgElevated,
    },
    title: { color: colors.muted, fontSize: 13, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  });
}
