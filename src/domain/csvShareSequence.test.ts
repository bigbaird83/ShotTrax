import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import { COPY } from './playerCopy';
import {
  CSV_SHARE_CLOSE_DELAY_MS,
  CSV_SHARE_TIMEOUT_MS,
  shareCsvSheets,
  shareWithTimeout,
  waitForShareSheetToClose,
} from './csvShareSequence';

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

test('second csv sheet waits until the first share settles and the sheet has closed', async () => {
  const events: string[] = [];
  let releaseFirst: (ok: boolean) => void = () => {};
  const first = new Promise<boolean>((resolve) => {
    releaseFirst = resolve;
  });
  const openRounds = mock.fn(async () => {
    events.push('open-rounds');
    return first;
  });
  const openShots = mock.fn(async () => {
    events.push('open-shots');
    return true;
  });
  let releasePause: () => void = () => {};
  const pending = shareCsvSheets({
    sheets: [
      { title: COPY.exportCsvSheetRounds, open: openRounds },
      { title: COPY.exportCsvSheetShots, open: openShots },
    ],
    afterClose: () => {
      events.push('pause');
      return new Promise((resolve) => {
        releasePause = resolve;
      });
    },
    timeoutMs: 5_000,
  });

  await flush();
  assert.equal(openRounds.mock.calls.length, 1);
  assert.equal(openShots.mock.calls.length, 0);
  assert.deepEqual(events, ['open-rounds']);

  releaseFirst(true);
  await flush();
  assert.equal(openShots.mock.calls.length, 0);
  assert.deepEqual(events, ['open-rounds', 'pause']);

  releasePause();
  assert.equal(await pending, 'done');
  assert.deepEqual(events, ['open-rounds', 'pause', 'open-shots']);
  assert.equal(openShots.mock.calls.length, 1);
});

test('a share that never settles fails and does not open the next sheet', async () => {
  const openRounds = mock.fn(() => new Promise<boolean>(() => {}));
  const openShots = mock.fn(async () => true);
  let paused = false;
  const outcome = await shareCsvSheets({
    sheets: [
      { title: COPY.exportCsvSheetRounds, open: openRounds },
      { title: COPY.exportCsvSheetShots, open: openShots },
    ],
    afterClose: async () => {
      paused = true;
    },
    timeoutMs: 30,
  });
  assert.equal(outcome, 'failed');
  assert.equal(openRounds.mock.calls.length, 1);
  assert.equal(openShots.mock.calls.length, 0);
  assert.equal(paused, false);
});

test('a failed second sheet is partial after the first one succeeded', async () => {
  const events: string[] = [];
  const outcome = await shareCsvSheets({
    sheets: [
      {
        title: COPY.exportCsvSheetRounds,
        open: async () => {
          events.push('open-rounds');
          return true;
        },
      },
      {
        title: COPY.exportCsvSheetShots,
        open: async () => {
          events.push('open-shots');
          return false;
        },
      },
    ],
    afterClose: async () => {
      events.push('pause');
    },
    timeoutMs: 1_000,
  });
  assert.equal(outcome, 'partial');
  assert.deepEqual(events, ['open-rounds', 'pause', 'open-shots']);
});

test('a second sheet that never settles is partial and does not wait forever', async () => {
  const openShots = mock.fn(() => new Promise<boolean>(() => {}));
  const outcome = await shareCsvSheets({
    sheets: [
      { title: COPY.exportCsvSheetRounds, open: async () => true },
      { title: COPY.exportCsvSheetShots, open: openShots },
    ],
    afterClose: async () => {},
    timeoutMs: 30,
  });
  assert.equal(outcome, 'partial');
  assert.equal(openShots.mock.calls.length, 1);
});

test('leaving before the next sheet skips it', async () => {
  let cancelled = false;
  const openShots = mock.fn(async () => true);
  const outcome = await shareCsvSheets({
    sheets: [
      { title: COPY.exportCsvSheetRounds, open: async () => true },
      { title: COPY.exportCsvSheetShots, open: openShots },
    ],
    afterClose: async () => {
      cancelled = true;
    },
    timeoutMs: 1_000,
    isCancelled: () => cancelled,
  });
  assert.equal(outcome, 'partial');
  assert.equal(openShots.mock.calls.length, 0);
});

test('shareWithTimeout returns the sheet result and treats a rejection as failed', async () => {
  assert.equal(await shareWithTimeout(async () => true, 1_000), true);
  assert.equal(await shareWithTimeout(async () => false, 1_000), false);
  assert.equal(
    await shareWithTimeout(async () => {
      throw new Error('sheet');
    }, 1_000),
    false,
  );
});

test('a late share result after the timeout is ignored', async () => {
  let release: (ok: boolean) => void = () => {};
  const pending = shareWithTimeout(
    () =>
      new Promise<boolean>((resolve) => {
        release = resolve;
      }),
    20,
  );
  assert.equal(await pending, false);
  release(true);
});

test('close wait runs interactions, then a frame, then the delay', async () => {
  assert.ok(CSV_SHARE_CLOSE_DELAY_MS >= 400 && CSV_SHARE_CLOSE_DELAY_MS <= 600);
  assert.ok(CSV_SHARE_TIMEOUT_MS >= 120_000);
  const order: string[] = [];
  await waitForShareSheetToClose({
    runAfterInteractions: (task) => {
      order.push('interactions');
      task();
    },
    frame: (task) => {
      order.push('frame');
      task();
    },
    delayMs: CSV_SHARE_CLOSE_DELAY_MS,
    delay: async (ms) => {
      order.push(`delay:${ms}`);
    },
  });
  assert.deepEqual(order, ['interactions', 'frame', `delay:${CSV_SHARE_CLOSE_DELAY_MS}`]);
});
