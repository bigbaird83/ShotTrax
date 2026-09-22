import { useMemo, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useDb } from '@/src/db/DbProvider';
import { readSettingStore } from '@/src/db/repo';
import {
  CONTRIBUTE_HELP,
  CONTRIBUTE_THANKS,
  contributionMailto,
  queueContribution,
} from '@/src/domain/courseContribute';
import { SHOTTRAXX_CONTACT_EMAIL } from '@/src/domain/courseRequest';
import { COPY } from '@/src/domain/playerCopy';
import { BigButton } from '@/src/ui/BigButton';
import { useColors } from '@/src/ui/ColorThemeProvider';
import { Screen } from '@/src/ui/Screen';
import { tapTarget, type, type ColorPalette } from '@/src/ui/theme';

const SHEET_PLACEHOLDER = 'hole,tee_lat,tee_lon,green_lat,green_lon,par,yards';

export default function ContributeCourseScreen() {
  const { db, bump } = useDb();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [courseName, setCourseName] = useState('');
  const [city, setCity] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [sheet, setSheet] = useState('');
  const [holes, setHoles] = useState<9 | 18>(18);
  const [grant, setGrant] = useState(false);
  const [issues, setIssues] = useState<string[]>([]);
  const [queued, setQueued] = useState(false);

  const send = () => {
    const verdict = queueContribution(readSettingStore(db), {
      courseName,
      city,
      claimedHoleCount: holes,
      sheet,
      email,
      grantCommercialOdbl: grant,
      notes,
    });
    if (!verdict.ok) {
      setQueued(false);
      setIssues(verdict.issues.map((issue) => issue.message));
      return;
    }
    bump();
    setIssues([]);
    setQueued(true);
    const url = contributionMailto(verdict.contribution);
    void Linking.openURL(url).catch(() => {
      Alert.alert(COPY.contributeCourseTitle, `Couldn’t open email. Write ${SHOTTRAXX_CONTACT_EMAIL}.`);
    });
  };

  return (
    <Screen>
      <Text style={styles.title}>{COPY.contributeCourseTitle}</Text>
      <Text style={styles.lede}>{CONTRIBUTE_THANKS}</Text>
      <Text style={styles.help}>{CONTRIBUTE_HELP}</Text>
      <Text style={styles.contact}>{COPY.contactLine}</Text>
      <Text style={styles.label}>{COPY.courseName}</Text>
      <TextInput value={courseName} onChangeText={setCourseName} style={styles.input} placeholderTextColor={colors.muted} />
      <Text style={styles.label}>{COPY.city}</Text>
      <TextInput value={city} onChangeText={setCity} style={styles.input} placeholderTextColor={colors.muted} />
      <Text style={styles.label}>{COPY.yourEmail}</Text>
      <TextInput
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        style={styles.input}
        placeholderTextColor={colors.muted}
      />
      <Text style={styles.label}>{COPY.holeCount}</Text>
      <View style={styles.row}>
        {([9, 18] as const).map((count) => (
          <Pressable
            key={count}
            accessibilityRole="button"
            accessibilityState={{ selected: holes === count }}
            onPress={() => setHoles(count)}
            style={[styles.chip, holes === count && styles.chipOn]}>
            <Text style={styles.chipText}>{count}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.label}>{COPY.sheet}</Text>
      <TextInput
        value={sheet}
        onChangeText={setSheet}
        multiline
        autoCapitalize="none"
        autoCorrect={false}
        placeholder={SHEET_PLACEHOLDER}
        placeholderTextColor={colors.muted}
        style={[styles.input, styles.sheet]}
      />
      <Text style={styles.label}>{COPY.notes}</Text>
      <TextInput value={notes} onChangeText={setNotes} style={styles.input} placeholderTextColor={colors.muted} />
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
      <BigButton label={COPY.contributeEmailButton} onPress={send} />
    </Screen>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    title: { color: colors.cream, fontSize: type.hole, fontWeight: '900' },
    lede: { color: colors.cream, fontSize: type.body, fontWeight: '800', lineHeight: 22 },
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
    sheet: { minHeight: 160, paddingTop: 12, textAlignVertical: 'top', fontSize: 14 },
    row: { flexDirection: 'row', gap: 10 },
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
    chipOn: { borderColor: colors.cream, backgroundColor: colors.accentWash },
    chipText: { color: colors.cream, fontSize: type.button, fontWeight: '800' },
    grant: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', minHeight: tapTarget },
    grantBox: { color: colors.cream, fontSize: 22, lineHeight: 26 },
    grantText: { color: colors.cream, fontSize: type.meta, fontWeight: '700', flex: 1, lineHeight: 20 },
    warn: { color: colors.orange, fontSize: type.meta, fontWeight: '700' },
    meta: { color: colors.muted, fontSize: type.meta, lineHeight: 20 },
  });
}
