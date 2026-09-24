import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { clubListPayload, clubListPushKey, parseClubList } from './watchMessages';
import { planLiveGpsToPin } from './yardsToGreen';
import {
  COMPLICATION_EMPTY,
  COMPLICATION_FAMILIES,
  COMPLICATION_KIND,
  COMPLICATION_UNAVAILABLE,
  WATCH_LIVE_YTG_CAPTION,
  WATCH_LIVE_YTG_MIN_MS,
  complicationFromClubList,
  complicationFromHoleMap,
  nextWatchLiveYtgSnapshot,
  watchLiveYardsLabel,
} from './watchComplication';

const listBase = {
  top3: ['club_7i'],
  bag: ['club_7i'],
  labels: { club_7i: '7i' },
};

test('complication shows the hole-map yards and nothing else', () => {
  const face = complicationFromHoleMap({
    holeNumber: 3,
    map: { yards: 164.4, quality: 'good' },
  });
  assert.equal(face.unavailable, false);
  assert.equal(face.yards, 164);
  assert.equal(face.quality, 'good');
  assert.equal(face.value, '164');
  assert.equal(face.inline, 'H3 · 164 yd');
  assert.equal(face.detail, null);

  const soft = complicationFromHoleMap({
    holeNumber: 7,
    map: { yards: 150, quality: 'soft' },
  });
  assert.equal(soft.yards, 150);
  assert.equal(soft.quality, 'soft');
  assert.equal(soft.inline, 'H7 · 150 yd');
});

test('complication shows Unavailable when the hole map has no trusted yards', () => {
  const missing = planLiveGpsToPin({ fix: null, green: null });
  assert.equal(missing.yards, null);
  assert.equal(missing.quality, 'none');
  const face = complicationFromHoleMap({ holeNumber: 4, map: missing });
  assert.equal(face.yards, null);
  assert.equal(face.unavailable, true);
  assert.equal(face.value, COMPLICATION_EMPTY);
  assert.equal(face.detail, COMPLICATION_UNAVAILABLE);
  assert.equal(face.inline, `H4 · ${COMPLICATION_EMPTY}`);
  assert.doesNotMatch(face.inline, /\d+ yd/);
  assert.doesNotMatch(face.value, /\d/);

  const untrusted = complicationFromHoleMap({
    holeNumber: 4,
    map: { yards: 90, quality: 'none' },
  });
  assert.equal(untrusted.yards, null);
  assert.equal(untrusted.value, COMPLICATION_EMPTY);
  assert.doesNotMatch(untrusted.inline, /90/);
  assert.doesNotMatch(JSON.stringify(untrusted), /90/);

  const zero = complicationFromHoleMap({
    holeNumber: 1,
    map: { yards: 0, quality: 'good' },
  });
  assert.equal(zero.yards, null);
  assert.equal(zero.unavailable, true);

  const forced = complicationFromHoleMap({
    holeNumber: 2,
    map: { yards: 140, quality: 'forced' },
  });
  assert.equal(forced.yards, null);
  assert.doesNotMatch(forced.inline, /140/);

  const missingGreen = planLiveGpsToPin({ fix: null, green: null });
  const missingFace = complicationFromHoleMap({ holeNumber: 8, map: missingGreen });
  assert.equal(missingGreen.quality, 'none');
  assert.equal(missingFace.yards, null);
  assert.equal(missingFace.detail, COMPLICATION_UNAVAILABLE);
  assert.equal(watchLiveYardsLabel(missingGreen).text, COMPLICATION_EMPTY);
  assert.equal(watchLiveYardsLabel(missingGreen).trusted, false);
  assert.equal(watchLiveYardsLabel({ yards: 90, quality: 'none' }).text, COMPLICATION_EMPTY);
  assert.equal(watchLiveYardsLabel({ yards: 142, quality: 'good' }).text, '142 yd');
  assert.equal(WATCH_LIVE_YTG_CAPTION, 'to hole');
  assert.doesNotMatch(watchLiveYardsLabel({ yards: 90, quality: 'none' }).text, /90/);
  assert.equal(watchLiveYardsLabel({ yards: 150, quality: 'soft' }).trusted, true);
});

test('complication does not invent Hole 1 when no hole is live', () => {
  const face = complicationFromHoleMap({
    holeNumber: null,
    map: { yards: null, quality: 'none' },
  });
  assert.equal(face.holeNumber, null);
  assert.equal(face.inline, COMPLICATION_EMPTY);
  assert.doesNotMatch(face.inline, /Hole|H\d/);

  const zeroHole = complicationFromHoleMap({
    holeNumber: 0,
    map: { yards: 164, quality: 'good' },
  });
  assert.equal(zeroHole.holeNumber, null);
  assert.equal(zeroHole.inline, '164 yd');
  assert.doesNotMatch(zeroHole.inline, /H1/);
  assert.doesNotMatch(zeroHole.inline, /H0/);
});

test('complication yards ride on clubList and do not replace club-rank yards', () => {
  const msg = clubListPayload({
    ...listBase,
    holeNumber: 5,
    yardsToGreen: 180,
    yardsQuality: 'good',
    complication: { yards: 164, quality: 'good' },
  });
  assert.equal(msg.yardsToGreen, 180);
  assert.equal(msg.complicationYards, 164);
  assert.equal(msg.complicationQuality, 'good');
  assert.deepEqual(parseClubList(JSON.parse(JSON.stringify(msg))), msg);

  const cleared = clubListPayload({
    ...listBase,
    holeNumber: 5,
    yardsToGreen: 180,
    yardsQuality: 'good',
    complication: { yards: 90, quality: 'none' },
  });
  assert.equal(cleared.yardsToGreen, 180);
  assert.equal(cleared.complicationYards, null);
  assert.equal(cleared.complicationQuality, 'none');
  assert.equal(parseClubList(cleared)?.complicationYards, null);
  assert.doesNotMatch(JSON.stringify(parseClubList(cleared)), /"complicationYards":90/);

  const sameRank = clubListPayload({
    ...listBase,
    holeNumber: 5,
    yardsToGreen: 180,
    yardsQuality: 'good',
    complication: { yards: 150, quality: 'soft' },
  });
  assert.notEqual(clubListPushKey(msg), clubListPushKey(sameRank));
  assert.equal(
    clubListPushKey(msg),
    clubListPushKey(
      clubListPayload({
        ...listBase,
        holeNumber: 5,
        yardsToGreen: 180,
        yardsQuality: 'good',
        complication: { yards: 164, quality: 'good' },
      }),
    ),
  );
});

test('complication uses the watch widget families and the phone hole-map number', () => {
  assert.deepEqual(COMPLICATION_FAMILIES, [
    'accessoryCircular',
    'accessoryCorner',
    'accessoryInline',
    'accessoryRectangular',
  ]);
  assert.equal(COMPLICATION_KIND, 'ShotTraxxHoleYards');

  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  const pick = readFileSync(new URL('../../app/round/[id]/club-pick.tsx', import.meta.url), 'utf8');
  const watchPush = hole.slice(hole.indexOf('useWatchClubList'), hole.indexOf('if (!round || !hole)'));
  assert.match(watchPush, /complication:\s*\{[^}]*liveGpsToPin\.yards/s);
  assert.match(watchPush, /quality: liveGpsToPin\.quality/);
  assert.doesNotMatch(watchPush, /yardsToGreen: liveToGreen\.yards/);
  assert.doesNotMatch(watchPush, /complication:[\s\S]*playHeaderYards/);
  assert.match(pick, /complication:\s*\{[^}]*liveGpsToPin\.yards/s);
  assert.match(pick, /planLiveGpsToPin\(/);
  assert.match(watchPush, /yardsToGreen: target\?\.dYards/);

  const watchUi = readFileSync(new URL('../../targets/watch/content.swift', import.meta.url), 'utf8');
  const clubPick = watchUi.slice(watchUi.indexOf('private var clubPick'), watchUi.indexOf('private var moreClubs'));
  assert.match(clubPick, /session\.list\.statusLine/);
  assert.match(clubPick, /session\.list\.liveYardsLabel/);
  assert.match(clubPick, /Text\("to hole"\)/);
  assert.match(clubPick, /size: 28/);
  assert.match(clubPick, /size: 11/);
  assert.ok(clubPick.indexOf('size: 28') < clubPick.indexOf('Text("to hole")'));
  assert.ok(clubPick.indexOf('Text("to hole")') < clubPick.indexOf('size: 11'));
  assert.ok(clubPick.indexOf('session.list.statusLine') < clubPick.indexOf('session.list.liveYardsLabel'));
  assert.ok(clubPick.indexOf('session.list.liveYardsLabel') < clubPick.indexOf('session.leave("back")'));
  assert.match(clubPick, /fixedSize\(horizontal: true, vertical: true\)/);

  const widget = readFileSync(new URL('../../targets/watch-widget/index.swift', import.meta.url), 'utf8');
  assert.match(widget, /kind: "ShotTraxxHoleYards"/);
  assert.match(widget, /complicationYards/);
  assert.match(widget, /complicationQuality/);
  assert.match(widget, /complicationHole/);
  assert.match(widget, /policy: \.never/);
  assert.match(widget, /"Unavailable"/);
  assert.match(widget, /\.accessoryCircular/);
  assert.match(widget, /\.accessoryCorner/);
  assert.match(widget, /\.accessoryInline/);
  assert.match(widget, /\.accessoryRectangular/);
  assert.doesNotMatch(widget, /CoreLocation|CLLocation|WCSession|WatchConnectivity/);
  assert.doesNotMatch(widget, /addingTimeInterval/);
  assert.doesNotMatch(widget, /Hole 1/);
  assert.doesNotMatch(widget, /yardsToGreen/);

  const session = readFileSync(new URL('../../targets/watch/WatchClubSession.swift', import.meta.url), 'utf8');
  assert.match(session, /reloadTimelines\(ofKind: "ShotTraxxHoleYards"\)/);
  assert.match(session, /complicationQuality/);
  assert.match(session, /forKey: "complicationYards"/);
  assert.doesNotMatch(
    session.slice(session.indexOf('private func persist'), session.indexOf('private func loadFromDefaults')),
    /CLLocation|requestLocation|startUpdatingLocation/,
  );
  assert.match(session, /var liveYardsLabel/);
  assert.match(session, /return "\\\(yards\) yd"/);
  assert.match(session, /return "—"/);
});

test('live yards wait between drift updates and clear immediately when untrusted', () => {
  const first = nextWatchLiveYtgSnapshot({
    previous: null,
    holeNumber: 4,
    live: { yards: 180, quality: 'good' },
    nowMs: 1_000,
  });
  assert.equal(first.commit, true);
  assert.equal(first.snapshot.yards, 180);

  const soon = nextWatchLiveYtgSnapshot({
    previous: first.snapshot,
    holeNumber: 4,
    live: { yards: 176, quality: 'good' },
    nowMs: 1_000 + WATCH_LIVE_YTG_MIN_MS - 1,
  });
  assert.equal(soon.commit, false);
  assert.equal(soon.snapshot.yards, 180);

  const later = nextWatchLiveYtgSnapshot({
    previous: first.snapshot,
    holeNumber: 4,
    live: { yards: 170, quality: 'good' },
    nowMs: 1_000 + WATCH_LIVE_YTG_MIN_MS,
  });
  assert.equal(later.commit, true);
  assert.equal(later.snapshot.yards, 170);

  const lost = nextWatchLiveYtgSnapshot({
    previous: first.snapshot,
    holeNumber: 4,
    live: { yards: 180, quality: 'none' },
    nowMs: 1_100,
  });
  assert.equal(lost.commit, true);
  assert.equal(lost.snapshot.yards, null);
  assert.equal(lost.snapshot.quality, 'none');
  assert.equal(watchLiveYardsLabel({ yards: lost.snapshot.yards, quality: lost.snapshot.quality }).text, '—');

  const holeChange = nextWatchLiveYtgSnapshot({
    previous: first.snapshot,
    holeNumber: 5,
    live: { yards: 400, quality: 'good' },
    nowMs: 1_100,
  });
  assert.equal(holeChange.commit, true);
  assert.equal(holeChange.snapshot.yards, 400);
  assert.equal(holeChange.snapshot.holeNumber, 5);
});

test('shared clubList payload: null yards + none quality → widget string uses —', () => {
  const msg = clubListPayload({
    ...listBase,
    holeNumber: 7,
    yardsToGreen: null,
    yardsQuality: 'none',
    complication: { yards: null, quality: 'none' },
  });
  const stored = parseClubList(JSON.parse(JSON.stringify(msg)));
  assert.ok(stored);
  const face = complicationFromClubList(stored);
  assert.equal(face.inline, `H7 · ${COMPLICATION_EMPTY}`);
  assert.equal(face.value, COMPLICATION_EMPTY);
  assert.equal(face.unavailable, true);

  const good = complicationFromClubList(
    clubListPayload({ ...listBase, holeNumber: 7, yardsToGreen: 142, yardsQuality: 'good', complication: { yards: 142, quality: 'good' } }),
  );
  assert.equal(good.inline, 'H7 · 142 yd');

  // Club-rank yards (tee / card number) never stand in for missing live yards or a missing green.
  const rankOnly = complicationFromClubList(
    clubListPayload({ ...listBase, holeNumber: 7, yardsToGreen: 410, yardsQuality: 'good' }),
  );
  assert.equal(rankOnly.inline, `H7 · ${COMPLICATION_EMPTY}`);
  assert.doesNotMatch(JSON.stringify(rankOnly), /410/);
  const noGreen = complicationFromClubList(
    clubListPayload({ ...listBase, holeNumber: 7, yardsToGreen: 410, yardsQuality: 'good', complication: planLiveGpsToPin({ fix: null, green: null }) }),
  );
  assert.equal(noGreen.inline, `H7 · ${COMPLICATION_EMPTY}`);

  const widget = readFileSync(new URL('../../targets/watch-widget/index.swift', import.meta.url), 'utf8');
  assert.match(widget, /inline = "H\\\(holeNumber\) · \\\(yards\) yd"/);
  assert.match(widget, /inline = "H\\\(holeNumber\) · —"/);
  assert.doesNotMatch(widget, /SOFT/);
  // Phone writes hole + yards + quality to its app group, and wakes the Watch when the face has the complication.
  const bridge = readFileSync(new URL('../../modules/watch-bridge/ios/WatchBridgeModule.swift', import.meta.url), 'utf8');
  assert.match(bridge, /forKey: "complicationHole"/);
  assert.match(bridge, /forKey: "complicationYards"/);
  assert.match(bridge, /forKey: "complicationQuality"/);
  assert.match(bridge, /transferCurrentComplicationUserInfo/);
  assert.match(bridge, /isComplicationEnabled/);
  const app = readFileSync(new URL('../../targets/watch/index.swift', import.meta.url), 'utf8');
  assert.match(app, /backgroundTask\(\.watchConnectivity\)/);
});
