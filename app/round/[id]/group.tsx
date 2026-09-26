import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type AccessibilityActionEvent,
} from 'react-native';
import { useDb } from '@/src/db/DbProvider';
import {
  addGroupPlayer,
  loadGroup,
  recentPartnersForRound,
  removeGroupPlayer,
  removeRecentPlayer,
  setGroupGames,
  setPlayerHoleScore,
  updateGroupPlayer,
  type GroupSnapshot,
} from '@/src/db/groupRepo';
import { getRound } from '@/src/db/repo';
import {
  formatMatchLine,
  formatToPar,
  GROUP_MAX_PLAYERS,
  matchPair,
  parCoverage,
  parseGroupHandicap,
  planGroupGames,
  type GroupGameSettings,
} from '@/src/domain/groupGames';
import {
  describeGroupGame,
  describeGroupGameShort,
  type GroupGameId,
  type GroupRulesContext,
} from '@/src/domain/groupRules';
import { stepperClear, stepperShown, stepperStep, stepperToggle, type StepperAction } from '@/src/domain/groupStepper';
import { COPY } from '@/src/domain/playerCopy';
import { BigButton } from '@/src/ui/BigButton';
import { Screen } from '@/src/ui/Screen';
import { useColors } from '@/src/ui/ColorThemeProvider';
import { tapTarget, type ColorPalette } from '@/src/ui/theme';

/**
 * Group scoring for one round: your partners' scores hole by hole, a
 * leaderboard, and the side games you turn on. Your own score is the one
 * on your card — it is never typed here.
 */
export default function RoundGroupScreen() {
  const { id, hole: holeParam } = useLocalSearchParams<{ id: string; hole?: string }>();
  const { db, revision, bump } = useDb();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const round = useMemo(() => getRound(db, id), [db, id, revision]);
  const group = useMemo<GroupSnapshot | null>(() => (round ? loadGroup(db, round.id) : null), [db, round, revision]);
  const recent = useMemo(() => (round ? recentPartnersForRound(db, round.id) : []), [db, round, revision]);
  const [holeNumber, setHoleNumber] = useState(() => {
    const n = Number(holeParam);
    return Number.isInteger(n) && n >= 1 ? n : 1;
  });
  const [newName, setNewName] = useState('');
  const [newHcp, setNewHcp] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editHcp, setEditHcp] = useState('');
  const [note, setNote] = useState<string | null>(null);
  /** Unsaved stepper numbers, keyed `playerId:hole`. */
  const [drafts, setDrafts] = useState<Record<string, number>>({});
  const [rulesOpen, setRulesOpen] = useState<GroupGameId | null>(null);

  const result = useMemo(
    () => (group ? planGroupGames({ holes: group.holes, players: group.players, settings: group.settings }) : null),
    [group],
  );

  if (!round || !group || !result) {
    return (
      <Screen>
        <Text style={styles.muted}>Round not found.</Text>
      </Screen>
    );
  }

  const nameOf = (playerId: string) => group.players.find((p) => p.id === playerId)?.name ?? '—';
  const hole = group.holes.find((h) => h.number === holeNumber) ?? group.holes[0] ?? null;
  const partners = group.players.filter((p) => !p.isMe);
  const settings = group.settings;
  /** Press and hold Saved (or the VoiceOver action): confirm, then clear that score. */
  const confirmClear = (playerId: string, playerName: string, holeNo: number, saved: number | null) => {
    const action = stepperClear(saved);
    if (action.kind !== 'clear') return;
    Alert.alert(`${COPY.groupClearTitle} ${playerName} · Hole ${holeNo}`, COPY.groupClearBody, [
      { text: COPY.cancel, style: 'cancel' },
      { text: COPY.groupClearConfirm, style: 'destructive', onPress: () => applyStepper(playerId, holeNo, action) },
    ]);
  };
  const applyStepper = (playerId: string, holeNo: number, action: StepperAction) => {
    const key = `${playerId}:${holeNo}`;
    if (action.kind === 'none') return;
    if (action.kind === 'draft') {
      setDrafts((prev) => ({ ...prev, [key]: action.value }));
      return;
    }
    setPlayerHoleScore(db, playerId, holeNo, action.kind === 'save' ? action.value : null);
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    bump();
  };
  const pair = matchPair(group.players, settings);
  const rulesCtx: GroupRulesContext = {
    net: result.net,
    holeCount: group.holes.length,
    parCoverage: parCoverage(group.holes),
    playerCount: group.players.length,
    matchNames: pair ? [nameOf(pair[0]), nameOf(pair[1])] : null,
  };
  const rules = (gameId: GroupGameId) => describeGroupGame(gameId, settings, rulesCtx);
  const howLink = (gameId: GroupGameId) => (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: rulesOpen === gameId }}
        testID={`group-rules-${gameId}`}
        onPress={() => setRulesOpen((open) => (open === gameId ? null : gameId))}>
        <Text style={styles.link}>{rulesOpen === gameId ? COPY.groupHideRules : COPY.groupHowScored}</Text>
      </Pressable>
      {rulesOpen === gameId ? <Text style={styles.note}>{rules(gameId)}</Text> : null}
    </>
  );
  // Game switches: one line, with the full rules behind the same link as the results.
  const ruleLine = (gameId: GroupGameId) => (
    <>
      <Text style={styles.note}>{describeGroupGameShort(gameId, settings, rulesCtx)}</Text>
      {howLink(gameId)}
    </>
  );
  const netBlockedCopy =
    result.netBlockReason === 'handicap'
      ? COPY.groupNetNeedsHandicaps
      : result.netBlockReason === 'stroke_index'
        ? COPY.groupNetBlocked
        : null;
  const saveGames = (next: Partial<GroupGameSettings>) => {
    setGroupGames(db, round.id, { ...settings, ...next });
    bump();
  };

  const onAdd = () => {
    const outcome = addGroupPlayer(db, round.id, { name: newName, handicap: parseGroupHandicap(newHcp) });
    if (outcome.status === 'full') setNote(COPY.groupFull);
    else if (outcome.status === 'no_name') setNote(COPY.groupNeedsName);
    else {
      setNote(null);
      setNewName('');
      setNewHcp('');
      bump();
    }
  };

  const onAddRecent = (player: { name: string; handicap: number | null }) => {
    const outcome = addGroupPlayer(db, round.id, { name: player.name, handicap: player.handicap });
    if (outcome.status === 'full') setNote(COPY.groupFull);
    else if (outcome.status === 'no_name') setNote(COPY.groupNeedsName);
    else {
      setNote(null);
      setNewName('');
      setNewHcp('');
      bump();
    }
  };

  const confirmRemoveRecent = (player: { id: string; name: string }) => {
    Alert.alert(`${COPY.groupRemoveRecentTitle} ${player.name}`, COPY.groupRemoveRecentBody, [
      { text: COPY.cancel, style: 'cancel' },
      {
        text: COPY.groupRemoveRecent,
        style: 'destructive',
        onPress: () => {
          removeRecentPlayer(db, player.id);
          bump();
        },
      },
    ]);
  };

  const beginEdit = (playerId: string) => {
    const player = group.players.find((p) => p.id === playerId);
    if (!player) return;
    setEditId(player.id);
    setEditName(player.name);
    setEditHcp(player.handicap != null ? String(player.handicap) : '');
  };

  const saveEdit = () => {
    if (!editId) return;
    updateGroupPlayer(db, editId, { name: editName, handicap: parseGroupHandicap(editHcp) });
    setEditId(null);
    bump();
  };

  const pairIds = settings.matchPlayerIds ?? (group.players.length === 2 ? [group.players[0].id, group.players[1].id] : null);

  return (
    <Screen>
      <Text style={styles.title}>{round.courseName ?? 'Round'}</Text>
      <Text style={styles.muted}>{COPY.groupLede}</Text>
      {partners.length > 0 ? (
        <BigButton
          label={COPY.groupCard}
          variant="secondary"
          onPress={() => router.push(`/round/${round.id}/group-card`)}
        />
      ) : null}

      {partners.length > 0 && hole ? (
        <View style={styles.block} testID="group-score-entry">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.holeRow}>
            {group.holes.map((row) => {
              const on = row.number === hole.number;
              const done = partners.every((p) => p.scores[row.number] != null);
              return (
                <Pressable
                  key={row.number}
                  accessibilityRole="button"
                  accessibilityLabel={`Hole ${row.number}`}
                  accessibilityState={{ selected: on }}
                  testID={`group-hole-${row.number}`}
                  onPress={() => setHoleNumber(row.number)}
                  style={[styles.holeChip, done && styles.holeChipDone, on && styles.chipOn]}>
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>{row.number}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <Text style={styles.section}>
            Hole {hole.number}
            {hole.par != null ? ` · Par ${hole.par}` : ''}
          </Text>
          {group.players.map((player) => {
            const score = player.scores[hole.number] ?? null;
            if (player.isMe) {
              return (
                <View key={player.id} style={styles.row}>
                  <Text style={styles.label}>{player.name}</Text>
                  <Text style={styles.value}>{score ?? '—'}</Text>
                </View>
              );
            }
            const draft = drafts[`${player.id}:${hole.number}`];
            const shown = stepperShown(score, draft, hole.par);
            const saved = score != null;
            return (
              <View key={player.id} style={styles.stepper} testID={`group-stepper-${player.id}`}>
                <Text style={[styles.label, styles.stepperName]} numberOfLines={1}>
                  {player.name}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${player.name} ${COPY.groupScoreDown}`}
                  testID={`group-score-${player.id}-down`}
                  onPress={() => applyStepper(player.id, hole.number, stepperStep(score, draft, hole.par, -1))}
                  style={styles.stepButton}>
                  <Text style={styles.chipText}>−</Text>
                </Pressable>
                <Text
                  style={[styles.stepValue, !saved && styles.stepValueDraft]}
                  accessibilityLabel={`${player.name} ${shown}${saved ? '' : `, ${COPY.groupNotSaved}`}`}>
                  {shown}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${player.name} ${COPY.groupScoreUp}`}
                  testID={`group-score-${player.id}-up`}
                  onPress={() => applyStepper(player.id, hole.number, stepperStep(score, draft, hole.par, 1))}
                  style={styles.stepButton}>
                  <Text style={styles.chipText}>+</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={saved ? `${player.name} ${shown} ${COPY.groupSaved}` : `${COPY.groupSave} ${player.name} ${shown}`}
                  accessibilityHint={saved ? COPY.groupHoldToClear : undefined}
                  accessibilityState={{ selected: saved }}
                  accessibilityActions={saved ? [{ name: 'clear', label: COPY.groupClearConfirm }] : undefined}
                  onAccessibilityAction={(event: AccessibilityActionEvent) => {
                    if (event.nativeEvent.actionName === 'clear') confirmClear(player.id, player.name, hole.number, score);
                  }}
                  testID={`group-score-${player.id}-save`}
                  onPress={() => applyStepper(player.id, hole.number, stepperToggle(score, draft, hole.par))}
                  onLongPress={() => confirmClear(player.id, player.name, hole.number, score)}
                  style={[styles.saveButton, saved && styles.chipOn]}>
                  <Text style={[styles.saveText, saved && styles.chipTextOn]}>{saved ? COPY.groupSaved : COPY.groupSave}</Text>
                </Pressable>
              </View>
            );
          })}
          <Text style={styles.note}>{COPY.groupYourScoreNote}</Text>
        </View>
      ) : null}

      {partners.length > 0 ? (
        <View style={styles.block} testID="group-leaderboard">
          <Text style={styles.section}>{result.net ? COPY.groupLeaderboardNet : COPY.groupLeaderboard}</Text>
          {result.net ? (
            <Text style={styles.note}>
              {rulesCtx.parCoverage === 'none' ? COPY.groupNetTotalLabel : COPY.groupNetToParLabel}
            </Text>
          ) : null}
          {result.strokePlay.map((row) => (
            <View key={row.playerId} style={styles.row}>
              <Text style={styles.label}>
                {row.ranked ? `${row.place}. ` : ''}
                {row.name}
                {row.thru > 0 ? ` · thru ${row.thru}` : ''}
              </Text>
              <Text style={styles.value}>
                {row.thru === 0
                  ? '—'
                  : `${formatToPar(result.net ? row.netToPar : row.toPar)} · ${result.net ? row.net : row.gross}`}
              </Text>
            </View>
          ))}
          {netBlockedCopy ? <Text style={styles.warn}>{netBlockedCopy}</Text> : null}
          {howLink('strokePlay')}
        </View>
      ) : null}

      {result.skins ? (
        <View style={styles.block} testID="group-skins">
          <Text style={styles.section}>{COPY.groupSkins}</Text>
          {group.players.map((player) => (
            <View key={player.id} style={styles.row}>
              <Text style={styles.label}>{player.name}</Text>
              <Text style={styles.value}>{result.skins?.won[player.id] ?? 0}</Text>
            </View>
          ))}
          {result.skins.carrying > 0 ? (
            <Text style={styles.muted}>
              {result.skins.carrying} {result.skins.carrying === 1 ? 'skin' : 'skins'}{' '}
              {result.skins.holes.length === group.holes.length ? COPY.groupSkinsTiedAtEnd : COPY.groupSkinsCarrying}
            </Text>
          ) : null}
          {result.skins.waitingOn ? (
            <Text style={styles.warn} testID="group-skins-waiting">
              {COPY.groupSkinsWaitingPrefix} {result.skins.waitingOn.holeNumber}:{' '}
              {result.skins.waitingOn.playerIds.map(nameOf).join(', ')}. {COPY.groupSkinsWaitingSuffix}
            </Text>
          ) : null}
          {howLink('skins')}
        </View>
      ) : null}

      {result.stableford ? (
        <View style={styles.block} testID="group-stableford">
          <Text style={styles.section}>{COPY.groupStableford}</Text>
          {result.stableford.map((row) => (
            <View key={row.playerId} style={styles.row}>
              <Text style={styles.label}>{row.name}</Text>
              <Text style={styles.value}>{row.points} pts</Text>
            </View>
          ))}
          {howLink('stableford')}
        </View>
      ) : null}

      {result.match || result.nassau ? (
        <View style={styles.block} testID="group-match">
          {result.match ? (
            <>
              <Text style={styles.section}>{COPY.groupMatchPlay}</Text>
              <Text style={styles.value}>{formatMatchLine(result.match, nameOf)}</Text>
              {howLink('matchPlay')}
            </>
          ) : null}
          {result.nassau ? (
            <>
              <Text style={styles.section}>{COPY.groupNassau}</Text>
              <View style={styles.row}>
                <Text style={styles.label}>Front 9</Text>
                <Text style={styles.value}>{formatMatchLine(result.nassau.front, nameOf)}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>Back 9</Text>
                <Text style={styles.value}>{formatMatchLine(result.nassau.back, nameOf)}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>Overall</Text>
                <Text style={styles.value}>{formatMatchLine(result.nassau.overall, nameOf)}</Text>
              </View>
              {howLink('nassau')}
            </>
          ) : null}
        </View>
      ) : null}

      <View style={styles.block} testID="group-players">
        <Text style={styles.section}>{COPY.groupPlayers}</Text>
        {group.players.map((player) =>
          editId === player.id ? (
            <View key={player.id} style={styles.entry}>
              <TextInput
                value={editName}
                onChangeText={setEditName}
                placeholder={COPY.groupName}
                placeholderTextColor={colors.muted}
                style={styles.input}
              />
              <TextInput
                value={editHcp}
                onChangeText={setEditHcp}
                placeholder={COPY.groupHandicap}
                placeholderTextColor={colors.muted}
                keyboardType="number-pad"
                style={styles.input}
              />
              <View style={styles.buttons}>
                <BigButton label={COPY.cancel} variant="ghost" onPress={() => setEditId(null)} style={styles.flex} />
                <BigButton label={COPY.groupSave} onPress={saveEdit} style={styles.flex} />
              </View>
              {!player.isMe ? (
                <BigButton
                  label={COPY.groupRemove}
                  variant="danger"
                  onPress={() => {
                    removeGroupPlayer(db, player.id);
                    setEditId(null);
                    bump();
                  }}
                />
              ) : null}
            </View>
          ) : (
            <Pressable
              key={player.id}
              accessibilityRole="button"
              accessibilityLabel={`${COPY.groupEdit} ${player.name}`}
              onPress={() => beginEdit(player.id)}
              style={styles.row}>
              <Text style={styles.label}>{player.name}</Text>
              <Text style={styles.muted}>
                {player.handicap != null ? `${COPY.groupHcpShort} ${player.handicap}` : COPY.groupNoHcp} · {COPY.groupEdit}
              </Text>
            </Pressable>
          ),
        )}
        {group.players.length < GROUP_MAX_PLAYERS ? (
          <View style={styles.entry}>
            {recent.length > 0 ? (
              <View style={styles.recent} testID="group-recent">
                <Text style={styles.note}>{COPY.groupRecent}</Text>
                {recent.map((player) => {
                  const hcp = player.handicap != null ? `${COPY.groupHcpShort} ${player.handicap}` : null;
                  const label = hcp ? `${player.name}, ${hcp}` : player.name;
                  return (
                    <Pressable
                      key={player.id}
                      accessibilityRole="button"
                      accessibilityLabel={`${COPY.groupAddPlayer} ${label}`}
                      accessibilityHint={COPY.groupHoldToRemoveRecent}
                      accessibilityActions={[{ name: 'Remove from recent', label: COPY.groupRemoveRecent }]}
                      onAccessibilityAction={(event: AccessibilityActionEvent) => {
                        if (event.nativeEvent.actionName === 'Remove from recent') confirmRemoveRecent(player);
                      }}
                      testID={`group-recent-${player.id}`}
                      onPress={() => onAddRecent(player)}
                      onLongPress={() => confirmRemoveRecent(player)}
                      style={styles.recentRow}>
                      <Text style={styles.label} numberOfLines={1}>
                        {player.name}
                      </Text>
                      {hcp ? <Text style={styles.muted}>{hcp}</Text> : null}
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
            <TextInput
              value={newName}
              onChangeText={setNewName}
              placeholder={COPY.groupName}
              placeholderTextColor={colors.muted}
              style={styles.input}
              testID="group-new-name"
            />
            <TextInput
              value={newHcp}
              onChangeText={setNewHcp}
              placeholder={COPY.groupHandicapOptional}
              placeholderTextColor={colors.muted}
              keyboardType="number-pad"
              style={styles.input}
            />
            <BigButton label={COPY.groupAddPlayer} onPress={onAdd} />
          </View>
        ) : (
          <Text style={styles.muted}>{COPY.groupFull}</Text>
        )}
        {note ? <Text style={styles.warn}>{note}</Text> : null}
      </View>

      {partners.length > 0 ? (
        <View style={styles.block} testID="group-games">
          <Text style={styles.section}>{COPY.groupGames}</Text>
          <Toggle styles={styles} colors={colors} label={COPY.groupNet} value={settings.net} onChange={(net) => saveGames({ net })} />
          <Text style={styles.note}>
            {COPY.groupNetHow}
            {group.holes.length === 9 ? ` ${COPY.groupNetHalved}` : ''}
          </Text>
          {netBlockedCopy ? <Text style={styles.warn}>{netBlockedCopy}</Text> : null}
          <Text style={styles.label}>{COPY.groupStrokePlay}</Text>
          {ruleLine('strokePlay')}
          <Toggle styles={styles} colors={colors} label={COPY.groupSkins} value={settings.skins} onChange={(skins) => saveGames({ skins })} />
          {settings.skins ? (
            <Toggle
              styles={styles}
              colors={colors}
              label={COPY.groupSkinsCarry}
              value={settings.skinsCarry}
              onChange={(skinsCarry) => saveGames({ skinsCarry })}
            />
          ) : null}
          {ruleLine('skins')}
          <Toggle
            styles={styles}
            colors={colors}
            label={COPY.groupStableford}
            value={settings.stableford}
            onChange={(stableford) => saveGames({ stableford })}
          />
          {ruleLine('stableford')}
          <Toggle
            styles={styles}
            colors={colors}
            label={COPY.groupMatchPlay}
            value={settings.matchPlay}
            onChange={(matchPlay) => saveGames({ matchPlay })}
          />
          {ruleLine('matchPlay')}
          {round.holeCount === 18 ? (
            <Toggle
              styles={styles}
              colors={colors}
              label={COPY.groupNassau}
              value={settings.nassau}
              onChange={(nassau) => saveGames({ nassau })}
            />
          ) : null}
          {round.holeCount === 18 ? ruleLine('nassau') : null}
          {(settings.matchPlay || settings.nassau) && group.players.length > 2 ? (
            <>
              <Text style={styles.label}>{COPY.groupMatchPick}</Text>
              <View style={styles.chips}>
                {group.players.map((player) => {
                  const on = pairIds?.includes(player.id) ?? false;
                  return (
                    <Pressable
                      key={player.id}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      onPress={() => {
                        const current = (pairIds ?? []).filter((pid) => pid !== player.id);
                        const next = on ? current : [...current, player.id].slice(-2);
                        saveGames({ matchPlayerIds: next.length === 2 ? [next[0], next[1]] : null });
                      }}
                      style={[styles.nameChip, on && styles.chipOn]}>
                      <Text style={[styles.chipText, on && styles.chipTextOn]}>{player.name}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          ) : null}
        </View>
      ) : null}
    </Screen>
  );
}

function Toggle({
  styles,
  colors,
  label,
  value,
  onChange,
}: {
  styles: ReturnType<typeof makeStyles>;
  colors: ColorPalette;
  label: string;
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Switch
        accessibilityLabel={label}
        value={value}
        onValueChange={onChange}
        trackColor={{ true: colors.lime, false: colors.line }}
      />
    </View>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    title: { color: colors.cream, fontSize: 24, fontWeight: '900' },
    section: { color: colors.cream, fontSize: 18, fontWeight: '800' },
    muted: { color: colors.muted, fontSize: 15 },
    note: { color: colors.muted, fontSize: 13 },
    warn: { color: colors.orange, fontSize: 14, fontWeight: '700' },
    link: { color: colors.lime, fontSize: 14, fontWeight: '800', minHeight: 32, paddingVertical: 6 },
    block: { gap: 10, backgroundColor: colors.bgElevated, padding: 14, borderRadius: 16 },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, minHeight: 36 },
    entry: { gap: 8 },
    recent: { gap: 8 },
    recentRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 12,
      minHeight: tapTarget,
      paddingHorizontal: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.bg,
    },
    label: { color: colors.cream, fontSize: 16, fontWeight: '800', flexShrink: 1 },
    value: { color: colors.cream, fontSize: 18, fontWeight: '900' },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    holeRow: { gap: 8 },
    holeChip: {
      minWidth: tapTarget,
      minHeight: tapTarget,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.line,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.bg,
    },
    holeChipDone: { borderColor: colors.lime },
    stepper: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: tapTarget },
    stepperName: { flex: 1 },
    stepButton: {
      width: tapTarget,
      height: tapTarget,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.line,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.bg,
    },
    stepValue: { color: colors.cream, fontSize: 26, fontWeight: '900', minWidth: 36, textAlign: 'center' },
    stepValueDraft: { color: colors.muted },
    saveButton: {
      minWidth: 76,
      height: tapTarget,
      paddingHorizontal: 10,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.line,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.bg,
    },
    saveText: { color: colors.cream, fontSize: 15, fontWeight: '800' },
    nameChip: {
      minHeight: tapTarget,
      paddingHorizontal: 14,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.line,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.bg,
    },
    chipOn: { backgroundColor: colors.cream, borderColor: colors.cream },
    chipText: { color: colors.cream, fontSize: 18, fontWeight: '800' },
    chipTextOn: { color: colors.bg },
    input: {
      minHeight: 52,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 12,
      paddingHorizontal: 12,
      color: colors.cream,
      fontSize: 16,
      backgroundColor: colors.bg,
    },
    buttons: { flexDirection: 'row', gap: 8 },
    flex: { flex: 1 },
  });
}
