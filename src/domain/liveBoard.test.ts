import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { COPY } from './playerCopy';
import {
  decodeScoreSnapshot,
  encodeScoreSnapshot,
  formatLiveBoardShare,
  liveBoardNeedsViewerLocation,
  liveBoardShowsGps,
  liveBoardShowsLatLon,
  liveBoardShowsMap,
  normalizeShareBoardCode,
  snapshotQueryIncludesPayload,
} from './liveBoard';

test('live board is scores + a code — no map, GPS, or spectator token', () => {
  assert.equal(liveBoardShowsMap(), false);
  assert.equal(liveBoardShowsGps(), false);
  assert.equal(liveBoardShowsLatLon(), false);
  assert.equal(liveBoardNeedsViewerLocation(), false);
  assert.equal(normalizeShareBoardCode(' ab12cd '), 'AB12CD');
  assert.equal(encodeScoreSnapshot([{ hole: 1, score: 4 }, { hole: 2, score: null }]), '4.');
  assert.deepEqual(decodeScoreSnapshot('4.3.'), [4, 3, null]);
  assert.equal(snapshotQueryIncludesPayload('4.3'), false);

  const text = formatLiveBoardShare({
    courseName: 'Magnolia',
    code: 'AB12CD',
    url: 'shottrax:///s/AB12CD?h=4.3',
    holes: [
      { hole: 1, score: 4 },
      { hole: 2, score: 3 },
      { hole: 3, score: null },
    ],
  });
  assert.match(text, /ShotTraxx live board/);
  assert.match(text, /Magnolia · 7/);
  assert.match(text, /Code AB12CD/);
  assert.match(text, /1  4/);
  assert.match(text, /shottrax:\/\/\/s\/AB12CD/);
  assert.match(text, /Scores only/);
  assert.doesNotMatch(text, /[?&]p=/);
  assert.doesNotMatch(text, /lat|lng|GPS|trail/i);

  const blocked = formatLiveBoardShare({
    courseName: 'Magnolia',
    code: 'AB12CD',
    url: 'shottrax:///s/AB12CD?p=abc',
    holes: [{ hole: 1, score: 4 }],
  });
  assert.doesNotMatch(blocked, /[?&]p=/);

  const spectator = readFileSync(new URL('../../app/s/[token].tsx', import.meta.url), 'utf8');
  assert.match(spectator, /decodeScoreSnapshot/);
  assert.match(spectator, /COPY\.liveBoardPrivacy/);
  assert.doesNotMatch(spectator, /MapView|react-native-maps|getCurrentFix|expo-location/);
});
