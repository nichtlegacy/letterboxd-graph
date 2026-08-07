/**
 * Tests for the year-in-review card
 *
 * These assert on the generated markup rather than on pixels: the point is that
 * the right numbers and films end up on the card and that nothing overflows.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  generateReviewCard,
  generateProfileCard,
  pickTopFilms,
  aggregateFilms,
  entriesForPeriod,
  periodLabels,
  periodSlug
} from '../src/cards.js';

function entry(dateString, { title = 'Film', year = '2020', rating = null, rewatch = false, liked = false } = {}) {
  return {
    date: new Date(`${dateString}T00:00:00Z`),
    title,
    year,
    rating,
    rewatch,
    liked,
    url: `https://letterboxd.com/someone/film/${title.toLowerCase().replace(/\s+/g, '-')}/`
  };
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

  assert.ok(texts.includes('Nothing logged this year'));
  assert.ok(texts.includes('–'), 'average rating falls back to a dash');
  assert.ok(svg.startsWith('<svg'));
});

test('card handles entries without ratings', async () => {
  const svg = await generateReviewCard(
    [entry('2025-01-01', { title: 'Unrated' })],
    { year: 2025, username: 'someone' }
  );

  assert.ok(textNodes(svg).includes('Nothing logged this year'));
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







test('the stat grid ends level with the last film row', async () => {
  const svg = await generateReviewCard(
    ['A', 'B', 'C', 'D', 'E'].map((title, i) => entry(`2025-01-0${i + 1}`, { title, rating: 5 - i * 0.5 })),
    { year: 2025, username: 'someone' }
  );

  // Read the panels straight out of the markup rather than hard coding the
  // layout, so the assertion survives a change of padding or column widths.
  const panels = [...svg.matchAll(/<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)" rx="14"/g)]
    .map(([, x, y, width, height]) => ({
      x: Number(x),
      bottom: Number(y) + Number(height),
      width: Number(width)
    }));
  const widest = Math.max(...panels.map(panel => panel.width));
  const rows = panels.filter(panel => panel.width === widest);
  const tiles = panels.filter(panel => panel.width !== widest);

  assert.ok(rows.length === 5 && tiles.length === 6);
  assert.equal(Math.max(...tiles.map(t => t.bottom)), Math.max(...rows.map(r => r.bottom)),
    'both columns end on the same line');
});

test('aggregateFilms merges repeat viewings of the same film', () => {
  const films = aggregateFilms([
    entry('2025-01-01', { title: 'Heat', rating: 4 }),
    entry('2025-06-01', { title: 'Heat', rating: 5, rewatch: true, liked: true }),
    entry('2025-02-01', { title: 'Other', rating: 3 })
  ]);
  const heat = films.find(film => film.title === 'Heat');

  assert.equal(films.length, 2);
  assert.equal(heat.watches, 2);
  assert.equal(heat.rating, 5, 'the best rating wins');
  assert.equal(heat.liked, true, 'a like on any viewing counts');
});

test('ranking: a higher rating always beats likes and rewatches', () => {
  // The bonuses are capped below a half-star step on purpose, so no amount of
  // liking or rewatching can lift a film past one rated higher.
  const top = pickTopFilms([
    entry('2025-01-01', { title: 'Plain 4.5', rating: 4.5 }),
    entry('2025-02-01', { title: 'Beloved 4', rating: 4, liked: true }),
    entry('2025-02-02', { title: 'Beloved 4', rating: 4, liked: true, rewatch: true }),
    entry('2025-02-03', { title: 'Beloved 4', rating: 4, liked: true, rewatch: true })
  ]);

  assert.equal(top[0].title, 'Plain 4.5');
  assert.equal(top[1].title, 'Beloved 4');
});

test('ranking: a like breaks a tie between equally rated films', () => {
  const top = pickTopFilms([
    entry('2025-01-01', { title: 'Unliked', rating: 4 }),
    entry('2025-01-02', { title: 'Liked', rating: 4, liked: true })
  ]);

  assert.equal(top[0].title, 'Liked');
});

test('ranking: rewatches break a tie when neither film is liked', () => {
  const top = pickTopFilms([
    entry('2025-01-01', { title: 'Once', rating: 4 }),
    entry('2025-01-02', { title: 'Twice', rating: 4 }),
    entry('2025-03-02', { title: 'Twice', rating: 4, rewatch: true })
  ]);

  assert.equal(top[0].title, 'Twice');
});

test('ranking: a like outweighs a rewatch', () => {
  // Likes are rarer than rewatches on a typical profile, so they say more.
  const top = pickTopFilms([
    entry('2025-01-01', { title: 'Rewatched', rating: 4 }),
    entry('2025-02-01', { title: 'Rewatched', rating: 4, rewatch: true }),
    entry('2025-01-02', { title: 'Liked', rating: 4, liked: true })
  ]);

  assert.equal(top[0].title, 'Liked');
});

test('ranking: the rewatch bonus stops growing', () => {
  // Otherwise a comfort watch would climb indefinitely.
  const many = ['2025-01-01', '2025-02-01', '2025-03-01', '2025-04-01', '2025-05-01']
    .map(date => entry(date, { title: 'Comfort', rating: 4, rewatch: date !== '2025-01-01' }));
  const top = pickTopFilms([
    ...many,
    entry('2025-06-01', { title: 'Liked', rating: 4, liked: true })
  ]);

  assert.equal(top[0].title, 'Liked');
});


test('card renders the Letterboxd logo when one is supplied', async () => {
  const film = entry('2025-01-01', { title: 'A', rating: 4 });
  const withLogo = await generateReviewCard([film], {
    year: 2025, username: 'someone', logoBase64: 'data:image/png;base64,BBBB'
  });
  const withoutLogo = await generateReviewCard([film], { year: 2025, username: 'someone' });

  assert.ok(withLogo.includes('data:image/png;base64,BBBB'));
  assert.ok(withoutLogo.includes('fill="#FF8000"'), 'falls back to the dots');
});

test('profile card reports the all-time count and scopes the fetched figures', async () => {
  const svg = await generateProfileCard(
    [
      entry('2025-01-01', { title: 'A', rating: 4 }),
      entry('2026-01-01', { title: 'B', rating: 3 })
    ],
    { years: [2025, 2026], totalEntries: 626, username: 'someone', displayName: 'Someone' }
  );
  const texts = textNodes(svg);

  assert.ok(texts.includes('626'), 'the headline is the all-time count');
  assert.ok(texts.includes('FILMS WATCHED'));
  assert.ok(texts.includes('Diary Entries 2025–2026'), 'the tiles say which years they cover');
  assert.ok(texts.includes('TOP RATED 2025–2026'));
  assert.ok(texts.includes('2'), 'the tile counts only the fetched entries');
});

test('profile card lays out however many favourites a profile pins', async () => {
  const film = entry('2025-01-01', { title: 'A', rating: 4 });
  const favourite = { title: 'Fav', year: '1999', url: 'https://letterboxd.com/film/fav/' };

  const none = await generateProfileCard([film], { years: [2025], username: 'someone' });
  assert.ok(textNodes(none).includes('No favourites pinned'));

  const two = await generateProfileCard([film], {
    years: [2025],
    username: 'someone',
    favourites: [favourite, { ...favourite, title: 'Fav2', url: 'https://letterboxd.com/film/fav2/' }]
  });
  assert.equal((two.match(/id="favClip\d"/g) || []).length, 2, 'one clip per pinned favourite');
});

test('profile card keeps favourite and list posters apart', async () => {
  const film = entry('2025-01-01', { title: 'Shared', rating: 5 });
  const svg = await generateProfileCard([film], {
    years: [2025],
    username: 'someone',
    favourites: [{ title: 'Shared', year: '1999', url: film.url }],
    posters: new Map([[film.url, 'data:image/jpeg;base64,SMALL']]),
    favouritePosters: new Map([[film.url, 'data:image/jpeg;base64,LARGE']])
  });

  // The same film can be both a favourite and a top rated entry, and the two
  // are drawn at very different sizes.
  assert.ok(svg.includes('SMALL'));
  assert.ok(svg.includes('LARGE'));
});

test('profile card handles a profile with nothing rated', async () => {
  const svg = await generateProfileCard([entry('2025-01-01', { title: 'A' })], {
    years: [2025], totalEntries: 1, username: 'someone'
  });

  assert.ok(textNodes(svg).includes('No rated films yet'));
  assert.ok(svg.includes('width="1200"'));
});

test('cards link the profile block, the logo and every film', async () => {
  const film = entry('2025-01-01', { title: 'A', rating: 5 });
  const svg = await generateReviewCard([film], {
    year: 2025,
    username: 'someone',
    displayName: 'Someone',
    logoBase64: 'data:image/png;base64,X'
  });
  const links = [...svg.matchAll(/<a href="([^"]+)"/g)].map(match => match[1]);

  assert.equal(links.filter(href => href === 'https://letterboxd.com/someone/').length, 3,
    'avatar, display name and handle');
  assert.ok(links.includes('https://letterboxd.com/'), 'the logo links to Letterboxd');
  assert.equal(links.filter(href => href === film.url).length, 2, 'poster and title');
});

test('profile card links the favourites to their film pages', async () => {
  const svg = await generateProfileCard([entry('2025-01-01', { title: 'A', rating: 4 })], {
    years: [2025],
    username: 'someone',
    favourites: [{ title: 'Fav', year: '1999', url: 'https://letterboxd.com/film/fav/' }]
  });

  assert.ok(svg.includes('<a href="https://letterboxd.com/film/fav/">'));
});

test('a film without a URL falls back to the profile rather than a dead link', async () => {
  const svg = await generateReviewCard(
    [{ date: new Date('2025-01-01T00:00:00Z'), title: 'No link', year: '2020', rating: 4 }],
    { year: 2025, username: 'someone' }
  );

  assert.ok(!svg.includes('<a href="undefined"'));
  assert.ok(!svg.includes('<a href="">'));
});

test('a rewatch links to the film, not to one viewing of it', async () => {
  // Letterboxd logs a rewatch at /<user>/film/<slug>/2/, which is that single
  // viewing. The card lists films, so the trailing index is dropped.
  const svg = await generateReviewCard(
    [{
      date: new Date('2025-01-01T00:00:00Z'),
      title: 'Heat',
      year: '1995',
      rating: 5,
      url: 'https://letterboxd.com/someone/film/heat/3/'
    }],
    { year: 2025, username: 'someone' }
  );

  assert.ok(svg.includes('<a href="https://letterboxd.com/someone/film/heat/">'));
  assert.ok(!svg.includes('/film/heat/3/'));
});

test('profile card drops the year range when the diary is complete', async () => {
  const entries = [entry('2024-01-01', { title: 'A', rating: 4 }), entry('2026-01-01', { title: 'B', rating: 3 })];

  const scoped = await generateProfileCard(entries, {
    years: [2024, 2026], totalEntries: 626, username: 'someone'
  });
  const complete = await generateProfileCard(entries, {
    years: [2024, 2026], allTime: true, totalEntries: 626, username: 'someone'
  });

  assert.ok(textNodes(scoped).includes('TOP RATED 2024–2026'));
  assert.ok(textNodes(scoped).includes('Diary Entries 2024–2026'));

  // Labelling a complete diary with its span would read as a restriction that
  // is not there.
  assert.ok(textNodes(complete).includes('TOP RATED'));
  assert.ok(textNodes(complete).includes('Diary Entries'));
  assert.ok(!complete.includes('2024–2026'));
});

test('profile card names the favourites under their posters', async () => {
  const svg = await generateProfileCard([entry('2025-01-01', { title: 'A', rating: 4 })], {
    years: [2025],
    username: 'someone',
    favourites: [{ title: 'Solaris', year: '1972', url: 'https://letterboxd.com/film/solaris/' }]
  });
  const texts = textNodes(svg);

  assert.ok(texts.includes('Solaris'));
  assert.ok(texts.includes('1972'));
});

test('film rows carry runtime and the community rating when known', async () => {
  const film = entry('2025-01-01', { title: 'The Big Lebowski', year: '1998', rating: 5 });
  const svg = await generateReviewCard([film], {
    year: 2025,
    username: 'someone',
    details: new Map([[film.url, { runtime: 117, averageRating: 4.11 }]])
  });

  assert.ok(textNodes(svg).includes('1998  ·  1h 57m  ·  ★ 4.1'));
});

test('film rows fall back gracefully when the film page gave nothing', async () => {
  const film = entry('2025-01-01', { title: 'A', year: '1998', rating: 5 });
  const svg = await generateReviewCard([film], { year: 2025, username: 'someone' });

  assert.ok(textNodes(svg).includes('1998'));
  assert.ok(!svg.includes('·'), 'no separators left dangling');
});

test('a runtime under an hour drops the hours part', async () => {
  const film = entry('2025-01-01', { title: 'Short', year: '2020', rating: 4 });
  const svg = await generateReviewCard([film], {
    year: 2025,
    username: 'someone',
    details: new Map([[film.url, { runtime: 48, averageRating: null }]])
  });

  assert.ok(textNodes(svg).includes('2020  ·  48m'));
});

test('rank colors group the ranks into tiers', async () => {
  const films = ['A', 'B', 'C', 'D', 'E'].map((title, i) =>
    entry(`2025-01-0${i + 1}`, { title, rating: 5 - i * 0.5 }));
  const svg = await generateReviewCard(films, { year: 2025, username: 'someone' });
  const colors = [...svg.matchAll(/<circle cx="[\d.]+" cy="[\d.]+" r="16" fill="(#[0-9A-F]{6})"/gi)]
    .map(match => match[1]);

  assert.deepEqual(colors, ['#FF8000', '#FF8000', '#00E054', '#00E054', '#40BCF4']);
});

test('both cards have rounded corners', async () => {
  const film = entry('2025-01-01', { title: 'A', rating: 4 });
  const year = await generateReviewCard([film], { year: 2025, username: 'someone' });
  const profile = await generateProfileCard([film], { years: [2025], username: 'someone' });

  for (const svg of [year, profile]) {
    assert.match(svg, /<rect width="100%" height="100%" rx="\d+"/);
  }
});

test('a long favourite title wraps instead of being cut mid-word', async () => {
  const svg = await generateProfileCard([entry('2025-01-01', { title: 'A', rating: 4 })], {
    years: [2025],
    username: 'someone',
    favourites: [{ title: 'The Butterfly Effect', year: '2004', url: 'https://letterboxd.com/film/tbe/' }]
  });
  const texts = textNodes(svg);

  assert.ok(texts.includes('The Butterfly'), 'first line breaks on a space');
  assert.ok(texts.includes('Effect'), 'the rest goes on a second line');
  assert.ok(!texts.some(text => text.startsWith('The Butterfly Eff…')));
});

test('a favourite title too long even for two lines is truncated on the last', async () => {
  const svg = await generateProfileCard([entry('2025-01-01', { title: 'A', rating: 4 })], {
    years: [2025],
    username: 'someone',
    favourites: [{
      title: 'Everything Everywhere All at Once Forever and Ever',
      year: '2022',
      url: 'https://letterboxd.com/film/eeaao/'
    }]
  });
  const texts = textNodes(svg);

  assert.ok(texts.some(text => text.endsWith('…')));
  assert.ok(texts.includes('2022'), 'the year still follows below');
});

test('the year follows a one line title without a gap', async () => {
  const svg = await generateProfileCard([entry('2025-01-01', { title: 'A', rating: 4 })], {
    years: [2025],
    username: 'someone',
    favourites: [
      { title: 'Star Wars', year: '1977', url: 'https://letterboxd.com/film/star-wars/' },
      { title: 'The Butterfly Effect', year: '2004', url: 'https://letterboxd.com/film/tbe/' }
    ]
  });
  const caption = (label) => {
    const match = svg.match(new RegExp(`<text x="[\\d.]+" y="([\\d.]+)"[^>]*>${label}<`));
    return Number(match[1]);
  };

  // A short title keeps its year close; a wrapped one pushes it down by a line.
  assert.equal(caption('1977') - caption('Star Wars'), 17);
  assert.equal(caption('2004') - caption('The Butterfly'), 33);
});

test('both cards show the Pro and Patron badges', async () => {
  const film = entry('2025-01-01', { title: 'A', rating: 4 });

  for (const [status, label, color] of [['patron', 'PATRON', '#40bcf4'], ['pro', 'PRO', '#ff8000']]) {
    const year = await generateReviewCard([film], { year: 2025, username: 'someone', memberStatus: status });
    const profile = await generateProfileCard([film], { years: [2025], username: 'someone', memberStatus: status });

    for (const svg of [year, profile]) {
      assert.ok(textNodes(svg).includes(label));
      assert.ok(svg.includes(color), `${label} keeps its colour`);
    }
  }
});

test('a member with neither badge gets none', async () => {
  const film = entry('2025-01-01', { title: 'A', rating: 4 });
  const year = await generateReviewCard([film], { year: 2025, username: 'someone' });
  const profile = await generateProfileCard([film], { years: [2025], username: 'someone', memberStatus: null });

  for (const svg of [year, profile]) {
    assert.ok(!svg.includes('PATRON'));
    assert.ok(!/>PRO</.test(svg));
  }
});

test('the profile card does not label two different numbers as films', async () => {
  // A profile counts films watched; the diary counts logged viewings. On a
  // profile with 3,653 films and 1,254 diary entries the two are far apart.
  const svg = await generateProfileCard(
    [entry('2025-01-01', { title: 'A', rating: 4 })],
    { years: [2025], allTime: true, totalEntries: 3653, username: 'someone' }
  );
  const texts = textNodes(svg);

  assert.ok(texts.includes('3653'));
  assert.ok(texts.includes('FILMS WATCHED'));
  assert.ok(texts.includes('Diary Entries'));
  assert.ok(!texts.includes('Films'), 'the bare word would be ambiguous here');
});

test('entriesForPeriod narrows to a year or to a month within it', () => {
  const entries = [
    entry('2026-08-03', { title: 'Aug' }),
    entry('2026-07-30', { title: 'Jul' }),
    entry('2025-08-03', { title: 'LastAug' })
  ];

  assert.equal(entriesForPeriod(entries, { year: 2026 }).length, 2);
  assert.equal(entriesForPeriod(entries, { year: 2026, month: 8 })[0].title, 'Aug');
  assert.equal(entriesForPeriod(entries, { year: 2026, month: 9 }).length, 0);
});

test('a period names itself for the card and for the file', () => {
  assert.deepEqual(periodLabels({ year: 2026 }), { headline: '2026', subtitle: 'IN REVIEW' });
  assert.deepEqual(periodLabels({ year: 2026, month: 8 }), { headline: 'August', subtitle: '2026 IN REVIEW' });

  assert.equal(periodSlug({ year: 2026 }), '2026');
  assert.equal(periodSlug({ year: 2026, month: 8 }), '2026-08');
  assert.equal(periodSlug({ year: 2026, month: 12 }), '2026-12');
});

test('a month card counts only that month', async () => {
  const entries = [
    entry('2026-08-03', { title: 'Aug A', rating: 5 }),
    entry('2026-08-14', { title: 'Aug B', rating: 4 }),
    entry('2026-07-30', { title: 'Jul', rating: 5 })
  ];
  const svg = await generateReviewCard(entries, { year: 2026, month: 8, username: 'someone' });
  const texts = textNodes(svg);

  assert.ok(texts.includes('August'));
  assert.ok(texts.includes('2026 IN REVIEW'));
  assert.ok(texts.includes('2'), 'two films that month');
  assert.ok(!texts.includes('Jul'), 'the previous month is excluded');
});

test('an empty month says so', async () => {
  const svg = await generateReviewCard([entry('2026-07-01', { title: 'Jul', rating: 4 })], {
    year: 2026, month: 8, username: 'someone'
  });

  assert.ok(textNodes(svg).includes('Nothing logged this month'));
});

test('a long month name is scaled down to fit the column', async () => {
  const short = await generateReviewCard([], { year: 2026, month: 5, username: 'someone' });
  const long = await generateReviewCard([], { year: 2026, month: 9, username: 'someone' });
  const size = (svg) => Number(svg.match(/y="202" font-size="(\d+)"/)[1]);

  assert.equal(size(short), 88, 'May needs no shrinking');
  assert.ok(size(long) <= 88 && size(long) >= 40);
});

test('an empty period fills the column rather than leaving one short row', async () => {
  const svg = await generateReviewCard([], { year: 2026, month: 8, username: 'someone' });
  const panels = [...svg.matchAll(/<rect x="[\d.]+" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)" rx="14"/g)]
    .map(([, y, width, height]) => ({ y: Number(y), width: Number(width), height: Number(height) }));
  const widest = panels.reduce((a, b) => (b.width > a.width ? b : a));

  assert.ok(widest.height > 400, 'the placeholder spans the list it replaces');
  assert.ok(textNodes(svg).some(text => text.includes('August 2026')), 'it names the period');
});

test('the hero rules keep clear of a wider subtitle', async () => {
  const rulesOf = (svg) => [...svg.matchAll(/<line x1="([\d.]+)" y1="229" x2="([\d.]+)"/g)]
    .map(([, x1, x2]) => [Number(x1), Number(x2)]);

  const year = await generateReviewCard([], { year: 2026, username: 'someone' });
  const month = await generateReviewCard([], { year: 2026, month: 9, username: 'someone' });

  // "2026 IN REVIEW" is wider than "IN REVIEW", so the rules have to give way.
  assert.ok(rulesOf(month)[0][1] < rulesOf(year)[0][1]);
  assert.ok(rulesOf(month)[1][0] > rulesOf(year)[1][0]);
});
