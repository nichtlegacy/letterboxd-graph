/**
 * Tests for the Pages build step
 *
 * The page is data-driven, so what matters is that the manifest describes the
 * generated files correctly: the right kind per filename, both themes paired,
 * the drawn size read out of the markup and the sections in reading order.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  classify, label, readDimensions, readChrome, buildAssets, slimData, allTimeFromCells,
  siteBase, describe, renderMeta, injectMeta, previewAsset, renderSitemap, renderRobots
} from '../scripts/build-site.mjs';

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

test('buildAssets orders the page: graph, newest year, the finished month, profile', () => {
  const assets = buildAssets(FILES, reader());

  assert.deepEqual(
    assets.map(asset => `${asset.kind}:${asset.slug}`),
    [
      'graph:github-letterboxd',
      'year:2026',
      'year:2025',
      // The month that is over leads: the one in progress is a few days of
      // figures beside it.
      'month:previous-month',
      'month:current-month',
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
    profileImage: 'data:image/png;base64,avatar',
    years: [2026, 2025],
    generatedAt: '2026-08-07T13:47:48.026Z',
    stats: { films: 456, daysActive: 322, streak: 34 },
    byYear: {
      2026: { scope: 'year', entries: 3 },
      2025: { scope: 'year', entries: 3 }
    },
    calendar: new Array(500).fill({ date: '2025-01-01', count: 0 }),
    cells: [
      { date: '2025-01-02', count: 2, films: [{ title: 'A' }, { title: 'B' }] },
      { date: '2025-01-03', count: 1, films: [{ title: 'C' }] },
      { date: '2026-02-16', count: 3, films: [{ title: 'D' }, { title: 'E' }, { title: 'F' }] }
    ],
    recent: new Array(20).fill({ date: '2026-07-30', title: 'Film' })
  });

  assert.equal(slim.user, 'nichtlegacy');
  assert.equal(slim.profileImage, 'data:image/png;base64,avatar');
  assert.equal(slim.calendar, undefined);
  assert.equal(slim.cells, undefined);
  assert.equal(slim.recent.length, 16);
  assert.deepEqual(slim.stats, { films: 456, daysActive: 322, streak: 34 });
  assert.deepEqual(slim.byYear, {
    2026: { scope: 'year', entries: 3 },
    2025: { scope: 'year', entries: 3 }
  });

  // The figures the page draws are aggregated here so it never has to load the
  // cells the totals came from.
  assert.deepEqual(slim.allTime.perYear, [
    { year: 2025, films: 3, days: 2 },
    { year: 2026, films: 3, days: 1 }
  ]);
});

test('slimData leaves old exports in All Time-only mode', () => {
  const slim = slimData({ user: 'someone', allTime: { entries: 10 }, recent: [] });
  assert.deepEqual(slim.byYear, {});
});

test('readChrome reads the radius and fill of the card background', () => {
  // The page clips its embed to this radius and paints this fill behind it, so
  // an <object> canvas cannot show through the rounded corners.
  const card = `<svg viewBox="0 0 1200 630"><defs><style>@font-face{}</style></defs>
    <rect width="100%" height="100%" rx="20" fill="#12161c"/></svg>`;

  assert.deepEqual(readChrome(card), { radius: 20, fill: '#12161c' });
});

test('readChrome copes with a card that has no rounded background', () => {
  assert.deepEqual(readChrome('<svg viewBox="0 0 10 10"><g/></svg>'), { radius: 0, fill: null });
});

test('buildAssets records the radius once and the fill per theme', () => {
  const svg = (fill) => `<svg viewBox="0 0 1200 630"><rect width="100%" height="100%" rx="20" fill="${fill}"/></svg>`;
  const assets = buildAssets(
    ['letterboxd-profile-dark.svg', 'letterboxd-profile-light.svg'],
    name => svg(name.includes('dark') ? '#12161c' : '#ffffff')
  );

  assert.equal(assets[0].radius, 20);
  assert.deepEqual(assets[0].background, { dark: '#12161c', light: '#ffffff' });
});

test('slimData keeps a generator-written all-time block as it is', () => {
  const slim = slimData({
    user: 'someone',
    allTime: { scope: 'all', entries: 3000, films: 3653 },
    cells: [{ date: '2025-01-01', count: 1, films: [{ title: 'A' }] }],
    recent: []
  });

  assert.equal(slim.allTime.scope, 'all');
  assert.equal(slim.allTime.films, 3653, 'the whole diary wins over the graph years');
});

test('allTimeFromCells rebuilds the block for an export written before it existed', () => {
  const slim = slimData({
    user: 'someone',
    cells: [
      { date: '2025-01-01', count: 2, films: [{ title: 'A', rating: 4 }, { title: 'B', rating: 3 }] },
      { date: '2025-01-02', count: 1, films: [{ title: 'A', rating: 5 }] }
    ],
    recent: []
  });

  assert.equal(slim.allTime.scope, 'years', 'and says it only covers the graph years');
  assert.equal(slim.allTime.entries, 3);
  assert.equal(slim.allTime.distinctFilms, 2);
  assert.equal(slim.allTime.films, null, 'no profile figure in an export that old');
});

test('allTimeFromCells has nothing to rebuild from an empty export', () => {
  assert.equal(allTimeFromCells({ cells: [] }), null);
});

/* ── The head ─────────────────────────────────────────────────────────────── */

const SLIM = {
  user: 'someone',
  years: [2025, 2026],
  generatedAt: '2026-08-07T17:10:18.311Z',
  allTime: {
    scope: 'all',
    films: 626,
    entries: 599,
    daysActive: 427,
    rewatches: 83,
    averageRating: 3.3,
    streak: { length: 34 },
    firstEntry: '2024-02-22',
    lastEntry: '2026-07-30'
  }
};

const meta = (html, name) =>
  new RegExp(`<meta (?:name|property)="${name}" content="([^"]*)">`).exec(html)?.[1] ?? null;

test('siteBase prefers the URL the deployment reports', () => {
  assert.equal(siteBase({ SITE_URL: 'https://films.example/', GITHUB_REPOSITORY: 'o/r' }), 'https://films.example/');
});

test('siteBase gives the reported URL a trailing slash', () => {
  // Everything is appended to it, and configure-pages does not always end in one.
  assert.equal(siteBase({ SITE_URL: 'https://films.example' }), 'https://films.example/');
});

test('siteBase falls back to the address Pages gives a repository', () => {
  assert.equal(siteBase({ GITHUB_REPOSITORY: 'Someone/letterboxd-graph' }), 'https://someone.github.io/letterboxd-graph/');
});

test('siteBase serves a user page from the root', () => {
  // <owner>.github.io is not published under its own name.
  assert.equal(siteBase({ GITHUB_REPOSITORY: 'someone/someone.github.io' }), 'https://someone.github.io/');
});

test('describe names the user and the span the diary covers', () => {
  const text = describe(SLIM);

  assert.match(text.title, /^@someone's film diary/);
  assert.equal(text.ogTitle, "@someone's Letterboxd diary");
  assert.match(text.description, /626 films logged on Letterboxd by @someone, 2024–2026/);
  assert.ok(text.description.length <= 160, `description is ${text.description.length} characters, Google cuts at about 160`);
});

test('describe prefers the diary span over the years that were drawn', () => {
  // `years` is only what the graph covers; the diary started before that.
  assert.match(describe(SLIM).description, /2024–2026/);
});

test('describe leads the share card with the figures', () => {
  const text = describe(SLIM);

  assert.equal(
    text.ogDescription,
    '599 entries. 427 active days. 83 rewatches. One 34-day streak. A visual Letterboxd diary with yearly and monthly cards, ratings, milestones, and more.'
  );
  assert.ok(text.ogDescription.length <= 200, `card description is ${text.ogDescription.length} characters, X cuts at about 200`);
  assert.match(text.imageAlt, /Pages site/);
  assert.match(text.imageAlt, /626 films watched/);
});

test('describe falls back to the generic page when there is no export', () => {
  const text = describe(null);

  assert.equal(text.title, 'Letterboxd Graph');
  assert.doesNotMatch(text.description, /undefined|NaN/);
});

test('renderMeta writes absolute URLs, because a crawler resolves nothing', () => {
  const html = renderMeta({
    base: 'https://someone.github.io/letterboxd-graph/',
    data: SLIM,
    repository: 'someone/letterboxd-graph',
    image: 'og.png'
  });

  assert.match(html, /<link rel="canonical" href="https:\/\/someone\.github\.io\/letterboxd-graph\/">/);
  assert.equal(meta(html, 'theme-color'), '#00e054');
  assert.equal(meta(html, 'og:url'), 'https://someone.github.io/letterboxd-graph/');
  assert.match(meta(html, 'og:image'), /^https:\/\/someone\.github\.io\/letterboxd-graph\/og\.png/);
  assert.match(meta(html, 'twitter:image'), /^https:\/\//);
});

test('renderMeta moves the preview URL when the cards are redrawn', () => {
  // A platform caches a card by its URL, so a stable one shows last week's figures.
  const html = renderMeta({ base: 'https://x.test/', data: SLIM, repository: 'o/r', image: 'og.png' });

  assert.equal(meta(html, 'og:image'), 'https://x.test/og.png?v=20260807');
});

test('renderMeta asks for the large card when there is an image to fill it', () => {
  const withImage = renderMeta({ base: 'https://x.test/', data: SLIM, repository: 'o/r', image: 'og.png' });
  const without = renderMeta({ base: 'https://x.test/', data: SLIM, repository: 'o/r', image: null });

  assert.equal(meta(withImage, 'twitter:card'), 'summary_large_image');
  assert.equal(meta(without, 'twitter:card'), 'summary', 'a large card with no image is an empty box');
  assert.equal(meta(without, 'og:image'), null);
});

test('renderMeta states the preview size, so the card reserves the space', () => {
  const html = renderMeta({ base: 'https://x.test/', data: SLIM, repository: 'o/r', image: 'og.png' });

  assert.equal(meta(html, 'og:image:width'), '1200');
  assert.equal(meta(html, 'og:image:height'), '630');
  assert.equal(meta(html, 'og:image:type'), 'image/png');
});

test('renderMeta escapes what it puts in an attribute', () => {
  const html = renderMeta({
    base: 'https://x.test/',
    data: { ...SLIM, user: 'a"b<c' },
    repository: 'o/r',
    image: 'og.png'
  });

  assert.doesNotMatch(meta(html, 'og:title'), /"/);
  assert.match(html, /&quot;/);
});

test('renderMeta describes the page to a search engine as well as to a card', () => {
  const html = renderMeta({ base: 'https://x.test/', data: SLIM, repository: 'o/r', image: 'og.png' });
  const block = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html);

  const graph = JSON.parse(block[1])['@graph'];
  const types = graph.map(node => node['@type']);

  assert.deepEqual(types, ['WebSite', 'Person', 'ProfilePage', 'SoftwareSourceCode']);

  const page = graph.find(node => node['@type'] === 'ProfilePage');
  assert.equal(page.mainEntity['@id'], 'https://x.test/#person');
  assert.equal(page.dateModified, SLIM.generatedAt);
});

test('renderMeta leaves out the person when there is no diary to attribute', () => {
  const html = renderMeta({ base: 'https://x.test/', data: null, repository: 'o/r', image: null });
  const graph = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)[1])['@graph'];

  assert.deepEqual(graph.map(node => node['@type']), ['WebSite', 'SoftwareSourceCode']);
});

test('injectMeta replaces the marked region and nothing else', () => {
  const page = '<head>\n  <!-- meta:start -->\n  <title>Fallback</title>\n  <!-- meta:end -->\n  <link rel="icon">\n</head>';
  const out = injectMeta(page, '  <title>Built</title>');

  assert.match(out, /<title>Built<\/title>/);
  assert.doesNotMatch(out, /Fallback/);
  assert.match(out, /<link rel="icon">/);
  assert.match(out, /<!-- meta:start -->[\s\S]*<!-- meta:end -->/, 'the markers survive, so a rebuild can fill it again');
});

test('injectMeta fails loudly if the page lost its markers', () => {
  // Silently shipping the fallback tags would look like a working build.
  assert.throws(() => injectMeta('<head><title>x</title></head>', '<title>y</title>'), /meta:start/);
});

test('previewAsset shares the profile card', () => {
  const assets = buildAssets(FILES, () => svg(1200, 630));

  assert.equal(previewAsset(assets).kind, 'profile');
});

test('previewAsset falls back to the most recent year, then to anything', () => {
  const years = buildAssets(
    ['letterboxd-review-2025-dark.svg', 'letterboxd-review-2025-light.svg',
     'letterboxd-review-2026-dark.svg', 'letterboxd-review-2026-light.svg'],
    () => svg(1200, 630)
  );

  assert.equal(previewAsset(years).slug, '2026');
  assert.equal(previewAsset([]), null);
});

test('the sitemap carries the URL and the date it was last drawn', () => {
  const xml = renderSitemap('https://x.test/', '2026-08-07T17:10:18.311Z');

  assert.match(xml, /<loc>https:\/\/x\.test\/<\/loc>/);
  assert.match(xml, /<lastmod>2026-08-07<\/lastmod>/);
});

test('the sitemap leaves out a date it does not have', () => {
  assert.doesNotMatch(renderSitemap('https://x.test/', null), /lastmod/);
});

test('robots.txt points at the sitemap', () => {
  assert.match(renderRobots('https://x.test/'), /Sitemap: https:\/\/x\.test\/sitemap\.xml/);
});
