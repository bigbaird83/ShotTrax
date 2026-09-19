import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { COPY } from '../domain/playerCopy';
import { PUTT_LENGTHS, type PuttDraft, type PuttLengthId } from '../domain/putts';
import { useColors } from './ColorThemeProvider';
import { tapTarget, type, type ColorPalette } from './theme';
import { BigButton } from './BigButton';

export function PuttSheetBody({
  holeNumber,
  draft,
  disabled,
  onAdd,
  onUndo,
  onMadeIt,
}: {
  holeNumber: number;
  draft: PuttDraft;
  disabled?: boolean;
  onAdd: (id: PuttLengthId) => void;
  onUndo: () => void;
  onMadeIt: () => void;
}) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const canAdd = draft.lengths.length < 5 && !disabled;
  const canMake = draft.lengths.length > 0 && !disabled;
  return (
    <View style={styles.wrap}>
      <Text style={styles.lede}>{COPY.puttSheetLede}</Text>
      {draft.lengths.length === 0 ? (
        <Text style={styles.muted}>Pick a length. Each putt gets its own.</Text>
      ) : (
        draft.lengths.map((id, index) => {
          const label = PUTT_LENGTHS.find((row) => row.id === id)?.label ?? id;
          return (
            <View key={`${id}-${index}`} style={styles.row}>
              <Text style={styles.puttN}>Putt {index + 1}</Text>
              <Text style={styles.puttLen}>{label}</Text>
            </View>
          );
        })
      )}
      <View style={styles.buckets}>
        {PUTT_LENGTHS.map((bucket) => (
          <Pressable
            key={bucket.id}
            accessibilityRole="button"
            accessibilityLabel={bucket.label}
            disabled={!canAdd}
            onPress={() => onAdd(bucket.id)}
            style={[styles.bucket, !canAdd && styles.bucketOff]}>
            <Text style={styles.bucketText}>{bucket.label}</Text>
          </Pressable>
        ))}
      </View>
      {draft.lengths.length > 0 ? (
        <BigButton label={COPY.undoPutt} variant="ghost" disabled={disabled} onPress={onUndo} />
      ) : null}
      <BigButton label={COPY.madeIt} disabled={!canMake} onPress={onMadeIt} />
      <Text style={styles.meta}>Hole {holeNumber}</Text>
    </View>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
  wrap: { padding: 16, gap: 12, paddingBottom: 40 },
  lede: { color: colors.cream, fontSize: type.body, fontWeight: '800' },
  muted: { color: colors.muted, fontSize: type.body },
  meta: { color: colors.muted, fontSize: type.tiny, fontWeight: '700' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.bgElevated,
    borderRadius: 14,
    paddingHorizontal: 14,
    minHeight: 52,
  },
  puttN: { color: colors.cream, fontSize: type.body, fontWeight: '800' },
  puttLen: { color: colors.cream, fontSize: type.body, fontWeight: '900' },
  buckets: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  bucket: {
    flexGrow: 1,
    minHeight: tapTarget,
    minWidth: 72,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgElevated,
  },
  bucketOff: { opacity: 0.45, borderColor: colors.line },
  bucketText: { color: colors.cream, fontSize: type.meta, fontWeight: '800', textAlign: 'center' },
  });
}
