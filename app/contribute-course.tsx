import * as ImagePicker from 'expo-image-picker';
import * as MailComposer from 'expo-mail-composer';
import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Image, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { catalogEntryById, LOCAL_COURSE_CATALOG } from '@/src/course/catalog';
import { useDb } from '@/src/db/DbProvider';
import { readSettingStore } from '@/src/db/repo';
import {
  CONTRIBUTE_GPS_STEPS,
  CONTRIBUTE_PARS,
  CONTRIBUTE_THANKS,
  contributeFixBlockedReason,
  contributeFixQuality,
  contributeGpsHoles,
  contributeHoleYards,
  contributePinFromFix,
  contributionEmail,
  contributionMailto,
  knownCourseCity,
  queueContribution,
  type ContributeGpsHole,
  type ContributePhoto,
  type ContributePin,
} from '@/src/domain/courseContribute';
import { SHOTTRAXX_CONTACT_EMAIL } from '@/src/domain/courseRequest';
import { listFavorites } from '@/src/domain/favorites';
import { COPY } from '@/src/domain/playerCopy';
import { getCurrentFix } from '@/src/services/location';
import { useLiveFix } from '@/src/services/useLiveFix';
import { BigButton } from '@/src/ui/BigButton';
import { useColors } from '@/src/ui/ColorThemeProvider';
import { Screen } from '@/src/ui/Screen';
import { tapTarget, type, type ColorPalette } from '@/src/ui/theme';

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

function pinLabel(pin: ContributePin | null): string {
  if (!pin) return '—';
  return `saved · ${pin.quality} ±${Math.round(pin.accuracyM)} m`;
}

export default function ContributeCourseScreen() {
  const params = useLocalSearchParams<{ name?: string; city?: string; courseId?: string }>();
  const catalog = catalogEntryById(firstParam(params.courseId));
  const { db, bump } = useDb();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [courseName, setCourseName] = useState(firstParam(params.name) || catalog?.name || '');
  const [city, setCity] = useState('');
  const [email, setEmail] = useState('');
  const [holeCount, setHoleCount] = useState<9 | 18>(18);
  const [holes, setHoles] = useState<ContributeGpsHole[]>(() => contributeGpsHoles(18));
  const [at, setAt] = useState(0);
  const [pinning, setPinning] = useState(false);
  const [photo, setPhoto] = useState<ContributePhoto | null>(null);
  const [grant, setGrant] = useState(false);
  const [issues, setIssues] = useState<string[]>([]);
  const [queued, setQueued] = useState(false);
  const fix = useLiveFix(true);
  const quality = contributeFixQuality(fix);
  const blocked = contributeFixBlockedReason(fix);

  const knownCity = useMemo(() => {
    const seeded = firstParam(params.city) || catalog?.city || '';
    if (seeded) return seeded;
    const favorites = listFavorites(readSettingStore(db));
    return knownCourseCity(courseName, [...favorites, ...LOCAL_COURSE_CATALOG]);
  }, [catalog, courseName, db, params.city]);

  const hole = holes[at] ?? holes[0];
  const yards = hole ? contributeHoleYards(hole) : null;

  const pickCount = (count: 9 | 18) => {
    setHoleCount(count);
    setHoles((prev) => contributeGpsHoles(count, prev));
    setAt((i) => Math.min(i, count - 1));
  };

  const setHole = (patch: Partial<ContributeGpsHole>) => {
    setHoles((prev) => prev.map((h, i) => (i === at ? { ...h, ...patch } : h)));
  };

  /** Reads a fresh fix at the tap. Saves only when it passes the gate; never fills in a pin. */
  const pin = async (which: 'tee' | 'green') => {
    setPinning(true);
    try {
      const fresh = await getCurrentFix();
      const saved = contributePinFromFix(fresh);
      if (!saved) {
        Alert.alert(COPY.contributeCourseTitle, contributeFixBlockedReason(fresh) ?? 'GPS not ready.');
        return;
      }
      setHole(which === 'tee' ? { tee: saved } : { green: saved });
    } catch (error) {
      Alert.alert(COPY.contributeCourseTitle, error instanceof Error ? error.message : 'GPS not ready.');
    } finally {
      setPinning(false);
    }
  };

  const takePhoto = async (source: 'camera' | 'library') => {
    try {
      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          Alert.alert(COPY.contributeCourseTitle, 'Allow the camera to snap the scorecard, or pick a photo instead.');
          return;
        }
      }
      const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.6 };
      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync(options)
          : await ImagePicker.launchImageLibraryAsync(options);
      const uri = result.canceled ? null : result.assets[0]?.uri;
      if (uri) setPhoto({ uri });
    } catch {
      Alert.alert(COPY.contributeCourseTitle, 'Couldn’t get the photo.');
    }
  };

  const send = async () => {
    const verdict = queueContribution(readSettingStore(db), {
      courseName,
      city: knownCity ?? city,
      claimedHoleCount: holeCount,
      sheet: '',
      email,
      grantCommercialOdbl: grant,
      notes: '',
      gpsHoles: holes,
      photo,
    });
    if (!verdict.ok) {
      setQueued(false);
      setIssues(verdict.issues.map((issue) => issue.message));
      return;
    }
    bump();
    setIssues([]);
    setQueued(true);
    const failed = () =>
      Alert.alert(COPY.contributeCourseTitle, `Couldn’t open email. Write ${SHOTTRAXX_CONTACT_EMAIL}.`);
    try {
      if (await MailComposer.isAvailableAsync()) {
        await MailComposer.composeAsync(contributionEmail(verdict.contribution));
        return;
      }
    } catch {
      // Fall through to a plain mailto. It cannot attach the photo; the body asks for it.
    }
    void Linking.openURL(contributionMailto(verdict.contribution)).catch(failed);
  };

  return (
    <Screen>
      <Text style={styles.title}>{COPY.contributeCourseTitle}</Text>
      {CONTRIBUTE_GPS_STEPS.map((step, i) => (
        <Text key={step} style={styles.help}>
          {i + 1}. {step}
        </Text>
      ))}

      <Text style={styles.label}>{COPY.courseName}</Text>
      <TextInput value={courseName} onChangeText={setCourseName} style={styles.input} placeholderTextColor={colors.muted} />
      {knownCity ? (
        <Text style={styles.meta}>{knownCity}</Text>
      ) : (
        <>
          <Text style={styles.label}>{COPY.contributeLocation}</Text>
          <TextInput value={city} onChangeText={setCity} style={styles.input} placeholderTextColor={colors.muted} />
        </>
      )}

      <Text style={styles.label}>{COPY.holeCount}</Text>
      <View style={styles.row}>
        {([9, 18] as const).map((count) => (
          <Pressable
            key={count}
            accessibilityRole="button"
            accessibilityState={{ selected: holeCount === count }}
            onPress={() => pickCount(count)}
            style={[styles.chip, holeCount === count && styles.chipOn]}>
            <Text style={styles.chipText}>{count}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.holeStrip}>
        {holes.map((h, i) => (
          <Pressable
            key={h.hole}
            accessibilityRole="button"
            accessibilityLabel={`Hole ${h.hole}`}
            accessibilityState={{ selected: i === at }}
            onPress={() => setAt(i)}
            style={[styles.dot, i === at && styles.dotOn, h.tee && h.green && h.par != null && styles.dotDone]}>
            <Text style={styles.dotText}>{h.hole}</Text>
          </Pressable>
        ))}
      </View>

      {hole ? (
        <View style={styles.card}>
          <Text style={styles.holeTitle}>
            Hole {hole.hole} of {holeCount}
          </Text>
          <Text style={styles.label}>{COPY.scorecardPar}</Text>
          <View style={styles.row}>
            {CONTRIBUTE_PARS.map((par) => (
              <Pressable
                key={par}
                accessibilityRole="button"
                accessibilityState={{ selected: hole.par === par }}
                onPress={() => setHole({ par })}
                style={[styles.parChip, hole.par === par && styles.chipOn]}>
                <Text style={styles.chipText}>{par}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={[styles.gps, quality === 'none' && styles.warn]}>
            GPS: {quality}
            {fix?.accuracyM != null && quality !== 'none' ? ` ±${Math.round(fix.accuracyM)} m` : ''}
          </Text>
          {blocked ? <Text style={styles.warn}>{blocked}</Text> : null}
          <BigButton label={COPY.contributeOnTee} disabled={quality === 'none' || pinning} onPress={() => void pin('tee')} />
          <Text style={styles.meta}>Tee: {pinLabel(hole.tee)}</Text>
          <BigButton label={COPY.contributeOnGreen} disabled={quality === 'none' || pinning} onPress={() => void pin('green')} />
          <Text style={styles.meta}>Green: {pinLabel(hole.green)}</Text>
          {yards != null ? <Text style={styles.yards}>{yards} yd tee → green</Text> : null}
          <View style={styles.row}>
            <BigButton
              label="‹ Prev"
              variant="secondary"
              disabled={at === 0}
              onPress={() => setAt((i) => Math.max(0, i - 1))}
              style={styles.flex}
            />
            <BigButton
              label="Next ›"
              variant="secondary"
              disabled={at >= holeCount - 1}
              onPress={() => setAt((i) => Math.min(holeCount - 1, i + 1))}
              style={styles.flex}
            />
          </View>
        </View>
      ) : null}

      <Text style={styles.label}>{COPY.scorecard}</Text>
      <View style={styles.row}>
        <BigButton label={COPY.contributeTakePhoto} variant="secondary" onPress={() => void takePhoto('camera')} style={styles.flex} />
        <BigButton label={COPY.contributePickPhoto} variant="secondary" onPress={() => void takePhoto('library')} style={styles.flex} />
      </View>
      {photo ? <Image source={{ uri: photo.uri }} style={styles.photo} resizeMode="contain" /> : null}

      <Text style={styles.label}>{COPY.yourEmail} (optional)</Text>
      <TextInput
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        style={styles.input}
        placeholderTextColor={colors.muted}
      />
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: grant }}
        onPress={() => setGrant((value) => !value)}
        style={styles.grant}>
        <Text style={styles.grantBox}>{grant ? '☑' : '☐'}</Text>
        <Text style={styles.grantText}>{COPY.contributeGrant}</Text>
      </Pressable>
      {issues.map((message) => (
        <Text key={message} style={styles.warn}>
          {message}
        </Text>
      ))}
      {queued ? <Text style={styles.meta}>{CONTRIBUTE_THANKS}</Text> : null}
      <Text style={styles.meta}>{COPY.contributeReviewNote}</Text>
      <Text style={styles.contact}>{COPY.contactLine}</Text>
      <BigButton label={COPY.contributeEmailButton} onPress={() => void send()} />
    </Screen>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    title: { color: colors.cream, fontSize: type.hole, fontWeight: '900' },
    help: { color: colors.muted, fontSize: type.meta, lineHeight: 20 },
    contact: { color: colors.cream, fontSize: type.body, fontWeight: '800' },
    label: { color: colors.cream, fontSize: type.meta, fontWeight: '800' },
    input: {
      minHeight: 52,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 14,
      paddingHorizontal: 14,
      color: colors.cream,
      fontSize: 18,
      backgroundColor: colors.bgElevated,
    },
    row: { flexDirection: 'row', gap: 10 },
    flex: { flex: 1 },
    chip: {
      minWidth: 88,
      minHeight: tapTarget,
      borderRadius: 16,
      borderWidth: 2,
      borderColor: colors.line,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.bgElevated,
    },
    parChip: {
      flex: 1,
      minHeight: tapTarget,
      borderRadius: 16,
      borderWidth: 2,
      borderColor: colors.line,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.bgElevated,
    },
    chipOn: { borderColor: colors.cream, backgroundColor: colors.accentWash },
    chipText: { color: colors.cream, fontSize: type.button, fontWeight: '800' },
    holeStrip: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    dot: {
      width: 36,
      height: 36,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.line,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.bgElevated,
    },
    dotOn: { borderColor: colors.cream, borderWidth: 2 },
    dotDone: { backgroundColor: colors.accentWash },
    dotText: { color: colors.cream, fontSize: 14, fontWeight: '800' },
    card: {
      gap: 10,
      padding: 14,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.bgElevated,
    },
    holeTitle: { color: colors.cream, fontSize: type.button, fontWeight: '900' },
    gps: { color: colors.cream, fontSize: type.meta, fontWeight: '800' },
    yards: { color: colors.cream, fontSize: type.button, fontWeight: '900' },
    photo: { width: '100%', height: 220, borderRadius: 12 },
    grant: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', minHeight: tapTarget },
    grantBox: { color: colors.cream, fontSize: 22, lineHeight: 26 },
    grantText: { color: colors.cream, fontSize: type.meta, fontWeight: '700', flex: 1, lineHeight: 20 },
    warn: { color: colors.orange, fontSize: type.meta, fontWeight: '700' },
    meta: { color: colors.muted, fontSize: type.meta, lineHeight: 20 },
  });
}
