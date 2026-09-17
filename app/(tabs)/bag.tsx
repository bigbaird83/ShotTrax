import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useDb } from '@/src/db/DbProvider';
import { addClub, deleteClub, listClubs, restoreDefaultBag, setClubEnabled, updateClub } from '@/src/db/repo';
import { isPutterClubId, parseTypicalCarryYards } from '@/src/domain/defaultBag';
import { COPY } from '@/src/domain/playerCopy';
import { BigButton } from '@/src/ui/BigButton';
import { Screen } from '@/src/ui/Screen';
import { colors, tapTarget, type } from '@/src/ui/theme';

export default function BagScreen() {
  const { db, revision, bump } = useDb();
  const clubs = useMemo(() => listClubs(db), [db, revision]);
  const [name, setName] = useState('');
  const [shortName, setShortName] = useState('');
  const [carry, setCarry] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const editingPutter = editingId != null && isPutterClubId(editingId);

  const resetForm = () => {
    setName('');
    setShortName('');
    setCarry('');
    setEditingId(null);
  };

  return (
    <Screen>
      <Text style={styles.lede}>{COPY.bagLede}</Text>
      {clubs.map((club) => (
        <View key={club.id} style={styles.row}>
          <Pressable
            style={{ flex: 1 }}
            onPress={() => {
              setEditingId(club.id);
              setName(club.name);
              setShortName(club.shortName);
              setCarry(club.typicalCarryYards != null ? String(club.typicalCarryYards) : '');
            }}>
            <Text style={styles.name}>{club.name}</Text>
            <Text style={styles.short}>
              {isPutterClubId(club.id)
                ? club.shortName
                : club.typicalCarryYards != null
                  ? `${club.shortName} · ${club.typicalCarryYards} yd`
                  : club.shortName}
            </Text>
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
        placeholder="Name"
        placeholderTextColor={colors.muted}
        value={name}
        onChangeText={setName}
        style={styles.input}
      />
      <TextInput
        placeholder="Short name"
        placeholderTextColor={colors.muted}
        value={shortName}
        onChangeText={setShortName}
        style={styles.input}
      />
      {editingPutter ? null : (
        <>
          <TextInput
            placeholder={COPY.typicalCarryYards}
            placeholderTextColor={colors.muted}
            value={carry}
            onChangeText={setCarry}
            keyboardType="number-pad"
            style={styles.input}
          />
          {carry.trim() ? (
            <BigButton
              label={COPY.clearTypicalCarry}
              variant="ghost"
              onPress={() => setCarry('')}
            />
          ) : null}
        </>
      )}
      <BigButton
        label={editingId ? 'Save club' : 'Add to bag'}
        variant="secondary"
        disabled={!name.trim()}
        onPress={() => {
          const yards = editingPutter ? null : parseTypicalCarryYards(carry);
          if (editingId) {
            updateClub(db, editingId, name, shortName, yards);
          } else {
            addClub(db, name, shortName, yards);
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
              Alert.alert('Club has shots', 'It was turned off so your history stays intact.');
            }
            resetForm();
            bump();
          }}
        />
      ) : null}
      <BigButton
        label={COPY.restoreBag}
        variant="ghost"
        onPress={() => {
          restoreDefaultBag(db);
          bump();
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  lede: { color: colors.muted, fontSize: type.body, lineHeight: 22 },
  row: {
    minHeight: tapTarget,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.bgElevated,
    paddingHorizontal: 14,
    borderRadius: 14,
    gap: 8,
  },
  name: { color: colors.cream, fontSize: 18, fontWeight: '700' },
  short: { color: colors.muted, fontSize: type.meta },
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
