import { useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput } from 'react-native';
import { useDb } from '@/src/db/DbProvider';
import { addClub, deleteClub, listClubs, restoreDefaultBag, updateClub } from '@/src/db/repo';
import { COPY } from '@/src/domain/playerCopy';
import { BagCarryList } from '@/src/ui/BagCarryList';
import { BigButton } from '@/src/ui/BigButton';
import { Screen } from '@/src/ui/Screen';
import { colors, type } from '@/src/ui/theme';

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
      <Text style={styles.lede}>{COPY.bagLede}</Text>
      <BagCarryList
        db={db}
        clubs={clubs}
        onChange={bump}
        onRename={(club) => {
          setEditingId(club.id);
          setName(club.name);
          setShortName(club.shortName);
        }}
      />
      <Text style={styles.addTitle}>{editingId ? 'Edit name' : 'Add club'}</Text>
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
      <BigButton
        label={editingId ? 'Save name' : 'Add to bag'}
        variant="secondary"
        disabled={!name.trim()}
        onPress={() => {
          if (editingId) {
            updateClub(db, editingId, name, shortName);
          } else {
            addClub(db, name, shortName, null);
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
          resetForm();
          bump();
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  lede: { color: colors.muted, fontSize: type.body, lineHeight: 22 },
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
