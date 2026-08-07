/**
 * Tests for the `years` option
 *
 * The clock is injected everywhere: a test that reads the real year passes in
 * December and fails in January, which is exactly the bug `last N` exists to
 * prevent.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveYears } from '../src/years.js';

const at = (iso) => new Date(`${iso}T00:00:00Z`);

test('resolveYears: empty means the current year', () => {
  assert.deepEqual(resolveYears('', at('2026-08-07')), [2026]);
  assert.deepEqual(resolveYears(null, at('2026-08-07')), [2026]);
  assert.deepEqual(resolveYears(undefined, at('2026-08-07')), [2026]);
});

test('resolveYears: a list is taken as written, in the order given', () => {
  assert.deepEqual(resolveYears('2026,2025', at('2026-08-07')), [2026, 2025]);
  assert.deepEqual(resolveYears('2024, 2026', at('2026-08-07')), [2024, 2026]);
  assert.deepEqual(resolveYears('2025', at('2026-08-07')), [2025]);
});

test('resolveYears: a list drops duplicates', () => {
  assert.deepEqual(resolveYears('2026,2026,2025', at('2026-08-07')), [2026, 2025]);
});

test('resolveYears: "last N" counts back from the current year', () => {
  assert.deepEqual(resolveYears('last 2', at('2026-08-07')), [2026, 2025]);
  assert.deepEqual(resolveYears('last 1', at('2026-08-07')), [2026]);
  assert.deepEqual(resolveYears('last 4', at('2026-08-07')), [2026, 2025, 2024, 2023]);
});

test('resolveYears: "last N" is written however it comes', () => {
  for (const spec of ['last 2', 'last-2', 'last2', 'LAST 2', ' Last  2 ']) {
    assert.deepEqual(resolveYears(spec, at('2026-08-07')), [2026, 2025], spec);
  }
});

test('resolveYears: "last N" follows the calendar over the turn of the year', () => {
  // The whole point: the same setting, a day apart, covers different years.
  assert.deepEqual(resolveYears('last 2', at('2026-12-31')), [2026, 2025]);
  assert.deepEqual(resolveYears('last 2', at('2027-01-01')), [2027, 2026]);
});

test('resolveYears: the year is read in UTC, like the diary dates', () => {
  // 22:00 UTC on New Year's Eve is already next year in Auckland and still last
  // year in Los Angeles. The diary is UTC, so the graph is too.
  assert.deepEqual(resolveYears('last 1', new Date('2026-12-31T22:00:00Z')), [2026]);
  assert.deepEqual(resolveYears('last 1', new Date('2027-01-01T02:00:00Z')), [2027]);
});

test('resolveYears: nonsense falls back to the current year rather than failing', () => {
  assert.deepEqual(resolveYears('recent', at('2026-08-07')), [2026]);
  assert.deepEqual(resolveYears('last', at('2026-08-07')), [2026]);
  assert.deepEqual(resolveYears('last 0', at('2026-08-07')), [2026], 'zero years is no graph at all');
});
