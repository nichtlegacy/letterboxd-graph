/**
 * Tests for the year-in-review card
 *
 * These assert on the generated markup rather than on pixels: the point is that
 * the right numbers and films end up on the card and that nothing overflows.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { generateReviewCard } from '../src/review.js';

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
  assert.ok(!svg.includes('Old'), 'entries from other years are excluded');
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

  assert.ok(textNodes(svg).includes('1999 · ★★★½'));
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
