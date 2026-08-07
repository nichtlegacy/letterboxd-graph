/**
 * Tests for the year-in-review card
 *
 * These assert on the generated markup rather than on pixels: the point is that
 * the right numbers and films end up on the card and that nothing overflows.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { generateReviewCard, weeklyActivity } from '../src/review.js';

function entry(dateString, { title = 'Film', year = '2020', rating = null, rewatch = false, liked = false } = {}) {
  return { date: new Date(`${dateString}T00:00:00Z`), title, year, rating, rewatch, liked };
}

/**
 * Read the card's text content in document order. Matches on any text between
 * tags, since a value followed by a nested tspan (the average rating and its
 * star) is not directly followed by a closing tag.
 */
function textNodes(svg) {
  return [...svg.matchAll(/>([^<>]+)</g)].map(m => m[1].trim()).filter(Boolean);
}

test('card reports the figures for the requested year only', async () => {
  const svg = await generateReviewCard(
    [
      entry('2025-01-01', { title: 'A', rating: 4, rewatch: true }),
      entry('2025-01-02', { title: 'B', rating: 3, liked: true }),
      entry('2024-06-01', { title: 'Old', rating: 5 })
    ],
    { year: 2025, username: 'someone', displayName: 'Someone' }
  );
  const texts = textNodes(svg);

  assert.ok(texts.includes('2025'));
  assert.ok(texts.includes('2'), 'film count');
  assert.ok(texts.includes('3.5'), 'average rating');
  assert.ok(texts.includes('Rewatches'));
  assert.ok(!texts.includes('Old'), 'entries from other years are excluded');
});

test('card lists the highest rated films first', async () => {
  const svg = await generateReviewCard(
    [
      entry('2025-01-01', { title: 'Mediocre', rating: 2 }),
      entry('2025-01-02', { title: 'Great', rating: 5 }),
      entry('2025-01-03', { title: 'Good', rating: 4 })
    ],
    { year: 2025, username: 'someone' }
  );

  assert.ok(svg.indexOf('Great') < svg.indexOf('Good'));
  assert.ok(svg.indexOf('Good') < svg.indexOf('Mediocre'));
});

test('card shows a rewatched film once, at its best rating', async () => {
  const svg = await generateReviewCard(
    [
      entry('2025-01-01', { title: 'Heat', rating: 4 }),
      entry('2025-06-01', { title: 'Heat', rating: 5, rewatch: true }),
      entry('2025-02-01', { title: 'Other', rating: 4.5 })
    ],
    { year: 2025, username: 'someone' }
  );

  assert.equal(svg.split('Heat').length - 1, 1, 'listed once');
  assert.ok(svg.indexOf('Heat') < svg.indexOf('Other'), 'ranked by its 5 star rewatch');
});

test('card renders half stars the way Letterboxd does', async () => {
  const svg = await generateReviewCard(
    [entry('2025-01-01', { title: 'Half', rating: 3.5, year: '1999' })],
    { year: 2025, username: 'someone' }
  );
  const texts = textNodes(svg);

  assert.ok(texts.includes('★★★½'));
  assert.ok(texts.includes('1999'));
});

test('card embeds a poster when one was resolved, and a placeholder otherwise', async () => {
  const film = entry('2025-01-01', { title: 'Postered', rating: 5 });
  const withoutPoster = await generateReviewCard([film], { year: 2025, username: 'someone' });
  assert.ok(!withoutPoster.includes('<image href="data:image/jpeg'));

  const withPoster = await generateReviewCard([film], {
    year: 2025,
    username: 'someone',
    posters: new Map([[film.url, 'data:image/jpeg;base64,AAAA']])
  });
  assert.ok(withPoster.includes('data:image/jpeg;base64,AAAA'));
  assert.ok(withPoster.includes('clip-path="url(#posterClip0)"'));
});

test('card keeps the title clear of the rating column', async () => {
  // A five star rating is the widest the stars column gets, so the title has
  // the least room in exactly that case.
  const svg = await generateReviewCard(
    [entry('2025-01-01', { title: 'A Very Long Film Title That Would Otherwise Run Into The Stars', rating: 5 })],
    { year: 2025, username: 'someone' }
  );
  const title = textNodes(svg).find(text => text.startsWith('A Very Long'));

  assert.ok(title.endsWith('…'));
});

test('card truncates a long title instead of overflowing', async () => {
  const long = 'Dr. Strangelove or: How I Learned to Stop Worrying and Love the Bomb';
  const svg = await generateReviewCard(
    [entry('2025-01-01', { title: long, rating: 5 })],
    { year: 2025, username: 'someone' }
  );
  const rendered = textNodes(svg).find(text => text.startsWith('Dr. Strangelove'));

  assert.ok(rendered.endsWith('…'));
  assert.ok(rendered.length < long.length);
});

test('card handles a year with no entries', async () => {
  const svg = await generateReviewCard([], { year: 2025, username: 'someone' });
  const texts = textNodes(svg);

  assert.ok(texts.includes('No rated films this year'));
  assert.ok(texts.includes('–'), 'average rating falls back to a dash');
  assert.ok(svg.startsWith('<svg'));
});

test('card handles entries without ratings', async () => {
  const svg = await generateReviewCard(
    [entry('2025-01-01', { title: 'Unrated' })],
    { year: 2025, username: 'someone' }
  );

  assert.ok(textNodes(svg).includes('No rated films this year'));
  assert.ok(!svg.includes('Unrated'));
});

test('card is a fixed 1200x630 so it works as an Open Graph image', async () => {
  const svg = await generateReviewCard(
    [entry('2025-01-01', { title: 'A', rating: 4 })],
    { year: 2025, username: 'someone' }
  );

  assert.ok(svg.includes('width="1200"'));
  assert.ok(svg.includes('height="630"'));
  assert.ok(svg.includes('@font-face'), 'fonts are embedded');
});

test('card can render the year and the name plain instead of gradient', async () => {
  const film = entry('2025-01-01', { title: 'A', rating: 4 });
  const both = await generateReviewCard([film], { year: 2025, username: 'someone', displayName: 'Someone' });
  assert.equal(both.match(/url\(#reviewGradient\)/g).length, 2, 'name and year');

  const yearOnly = await generateReviewCard([film], {
    year: 2025, username: 'someone', displayName: 'Someone', usernameGradient: false
  });
  assert.equal(yearOnly.match(/url\(#reviewGradient\)/g).length, 1);

  const plain = await generateReviewCard([film], {
    year: 2025, username: 'someone', displayName: 'Someone', usernameGradient: false, yearGradient: false
  });
  assert.equal(plain.match(/url\(#reviewGradient\)/g), null);
});

test('card uses the Letterboxd green for ratings, not gold', async () => {
  const svg = await generateReviewCard(
    [entry('2025-01-01', { title: 'A', rating: 4 })],
    { year: 2025, username: 'someone' }
  );

  assert.ok(svg.includes('fill="#00e054" text-anchor="end"'), 'stars');
  assert.ok(!svg.includes('#f5c518'), 'no gold left over');
});

test('weeklyActivity buckets a whole year without losing entries', () => {
  const entries = [];
  for (let month = 0; month < 12; month++) {
    for (const day of [1, 15, 28]) {
      entries.push(entry(`2025-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`));
    }
  }
  const weeks = weeklyActivity(entries, 2025);

  assert.equal(weeks.length, 53, 'a year spans 53 aligned columns');
  assert.equal(weeks.reduce((sum, count) => sum + count, 0), entries.length, 'no entry falls outside');
});

test('weeklyActivity puts the year boundaries in the first and last week', () => {
  const weeks = weeklyActivity(
    [entry('2025-01-01'), entry('2025-12-31')],
    2025
  );

  assert.equal(weeks[0], 1);
  assert.equal(weeks[weeks.length - 1], 1);
});

test('weeklyActivity honours the week start', () => {
  // 1 Jan 2025 is a Wednesday, so a Monday-aligned year starts two days
  // earlier than a Sunday-aligned one, which shifts the boundary weeks.
  const sunday = weeklyActivity([entry('2025-01-01')], 2025, 'sunday');
  const monday = weeklyActivity([entry('2025-01-01')], 2025, 'monday');

  assert.equal(sunday[0], 1);
  assert.equal(monday[0], 1);
  assert.equal(sunday.reduce((a, b) => a + b, 0), 1);
  assert.equal(monday.reduce((a, b) => a + b, 0), 1);
});

test('weeklyActivity returns all zeroes for a year with no films', () => {
  const weeks = weeklyActivity([], 2025);

  assert.equal(weeks.length, 53);
  assert.ok(weeks.every(count => count === 0));
});

test('card draws one activity cell per week and reports the peak', async () => {
  const svg = await generateReviewCard(
    [
      entry('2025-03-01', { rating: 4 }),
      entry('2025-03-02', { rating: 4 }),
      entry('2025-03-03', { rating: 4 })
    ],
    { year: 2025, username: 'someone' }
  );
  const cells = svg.match(/<rect x="[\d.]+" y="554"/g) || [];

  assert.equal(cells.length, 53);
  assert.ok(textNodes(svg).includes('WEEKLY ACTIVITY'));
  assert.ok(textNodes(svg).some(text => text.startsWith('peak ')));
});

test('card marks a rewatched film in the top rated list', async () => {
  const svg = await generateReviewCard(
    [
      entry('2025-01-01', { title: 'Rewatched', year: '1999', rating: 5, rewatch: true }),
      entry('2025-01-02', { title: 'First time', year: '2001', rating: 4 })
    ],
    { year: 2025, username: 'someone' }
  );
  const texts = textNodes(svg);

  assert.ok(texts.some(text => text.startsWith('1999') && text.includes('↻')));
  assert.ok(texts.includes('2001'), 'a first watch carries no marker');
});
