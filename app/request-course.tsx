import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Linking, StyleSheet, Text, TextInput, View } from 'react-native';
import { catalogEntryById } from '@/src/course/catalog';
import { useDb } from '@/src/db/DbProvider';
import { readSettingStore } from '@/src/db/repo';
import {
  buildCourseRequest,
  courseRequestMailto,
  queueCourseRequest,
  SHOTTRAXX_CONTACT_EMAIL,
} from '@/src/domain/courseRequest';
import { COPY } from '@/src/domain/playerCopy';
import { BigButton } from '@/src/ui/BigButton';
import { useColors } from '@/src/ui/ColorThemeProvider';
import { Screen } from '@/src/ui/Screen';
import { type, type ColorPalette } from '@/src/ui/theme';

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

export default function RequestCourseScreen() {
  const params = useLocalSearchParams<{ name?: string; city?: string; courseId?: string }>();
  const seededName = firstParam(params.name);
  const seededId = firstParam(params.courseId);
  const catalog = catalogEntryById(seededId);
  const seededCity = firstParam(params.city) || catalog?.city || '';
  const { db, bump } = useDb();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [name, setName] = useState(seededName || catalog?.name || '');
  const [city, setCity] = useState(seededCity);
  const [notes, setNotes] = useState('');
  const [queued, setQueued] = useState(false);

  const send = () => {
    const payload = buildCourseRequest({ name, city, notes });
    if (!payload) {
      Alert.alert(COPY.requestCourseTitle, 'Add the course name.');
      return;
    }
    queueCourseRequest(readSettingStore(db), payload);
    bump();
    setQueued(true);
    const url = courseRequestMailto(payload);
    void Linking.openURL(url).catch(() => {
      Alert.alert(COPY.requestCourseTitle, `Couldn’t open email. Write ${SHOTTRAXX_CONTACT_EMAIL}.`);
    });
  };

  return (
    <Screen>
      <Text style={styles.title}>{COPY.requestCourseTitle}</Text>
      <Text style={styles.lede}>{COPY.requestCourseLede}</Text>
      <Text style={styles.contact}>{COPY.contactLine}</Text>
      <Text style={styles.label}>{COPY.courseName}</Text>
      <TextInput value={name} onChangeText={setName} style={styles.input} placeholderTextColor={colors.muted} />
      <Text style={styles.label}>{COPY.city}</Text>
      <TextInput value={city} onChangeText={setCity} style={styles.input} placeholderTextColor={colors.muted} />
      <Text style={styles.label}>{COPY.notes}</Text>
      <TextInput
        value={notes}
        onChangeText={setNotes}
        style={[styles.input, styles.notes]}
        multiline
        placeholderTextColor={colors.muted}
      />
      {queued ? <Text style={styles.meta}>Queued. Your email app still has to send it.</Text> : null}
      <BigButton label={COPY.requestEmailButton} onPress={send} />
      <BigButton label={COPY.contributeCourse} variant="secondary" onPress={() => router.push('/contribute-course')} />
    </Screen>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    title: { color: colors.cream, fontSize: type.hole, fontWeight: '900' },
    lede: { color: colors.muted, fontSize: type.body, lineHeight: 22 },
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
    notes: { minHeight: 120, paddingTop: 12, textAlignVertical: 'top' },
    meta: { color: colors.muted, fontSize: type.meta },
  });
}
