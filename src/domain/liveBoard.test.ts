import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
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
    code: 'AB12CD',
    url: 'shottrax:///s/AB12CD?h=4.3',
  });
  assert.equal(text, 'AB12CD\nshottrax:///s/AB12CD?h=4.3');
  assert.doesNotMatch(text, /®/);
  assert.doesNotMatch(text, /[?&]p=/);
  assert.doesNotMatch(text, /lat|lng|GPS|trail/i);

  const blocked = formatLiveBoardShare({
    code: 'AB12CD',
    url: 'shottrax:///s/AB12CD?p=abc',
  });
  assert.equal(blocked, 'AB12CD');
  assert.doesNotMatch(blocked, /[?&]p=/);

  const spectator = readFileSync(new URL('../../app/s/[token].tsx', import.meta.url), 'utf8');
  assert.match(spectator, /decodeScoreSnapshot/);
  assert.match(spectator, /COPY\.liveBoardPrivacy/);
  assert.doesNotMatch(spectator, /MapView|react-native-maps|getCurrentFix|expo-location/);
});

test('live-round share message is the code and join link only — no hole scores', () => {
  const holes = [
    { hole: 1, score: 4 },
    { hole: 2, score: 6 },
    { hole: 3, score: null },
    { hole: 9, score: 8 },
  ];
  const code = 'BK3MCQ';
  const url = 'shottrax:///s/BK3MCQ';
  const text = formatLiveBoardShare({
    courseName: 'Magnolia',
    code,
    url,
    holes,
  });

  assert.equal(text, `${code}\n${url}`);
  assert.equal(text.split('\n').length, 2);
  assert.doesNotMatch(text, /Magnolia/);
  assert.doesNotMatch(text, /Hole\s+\d+/i);
  assert.doesNotMatch(text, /Hole\s+\d+\s*[:·]/i);
  assert.doesNotMatch(text, /^\d+\s+\S+/m);
  assert.doesNotMatch(text, /1\s+4/);
  assert.doesNotMatch(text, /2\s+6/);
  assert.doesNotMatch(text, /9\s+8/);
  assert.doesNotMatch(text, /—/);
  assert.doesNotMatch(text, /·/);
  assert.doesNotMatch(text, /Scores only|live board/i);
  for (const row of holes) {
    if (row.score == null) continue;
    assert.equal(text.includes(String(row.score)), false);
  }
});

test('typed code, spaced code, and pasted link share one lookup key', () => {
  assert.equal(normalizeShareBoardCode('BK3MCQ'), 'BK3MCQ');
  assert.equal(normalizeShareBoardCode('  bk3mcq\n'), 'BK3MCQ');
  assert.equal(normalizeShareBoardCode('bk3 mcq'), 'BK3MCQ');
  assert.equal(normalizeShareBoardCode('BK3-MCQ'), 'BK3MCQ');
  assert.equal(normalizeShareBoardCode('shottrax:///s/BK3MCQ?h=4.4.1.4'), 'BK3MCQ');
  assert.equal(normalizeShareBoardCode('shottrax:///s/bk3mcq'), 'BK3MCQ');
  assert.equal(normalizeShareBoardCode('   '), null);
  assert.equal(normalizeShareBoardCode(null), null);
});
