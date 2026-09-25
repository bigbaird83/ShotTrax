import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { getWatchBridgeNative } from '@/modules/watch-bridge';
import { catalogEntryById } from '@/src/course/catalog';
import { recordedPaintWaterfallStep } from '@/src/course/waterfall';
import { useDb } from '@/src/db/DbProvider';
import { getActiveRound, listHoles } from '@/src/db/repo';
import { readBuildStamp } from '@/src/domain/buildStamp';
import {
  DIAGNOSTICS_DASH,
  currentPlayedHoleNumber,
  diagnosticsFixQuality,
  formatDiagnosticsGreenSource,
  formatDiagnosticsHole,
  formatDiagnosticsYesNo,
  formatFixAge,
  formatHorizontalAccuracy,
  formatLastWatchSend,
  formatRemainingComplicationTransfers,
  paintMatchForRound,
  readDiagnosticsBuild,
  watchLinkFromNative,
  type WatchLinkSnapshot,
} from '@/src/domain/diagnostics';
import { useLiveFix } from '@/src/services/useLiveFix';
import { useColors } from '@/src/ui/ColorThemeProvider';
import { Screen } from '@/src/ui/Screen';
import { cardBorder } from '@/src/ui/surface';
import { type, type ColorPalette } from '@/src/ui/theme';

function readWatchLink(): WatchLinkSnapshot {
  try {
    const mod = getWatchBridgeNative();
    if (!mod || typeof mod.readLinkStatus !== 'function') return watchLinkFromNative(null);
    return watchLinkFromNative(mod.readLinkStatus());
  } catch {
    return watchLinkFromNative(null);
  }
}

export default function DiagnosticsScreen() {
  const { db, revision } = useDb();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const fix = useLiveFix(true);
  const [now, setNow] = useState(() => Date.now());
  const [link, setLink] = useState<WatchLinkSnapshot>(() => readWatchLink());
  const build = useMemo(() => readDiagnosticsBuild(readBuildStamp()), []);
  const round = useMemo(() => getActiveRound(db), [db, revision]);
  const holes = useMemo(() => (round ? listHoles(db, round.id) : []), [db, round, revision]);
  const holeNumber = currentPlayedHoleNumber(holes);
  const [greenSource, setGreenSource] = useState(() => formatDiagnosticsGreenSource(null));

  useEffect(() => {
    const id = setInterval(() => {
      setNow(Date.now());
      setLink(readWatchLink());
    }, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let live = true;
    const load = () => {
      if (!round) {
        if (live) setGreenSource(formatDiagnosticsGreenSource(null));
        return;
      }
      const match = paintMatchForRound(round, catalogEntryById(round.courseApiId));
      if (!match) {
        if (live) setGreenSource(formatDiagnosticsGreenSource(null));
        return;
      }
      void recordedPaintWaterfallStep(match)
        .then((result) => {
          if (live) setGreenSource(formatDiagnosticsGreenSource(result));
        })
        .catch(() => {
          if (live) setGreenSource(formatDiagnosticsGreenSource(null));
        });
    };
    load();
    const id = setInterval(load, 5000);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, [round]);

  return (
    <Screen>
      <Text style={styles.title}>Diagnostics</Text>
      {!round ? <Text style={styles.note}>No round in progress.</Text> : null}

      <Text style={styles.groupLabel}>GPS</Text>
      <View style={styles.list}>
        <Field styles={styles} label="Accuracy" value={formatHorizontalAccuracy(fix?.accuracyM)} />
        <View style={styles.divider} />
        <Field styles={styles} label="Fix quality" value={diagnosticsFixQuality(fix)} />
        <View style={styles.divider} />
        <Field styles={styles} label="Fix age" value={formatFixAge(fix?.timestamp, now)} />
      </View>

      <Text style={styles.groupLabel}>Green</Text>
      <View style={styles.list}>
        <Field
          styles={styles}
          label="Hole"
          value={round ? formatDiagnosticsHole(holeNumber) : DIAGNOSTICS_DASH}
        />
        <View style={styles.divider} />
        <Field styles={styles} label="Source" value={greenSource} />
      </View>

      <Text style={styles.groupLabel}>Watch</Text>
      <View style={styles.list}>
        <Field styles={styles} label="Paired" value={formatDiagnosticsYesNo(link.paired)} />
        <View style={styles.divider} />
        <Field styles={styles} label="Reachable" value={formatDiagnosticsYesNo(link.reachable)} />
        <View style={styles.divider} />
        <Field styles={styles} label="Last sent" value={formatLastWatchSend(link.lastSentAtMs)} />
        <View style={styles.divider} />
        <Field
          styles={styles}
          label="Transfers left"
          value={formatRemainingComplicationTransfers(link.remainingComplicationTransfers)}
        />
      </View>

      <Text style={styles.groupLabel}>Build</Text>
      <View style={styles.list}>
        <Field styles={styles} label="Version" value={build.version} />
        <View style={styles.divider} />
        <Field styles={styles} label="Build" value={build.buildNumber} />
        <View style={styles.divider} />
        <Field styles={styles} label="Commit" value={build.commit} />
      </View>
    </Screen>
  );
}

function Field({
  styles,
  label,
  value,
}: {
  styles: ReturnType<typeof makeStyles>;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value} selectable>
        {value}
      </Text>
    </View>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    title: { color: colors.cream, fontSize: 32, fontWeight: '900', letterSpacing: -0.8 },
    note: { color: colors.muted, fontSize: type.meta, fontWeight: '600', marginHorizontal: 4 },
    groupLabel: {
      color: colors.muted,
      fontSize: type.kicker,
      fontWeight: '800',
      letterSpacing: 1.6,
      textTransform: 'uppercase',
      marginTop: 8,
      marginHorizontal: 4,
    },
    list: {
      backgroundColor: colors.bgElevated,
      borderRadius: 22,
      overflow: 'hidden',
      ...cardBorder(colors),
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 14,
      minHeight: 52,
    },
    label: { flex: 1, color: colors.muted, fontSize: type.meta, fontWeight: '800' },
    value: { color: colors.cream, fontSize: type.body, fontWeight: '800', flexShrink: 1, textAlign: 'right' },
    divider: { height: colors.flat ? 2 : 1, backgroundColor: colors.line, marginLeft: 14 },
  });
}
