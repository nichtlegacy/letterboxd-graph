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
  buildOnThisDay,
  buildAllTimeStats,
  chooseMilestoneStep,
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
    { decade: 1990, label: '1990s', count: 2, averageRating: null },
    { decade: 2020, label: '2020s', count: 1, averageRating: null }
  ]);
});

test('calculateDecadeDistribution: averages rated entries and ignores unrated ones', () => {
  const decades = calculateDecadeDistribution([
    entry('2025-01-01', { year: '1999', rating: 4 }),
    entry('2025-01-02', { year: '1994', rating: 4.5 }),
    entry('2025-01-03', { year: '1990' })
  ]);

  assert.deepEqual(decades, [
    { decade: 1990, label: '1990s', count: 3, averageRating: 4.5 }
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
  assert.deepEqual(decades, [{ decade: 2000, label: '2000s', count: 1, averageRating: null }]);
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

test('buildOnThisDay: matches month and day across viewing years', () => {
  const result = buildOnThisDay([
    entry('2026-08-15', { title: 'Newest', rating: 4, liked: true }),
    entry('2025-08-15', { title: 'Older', rewatch: true }),
    entry('2025-08-16', { title: 'Different day' })
  ], '2026-08-15T01:23:00Z');

  assert.deepEqual(result.map(item => [item.date, item.title]), [
    ['2026-08-15', 'Newest'],
    ['2025-08-15', 'Older']
  ]);
  assert.equal(result[0].liked, true);
  assert.equal(result[1].rewatch, true);
  assert.equal(result[0].reviewed, false);
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
      url: 'https://letterboxd.com/film/a/',
      reviewed: false,
      reviewUrl: null,
      filmUid: null,
      lid: null,
      slug: null
    }
  );
  assert.equal(result.recent[0].rewatch, false);
});

test('buildJsonExport preserves review and stable film identifiers', () => {
  const film = entry('2025-02-01', { title: 'Heat' });
  Object.assign(film, {
    reviewed: true,
    reviewUrl: 'https://letterboxd.com/someone/film/heat/',
    filmUid: 'film:18003',
    lid: '2G9K',
    slug: 'heat-1995'
  });

  const result = buildJsonExport([film], {
    username: 'someone',
    year: 2025,
    years: [2025]
  });

  for (const exported of [result.cells[0].films[0], result.calendar.find(day => day.count).films[0], result.recent[0]]) {
    assert.equal(exported.reviewed, true);
    assert.equal(exported.reviewUrl, 'https://letterboxd.com/someone/film/heat/');
    assert.equal(exported.filmUid, 'film:18003');
    assert.equal(exported.lid, '2G9K');
    assert.equal(exported.slug, 'heat-1995');
  }
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

test('filmKey prefers stable identifiers before URL and title fallbacks', () => {
  const base = { title: 'Heat', year: '1995', url: 'https://letterboxd.com/film/wrong/' };

  assert.equal(filmKey({ ...base, filmUid: 'film:18003', slug: 'heat-1995' }), 'uid:film:18003');
  assert.equal(filmKey({ ...base, slug: 'heat-1995' }), 'slug:heat-1995');
  assert.equal(filmKey(base), 'film:wrong');
  assert.equal(filmKey({ title: 'Heat', year: '1995' }), 'title:Heat|1995');
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

test('buildAllTimeStats: nothing to aggregate', () => {
  assert.equal(buildAllTimeStats([]), null);
  assert.equal(buildAllTimeStats(null), null);
});

test('buildAllTimeStats counts entries, distinct films and the profile figure apart', () => {
  const all = buildAllTimeStats([
    entry('2024-01-01', { title: 'A', rating: 4, liked: true }),
    entry('2024-01-01', { title: 'B', rating: 3 }),
    entry('2024-03-05', { title: 'A', rating: 5, rewatch: true })
  ], { totalFilms: 600 });

  assert.equal(all.entries, 3, 'three viewings');
  assert.equal(all.distinctFilms, 2, 'of two films');
  assert.equal(all.films, 600, 'the profile figure is carried through untouched');
  assert.equal(all.daysActive, 2);
  assert.equal(all.multiFilmDays, 1);
  assert.equal(all.rewatches, 1);
  assert.equal(all.liked, 1);
  assert.equal(all.rated, 3);
  assert.equal(all.averageRating, 4);
  assert.equal(all.firstEntry, '2024-01-01');
  assert.equal(all.lastEntry, '2024-03-05');
});

test('buildAllTimeStats counts days with two or more films', () => {
  const all = buildAllTimeStats([
    entry('2024-01-01', { title: 'A' }),
    entry('2024-01-01', { title: 'B' }),
    entry('2024-01-02', { title: 'C' }),
    entry('2024-01-03', { title: 'D' }),
    entry('2024-01-03', { title: 'E' }),
    entry('2024-01-03', { title: 'F' })
  ]);

  assert.equal(all.multiFilmDays, 2);
});

test('buildAllTimeStats reports release, watch and review breakdowns', () => {
  const first = entry('2025-01-01', { title: 'New', year: '2025' });
  const older = entry('2025-01-02', { title: 'Old', year: '1995', rewatch: true });
  const future = entry('2025-01-03', { title: 'Festival', year: '2026' });
  const unknown = entry('2025-01-04', { title: 'Unknown', year: '' });
  Object.assign(first, { reviewed: true });

  const stats = buildAllTimeStats([first, older, future, unknown]);

  assert.deepEqual(stats.releaseBreakdown, { sameYear: 1, older: 1, other: 2 });
  assert.deepEqual(stats.watchBreakdown, { firstWatches: 3, rewatches: 1 });
  assert.deepEqual(stats.reviewBreakdown, { reviewed: 1, notReviewed: 3 });
});

test('buildAllTimeStats: the month series runs continuously, gaps included', () => {
  const all = buildAllTimeStats([
    entry('2024-01-10', { title: 'A' }),
    entry('2024-04-02', { title: 'B' }),
    entry('2024-04-20', { title: 'C' })
  ]);

  assert.deepEqual(all.monthSeries, [
    { month: '2024-01', count: 1 },
    { month: '2024-02', count: 0 },
    { month: '2024-03', count: 0 },
    { month: '2024-04', count: 2 }
  ]);
});

test('buildAllTimeStats: a year scope includes every Monday-to-Sunday week', () => {
  const all = buildAllTimeStats([
    entry('2025-01-01', { title: 'New year' }),
    entry('2025-02-03', { title: 'A' }),
    entry('2025-02-09', { title: 'B' }),
    entry('2025-12-31', { title: 'Year end' })
  ], { scope: 'year' });

  assert.equal(all.weekSeries.length, 53);
  assert.deepEqual(all.weekSeries[0], {
    week: 1,
    start: '2024-12-30',
    end: '2025-01-05',
    count: 1
  });
  assert.deepEqual(all.weekSeries[5], {
    week: 6,
    start: '2025-02-03',
    end: '2025-02-09',
    count: 2
  });
  assert.deepEqual(all.weekSeries.at(-1), {
    week: 53,
    start: '2025-12-29',
    end: '2026-01-04',
    count: 1
  });
});

test('buildAllTimeStats: weekday and month distributions', () => {
  // 2024-01-07 is a Sunday, 2024-01-08 a Monday.
  const all = buildAllTimeStats([
    entry('2024-01-07', { title: 'A' }),
    entry('2024-01-08', { title: 'B' }),
    entry('2024-06-09', { title: 'C' })
  ]);

  assert.equal(all.perWeekday[0], 2, 'both Sundays land on index 0');
  assert.equal(all.perWeekday[1], 1);
  assert.equal(all.perMonthOfYear[0], 2, 'January');
  assert.equal(all.perMonthOfYear[5], 1, 'June');
});

test('buildAllTimeStats: the longest gap is the quiet span between active days', () => {
  const all = buildAllTimeStats([
    entry('2024-01-01', { title: 'A' }),
    entry('2024-01-02', { title: 'B' }),
    entry('2024-02-01', { title: 'C' })
  ]);

  assert.equal(all.longestGap.days, 29, 'the days between 2 Jan and 1 Feb');
  assert.deepEqual([all.longestGap.from, all.longestGap.to], ['2024-01-02', '2024-02-01']);
});

const diaryOf = (length) => Array.from({ length }, (_, index) => {
  const date = new Date(Date.UTC(2024, 0, 1 + index));
  return entry(date.toISOString().split('T')[0], { title: `Film ${index + 1}` });
});

test('buildAllTimeStats: milestones mark the first, the round numbers and the latest', () => {
  const all = buildAllTimeStats(diaryOf(250));

  assert.deepEqual(all.milestones.map(m => m.n), [1, 50, 100, 150, 200, 250]);
  assert.equal(all.milestones[0].title, 'Film 1');
  assert.equal(all.milestones[1].title, 'Film 50');
  assert.equal(all.milestones.at(-1).title, 'Film 250', 'the latest entry closes the run');
});

test('buildAllTimeStats: each milestone says which of the three kinds it is', () => {
  const all = buildAllTimeStats(diaryOf(120));

  assert.equal(all.milestoneStep, 25);
  assert.deepEqual(all.milestones.map(m => [m.n, m.kind]), [
    [1, 'first'], [25, 'step'], [50, 'step'], [75, 'step'], [100, 'step'], [120, 'latest']
  ]);
});

test('buildAllTimeStats: a diary that ends on a round number needs no separate latest', () => {
  const all = buildAllTimeStats(diaryOf(100));

  assert.deepEqual(all.milestones.map(m => m.n), [1, 25, 50, 75, 100]);
  assert.equal(all.milestones.at(-1).kind, 'step', 'the round number outranks the endpoint');
});

test('buildAllTimeStats: a caller can still pin the step', () => {
  const all = buildAllTimeStats(diaryOf(120), { milestoneStep: 100 });

  assert.equal(all.milestoneStep, 100);
  assert.deepEqual(all.milestones.map(m => m.n), [1, 100, 120]);
});

test('buildAllTimeStats: a step of zero leaves only the two ends', () => {
  const all = buildAllTimeStats(diaryOf(120), { milestoneStep: 0 });

  assert.deepEqual(all.milestones.map(m => m.n), [1, 120]);
});

test('buildAllTimeStats: a diary shorter than one milestone still has both ends', () => {
  const all = buildAllTimeStats([
    entry('2024-01-01', { title: 'A' }),
    entry('2024-01-02', { title: 'B' })
  ]);

  assert.deepEqual(all.milestones.map(m => m.n), [1, 2]);
});

test('chooseMilestoneStep: the row keeps its length as the diary grows', () => {
  // The point of the ladder: a small diary and a huge one both come out around
  // five marks, so the section never turns into a wall of them.
  for (const total of [40, 143, 599, 1200, 5000, 12000, 40000]) {
    assert.ok(
      Math.floor(total / chooseMilestoneStep(total)) <= 5,
      `${total} entries produced more than five milestones`
    );
  }
});

test('chooseMilestoneStep: the step is the smallest one that fits', () => {
  assert.equal(chooseMilestoneStep(143), 25);
  assert.equal(chooseMilestoneStep(599), 100);
  assert.equal(chooseMilestoneStep(5000), 1000);
  assert.equal(chooseMilestoneStep(20), 25, 'a short diary gets no numbered marks at all');
});

test('buildAllTimeStats: most rewatched ranks repeat viewings only', () => {
  const all = buildAllTimeStats([
    entry('2024-01-01', { title: 'A' }),
    entry('2024-02-01', { title: 'A' }),
    entry('2024-03-01', { title: 'A' }),
    entry('2024-01-05', { title: 'B' }),
    entry('2024-02-05', { title: 'B' }),
    entry('2024-01-09', { title: 'C' })
  ]);

  assert.deepEqual(all.mostRewatched.map(film => [film.title, film.views]), [['A', 3], ['B', 2]]);
});

test('buildAllTimeStats: most rewatched carries the average rated viewing', () => {
  const all = buildAllTimeStats([
    entry('2024-01-01', { title: 'A', rating: 4 }),
    entry('2024-02-01', { title: 'A', rating: 5 }),
    entry('2024-03-01', { title: 'A' }),
    entry('2024-01-05', { title: 'B' }),
    entry('2024-02-05', { title: 'B' })
  ]);

  assert.deepEqual(
    all.mostRewatched.map(film => [film.title, film.averageRating]),
    [['A', 4.5], ['B', null]]
  );
});

test('buildAllTimeStats keeps all rewatched films for the UI limit', () => {
  const entries = Array.from({ length: 6 }, (_, index) => [
    entry(`2024-01-${String(index + 1).padStart(2, '0')}`, { title: `Film ${index}` }),
    entry(`2024-02-${String(index + 1).padStart(2, '0')}`, { title: `Film ${index}` })
  ]).flat();

  const all = buildAllTimeStats(entries);

  assert.equal(all.mostRewatched.length, 6);
});

test('buildAllTimeStats: rates per week and per month come off the span, not the calendar', () => {
  // Ten films across ten days: a heavy week, not a tenth of a year.
  const entries = Array.from({ length: 10 }, (_, index) =>
    entry(new Date(Date.UTC(2024, 0, 1 + index)).toISOString().split('T')[0], { title: `F${index}` }));

  const all = buildAllTimeStats(entries);

  assert.equal(all.spanDays, 10);
  assert.equal(all.perWeek, 7);
  assert.equal(all.perDay, 1);
});

test('buildJsonExport carries an all-time block covering more than the graph years', () => {
  const graphYears = [entry('2026-01-01', { title: 'New' })];
  const whole = [entry('2019-05-05', { title: 'Old' }), ...graphYears];

  const exported = buildJsonExport(graphYears, {
    username: 'someone',
    years: [2026],
    allEntries: whole,
    totalFilms: 42,
    profileImage: 'data:image/png;base64,avatar',
    scope: 'all'
  });

  assert.equal(exported.profileImage, 'data:image/png;base64,avatar');
  assert.equal(exported.stats.films, 1, 'the graph figures stay scoped to the years');
  assert.equal(exported.allTime.entries, 2, 'the all-time block sees the whole diary');
  assert.equal(exported.allTime.firstEntry, '2019-05-05');
  assert.equal(exported.allTime.films, 42);
  assert.equal(exported.allTime.scope, 'all');
});

test('buildJsonExport falls back to the exported entries when no diary was passed', () => {
  const exported = buildJsonExport([entry('2026-01-01', { title: 'Only' })], { username: 'someone' });

  assert.equal(exported.allTime.entries, 1);
  assert.equal(exported.allTime.films, null, 'no profile figure to report');
});

test('buildJsonExport prepares one aggregate per diary watch year', () => {
  const diary = markRewatches([
    entry('2024-12-31', { title: 'Heat', year: '1995' }),
    entry('2025-01-01', { title: 'Heat', year: '1995' }),
    entry('2025-02-01', { title: 'New Film', year: '2025' })
  ]);
  diary[2].reviewed = true;

  const result = buildJsonExport(diary.filter(item => item.date.getUTCFullYear() === 2025), {
    username: 'someone',
    years: [2025],
    allEntries: diary,
    scope: 'all'
  });

  assert.deepEqual(Object.keys(result.byYear).sort(), ['2024', '2025']);
  assert.equal(result.byYear['2024'].entries, 1);
  assert.equal(result.byYear['2025'].entries, 2);
  assert.deepEqual(result.byYear['2025'].watchBreakdown, { firstWatches: 1, rewatches: 1 });
  assert.deepEqual(result.byYear['2025'].reviewBreakdown, { reviewed: 1, notReviewed: 1 });
  assert.equal(result.byYear['2025'].films, null);
  assert.equal(result.byYear['2025'].scope, 'year');
});
