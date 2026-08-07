/**
 * Tests for the pure statistics helpers in src/stats.js
 *
 * Run with `npm test` (or `node --test tests/`).
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateStreak,
  calculateDaysActive,
  calculateAverageRating,
  calculateDecadeDistribution,
  groupEntriesByDate,
  buildJsonExport
} from '../src/stats.js';

/**
 * Build a diary entry. Dates are UTC so the tests do not depend on the
 * machine's timezone.
 */
function entry(dateString, { title = 'Film', year = '2020', rating = null } = {}) {
  return {
    date: new Date(`${dateString}T00:00:00Z`),
    title,
    year,
    rating,
    url: `https://letterboxd.com/film/${title.toLowerCase()}/`
  };
}

test('calculateStreak: no entries', () => {
  assert.deepEqual(calculateStreak([]), { length: 0, startDate: null, endDate: null, films: 0 });
  assert.deepEqual(calculateStreak(null), { length: 0, startDate: null, endDate: null, films: 0 });
});

test('calculateStreak: single day', () => {
  const result = calculateStreak([entry('2025-03-04')]);
  assert.equal(result.length, 1);
  assert.equal(result.startDate, '2025-03-04');
  assert.equal(result.endDate, '2025-03-04');
  assert.equal(result.films, 1);
});

test('calculateStreak: picks the longest run, not the first', () => {
  const result = calculateStreak([
    entry('2025-01-01'), entry('2025-01-02'),
    entry('2025-02-10'), entry('2025-02-11'), entry('2025-02-12'), entry('2025-02-13')
  ]);
  assert.equal(result.length, 4);
  assert.equal(result.startDate, '2025-02-10');
  assert.equal(result.endDate, '2025-02-13');
});

test('calculateStreak: several films on one day count once for length', () => {
  const result = calculateStreak([
    entry('2025-05-01'), entry('2025-05-01'), entry('2025-05-01'),
    entry('2025-05-02')
  ]);
  assert.equal(result.length, 2);
  assert.equal(result.films, 4);
});

test('calculateStreak: a gap of one day breaks the run', () => {
  const result = calculateStreak([entry('2025-07-01'), entry('2025-07-03')]);
  assert.equal(result.length, 1);
});

test('calculateStreak: runs across a month boundary', () => {
  const result = calculateStreak([
    entry('2025-01-30'), entry('2025-01-31'), entry('2025-02-01'), entry('2025-02-02')
  ]);
  assert.equal(result.length, 4);
  assert.equal(result.startDate, '2025-01-30');
  assert.equal(result.endDate, '2025-02-02');
});

test('calculateStreak: runs across a year boundary', () => {
  const result = calculateStreak([
    entry('2024-12-30'), entry('2024-12-31'), entry('2025-01-01')
  ]);
  assert.equal(result.length, 3);
  assert.equal(result.startDate, '2024-12-30');
  assert.equal(result.endDate, '2025-01-01');
});

test('calculateStreak: leap day is a normal consecutive day', () => {
  const result = calculateStreak([
    entry('2024-02-28'), entry('2024-02-29'), entry('2024-03-01')
  ]);
  assert.equal(result.length, 3);
});

test('calculateStreak: unsorted input still finds the run', () => {
  const result = calculateStreak([
    entry('2025-04-03'), entry('2025-04-01'), entry('2025-04-02')
  ]);
  assert.equal(result.length, 3);
  assert.equal(result.startDate, '2025-04-01');
});

test('calculateDaysActive: counts unique days', () => {
  assert.equal(calculateDaysActive([]), 0);
  assert.equal(calculateDaysActive([entry('2025-01-01'), entry('2025-01-01')]), 1);
  assert.equal(calculateDaysActive([entry('2025-01-01'), entry('2025-01-02')]), 2);
});

test('calculateAverageRating: ignores unrated entries', () => {
  assert.equal(calculateAverageRating([]), null);
  assert.equal(calculateAverageRating([entry('2025-01-01')]), null);
  assert.equal(
    calculateAverageRating([
      entry('2025-01-01', { rating: 4 }),
      entry('2025-01-02', { rating: 3 }),
      entry('2025-01-03')
    ]),
    3.5
  );
});

test('calculateAverageRating: rounds to one decimal', () => {
  const average = calculateAverageRating([
    entry('2025-01-01', { rating: 4 }),
    entry('2025-01-02', { rating: 4 }),
    entry('2025-01-03', { rating: 3 })
  ]);
  assert.equal(average, 3.7);
});

test('calculateDecadeDistribution: groups and sorts ascending', () => {
  const decades = calculateDecadeDistribution([
    entry('2025-01-01', { year: '1999' }),
    entry('2025-01-02', { year: '1994' }),
    entry('2025-01-03', { year: '2020' })
  ]);
  assert.deepEqual(decades, [
    { decade: 1990, label: '1990s', count: 2 },
    { decade: 2020, label: '2020s', count: 1 }
  ]);
});

test('calculateDecadeDistribution: skips missing or implausible years', () => {
  const decades = calculateDecadeDistribution([
    entry('2025-01-01', { year: null }),
    entry('2025-01-02', { year: '' }),
    entry('2025-01-03', { year: 'unknown' }),
    entry('2025-01-04', { year: '1800' }),
    entry('2025-01-05', { year: '3200' }),
    entry('2025-01-06', { year: '2001' })
  ]);
  assert.deepEqual(decades, [{ decade: 2000, label: '2000s', count: 1 }]);
});

test('calculateDecadeDistribution: no usable years yields an empty list', () => {
  assert.deepEqual(calculateDecadeDistribution([]), []);
  assert.deepEqual(calculateDecadeDistribution([entry('2025-01-01', { year: null })]), []);
});

test('groupEntriesByDate: keys are ISO dates', () => {
  const grouped = groupEntriesByDate([
    entry('2025-06-01', { title: 'A' }),
    entry('2025-06-01', { title: 'B' }),
    entry('2025-06-02', { title: 'C' })
  ]);
  assert.equal(grouped.get('2025-06-01').length, 2);
  assert.equal(grouped.get('2025-06-02').length, 1);
});

test('buildJsonExport: reports stats over the entries it is given', () => {
  const result = buildJsonExport(
    [
      entry('2025-02-01', { title: 'A', rating: 4 }),
      entry('2025-02-02', { title: 'B', rating: 3 }),
      entry('2025-02-03', { title: 'C' })
    ],
    { username: 'someone', year: 2025, years: [2025], weekStart: 'sunday', recentLimit: 5 }
  );

  assert.equal(result.user, 'someone');
  assert.equal(result.stats.films, 3);
  assert.equal(result.stats.daysActive, 3);
  assert.equal(result.stats.streak, 3);
  assert.equal(result.stats.streakFilms, 3);
  assert.equal(result.cells.length, 3);
  assert.deepEqual(result.years, [2025]);
});

test('buildJsonExport: `year` labels the export, it does not filter entries', () => {
  // The CLI always passes exactly the entries for the years it fetched, so the
  // two agree in practice. This pins the behaviour down for anyone calling the
  // helper directly with a wider set of entries.
  const result = buildJsonExport(
    [entry('2025-02-01'), entry('2024-11-05')],
    { username: 'someone', year: 2025, years: [2025] }
  );

  assert.equal(result.year, 2025);
  assert.equal(result.stats.films, 2);
  assert.ok(result.cells.some(cell => cell.date.startsWith('2024')));
});

test('buildJsonExport: no entries still yields a usable payload', () => {
  const result = buildJsonExport([], { username: 'someone', year: 2025, years: [2025] });

  assert.equal(result.stats.films, 0);
  assert.equal(result.stats.daysActive, 0);
  assert.equal(result.stats.streak, 0);
  assert.equal(result.stats.streakFilms, 0);
  assert.deepEqual(result.cells, []);
  assert.deepEqual(result.recent, []);
});
