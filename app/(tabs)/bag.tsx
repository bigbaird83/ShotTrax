import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useDb } from '@/src/db/DbProvider';
import { addClub, deleteClub, listClubs, setClubEnabled, updateClub } from '@/src/db/repo';
import { BigButton } from '@/src/ui/BigButton';
import { Screen } from '@/src/ui/Screen';
import { colors } from '@/src/ui/theme';

export default function BagScreen() {
  const { db, revision, bump } = useDb();
  const clubs = useMemo(() => listClubs(db), [db, revision]);
  const [name, setName] = useState('');
  const [shortName, setShortName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const resetForm = () => {
    setName('');
    setShortName('');
    setEditingId(null);
  };

  return (
    <Screen>
      <Text style={styles.lede}>
        Seeded 14-club bag with full CRUD. Voice pick matches names and nicknames (“seven iron”)
        then still requires confirm. Top-3 ranking uses club averages after 5 closed shots.
      </Text>
      {clubs.map((club) => (
        <View key={club.id} style={styles.row}>
          <Pressable
            style={{ flex: 1 }}
            onPress={() => {
              setEditingId(club.id);
              setName(club.name);
              setShortName(club.shortName);
            }}>
            <Text style={styles.name}>{club.name}</Text>
            <Text style={styles.short}>{club.shortName} · tap to edit</Text>
          </Pressable>
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
      <Text style={styles.addTitle}>{editingId ? 'Edit club' : 'Add club'}</Text>
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
        label={editingId ? 'Save club' : 'Add to bag'}
        variant="secondary"
        disabled={!name.trim()}
        onPress={() => {
          if (editingId) {
            updateClub(db, editingId, name, shortName);
          } else {
            addClub(db, name, shortName);
          }
          resetForm();
          bump();
        }}
      />
      {editingId ? (
        <BigButton
          label="Delete club"
          variant="danger"
          onPress={() => {
            const result = deleteClub(db, editingId);
            if (result === 'disabled') {
              Alert.alert(
                'Club has shots',
                'It was turned off in the bag so existing shot history and averages stay intact.',
              );
            }
            resetForm();
            bump();
          }}
        />
      ) : null}
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
    gap: 8,
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
