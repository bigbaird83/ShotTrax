import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { COPY, formatPuttN } from '../domain/playerCopy';
import {
  PUTT_LENGTHS,
  canCommitPutt,
  commitPuttLength,
  showPuttNoLengthCue,
  nextPuttNumber,
  pickPuttLength,
  type PuttDraft,
  type PuttLengthId,
} from '../domain/putts';
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
  onMadeIt: (pending?: PuttLengthId | null) => void;
}) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [pending, setPending] = useState<PuttLengthId | null>(null);
  const pick = { draft, pending };
  const nextN = nextPuttNumber(draft);
  const canPick = nextN != null && !disabled;
  const canAdd = canCommitPutt(pick) && !disabled;
  const canMake = !disabled;
  const showNoLength = showPuttNoLengthCue(pick);
  const pendingLabel = pending
    ? PUTT_LENGTHS.find((row) => row.id === pending)?.label ?? pending
    : COPY.noLength;

  return (
    <View style={styles.wrap} testID="putt-sheet">
      <Text style={styles.lede}>{COPY.puttSheetLede}</Text>
      {draft.lengths.map((id, index) => {
        const label = PUTT_LENGTHS.find((row) => row.id === id)?.label ?? id;
        return (
          <View key={`${id}-${index}`} style={styles.row}>
            <Text style={styles.puttN}>{formatPuttN(index + 1)}</Text>
            <Text style={styles.puttLen}>{label}</Text>
          </View>
        );
      })}
      {nextN != null ? (
        <View style={styles.row} testID="putt-sheet-next">
          <Text style={styles.puttN}>{formatPuttN(nextN)}</Text>
          <Text style={pending ? styles.puttLen : styles.muted}>{pendingLabel}</Text>
        </View>
      ) : null}
      <View style={styles.buckets}>
        {PUTT_LENGTHS.map((bucket) => (
          <Pressable
            key={bucket.id}
            accessibilityRole="button"
            accessibilityLabel={bucket.label}
            disabled={!canPick}
            onPress={() => setPending(pickPuttLength({ draft, pending }, bucket.id).pending)}
            style={[styles.bucket, pending === bucket.id && styles.bucketOn, !canPick && styles.bucketOff]}>
            <Text style={styles.bucketText}>{bucket.label}</Text>
          </Pressable>
        ))}
      </View>
      <BigButton
        label={COPY.addPutt}
        variant="secondary"
        disabled={!canAdd}
        onPress={() => {
          const next = commitPuttLength({ draft, pending });
          if (next.draft.lengths.length === draft.lengths.length) return;
          const added = next.draft.lengths[next.draft.lengths.length - 1];
          if (!added) return;
          onAdd(added);
          setPending(next.pending);
        }}
      />
      {draft.lengths.length > 0 ? (
        <BigButton label={COPY.undoPutt} variant="ghost" disabled={disabled} onPress={onUndo} />
      ) : null}
      {showNoLength ? (
        <Text testID="putt-no-length-cue" style={styles.muted}>
          {COPY.noLengthCue}
        </Text>
      ) : null}
      <BigButton label={COPY.madeIt} disabled={!canMake} onPress={() => onMadeIt(pending)} />
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
  bucketOn: { borderColor: colors.lime },
  bucketOff: { opacity: 0.45, borderColor: colors.line },
  bucketText: { color: colors.cream, fontSize: type.meta, fontWeight: '800', textAlign: 'center' },
  });
}
