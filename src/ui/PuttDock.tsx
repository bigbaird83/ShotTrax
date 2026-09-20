import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { COPY } from '../domain/playerCopy';
import { PUTT_LENGTHS, type PuttDraft, type PuttLengthId } from '../domain/putts';
import { useColors } from './ColorThemeProvider';
import { type, type ColorPalette } from './theme';

/** Compact putt stepper + distance pills. Sits just above Hole Out — not its own dock row. */
export function PuttDock({
  draft,
  disabled,
  onAdd,
  onUndo,
}: {
  draft: PuttDraft;
  disabled?: boolean;
  onAdd: (id: PuttLengthId) => void;
  onUndo: () => void;
}) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const canAdd = draft.lengths.length < 5 && !disabled;
  return (
    <View style={styles.wrap} testID="play-dock-putts">
      <View style={styles.stepper}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={COPY.undoPutt}
          disabled={disabled || draft.lengths.length === 0}
          onPress={onUndo}
          style={[styles.step, (disabled || draft.lengths.length === 0) && styles.stepOff]}>
          <Text style={styles.stepText}>−</Text>
        </Pressable>
        <Text style={styles.count}>
          {COPY.putts} · {draft.lengths.length}
        </Text>
      </View>
      <View style={styles.buckets}>
        {PUTT_LENGTHS.map((bucket) => (
          <Pressable
            key={bucket.id}
            accessibilityRole="button"
            accessibilityLabel={bucket.label}
            disabled={!canAdd}
            onPress={() => onAdd(bucket.id)}
            style={[styles.bucket, !canAdd && styles.bucketOff]}>
            <Text style={styles.bucketText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
              {bucket.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    wrap: { gap: 4, minWidth: 0 },
    stepper: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    step: {
      minHeight: 32,
      minWidth: 32,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.line,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.bgElevated,
    },
    stepOff: { opacity: 0.4 },
    stepText: { color: colors.cream, fontSize: 18, fontWeight: '900' },
    count: { color: colors.cream, fontSize: type.tiny, fontWeight: '800' },
    buckets: { flexDirection: 'row', flexWrap: 'nowrap', gap: 4 },
    bucket: {
      flex: 1,
      minHeight: 32,
      minWidth: 0,
      paddingHorizontal: 2,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.line,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.bgElevated,
    },
    bucketOff: { opacity: 0.45 },
    bucketText: { color: colors.cream, fontSize: 10, fontWeight: '800', textAlign: 'center' },
  });
}
