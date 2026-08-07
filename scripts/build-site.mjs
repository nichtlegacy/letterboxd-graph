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

/**
 * Copy a directory tree. Node 20 has `fs.cpSync`, which is all this needs.
 *
 * @param {string} from
 * @param {string} to
 */
function copyTree(from, to) {
  fs.cpSync(from, to, { recursive: true });
}

function main() {
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

  if (data) fs.writeFileSync(path.join(outDir, 'data.json'), JSON.stringify(slimData(data)));

  // Pages runs no Jekyll here, and its default build would drop the underscore
  // prefixed paths some tooling writes.
  fs.writeFileSync(path.join(outDir, '.nojekyll'), '');

  console.log(`Built _site/ with ${assets.length} asset${assets.length === 1 ? '' : 's'}:`);
  for (const asset of assets) console.log(`   ${asset.kind.padEnd(8)} ${asset.label}`);
  if (!data) console.warn('   letterboxd-data.json missing — the page will render without figures');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
