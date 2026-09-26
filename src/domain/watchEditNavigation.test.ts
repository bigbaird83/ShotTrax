import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { WATCH_CLUB_CHANGED } from './watchShotClubChange';
import { WATCH_SHOT_DELETED } from './watchShotUndo';
import { planWatchEditNavigation, watchEditNavigationStartsShotHold } from './watchEditNavigation';

test('Edit shot options return to the hole screen with the flash and do not start the hold', () => {
  assert.equal(watchEditNavigationStartsShotHold(), false);

  const picked = planWatchEditNavigation('changeClub', 'pickClub');
  assert.equal(picked.place, 'hole');
  assert.equal(picked.flash, 'Club changed ✓');
  assert.equal(picked.flash, WATCH_CLUB_CHANGED);
  assert.equal(picked.startsShotHold, false);

  const deleted = planWatchEditNavigation('edit', 'deleteShot');
  assert.equal(deleted.place, 'hole');
  assert.equal(deleted.flash, 'Shot deleted ✓');
  assert.equal(deleted.flash, WATCH_SHOT_DELETED);
  assert.equal(deleted.startsShotHold, false);

  const back = planWatchEditNavigation('edit', 'back');
  assert.equal(back.place, 'hole');
  assert.equal(back.flash, null);
  assert.equal(back.startsShotHold, false);

  // Opening the screens is not a hold either. Back from the club list lands on the hole.
  assert.equal(planWatchEditNavigation('hole', 'openEdit').place, 'edit');
  assert.equal(planWatchEditNavigation('hole', 'openEdit').startsShotHold, false);
  assert.equal(planWatchEditNavigation('edit', 'openChangeClub').place, 'changeClub');
  assert.equal(planWatchEditNavigation('changeClub', 'back').place, 'hole');
  assert.equal(planWatchEditNavigation('changeClub', 'back').startsShotHold, false);

  const session = readFileSync(new URL('../../targets/watch/WatchClubSession.swift', import.meta.url), 'utf8');
  const pick = session.slice(session.indexOf('func pickEditClub'), session.indexOf('func deleteEditedShot'));
  assert.match(pick, /changeShotClub\(clubId\)/);
  assert.match(pick, /closeEditScreens\(\)/);
  assert.doesNotMatch(pick, /beginShotHold|attachWatchFix/);
  const remove = session.slice(session.indexOf('func deleteEditedShot'), session.indexOf('func openPenaltyChoices'));
  assert.match(remove, /undoLastShot\(\)/);
  assert.match(remove, /closeEditScreens\(\)/);
  assert.doesNotMatch(remove, /beginShotHold|attachWatchFix/);
  const backFn = session.slice(session.indexOf('func backFromEditShot'), session.indexOf('func backFromChangeClub'));
  assert.match(backFn, /closeEditScreens\(\)/);
  assert.doesNotMatch(backFn, /beginShotHold|undoLastShot|changeShotClub|attachWatchFix/);
  const close = session.slice(session.indexOf('func closeEditScreens'), session.indexOf('func backFromEditShot'));
  assert.match(close, /editShotOpen = false/);
  assert.match(close, /changeClubOpen = false/);

  const ui = readFileSync(new URL('../../targets/watch/content.swift', import.meta.url), 'utf8');
  assert.match(ui, /session\.changeClubOpen/);
  assert.match(ui, /session\.editShotOpen/);
  assert.match(ui, /session\.pickEditClub\(clubId\)/);
  assert.match(ui, /session\.deleteEditedShot\(\)/);
  assert.match(ui, /session\.backFromEditShot\(\)/);
  const hole = ui.slice(ui.indexOf('private var clubPick'), ui.indexOf('private var editShotMenu'));
  assert.match(hole, /session\.feedback/);
  const edit = ui.slice(ui.indexOf('private var editShotMenu'), ui.indexOf('private var changeClubList'));
  const clubs = ui.slice(ui.indexOf('private var changeClubList'), ui.indexOf('private var allClubsList'));
  assert.doesNotMatch(edit, /beginShotHold|session\.feedback/);
  assert.doesNotMatch(clubs, /beginShotHold|session\.feedback/);
});
