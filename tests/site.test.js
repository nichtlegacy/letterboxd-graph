/**
 * Tests for the Pages build step
 *
 * The page is data-driven, so what matters is that the manifest describes the
 * generated files correctly: the right kind per filename, both themes paired,
 * the drawn size read out of the markup and the sections in reading order.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { classify, label, readDimensions, buildAssets, slimData } from '../scripts/build-site.mjs';

const svg = (width, height) =>
  `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg"></svg>`;

const FILES = [
  'github-letterboxd-dark.svg',
  'github-letterboxd-light.svg',
  'letterboxd-review-2025-dark.svg',
  'letterboxd-review-2025-light.svg',
  'letterboxd-review-2026-dark.svg',
  'letterboxd-review-2026-light.svg',
  'letterboxd-review-current-month-dark.svg',
  'letterboxd-review-current-month-light.svg',
  'letterboxd-review-previous-month-dark.svg',
  'letterboxd-review-previous-month-light.svg',
  'letterboxd-profile-dark.svg',
  'letterboxd-profile-light.svg',
  'letterboxd-data.json'
];

const reader = (sizes = {}) => (name) => {
  const [width, height] = sizes[name] || [1200, 630];
  return svg(width, height);
};

test('classify names the kind, period and theme of a generated file', () => {
  assert.deepEqual(classify('letterboxd-profile-dark.svg'), {
    kind: 'profile', slug: 'profile', theme: 'dark'
  });

  assert.deepEqual(classify('letterboxd-review-2026-light.svg'), {
    kind: 'year', slug: '2026', theme: 'light'
  });

  assert.deepEqual(classify('letterboxd-review-current-month-dark.svg'), {
    kind: 'month', slug: 'current-month', theme: 'dark'
  });

  assert.deepEqual(classify('letterboxd-review-month-minus-3-dark.svg'), {
    kind: 'month', slug: 'month-minus-3', theme: 'dark'
  });
});

test('classify treats any other themed SVG as the graph, whatever it is named', () => {
  // The graph filename follows the action's `output` input, so it cannot be
  // matched by a fixed pattern.
  assert.deepEqual(classify('my-films-dark.svg'), {
    kind: 'graph', slug: 'my-films', theme: 'dark'
  });

  assert.equal(classify('letterboxd-data.json'), null);
  assert.equal(classify('github-letterboxd-dark.png'), null);
});

test('label says how recent a month card is rather than naming a month', () => {
  assert.equal(label({ kind: 'month', slug: 'current-month' }), 'This month');
  assert.equal(label({ kind: 'month', slug: 'previous-month' }), 'Last month');
  assert.equal(label({ kind: 'month', slug: 'month-minus-4' }), '4 months ago');
  assert.equal(label({ kind: 'year', slug: '2026' }), '2026');
  assert.equal(label({ kind: 'profile', slug: 'profile' }), 'Profile');
});

test('readDimensions prefers the viewBox over the width and height attributes', () => {
  assert.deepEqual(readDimensions(svg(1000, 475)), { width: 1000, height: 475 });

  assert.deepEqual(
    readDimensions('<svg width="500" height="200" viewBox="0 0 1000 400"></svg>'),
    { width: 1000, height: 400 }
  );

  assert.deepEqual(
    readDimensions('<svg width="640" height="480"></svg>'),
    { width: 640, height: 480 }
  );
});

test('buildAssets pairs the two themes of every card into one entry', () => {
  const assets = buildAssets(FILES, reader());

  assert.equal(assets.length, 6);
  for (const asset of assets) {
    assert.ok(asset.svg.dark, `${asset.slug} is missing its dark file`);
    assert.ok(asset.svg.light, `${asset.slug} is missing its light file`);
    assert.equal(asset.svg.dark.startsWith('images/'), true);
  }
});

test('buildAssets measures each card so the page can reserve its space', () => {
  const assets = buildAssets(FILES, reader({
    'github-letterboxd-dark.svg': [1000, 475],
    'github-letterboxd-light.svg': [1000, 475]
  }));

  const graph = assets.find(asset => asset.kind === 'graph');
  assert.deepEqual([graph.width, graph.height], [1000, 475]);

  const card = assets.find(asset => asset.kind === 'year');
  assert.deepEqual([card.width, card.height], [1200, 630]);
});

test('buildAssets orders the page: graph, newest year, most recent month, profile', () => {
  const assets = buildAssets(FILES, reader());

  assert.deepEqual(
    assets.map(asset => `${asset.kind}:${asset.slug}`),
    [
      'graph:github-letterboxd',
      'year:2026',
      'year:2025',
      'month:current-month',
      'month:previous-month',
      'profile:profile'
    ]
  );
});

test('buildAssets drops a card that only exists in one theme', () => {
  const assets = buildAssets(['letterboxd-profile-dark.svg'], reader());
  assert.deepEqual(assets, []);
});

test('buildAssets records a PNG next to a card only when it was exported', () => {
  const withPng = buildAssets(
    ['letterboxd-profile-dark.svg', 'letterboxd-profile-light.svg', 'letterboxd-profile-dark.png'],
    reader()
  );

  assert.equal(withPng[0].png.dark, 'images/letterboxd-profile-dark.png');
  assert.equal(withPng[0].png.light, undefined);
});

test('slimData keeps the figures and drops the calendar', () => {
  const slim = slimData({
    user: 'nichtlegacy',
    years: [2026, 2025],
    generatedAt: '2026-08-07T13:47:48.026Z',
    stats: { films: 456, daysActive: 322, streak: 34 },
    calendar: new Array(500).fill({ date: '2025-01-01', count: 0 }),
    cells: [
      { date: '2025-01-02', count: 2 },
      { date: '2025-01-03', count: 1 },
      { date: '2026-02-16', count: 3 }
    ],
    recent: new Array(20).fill({ date: '2026-07-30', title: 'Film' })
  });

  assert.equal(slim.user, 'nichtlegacy');
  assert.equal(slim.calendar, undefined);
  assert.equal(slim.cells, undefined);
  assert.equal(slim.recent.length, 10);
  assert.deepEqual(slim.stats, { films: 456, daysActive: 322, streak: 34 });

  // Per-year totals are derived here so the page never has to load the cells.
  assert.deepEqual(slim.perYear, [
    { year: 2026, films: 3, days: 1 },
    { year: 2025, films: 3, days: 2 }
  ]);
});
