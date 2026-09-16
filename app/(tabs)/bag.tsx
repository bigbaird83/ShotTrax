import { useMemo, useState } from 'react';
import { StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useDb } from '@/src/db/DbProvider';
import { addClub, listClubs, setClubEnabled } from '@/src/db/repo';
import { BigButton } from '@/src/ui/BigButton';
import { Screen } from '@/src/ui/Screen';
import { colors } from '@/src/ui/theme';

export default function BagScreen() {
  const { db, revision, bump } = useDb();
  const clubs = useMemo(() => listClubs(db), [db, revision]);
  const [name, setName] = useState('');
  const [shortName, setShortName] = useState('');

  return (
    <Screen>
      <Text style={styles.lede}>
        Default 14-club bag. Toggle clubs you carry. Voice pick and top-3 ranking are not in this
        PR — tap a club when marking a shot.
      </Text>
      {clubs.map((club) => (
        <View key={club.id} style={styles.row}>
          <View>
            <Text style={styles.name}>{club.name}</Text>
            <Text style={styles.short}>{club.shortName}</Text>
          </View>
          <Switch
            value={club.enabled}
            onValueChange={(value) => {
              setClubEnabled(db, club.id, value);
              bump();
            }}
            trackColor={{ true: colors.lime, false: colors.line }}
            thumbColor={colors.cream}
          />
        </View>
      ))}
      <Text style={styles.addTitle}>Add club</Text>
      <TextInput
        placeholder="Name (e.g. 2 Iron)"
        placeholderTextColor={colors.muted}
        value={name}
        onChangeText={setName}
        style={styles.input}
      />
      <TextInput
        placeholder="Short (e.g. 2i)"
        placeholderTextColor={colors.muted}
        value={shortName}
        onChangeText={setShortName}
        style={styles.input}
      />
      <BigButton
        label="Add to bag"
        variant="secondary"
        disabled={!name.trim()}
        onPress={() => {
          addClub(db, name, shortName);
          setName('');
          setShortName('');
          bump();
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  lede: { color: colors.muted, fontSize: 16, lineHeight: 22 },
  row: {
    minHeight: 64,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.bgElevated,
    paddingHorizontal: 14,
    borderRadius: 14,
  },
  name: { color: colors.cream, fontSize: 18, fontWeight: '700' },
  short: { color: colors.muted, fontSize: 14 },
  addTitle: { color: colors.cream, fontSize: 18, fontWeight: '800', marginTop: 8 },
  input: {
    minHeight: 56,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    paddingHorizontal: 14,
    color: colors.cream,
    fontSize: 18,
    backgroundColor: colors.bgElevated,
  },
});
