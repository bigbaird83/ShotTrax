import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  planScorecardImageLines,
  renderScorecardPng,
  scorecardImageIncludesGps,
  scorecardImageIncludesSpectatorUrl,
  scorecardPngHasSignature,
} from './scorecardImage';
import { formatShareScorecard } from './spectator';

test('scorecard image is a readable PNG of the share text — no GPS, no spectator URL', () => {
  assert.equal(scorecardImageIncludesGps(), false);
  assert.equal(scorecardImageIncludesSpectatorUrl(), false);
  const holes = [
    { hole: 1, score: 4 },
    { hole: 2, score: 3 },
    { hole: 3, score: null },
  ];
  const lines = planScorecardImageLines({
    courseName: 'Magnolia',
    holes,
    lastClubYards: '7i · 155',
  });
  assert.deepEqual(
    lines,
    formatShareScorecard({ courseName: 'Magnolia', holes, lastClubYards: '7i · 155' }).split('\n'),
  );
  assert.equal(lines.join('\n').includes('?p='), false);
  assert.doesNotMatch(lines.join('\n'), /lat|lng|GPS|shottrax:\/\//i);

  const png = renderScorecardPng(lines);
  assert.equal(scorecardPngHasSignature(png), true);
  assert.ok(png.length > 200);
  const ascii = Buffer.from(png).toString('latin1');
  assert.doesNotMatch(ascii, /lat|lng|shottrax:\/\/|\?p=/i);
});
