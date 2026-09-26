import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { tabHref, tabSwipeClaims, tabSwipeTarget } from './tabSwipe';

test('swipe left goes to the next tab, swipe right to the previous', () => {
  assert.equal(tabSwipeTarget({ tab: 'index', dx: -90, dy: 5, vx: 0 }), 'favorites');
  assert.equal(tabSwipeTarget({ tab: 'favorites', dx: -90, dy: 5, vx: 0 }), 'bag');
  assert.equal(tabSwipeTarget({ tab: 'bag', dx: -90, dy: 5, vx: 0 }), 'averages');
  assert.equal(tabSwipeTarget({ tab: 'averages', dx: 90, dy: 5, vx: 0 }), 'bag');
  assert.equal(tabSwipeTarget({ tab: 'favorites', dx: 90, dy: 5, vx: 0 }), 'index');
});

test('tab swipe stops at the ends', () => {
  assert.equal(tabSwipeTarget({ tab: 'index', dx: 90, dy: 0, vx: 0 }), null);
  assert.equal(tabSwipeTarget({ tab: 'averages', dx: -90, dy: 0, vx: 0 }), null);
});

test('short or mostly vertical drags stay on the tab; a quick flick counts', () => {
  assert.equal(tabSwipeTarget({ tab: 'bag', dx: -40, dy: 0, vx: 0.1 }), null);
  assert.equal(tabSwipeTarget({ tab: 'bag', dx: -40, dy: 0, vx: -0.8 }), 'averages');
  assert.equal(tabSwipeTarget({ tab: 'bag', dx: -90, dy: 120, vx: 0 }), null);
  assert.equal(tabSwipeClaims({ dx: 20, dy: 3 }), true);
  assert.equal(tabSwipeClaims({ dx: 20, dy: 15 }), false);
  assert.equal(tabSwipeClaims({ dx: 8, dy: 0 }), false);
});

test('every home tab is wrapped in TabSwipe', () => {
  assert.equal(tabHref('index'), '/');
  for (const tab of ['index', 'favorites', 'bag', 'averages']) {
    const src = readFileSync(new URL(`../../app/(tabs)/${tab}.tsx`, import.meta.url), 'utf8');
    assert.match(src, new RegExp(`<TabSwipe tab="${tab}">`));
  }
});
