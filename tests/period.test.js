import test from 'node:test';
import assert from 'node:assert/strict';

import { availableYears, resolvePeriod, periodPath } from '../site/period.js';

const byYear = {
  2024: { entries: 1 },
  2026: { entries: 2 },
  2025: { entries: 0 },
  nope: { entries: 4 }
};

test('availableYears returns non-empty numeric years newest first', () => {
  assert.deepEqual(availableYears(byYear), [2026, 2024]);
});

test('resolvePeriod distinguishes All Time, valid years and invalid queries', () => {
  assert.deepEqual(resolvePeriod('', byYear), { year: null, invalid: false });
  assert.deepEqual(resolvePeriod('?year=2024', byYear), { year: 2024, invalid: false });
  assert.deepEqual(resolvePeriod('?year=2025', byYear), { year: null, invalid: true });
  assert.deepEqual(resolvePeriod('?year=nope', byYear), { year: null, invalid: true });
});

test('periodPath changes only the year query parameter', () => {
  assert.equal(periodPath('https://example.test/stats/?theme=dark#ratings', 2024), '/stats/?theme=dark&year=2024#ratings');
  assert.equal(periodPath('https://example.test/stats/?theme=dark&year=2024#ratings', null), '/stats/?theme=dark#ratings');
});
