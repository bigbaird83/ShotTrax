import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bagCustomizeSeenValue, shouldPromptBagCustomize } from './bagCustomize';

test('bag customize prompt is once — skip or finish does not show again', () => {
  assert.equal(shouldPromptBagCustomize(null), true);
  assert.equal(shouldPromptBagCustomize(undefined), true);
  assert.equal(shouldPromptBagCustomize(''), true);
  assert.equal(shouldPromptBagCustomize(bagCustomizeSeenValue()), false);
  assert.equal(shouldPromptBagCustomize('1'), false);
});
