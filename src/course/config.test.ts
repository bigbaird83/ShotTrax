import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getGolfCoursesApiKey, isGolfCoursesApiConfigured } from './config';

test('API key comes from EXPO_PUBLIC_GOLF_COURSES_API_KEY and is not invented', () => {
  const previousPublic = process.env.EXPO_PUBLIC_GOLF_COURSES_API_KEY;
  const previousSecret = process.env.GOLF_COURSES_API_KEY;
  delete process.env.EXPO_PUBLIC_GOLF_COURSES_API_KEY;
  delete process.env.GOLF_COURSES_API_KEY;
  try {
    assert.equal(getGolfCoursesApiKey(), null);
    assert.equal(isGolfCoursesApiConfigured(), false);
    process.env.EXPO_PUBLIC_GOLF_COURSES_API_KEY = '  abc123  ';
    assert.equal(getGolfCoursesApiKey(), 'abc123');
    assert.equal(isGolfCoursesApiConfigured(), true);
  } finally {
    if (previousPublic == null) delete process.env.EXPO_PUBLIC_GOLF_COURSES_API_KEY;
    else process.env.EXPO_PUBLIC_GOLF_COURSES_API_KEY = previousPublic;
    if (previousSecret == null) delete process.env.GOLF_COURSES_API_KEY;
    else process.env.GOLF_COURSES_API_KEY = previousSecret;
  }
});

test('GOLF_COURSES_API_KEY (EAS secret name) is read when public prefix is absent', () => {
  const previousPublic = process.env.EXPO_PUBLIC_GOLF_COURSES_API_KEY;
  const previousSecret = process.env.GOLF_COURSES_API_KEY;
  delete process.env.EXPO_PUBLIC_GOLF_COURSES_API_KEY;
  delete process.env.GOLF_COURSES_API_KEY;
  try {
    process.env.GOLF_COURSES_API_KEY = 'eas-secret';
    assert.equal(getGolfCoursesApiKey(), 'eas-secret');
  } finally {
    if (previousPublic == null) delete process.env.EXPO_PUBLIC_GOLF_COURSES_API_KEY;
    else process.env.EXPO_PUBLIC_GOLF_COURSES_API_KEY = previousPublic;
    if (previousSecret == null) delete process.env.GOLF_COURSES_API_KEY;
    else process.env.GOLF_COURSES_API_KEY = previousSecret;
  }
});
