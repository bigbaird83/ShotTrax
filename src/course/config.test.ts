import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getGolfCoursesApiKey, isGolfCoursesApiConfigured } from './config';

test('API key comes from EXPO_PUBLIC_GOLF_COURSES_API_KEY and is not invented', () => {
  const previous = process.env.EXPO_PUBLIC_GOLF_COURSES_API_KEY;
  delete process.env.EXPO_PUBLIC_GOLF_COURSES_API_KEY;
  try {
    assert.equal(getGolfCoursesApiKey(), null);
    assert.equal(isGolfCoursesApiConfigured(), false);
    process.env.EXPO_PUBLIC_GOLF_COURSES_API_KEY = '  abc123  ';
    assert.equal(getGolfCoursesApiKey(), 'abc123');
    assert.equal(isGolfCoursesApiConfigured(), true);
  } finally {
    if (previous == null) delete process.env.EXPO_PUBLIC_GOLF_COURSES_API_KEY;
    else process.env.EXPO_PUBLIC_GOLF_COURSES_API_KEY = previous;
  }
});
