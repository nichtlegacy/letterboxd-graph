/**
 * Tests for the contribution graph generator
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { generateSvg, generateMultiYearSvg, ratingLevel } from '../src/generator.js';

function entry(dateString, rating = null) {
  return {
    date: new Date(`${dateString}T00:00:00Z`),
    title: `Film ${dateString}`,
    year: '2020',
    rating,
    rewatch: false,
    liked: false,
    url: `https://letterboxd.com/someone/film/${dateString}/`
  };
}

/** Fill colors of the day cells, in document order */
function cellColors(svg) {
  return [...svg.matchAll(/<rect class="cell[^"]*"[\s\S]{0,160}?fill="(#[0-9a-f]{6})"/g)].map(m => m[1]);
}

test('ratingLevel averages over rated films only', () => {
  // An unrated film used to count as a zero, which pulled a five star day down
  // to 2.5 and coloured it two steps too low.
  assert.equal(ratingLevel([{ rating: 5 }, { rating: null }]), 4);
  assert.equal(ratingLevel([{ rating: 5 }]), 4);
  assert.equal(ratingLevel([{ rating: 1 }, { rating: 5 }]), 2, 'a genuine average still counts');
});

test('ratingLevel maps each band to its step', () => {
  assert.equal(ratingLevel([{ rating: 0.5 }]), 1);
  assert.equal(ratingLevel([{ rating: 2 }]), 1);
  assert.equal(ratingLevel([{ rating: 2.5 }]), 2);
  assert.equal(ratingLevel([{ rating: 3 }]), 2);
  assert.equal(ratingLevel([{ rating: 3.5 }]), 3);
  assert.equal(ratingLevel([{ rating: 4 }]), 3);
  assert.equal(ratingLevel([{ rating: 4.5 }]), 4);
  assert.equal(ratingLevel([{ rating: 5 }]), 4);
});

test('ratingLevel puts an unrated day on the lowest active step', () => {
  assert.equal(ratingLevel([{ rating: null }, { rating: null }]), 1);
  assert.equal(ratingLevel([{ rating: 0 }]), 1);
});

test('count mode scales colour with the busiest day', async () => {
  const entries = [
    entry('2025-01-01'),
    entry('2025-02-01'), entry('2025-02-01'),
    entry('2025-03-01'), entry('2025-03-01'), entry('2025-03-01'), entry('2025-03-01')
  ];
  const svg = await generateSvg(entries, { year: 2025, username: 'someone', mode: 'count', theme: 'dark' });
  const used = new Set(cellColors(svg));

  // Four films is the busiest day, so one film lands on the first step and four
  // on the last.
  assert.ok(used.has('#161b22'), 'empty days');
  assert.ok(used.has('#0e4429'), 'the quietest active day');
  assert.ok(used.has('#39d353'), 'the busiest day');
  assert.ok(svg.includes('>Less<') && svg.includes('>More<'), 'count legend');
});

test('rating mode colours by rating, not by how many films', async () => {
  const entries = [
    entry('2025-01-01', 1),
    entry('2025-02-01', 5), entry('2025-02-01', 5), entry('2025-02-01', 5)
  ];
  const svg = await generateSvg(entries, { year: 2025, username: 'someone', mode: 'rating', theme: 'dark' });
  const used = cellColors(svg).filter(colour => colour !== '#161b22');

  // One badly rated film outranks nothing; three great ones sit at the top,
  // which is the opposite of what count mode would show.
  assert.ok(used.includes('#0e4429'), 'the 1 star day');
  assert.ok(used.includes('#39d353'), 'the 5 star day');
  assert.ok(svg.includes('>Low<') && svg.includes('>High<'), 'rating legend');
});

test('rating mode is unmoved by an unrated film sharing the day', async () => {
  const rated = await generateSvg([entry('2025-01-01', 5)], {
    year: 2025, username: 'someone', mode: 'rating', theme: 'dark'
  });
  const mixed = await generateSvg([entry('2025-01-01', 5), entry('2025-01-01', null)], {
    year: 2025, username: 'someone', mode: 'rating', theme: 'dark'
  });

  const topColour = (svg) => cellColors(svg).find(colour => colour !== '#161b22');
  assert.equal(topColour(mixed), topColour(rated));
  assert.equal(topColour(rated), '#39d353');
});

test('the two modes disagree where they should', async () => {
  // A single 5 star film against four 1 star films: quietest day, best rating.
  const entries = [
    entry('2025-01-01', 5),
    entry('2025-02-01', 1), entry('2025-02-01', 1), entry('2025-02-01', 1), entry('2025-02-01', 1)
  ];
  const options = { year: 2025, username: 'someone', theme: 'dark' };
  const count = cellColors(await generateSvg(entries, { ...options, mode: 'count' }));
  const rating = cellColors(await generateSvg(entries, { ...options, mode: 'rating' }));

  const active = (colours) => colours.filter(colour => colour !== '#161b22');
  assert.deepEqual(active(count), ['#0e4429', '#39d353'], 'count: quiet day palest');
  assert.deepEqual(active(rating), ['#39d353', '#0e4429'], 'rating: the 5 star day is brightest');
});

test('the theme changes the ramp', async () => {
  const entries = [entry('2025-01-01', 5)];
  const dark = await generateSvg(entries, { year: 2025, username: 'someone', theme: 'dark' });
  const light = await generateSvg(entries, { year: 2025, username: 'someone', theme: 'light' });

  assert.ok(dark.includes('#39d353') && dark.includes('#0d1117'));
  assert.ok(light.includes('#216e39') && light.includes('#ffffff'));
});

test('the multi-year graph applies the same modes', async () => {
  const entries = [entry('2025-01-01', 5), entry('2024-01-01', 1)];
  const options = { years: [2025, 2024], username: 'someone', theme: 'dark' };

  const rating = await generateMultiYearSvg(entries, { ...options, mode: 'rating' });
  const active = cellColors(rating).filter(colour => colour !== '#161b22');

  assert.deepEqual(active, ['#39d353', '#0e4429'], '2025 rated 5, 2024 rated 1');
  assert.ok(rating.includes('>Low<') && rating.includes('>High<'));
});

test('an empty year still renders a full grid', async () => {
  const svg = await generateSvg([], { year: 2025, username: 'someone' });
  const colours = cellColors(svg);

  assert.equal(colours.length, 365, 'every day of 2025');
  assert.ok(colours.every(colour => colour === '#161b22'));
});
