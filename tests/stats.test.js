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
  buildJsonExport,
  filmKey,
  markRewatches
} from '../src/stats.js';

/**
 * Build a diary entry. Dates are UTC so the tests do not depend on the
 * machine's timezone.
 */
function entry(dateString, { title = 'Film', year = '2020', rating = null, rewatch = false, liked = false } = {}) {
  return {
    date: new Date(`${dateString}T00:00:00Z`),
    title,
    year,
    rating,
    rewatch,
    liked,
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

test('groupEntriesByDate: carries the rewatch and like flags through', () => {
  // The day tooltip renders from this map, so dropping the flags here silently
  // removes the markers from every film line.
  const grouped = groupEntriesByDate([
    entry('2025-06-01', { title: 'A', rewatch: true, liked: true }),
    entry('2025-06-01', { title: 'B' })
  ]);
  const [first, second] = grouped.get('2025-06-01');

  assert.equal(first.rewatch, true);
  assert.equal(first.liked, true);
  assert.equal(second.rewatch, false);
  assert.equal(second.liked, false);
});

test('groupEntriesByDate: missing flags normalise to false', () => {
  const grouped = groupEntriesByDate([
    { date: new Date('2025-06-01T00:00:00Z'), title: 'Legacy', year: '2020', rating: 4 }
  ]);
  const [only] = grouped.get('2025-06-01');

  assert.equal(only.rewatch, false);
  assert.equal(only.liked, false);
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
  assert.equal(result.stats.rewatches, 0);
  assert.equal(result.stats.liked, 0);
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

test('buildJsonExport: counts rewatches and likes', () => {
  const result = buildJsonExport(
    [
      entry('2025-02-01', { title: 'A', rewatch: true, liked: true }),
      entry('2025-02-02', { title: 'B', rewatch: true }),
      entry('2025-02-03', { title: 'C' })
    ],
    { username: 'someone', year: 2025, years: [2025] }
  );

  assert.equal(result.stats.rewatches, 2);
  assert.equal(result.stats.liked, 1);
  assert.deepEqual(
    result.cells[0].films[0],
    {
      title: 'A',
      year: '2020',
      rating: null,
      rewatch: true,
      liked: true,
      url: 'https://letterboxd.com/film/a/'
    }
  );
  assert.equal(result.recent[0].rewatch, false);
});

test('buildJsonExport: no entries still yields a usable payload', () => {
  const result = buildJsonExport([], { username: 'someone', year: 2025, years: [2025] });

  assert.equal(result.stats.films, 0);
  assert.equal(result.stats.daysActive, 0);
  assert.equal(result.stats.streak, 0);
  assert.equal(result.stats.streakFilms, 0);
  assert.equal(result.stats.rewatches, 0);
  assert.equal(result.stats.liked, 0);
  assert.deepEqual(result.cells, []);
  assert.deepEqual(result.recent, []);
});

test('filmKey identifies a film by its slug, not its title', () => {
  // Two different 2023 films are both called "Leo", so neither the title nor
  // the title and year together separate them.
  const a = { title: 'Leo', year: '2023', url: 'https://letterboxd.com/u/film/leo/' };
  const b = { title: 'Leo', year: '2023', url: 'https://letterboxd.com/u/film/leo-2023/' };

  assert.notEqual(filmKey(a), filmKey(b));
  assert.equal(filmKey(a), filmKey({ ...a, url: 'https://letterboxd.com/u/film/leo/2/' }),
    'a rewatch link points at the same film');
});

test('filmKey falls back to title and year without a URL', () => {
  assert.equal(filmKey({ title: 'Heat', year: '1995' }), 'title:Heat|1995');
  assert.notEqual(filmKey({ title: 'Heat', year: '1995' }), filmKey({ title: 'Heat', year: '2022' }));
});

test('markRewatches keeps every flag Letterboxd already set', () => {
  // A film first seen before the diary begins has one entry in it, and only the
  // flag knows that entry was a rewatch.
  const marked = markRewatches([
    { date: new Date('2025-01-01T00:00:00Z'), title: 'Heat', rewatch: true, url: 'https://letterboxd.com/u/film/heat/' }
  ]);

  assert.equal(marked[0].rewatch, true);
});

test('markRewatches derives the flag from a repeat viewing', () => {
  const entry = (date, slug, rewatch = false) => ({
    date: new Date(`${date}T00:00:00Z`),
    title: slug,
    rewatch,
    url: `https://letterboxd.com/u/film/${slug}/`
  });
  const marked = markRewatches([entry('2025-06-01', 'heat'), entry('2025-01-01', 'heat')]);

  assert.equal(marked[0].rewatch, false, 'the earliest viewing is the first watch');
  assert.equal(marked[1].rewatch, true, 'the later one is a rewatch even unticked');
});

test('markRewatches does not confuse two films sharing a title', () => {
  const marked = markRewatches([
    { date: new Date('2025-01-01T00:00:00Z'), title: 'Leo', url: 'https://letterboxd.com/u/film/leo/' },
    { date: new Date('2025-02-01T00:00:00Z'), title: 'Leo', url: 'https://letterboxd.com/u/film/leo-2023/' }
  ]);

  assert.ok(marked.every(entry => entry.rewatch === false));
});

test('markRewatches leaves the input untouched', () => {
  const original = [{ date: new Date('2025-01-01T00:00:00Z'), title: 'A', url: 'https://letterboxd.com/u/film/a/' }];
  markRewatches(original);

  assert.equal(original[0].rewatch, undefined);
});
