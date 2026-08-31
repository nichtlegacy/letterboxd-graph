/**
 * Persistent film-details cache
 *
 * Film pages are decorative — poster, runtime, community rating — but they cost
 * one request each. Cards only need the 20-30 films that actually make a list,
 * so a naïve run fetches the same 30 every time. With the cache the second run
 * hits the network only for films not seen before (or when the entry is stale).
 *
 * Stored as `images/.film-cache.json` next to the SVGs so it is committed and
 * therefore shared across runner instances. The file is JSON, not a binary
 * store, so it diffs readably and survives a checkout without extra tooling.
 *
 * Keyed by the canonical film URL (`https://letterboxd.com/film/<slug>/`) so
 * that `/user/film/<slug>/2/` and `/film/<slug>/` collapse to one entry.
 */

import fs from 'fs';
import path from 'path';

import { canonicalFilmUrl } from './fetcher.js';

const CACHE_VERSION = 1;
// Entries older than this are re-fetched so poster/rating drift is eventually
// picked up, but a daily run does not churn them.
const STALE_MS = 30 * 24 * 60 * 60 * 1000;

export function cacheFilePath(outputDir) {
  return path.join(outputDir, '.film-cache.json');
}

export function loadFilmCache(outputDir) {
  const file = cacheFilePath(outputDir);
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed.version !== CACHE_VERSION || typeof parsed.films !== 'object') {
      return { version: CACHE_VERSION, films: {} };
    }
    return parsed;
  } catch {
    return { version: CACHE_VERSION, films: {} };
  }
}

export function saveFilmCache(outputDir, cache) {
  const file = cacheFilePath(outputDir);
  // Keep the cache bounded in size — thousands of films accumulate over years.
  // Prune the oldest entries if it grows beyond a generous ceiling.
  const MAX_ENTRIES = 3000;
  const entries = Object.entries(cache.films || {});
  if (entries.length > MAX_ENTRIES) {
    entries.sort((a, b) => (a[1].fetchedAt || '').localeCompare(b[1].fetchedAt || ''));
    const toDelete = entries.length - MAX_ENTRIES;
    for (let i = 0; i < toDelete; i++) delete cache.films[entries[i][0]];
  }

  cache.version = CACHE_VERSION;
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(cache, null, 2));
}

function cacheKey(filmUrl) {
  return canonicalFilmUrl(filmUrl) || filmUrl;
}

export function getCachedDetail(cache, filmUrl) {
  const key = cacheKey(filmUrl);
  const entry = cache.films?.[key];
  if (!entry) return null;
  if (entry.fetchedAt) {
    const age = Date.now() - Date.parse(entry.fetchedAt);
    if (Number.isFinite(age) && age > STALE_MS) return null;
  }
  // Poster URLs can be missing — `null` is a valid cached value.
  return {
    poster: entry.poster ?? null,
    runtime: entry.runtime ?? null,
    averageRating: entry.averageRating ?? null,
  };
}

export function setCachedDetail(cache, filmUrl, detail) {
  const key = cacheKey(filmUrl);
  if (!key) return;
  cache.films[key] = {
    poster: detail.poster ?? null,
    runtime: detail.runtime ?? null,
    averageRating: detail.averageRating ?? null,
    fetchedAt: new Date().toISOString(),
  };
}
