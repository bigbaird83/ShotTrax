import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { THUNDERBIRD_HEBER_CLUBHOUSE, THUNDERBIRD_HEBER_SPRINGS_AR_KEY } from '../course/hydrate';
import { COPY } from './playerCopy';
import {
  courseNeedsPinSheets,
  missCardInventsPins,
  planMissCardCopy,
  thunderbirdPinsAreBlocked,
} from './missCard';

test('Thunderbird Heber Springs is HARD-MISS need-pins — never invented coords', () => {
  assert.equal(missCardInventsPins(), false);
  assert.equal(thunderbirdPinsAreBlocked(), true);
  assert.equal(
    courseNeedsPinSheets({
      courseKey: THUNDERBIRD_HEBER_SPRINGS_AR_KEY,
      name: 'Thunderbird Country Club',
      city: 'Heber Springs',
      state: 'AR',
    }),
    true,
  );
  assert.equal(
    courseNeedsPinSheets({
      courseApiId: `local:${THUNDERBIRD_HEBER_SPRINGS_AR_KEY}`,
      name: 'Thunderbird Country Club',
      location: THUNDERBIRD_HEBER_CLUBHOUSE,
    }),
    true,
  );
  assert.equal(
    courseNeedsPinSheets({ name: 'Thunderbird Country Club', city: 'Rancho Mirage' }),
    false,
  );
  assert.equal(courseNeedsPinSheets({ name: 'Cypress Creek Golf Club', city: 'Cabot' }), false);

  const copy = planMissCardCopy({ needPins: true });
  assert.equal(copy.title, COPY.hardMissNeedPins);
  assert.equal(copy.detail, COPY.hardMissNeedPinsDetail);
  assert.doesNotMatch(`${copy.title} ${copy.detail}`, /lat|lng|GPS/i);
  assert.match(copy.title, /HARD-MISS/);
  assert.equal(planMissCardCopy({ needPins: false }).title, COPY.courseCardMissingFrame);

  const map = readFileSync(new URL('../ui/HoleMap.tsx', import.meta.url), 'utf8');
  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  const picker = readFileSync(new URL('../ui/CoursePicker.tsx', import.meta.url), 'utf8');
  assert.match(map, /COPY\.courseCardMissingFrame/);
  assert.match(map, /missCopy/);
  assert.match(hole, /planMissCardCopy/);
  assert.match(hole, /courseNeedsPinSheets/);
  assert.match(picker, /COPY\.hardMissNeedPins/);
  assert.doesNotMatch(hole, /inventGreen|unlabeled green|THUNDERBIRD_HEBER_CLUBHOUSE/);
});
