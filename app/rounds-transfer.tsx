import { useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useDb } from '@/src/db/DbProvider';
import { collectRoundHistoryExport, restoreRoundHistory } from '@/src/db/repo';
import { COPY } from '@/src/domain/playerCopy';
import { formatRestoreToast, roundExportFilename, serializeRoundHistory } from '@/src/domain/roundTransfer';
import { pickRoundHistoryFile, presentRoundHistoryShare } from '@/src/services/roundHistoryShare';
import { BigButton } from '@/src/ui/BigButton';
import { useColors } from '@/src/ui/ColorThemeProvider';
import { Screen } from '@/src/ui/Screen';
import { type, type ColorPalette } from '@/src/ui/theme';

/** Export / Restore rounds. Menu → here. Rounds stay on the phone unless exported. No account. */
export default function RoundsTransferScreen() {
  const { db, bump } = useDb();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(id);
  }, [toast]);

  const onExport = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const now = new Date();
      const doc = collectRoundHistoryExport(db, now.toISOString());
      if (doc.rounds.length === 0) {
        setToast(COPY.exportRoundsEmpty);
        return;
      }
      const ok = await presentRoundHistoryShare(serializeRoundHistory(doc), roundExportFilename(now));
      setToast(ok ? COPY.exportRoundsDone : COPY.exportRoundsFailed);
    } catch {
      setToast(COPY.exportRoundsFailed);
    } finally {
      setBusy(false);
    }
  };

  const restoreFrom = (raw: string) => {
    try {
      const result = restoreRoundHistory(db, raw);
      if (!result.ok) {
        setToast(COPY.restoreRoundsFailed);
        return;
      }
      bump();
      setToast(formatRestoreToast({ added: result.added, updated: result.updated }));
    } catch {
      setToast(COPY.restoreRoundsFailed);
    }
  };

  const onRestore = async () => {
    if (busy) return;
    setBusy(true);
    let raw: string | null;
    try {
      raw = await pickRoundHistoryFile();
    } catch {
      setToast(COPY.restoreRoundsFailed);
      setBusy(false);
      return;
    }
    setBusy(false);
    if (raw == null) return;
    const text = raw;
    Alert.alert(COPY.restoreRounds, COPY.restoreRoundsConfirm, [
      { text: COPY.cancel, style: 'cancel' },
      { text: COPY.restoreRounds, onPress: () => restoreFrom(text) },
    ]);
  };

  return (
    <Screen>
      <Text style={styles.title}>{COPY.roundsTransfer}</Text>
      <Text style={styles.lede}>{COPY.roundsTransferHint}</Text>
      <View style={styles.actions}>
        <BigButton label={COPY.exportRounds} disabled={busy} onPress={() => void onExport()} />
        <BigButton label={COPY.restoreRounds} variant="secondary" disabled={busy} onPress={() => void onRestore()} />
      </View>
      {toast ? (
        <View style={styles.toast} accessibilityLiveRegion="polite" testID="rounds-transfer-toast">
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      ) : null}
    </Screen>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    title: { color: colors.cream, fontSize: type.hole, fontWeight: '900' },
    lede: { color: colors.muted, fontSize: type.body, lineHeight: 22 },
    actions: { gap: 12, marginTop: 8 },
    toast: {
      alignSelf: 'center',
      marginTop: 8,
      backgroundColor: colors.overlay,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    toastText: { color: colors.cream, fontSize: type.body, fontWeight: '700' },
  });
}
