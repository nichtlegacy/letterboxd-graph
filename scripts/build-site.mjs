#!/usr/bin/env node

/**
 * Builds the GitHub Pages site into `_site/`.
 *
 * The page itself is static — `site/` is copied verbatim. Everything that
 * depends on what the last generator run actually wrote is derived here
 * instead of being hardcoded in the page:
 *
 * - `manifest.json` lists the SVGs present in `images/`, paired by theme and
 *   carrying the dimensions read out of each file, so the page can reserve the
 *   right aspect ratio before an embed loads.
 * - `data.json` is a slim cut of `images/letterboxd-data.json`. The full export
 *   is several hundred kilobytes because it carries every diary cell; the page
 *   only needs the headline figures and the recent films.
 * - The head's title, description, Open Graph and Twitter tags, and the
 *   JSON-LD block are written from the same export, because the crawler that
 *   reads them does not run the JavaScript that fills the page in.
 * - `og.png` is the profile card rasterised, since the SVGs the page shows are
 *   not a format any social preview will render.
 * - `robots.txt` and `sitemap.xml`, so the page is indexable.
 *
 * Run it locally with `npm run build:site` and serve `_site/` to preview.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildAllTimeStats } from '../src/stats.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const PROFILE_FILE = /^letterboxd-profile-(dark|light)\.svg$/;
const REVIEW_FILE = /^letterboxd-review-(.+)-(dark|light)\.svg$/;
const THEMED_FILE = /^(.+)-(dark|light)\.svg$/;

const KIND_ORDER = { graph: 0, year: 1, month: 2, profile: 3 };

// The Open Graph default, and what the cards are already drawn at.
const OG_SIZE = { width: 1200, height: 630 };
const TOUCH_ICON_SIZE = { width: 180, height: 180 };

// The page's dark background, painted behind anything rasterised: a PNG with
// transparent corners is shown over whatever colour the reader's client uses,
// and a share card is as often on white as on black.
const CARD_BACKGROUND = '#12161a';

/**
 * Split a generated filename into what it shows, which period it covers and
 * which theme it is. Returns null for anything that is not a themed SVG, which
 * is how PNGs and the JSON export are skipped.
 *
 * @param {string} filename - Basename inside the images directory
 * @returns {{kind: string, slug: string, theme: string}|null}
 */
export function classify(filename) {
  const profile = PROFILE_FILE.exec(filename);
  if (profile) return { kind: 'profile', slug: 'profile', theme: profile[1] };

  const review = REVIEW_FILE.exec(filename);
  if (review) {
    const slug = review[1];
    return { kind: /^\d{4}$/.test(slug) ? 'year' : 'month', slug, theme: review[2] };
  }

  // Whatever is left is the contribution graph. Its name follows the action's
  // `output` input, so it cannot be matched by a fixed pattern.
  const themed = THEMED_FILE.exec(filename);
  if (themed) return { kind: 'graph', slug: themed[1], theme: themed[2] };

  return null;
}

/**
 * Human label for an asset. Month cards are named by how recent they are, so
 * the label has to say that rather than name a month.
 *
 * @param {{kind: string, slug: string}} asset
 * @returns {string}
 */
export function label({ kind, slug }) {
  if (kind === 'profile') return 'Profile';
  if (kind === 'year') return slug;
  if (kind === 'graph') return 'Contribution graph';

  if (slug === 'current-month') return 'This month';
  if (slug === 'previous-month') return 'Last month';

  const back = /^month-minus-(\d+)$/.exec(slug);
  return back ? `${back[1]} months ago` : slug;
}

/**
 * Read the drawn size out of an SVG so the page can reserve the space before
 * the embed loads. The viewBox wins over the width and height attributes: it is
 * the one that survives the file being scaled.
 *
 * @param {string} svg - SVG markup, of which only the root element is read
 * @returns {{width: number, height: number}}
 */
export function readDimensions(svg) {
  const head = svg.slice(0, 1000);

  const viewBox = /viewBox="\s*([\d.+-]+)[\s,]+([\d.+-]+)[\s,]+([\d.+-]+)[\s,]+([\d.+-]+)\s*"/.exec(head);
  if (viewBox) return { width: Number(viewBox[3]), height: Number(viewBox[4]) };

  const width = /\bwidth="(\d+(?:\.\d+)?)"/.exec(head);
  const height = /\bheight="(\d+(?:\.\d+)?)"/.exec(head);
  if (width && height) return { width: Number(width[1]), height: Number(height[1]) };

  return { width: 1200, height: 630 };
}

/**
 * Read the card's own chrome: the corner radius of its full-bleed background
 * rect and the colour it is filled with.
 *
 * Both matter to the page. An SVG in an `<object>` is its own document, and
 * some browsers paint that document's canvas white, which shows through
 * wherever the drawing is transparent — precisely the four rounded corners. The
 * page clips its embed to the same radius and paints the same fill behind it, so
 * there is no corner left for a canvas colour to show through.
 *
 * @param {string} svg - SVG markup
 * @returns {{radius: number, fill: string|null}}
 */
export function readChrome(svg) {
  // Not a head slice: the background rect sits after the defs, and those carry
  // the inlined font, which runs to hundreds of kilobytes.
  const rect = /<rect[^>]*\bwidth="100%"[^>]*>/.exec(svg);
  if (!rect) return { radius: 0, fill: null };

  const radius = /\brx="(\d+(?:\.\d+)?)"/.exec(rect[0]);
  const fill = /\bfill="(#[0-9a-fA-F]{3,8}|[a-z]+)"/.exec(rect[0]);

  return {
    radius: radius ? Number(radius[1]) : 0,
    fill: fill ? fill[1] : null
  };
}

/**
 * Sort assets into the order the page shows them: graph, years newest first,
 * months most recent first, then the profile card.
 *
 * @param {{kind: string, slug: string}} a
 * @param {{kind: string, slug: string}} b
 * @returns {number}
 */
function compareAssets(a, b) {
  if (KIND_ORDER[a.kind] !== KIND_ORDER[b.kind]) return KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
  if (a.kind === 'year') return Number(b.slug) - Number(a.slug);

  if (a.kind === 'month') {
    const rank = (slug) => {
      if (slug === 'current-month') return 0;
      if (slug === 'previous-month') return 1;
      const back = /^month-minus-(\d+)$/.exec(slug);
      return back ? Number(back[1]) : 99;
    };
    return rank(a.slug) - rank(b.slug);
  }

  return a.slug.localeCompare(b.slug);
}

/**
 * Pair the files in an images directory into one entry per asset.
 *
 * @param {string[]} filenames - Directory listing, basenames only
 * @param {(name: string) => string} readSvg - Reads a file's markup
 * @returns {Array<object>} One entry per asset, in page order
 */
export function buildAssets(filenames, readSvg) {
  const present = new Set(filenames);
  const assets = new Map();

  for (const filename of filenames.filter(name => name.endsWith('.svg')).sort()) {
    const parsed = classify(filename);
    if (!parsed) continue;

    const key = `${parsed.kind}:${parsed.slug}`;
    if (!assets.has(key)) {
      assets.set(key, {
        kind: parsed.kind,
        slug: parsed.slug,
        label: label(parsed),
        width: 1200,
        height: 630,
        radius: 0,
        background: {},
        svg: {},
        png: {}
      });
    }

    const asset = assets.get(key);
    asset.svg[parsed.theme] = `images/${filename}`;

    const png = filename.replace(/\.svg$/, '.png');
    if (present.has(png)) asset.png[parsed.theme] = `images/${png}`;

    const markup = readSvg(filename);
    const chrome = readChrome(markup);
    asset.background[parsed.theme] = chrome.fill;

    // The two themes are the same drawing, so its geometry is read once. The
    // fill is not: that is the whole point of having two files.
    if (parsed.theme === 'dark' || !asset.measured) {
      Object.assign(asset, readDimensions(markup), { radius: chrome.radius });
      asset.measured = true;
    }
  }

  return [...assets.values()]
    .filter(asset => asset.svg.dark && asset.svg.light)
    .map(({ measured, ...asset }) => asset)
    .sort(compareAssets);
}

/**
 * Cut the full JSON export down to what the page renders. The export carries
 * every diary cell, which is most of its size and none of its use here.
 *
 * @param {object} data - Parsed `letterboxd-data.json`
 * @returns {object} Slim payload
 */
export function slimData(data) {
  return {
    user: data.user,
    years: data.years || (data.year ? [data.year] : []),
    generatedAt: data.generatedAt,
    stats: data.stats,
    allTime: data.allTime || allTimeFromCells(data),
    // Two columns of eight on the page.
    recent: (data.recent || []).slice(0, 16)
  };
}

/**
 * Rebuild the all-time block for an export written before the generator started
 * including one. The cells only cover the graph years, so the figures are
 * narrower than a fresh run's — the page says as much by reading `scope`.
 *
 * @param {object} data - Parsed `letterboxd-data.json`
 * @returns {object|null}
 */
export function allTimeFromCells(data) {
  const entries = (data.cells || []).flatMap(cell =>
    (cell.films || []).map(film => ({ ...film, date: new Date(`${cell.date}T00:00:00Z`) })));

  return buildAllTimeStats(entries, { scope: 'years', totalFilms: null });
}

/* ── The head ─────────────────────────────────────────────────────────────── */

/**
 * Where the built page will be served from, as an absolute URL ending in a
 * slash. Everything a crawler reads has to be absolute: a share card is
 * resolved by a server that has no idea what the page's own address was.
 *
 * `SITE_URL` is what the Pages workflow passes in, taken from the deployment
 * itself, so a custom domain is picked up without being configured twice.
 * Failing that the address is the one Pages gives a repository by default,
 * which also covers the `<owner>.github.io` repository serving from the root.
 *
 * @param {object} env - Environment, normally `process.env`
 * @returns {string} Absolute URL with a trailing slash
 */
export function siteBase(env = {}) {
  const explicit = env.SITE_URL || env.PAGES_BASE_URL;
  if (explicit) return explicit.endsWith('/') ? explicit : `${explicit}/`;

  const [owner, repo] = (env.GITHUB_REPOSITORY || 'nichtlegacy/letterboxd-graph').split('/');
  const host = `${owner.toLowerCase()}.github.io`;

  return repo.toLowerCase() === host ? `https://${host}/` : `https://${host}/${repo}/`;
}

/**
 * Escape a string for use inside a double-quoted HTML attribute.
 *
 * @param {string} value
 * @returns {string}
 */
function attribute(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Thousands separators, matching what the page itself prints.
 *
 * @param {number} value
 * @returns {string}
 */
function count(value) {
  return Number(value).toLocaleString('en-GB');
}

/**
 * The sentences the head is built out of, derived from the export.
 *
 * Two descriptions rather than one: Google cuts its snippet at roughly 160
 * characters, so the meta description says the least that still identifies the
 * page, while the share card has room for the figures that make it worth
 * opening.
 *
 * @param {object|null} data - Slim payload, as written to `data.json`
 * @returns {{title: string, ogTitle: string, description: string, ogDescription: string, imageAlt: string}}
 */
export function describe(data) {
  const generic = 'A Letterboxd film diary as a contribution graph, review cards and a set of all-time statistics — generated daily by a GitHub Action.';

  if (!data?.user) {
    return {
      title: 'Letterboxd Graph',
      ogTitle: 'Letterboxd Graph',
      description: generic,
      ogDescription: generic,
      imageAlt: 'A Letterboxd profile card'
    };
  }

  const user = `@${data.user}`;
  const all = data.allTime || {};
  const films = all.films || all.entries;

  // The diary's own span beats the graph's: `years` is only what was drawn.
  const first = all.firstEntry?.slice(0, 4);
  const last = all.lastEntry?.slice(0, 4);
  const graphYears = (data.years || []).slice().sort((a, b) => a - b);
  const from = first || graphYears[0];
  const to = last || graphYears.at(-1);
  const span = from && to && from !== to ? `${from}–${to}` : from;

  // The two are not the same sentence. A tab and a search result want the site
  // named; a share card is already framed as one, and reads better leading with
  // the figure that makes it worth opening.
  const title = `${user}'s film diary — Letterboxd Graph`;
  const ogTitle = films ? `${user} — ${count(films)} films on Letterboxd` : title;

  const description = [
    films ? `${count(films)} films logged on Letterboxd by ${user}` : `${user}'s Letterboxd diary`,
    span ? `, ${span}` : '',
    ' — a contribution graph, a card per year and month, and the figures behind them, redrawn daily.'
  ].join('');

  // Two sentences of figures, then what the page is. X cuts a card's
  // description at around 200 characters, so the figures go first and the
  // sentence that survives being cut is the one that says the least.
  const logged = [
    all.entries ? `${count(all.entries)} diary entries` : null,
    all.daysActive ? `across ${count(all.daysActive)} days` : null
  ].filter(Boolean).join(' ');

  const then = [
    all.streak?.length ? `longest streak ${all.streak.length} days` : null,
    all.averageRating ? `average rating ${all.averageRating}` : null,
    all.rewatches ? `${count(all.rewatches)} rewatches` : null
  ].filter(Boolean).join(', ');

  const ogDescription = [
    logged ? `${logged}.` : null,
    then ? `${then.charAt(0).toUpperCase()}${then.slice(1)}.` : null,
    'Drawn as a contribution graph, a card per year and month, and every figure behind them.'
  ].filter(Boolean).join(' ');

  const imageAlt = films
    ? `Letterboxd profile card for ${user}: ${count(films)} films watched`
    : `Letterboxd profile card for ${user}`;

  return { title, ogTitle, description, ogDescription, imageAlt };
}

/**
 * The block of tags that replaces the marked region in `site/index.html`.
 *
 * @param {object} options
 * @param {string} options.base - Absolute site URL, trailing slash
 * @param {object|null} options.data - Slim payload
 * @param {string} options.repository - `owner/repo`
 * @param {string|null} options.image - Preview image path relative to the site root
 * @param {{width: number, height: number}} [options.imageSize]
 * @returns {string} HTML, indented to sit inside `<head>`
 */
export function renderMeta({ base, data, repository, image, imageSize = { width: 1200, height: 630 } }) {
  const text = describe(data);
  const url = base;

  // A social platform caches a preview by its URL, so a card that is redrawn
  // daily needs the URL to move with it or a reshare shows last week's figures.
  const stamp = data?.generatedAt ? data.generatedAt.slice(0, 10).replace(/-/g, '') : null;
  const imageUrl = image ? `${base}${image}${stamp ? `?v=${stamp}` : ''}` : null;

  const tags = [
    ['title', text.title],
    ['meta', 'name', 'description', text.description],
    ['link', 'canonical', url],
    null,
    ['meta', 'property', 'og:type', 'website'],
    ['meta', 'property', 'og:site_name', 'Letterboxd Graph'],
    ['meta', 'property', 'og:locale', 'en_GB'],
    ['meta', 'property', 'og:url', url],
    ['meta', 'property', 'og:title', text.ogTitle],
    ['meta', 'property', 'og:description', text.ogDescription],
    imageUrl && ['meta', 'property', 'og:image', imageUrl],
    imageUrl && ['meta', 'property', 'og:image:type', 'image/png'],
    imageUrl && ['meta', 'property', 'og:image:width', String(imageSize.width)],
    imageUrl && ['meta', 'property', 'og:image:height', String(imageSize.height)],
    imageUrl && ['meta', 'property', 'og:image:alt', text.imageAlt],
    null,
    ['meta', 'name', 'twitter:card', imageUrl ? 'summary_large_image' : 'summary'],
    ['meta', 'name', 'twitter:title', text.ogTitle],
    ['meta', 'name', 'twitter:description', text.ogDescription],
    imageUrl && ['meta', 'name', 'twitter:image', imageUrl],
    imageUrl && ['meta', 'name', 'twitter:image:alt', text.imageAlt]
  ];

  const lines = tags.map((tag) => {
    if (!tag) return '';
    if (tag[0] === 'title') return `  <title>${attribute(tag[1])}</title>`;
    if (tag[0] === 'link') return `  <link rel="${tag[1]}" href="${attribute(tag[2])}">`;
    return `  <meta ${tag[1]}="${tag[2]}" content="${attribute(tag[3])}">`;
  });

  return [...lines, '', renderJsonLd({ base, data, repository, image: imageUrl, text })].join('\n');
}

/**
 * Structured data for the page, as one graph so the nodes can reference each
 * other. It says the same thing the tags above say — a search engine reads the
 * two separately and a claim only made in one of them is a claim it may not
 * see.
 *
 * @param {object} options
 * @returns {string} A `<script type="application/ld+json">` block
 */
export function renderJsonLd({ base, data, repository, image, text }) {
  const nodes = [{
    '@type': 'WebSite',
    '@id': `${base}#website`,
    url: base,
    name: 'Letterboxd Graph',
    description: text.description,
    inLanguage: 'en-GB'
  }];

  if (data?.user) {
    const profile = `https://letterboxd.com/${data.user}/`;

    nodes.push({
      '@type': 'Person',
      '@id': `${base}#person`,
      name: data.user,
      alternateName: `@${data.user}`,
      url: profile,
      sameAs: [profile]
    });

    nodes.push({
      '@type': 'ProfilePage',
      '@id': `${base}#page`,
      url: base,
      name: text.ogTitle,
      description: text.ogDescription,
      isPartOf: { '@id': `${base}#website` },
      mainEntity: { '@id': `${base}#person` },
      about: { '@id': `${base}#person` },
      inLanguage: 'en-GB',
      ...(data.generatedAt ? { dateModified: data.generatedAt } : {}),
      ...(image ? { primaryImageOfPage: { '@type': 'ImageObject', url: image, width: 1200, height: 630 } } : {})
    });
  }

  if (repository) {
    nodes.push({
      '@type': 'SoftwareSourceCode',
      '@id': `${base}#source`,
      name: 'letterboxd-graph',
      codeRepository: `https://github.com/${repository}`,
      programmingLanguage: 'JavaScript',
      license: 'https://opensource.org/licenses/MIT'
    });
  }

  const graph = JSON.stringify({ '@context': 'https://schema.org', '@graph': nodes }, null, 2)
    .split('\n')
    .map(line => `    ${line}`)
    .join('\n');

  return `  <script type="application/ld+json">\n${graph}\n  </script>`;
}

const META_REGION = /([ \t]*)<!-- meta:start -->[\s\S]*?<!-- meta:end -->/;

/**
 * Swap the generated tags into the page's marked region.
 *
 * @param {string} html - Contents of `site/index.html`
 * @param {string} block - Output of `renderMeta`
 * @returns {string}
 * @throws {Error} If the page has lost its markers
 */
export function injectMeta(html, block) {
  if (!META_REGION.test(html)) {
    throw new Error('site/index.html has no <!-- meta:start --> region to fill in');
  }

  return html.replace(META_REGION, () => `  <!-- meta:start -->\n${block}\n  <!-- meta:end -->`);
}

/**
 * A sitemap for the one page there is. Small, but it is what carries the
 * last-modified date, and the page's content changes under a stable URL.
 *
 * @param {string} base - Absolute site URL
 * @param {string|null} lastmod - ISO timestamp of the last generator run
 * @returns {string}
 */
export function renderSitemap(base, lastmod) {
  const date = lastmod ? `\n    <lastmod>${lastmod.slice(0, 10)}</lastmod>` : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${base}</loc>${date}
    <changefreq>daily</changefreq>
  </url>
</urlset>
`;
}

/**
 * @param {string} base - Absolute site URL
 * @returns {string}
 */
export function renderRobots(base) {
  return `User-agent: *\nAllow: /\n\nSitemap: ${base}sitemap.xml\n`;
}

/**
 * Rasterise a card to a PNG for the share preview.
 *
 * The page's own cards are SVG, and no social platform renders one: Discord,
 * Slack and X all drop an SVG preview rather than draw it. The profile card is
 * already 1200x630, so it is the preview as it stands, only in a format that
 * survives the trip.
 *
 * `sharp` is a generator dependency rather than a site one, so a build without
 * it warns and carries on with no preview instead of failing.
 *
 * @param {string} svgPath - Card to rasterise
 * @param {string} outPath - Where to write the PNG
 * @param {{width: number, height: number}} size
 * @returns {Promise<boolean>} Whether the file was written
 */
async function rasterise(svgPath, outPath, size) {
  try {
    const { default: sharp } = await import('sharp');

    await sharp(fs.readFileSync(svgPath))
      .resize(size.width, size.height, { fit: 'contain', background: CARD_BACKGROUND })
      // The cards round their corners, and a corner left transparent is a
      // corner the reader's client fills in for itself.
      .flatten({ background: CARD_BACKGROUND })
      .png({ compressionLevel: 9 })
      .toFile(outPath);

    return true;
  } catch (error) {
    console.warn(`   Could not render ${path.basename(outPath)}: ${error.message}`);
    return false;
  }
}

/**
 * Pick the card that best represents the diary in a share preview: the profile
 * card first, then the most recent year, then whatever is there.
 *
 * @param {Array<object>} assets - Output of `buildAssets`
 * @returns {object|null}
 */
export function previewAsset(assets) {
  return assets.find(asset => asset.kind === 'profile')
    || assets.find(asset => asset.kind === 'year')
    || assets[0]
    || null;
}

/**
 * Copy a directory tree. Node 20 has `fs.cpSync`, which is all this needs.
 *
 * @param {string} from
 * @param {string} to
 */
function copyTree(from, to) {
  fs.cpSync(from, to, { recursive: true });
}

async function main() {
  const imagesDir = path.join(ROOT, 'images');
  const outDir = path.join(ROOT, '_site');

  if (!fs.existsSync(imagesDir)) {
    console.error('No images/ directory — run the generator before building the site.');
    process.exit(1);
  }

  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  copyTree(path.join(ROOT, 'site'), outDir);
  copyTree(imagesDir, path.join(outDir, 'images'));

  // The page sets its own type in Inter, the same family the SVGs embed, so it
  // is served from the repository rather than fetched from a font CDN.
  const fontsOut = path.join(outDir, 'fonts');
  fs.mkdirSync(fontsOut, { recursive: true });
  for (const name of fs.readdirSync(path.join(ROOT, 'fonts'))) {
    if (!name.endsWith('.woff2') && name !== 'LICENSE.txt') continue;
    fs.copyFileSync(path.join(ROOT, 'fonts', name), path.join(fontsOut, name));
  }

  const filenames = fs.readdirSync(imagesDir);
  const assets = buildAssets(filenames, name => fs.readFileSync(path.join(imagesDir, name), 'utf8'));

  const dataPath = path.join(imagesDir, 'letterboxd-data.json');
  const data = fs.existsSync(dataPath) ? JSON.parse(fs.readFileSync(dataPath, 'utf8')) : null;

  const repository = process.env.GITHUB_REPOSITORY || 'nichtlegacy/letterboxd-graph';
  const branch = process.env.GITHUB_REF_NAME || 'main';

  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify({
    repository,
    branch,
    rawBase: `https://raw.githubusercontent.com/${repository}/${branch}`,
    export: 'images/letterboxd-data.json',
    assets
  }, null, 2));

  const slim = data ? slimData(data) : null;
  if (slim) fs.writeFileSync(path.join(outDir, 'data.json'), JSON.stringify(slim));

  // Pages runs no Jekyll here, and its default build would drop the underscore
  // prefixed paths some tooling writes.
  fs.writeFileSync(path.join(outDir, '.nojekyll'), '');

  // Everything a crawler sees. It reads the served HTML and stops there, so the
  // figures have to be in the file rather than fetched by the page.
  const base = siteBase(process.env);

  const preview = previewAsset(assets);
  const previewSource = preview?.svg.dark || preview?.svg.light;
  const wrotePreview = previewSource
    && await rasterise(path.join(outDir, previewSource), path.join(outDir, 'og.png'), OG_SIZE);

  await rasterise(path.join(outDir, 'favicon.svg'), path.join(outDir, 'apple-touch-icon.png'), TOUCH_ICON_SIZE);

  const indexPath = path.join(outDir, 'index.html');
  fs.writeFileSync(indexPath, injectMeta(
    fs.readFileSync(indexPath, 'utf8'),
    renderMeta({ base, data: slim, repository, image: wrotePreview ? 'og.png' : null, imageSize: OG_SIZE })
  ));

  fs.writeFileSync(path.join(outDir, 'sitemap.xml'), renderSitemap(base, slim?.generatedAt || null));
  fs.writeFileSync(path.join(outDir, 'robots.txt'), renderRobots(base));

  console.log(`Built _site/ with ${assets.length} asset${assets.length === 1 ? '' : 's'}:`);
  for (const asset of assets) console.log(`   ${asset.kind.padEnd(8)} ${asset.label}`);
  console.log(`   served from ${base}`);
  if (!data) console.warn('   letterboxd-data.json missing — the page will render without figures');
  if (!wrotePreview) console.warn('   no og.png — shares will fall back to a link with no preview');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
