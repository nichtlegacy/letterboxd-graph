/**
 * Letterboxd Graph — diary page
 *
 * The complete diary, laid out the way Letterboxd lays out its own: entries
 * grouped under the month they were watched, a day number down the left, and
 * the film, its release year, the rating and the marks across the row.
 *
 * Everything is filtered and sorted in the browser from `diary.json` — the full
 * cut the build step writes beside the slim `data.json` the front page reads.
 * Nothing here knows which years or ratings the diary contains; every option is
 * read off the data.
 *
 * Filters are mirrored into the query string, so a filtered view is a URL that
 * can be shared or bookmarked.
 */

const STORAGE_KEY = 'lbg-theme';
const PAGE_SIZE = 100;
const SEARCH_DEBOUNCE = 120;

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const DEFAULTS = {
  q: '',
  year: '',
  month: '',
  released: '',
  rating: '',
  rewatch: false,
  liked: false,
  reviewed: false,
  sort: 'date-desc'
};

const systemQuery = matchMedia('(prefers-color-scheme: light)');
const storedTheme = localStorage.getItem(STORAGE_KEY);
let pageTheme = storedTheme === 'dark' || storedTheme === 'light'
  ? storedTheme
  : (systemQuery.matches ? 'light' : 'dark');

/* ── Theme ────────────────────────────────────────────────────────────────── */

function applyTheme() {
  document.documentElement.dataset.theme = pageTheme;

  const toggle = document.getElementById('theme-toggle');
  const next = pageTheme === 'dark' ? 'light' : 'dark';
  toggle.dataset.mode = pageTheme;
  toggle.querySelector('[data-theme-label]').textContent =
    pageTheme.charAt(0).toUpperCase() + pageTheme.slice(1);
  toggle.setAttribute('aria-label', `Theme: ${pageTheme}. Switch to ${next}.`);
}

function setupTheme() {
  document.getElementById('theme-toggle').addEventListener('click', () => {
    pageTheme = pageTheme === 'dark' ? 'light' : 'dark';
    localStorage.setItem(STORAGE_KEY, pageTheme);
    applyTheme();
  });

  systemQuery.addEventListener('change', () => {
    if (!localStorage.getItem(STORAGE_KEY)) {
      pageTheme = systemQuery.matches ? 'light' : 'dark';
      applyTheme();
    }
  });

  applyTheme();
}

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

/* ── Back to top ──────────────────────────────────────────────────────────── */

/**
 * The button the front page carries, on the same threshold and with the same
 * appearance — it reads the shared `.to-top` rules. A diary paged out to six
 * hundred rows is a long way back up.
 *
 * The class is toggled rather than the style, so the fade is the stylesheet's,
 * and it is only touched when it actually changes: this runs on every scroll.
 */
function setupToTop() {
  const button = document.querySelector('[data-to-top]');
  let queued = false;

  const update = () => {
    queued = false;
    const show = window.scrollY > window.innerHeight * 0.6;
    if (show !== button.classList.contains('is-visible')) {
      button.classList.toggle('is-visible', show);
    }
  };

  window.addEventListener('scroll', () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(update);
  }, { passive: true });

  button.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: reducedMotion.matches ? 'auto' : 'smooth' });
  });

  update();
}

/* ── Helpers ──────────────────────────────────────────────────────────────── */

const $ = (selector) => document.querySelector(selector);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * An `<svg><use>` pointing at one of the symbols the page defines once.
 *
 * @param {string} name - Symbol id without its hash
 * @param {string} [className]
 */
function icon(name, className) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  if (className) svg.setAttribute('class', className);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');

  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#${name}`);
  svg.append(use);

  return svg;
}

const count = (value) => value.toLocaleString('en-GB');

/** Letterboxd writes half stars as a half glyph rather than a number. */
function stars(rating) {
  if (!rating) return '';
  return '★'.repeat(Math.floor(rating)) + (rating % 1 ? '½' : '');
}

const utc = (iso) => new Date(`${String(iso).slice(0, 10)}T00:00:00Z`);

const formatDate = (iso) => utc(iso)
  .toLocaleDateString('en-GB', { timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric' });

const formatWeekday = (iso) => utc(iso)
  .toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'short' });

const monthLabel = (iso) => `${MONTHS[Number(String(iso).slice(5, 7)) - 1]} ${String(iso).slice(0, 4)}`;

/* ── State ────────────────────────────────────────────────────────────────── */

let entries = [];
let shown = PAGE_SIZE;
let user = null;

const state = { ...DEFAULTS };

const byTitle = (a, b) => String(a.title || '').localeCompare(String(b.title || ''), 'en');
const byDateThenTitle = (a, b) => b.date.localeCompare(a.date) || byTitle(a, b);

// Unrated entries sort last whichever way the rating column runs, so the sort
// reads as "best first" and "worst first" rather than "blanks first".
const SORTS = {
  'date-desc': (a, b) => b.date.localeCompare(a.date) || byTitle(a, b),
  'date-asc': (a, b) => a.date.localeCompare(b.date) || byTitle(a, b),
  'title-asc': (a, b) => byTitle(a, b) || b.date.localeCompare(a.date),
  'title-desc': (a, b) => byTitle(b, a) || b.date.localeCompare(a.date),
  'rating-desc': (a, b) => (b.rating ?? -1) - (a.rating ?? -1) || byDateThenTitle(a, b),
  'rating-asc': (a, b) => (a.rating ?? 99) - (b.rating ?? 99) || byDateThenTitle(a, b),
  'released-desc': (a, b) => (Number(b.year) || 0) - (Number(a.year) || 0) || byDateThenTitle(a, b),
  'released-asc': (a, b) => (Number(a.year) || 99999) - (Number(b.year) || 99999) || byDateThenTitle(a, b)
};

const groupsByMonth = () => state.sort === 'date-desc' || state.sort === 'date-asc';

function isUntouched() {
  return Object.keys(DEFAULTS).every(key => state[key] === DEFAULTS[key]);
}

/* ── Filtering ────────────────────────────────────────────────────────────── */

function filtered() {
  const q = state.q.trim().toLowerCase();

  const matches = entries.filter((entry) => {
    if (q && !String(entry.title || '').toLowerCase().includes(q)) return false;
    if (state.year && entry.date.slice(0, 4) !== state.year) return false;
    if (state.month && entry.date.slice(5, 7) !== state.month) return false;
    if (state.released && String(entry.year || '') !== state.released) return false;
    if (state.rating && !(typeof entry.rating === 'number' && entry.rating >= Number(state.rating))) return false;
    if (state.rewatch && !entry.rewatch) return false;
    if (state.liked && !entry.liked) return false;
    if (state.reviewed && !entry.reviewed) return false;
    return true;
  });

  return matches.sort(SORTS[state.sort] || SORTS['date-desc']);
}

/* ── Rendering: a row ─────────────────────────────────────────────────────── */

/**
 * The three marks, each in a fixed slot so they line up as columns down the
 * table even when a row carries none of them.
 */
function marksCell(entry) {
  const cell = el('td', 'diary-marks');

  const slot = (present, name, className, label, href) => {
    if (!present) {
      const empty = el('span', 'diary-mark is-empty');
      empty.setAttribute('aria-hidden', 'true');
      return empty;
    }

    const mark = el(href ? 'a' : 'span', `diary-mark ${className}`);
    mark.append(icon(name));
    mark.setAttribute('aria-label', label);

    if (href) {
      mark.href = href;
      mark.target = '_blank';
      mark.rel = 'noopener';
      mark.title = label;
    } else {
      mark.setAttribute('role', 'img');
      mark.title = label;
    }

    return mark;
  };

  cell.append(
    slot(entry.liked, 'i-heart', 'is-like', 'Liked'),
    slot(entry.rewatch, 'i-rewatch', 'is-rewatch', 'Rewatch'),
    slot(entry.reviewed, 'i-review', 'is-review', 'Review', entry.reviewUrl || null)
  );

  return cell;
}

function ratingCell(entry) {
  const cell = el('td', 'diary-rating');

  if (typeof entry.rating !== 'number') {
    const none = el('span', 'diary-rating-none', '—');
    none.setAttribute('role', 'img');
    none.setAttribute('aria-label', 'Not rated');
    cell.append(none);
    return cell;
  }

  const value = el('span', 'diary-stars', stars(entry.rating));
  value.setAttribute('role', 'img');
  value.setAttribute('aria-label', `${entry.rating} out of 5`);
  cell.append(value);

  return cell;
}

/**
 * @param {object} entry
 * @param {boolean} grouped - Whether a month heading carries the month, which
 *   is what decides between a day number and the full date in the left cell.
 */
function entryRow(entry, grouped) {
  const row = el('tr', 'diary-entry');

  const date = el('td', 'diary-when');

  // Without a username there is no day page to point at, so the date stays
  // text rather than becoming a link to nowhere.
  const link = el(user ? 'a' : 'span', 'diary-when-link');
  if (user) {
    link.href = `https://letterboxd.com/${user}/films/diary/for/${entry.date.slice(0, 4)}/${entry.date.slice(5, 7)}/${entry.date.slice(8, 10)}/`;
    link.target = '_blank';
    link.rel = 'noopener';
    link.setAttribute('aria-label', `Diary for ${formatDate(entry.date)}`);
  }

  if (grouped) {
    link.append(
      el('span', 'diary-day', String(Number(entry.date.slice(8, 10)))),
      el('span', 'diary-weekday', formatWeekday(entry.date))
    );
  } else {
    link.append(el('span', 'diary-full-date', formatDate(entry.date)));
  }

  date.append(link);

  const film = el('td', 'diary-film');
  const title = entry.url
    ? Object.assign(el('a', 'diary-title', entry.title), { href: entry.url, target: '_blank', rel: 'noopener' })
    : el('span', 'diary-title', entry.title);
  film.append(title);

  // On a phone the released column is folded into the title block, where it
  // reads as part of the film rather than as a column that fell off the table.
  if (entry.year) film.append(el('span', 'diary-film-year', entry.year));

  const released = el('td', 'diary-released', entry.year || '—');

  row.append(date, film, released, ratingCell(entry), marksCell(entry));
  return row;
}

/* ── Rendering: the table ─────────────────────────────────────────────────── */

function tableHead() {
  const head = el('thead');
  const row = el('tr');

  for (const [className, label] of [
    ['diary-col-when', 'Watched'],
    ['diary-col-film', 'Film'],
    ['diary-col-released', 'Released'],
    ['diary-col-rating', 'Rating'],
    ['diary-col-marks', 'Marks']
  ]) {
    const cell = el('th', className, label);
    cell.scope = 'col';
    row.append(cell);
  }

  head.append(row);
  return head;
}

function monthRow(iso) {
  const row = el('tr', 'diary-month');
  const cell = el('th', null);
  cell.colSpan = 5;
  cell.scope = 'rowgroup';
  cell.append(el('span', 'diary-month-label', monthLabel(iso)));
  row.append(cell);
  return row;
}

// The tbody currently on the page, and the last month it already carries a
// heading for, so showing another page appends to it rather than redrawing
// rows the reader has been looking at.
let tableBody = null;
let lastMonth = null;

function fillRows(list, from, to, marksNew) {
  const grouped = groupsByMonth();
  const fragment = document.createDocumentFragment();

  for (const entry of list.slice(from, to)) {
    const month = entry.date.slice(0, 7);

    if (grouped && month !== lastMonth) {
      lastMonth = month;
      fragment.append(monthRow(entry.date));
    }

    const row = entryRow(entry, grouped);
    if (marksNew) row.classList.add('is-new');
    fragment.append(row);
  }

  tableBody.append(fragment);
}

function renderTable(list) {
  const host = $('[data-table]');
  tableBody = null;
  lastMonth = null;

  if (!list.length) {
    host.replaceChildren(emptyState());
    return;
  }

  const table = el('table', 'diary-table');
  tableBody = el('tbody');
  fillRows(list, 0, shown, false);
  table.append(tableHead(), tableBody);
  host.replaceChildren(table);
}

/** The next page, appended in place. */
function growTable(list, from) {
  if (!tableBody) {
    renderTable(list);
    return;
  }

  fillRows(list, from, shown, true);
}

function emptyState() {
  const empty = el('div', 'diary-empty');
  empty.append(
    el('p', 'diary-empty-title', 'No entries match these filters'),
    el('p', 'diary-empty-note', 'Loosen a filter, or clear them all to see the whole diary again.')
  );

  const clear = el('button', 'diary-more', 'Clear filters');
  clear.type = 'button';
  clear.addEventListener('click', () => {
    resetFilters();
    // This button is inside the table that resetFilters() replaces, so focus
    // would otherwise fall back to the document.
    $('[data-filter-q]').focus();
  });
  empty.append(clear);

  return empty;
}

/* ── Rendering: the counts and the pill values ────────────────────────────── */

function renderSummary() {
  const summary = $('[data-diary-summary]');
  const total = entries.length;

  if (!total) {
    summary.textContent = 'The diary is empty.';
    return;
  }

  const oldest = entries[entries.length - 1].date;
  const newest = entries[0].date;

  summary.replaceChildren(
    document.createTextNode(`${formatDate(oldest)} to ${formatDate(newest)}. `)
  );

  const legend = el('span', 'diary-legend');
  for (const [name, className, label] of [
    ['i-heart', 'is-like', 'like'],
    ['i-rewatch', 'is-rewatch', 'rewatch'],
    ['i-review', 'is-review', 'review']
  ]) {
    const item = el('span', 'diary-legend-item');
    item.append(icon(name, `diary-legend-icon ${className}`), el('span', null, label));
    legend.append(item);
  }

  summary.append(legend);
}

function renderResult(list) {
  const result = $('[data-result]');
  const total = entries.length;
  const visible = Math.min(shown, list.length);

  result.hidden = false;
  result.textContent = list.length === total
    ? `Showing ${count(visible)} of ${count(total)} entries`
    : `${count(list.length)} of ${count(total)} entries match — showing ${count(visible)}`;
}

/**
 * The value each pill shows. The select that carries it is invisible — it is
 * stretched across the pill so every part of it opens the picker — so the page
 * draws the chosen option's own label here.
 */
function syncPillValues() {
  for (const select of document.querySelectorAll('.diary-pill select')) {
    const value = select.closest('.diary-pill').querySelector('[data-pill-value]');
    if (value) value.textContent = select.selectedOptions[0]?.textContent || '';
  }
}

/** The count and the pagination button, which both follow the list's length. */
function renderFooter(list) {
  renderResult(list);

  const more = $('[data-more]');
  const remaining = list.length - shown;
  more.hidden = remaining <= 0;
  if (remaining > 0) more.textContent = `Show ${count(Math.min(PAGE_SIZE, remaining))} more`;
}

function render() {
  const list = filtered();

  syncPillValues();
  renderTable(list);
  renderFooter(list);

  $('[data-reset]').hidden = isUntouched();
  syncUrl();
}

function rerender() {
  shown = PAGE_SIZE;
  render();
}

/* ── Controls ─────────────────────────────────────────────────────────────── */

function fillSelect(select, options, allLabel) {
  // The empty value has to be spelled out: an option with no `value` reports
  // its own text instead, so `select.value = ''` would match nothing and drop
  // the control to selectedIndex -1, showing blank rather than "Any month".
  const all = el('option', null, allLabel);
  all.value = '';
  select.replaceChildren(all);

  for (const { value, label } of options) {
    const option = el('option', null, label);
    option.value = value;
    select.append(option);
  }
}

/**
 * The year strip, the way Letterboxd tabs its diary by year. Built from the
 * data, newest first, with the whole diary as the first option.
 */
function buildYears() {
  const host = $('[data-years]');
  const years = [...new Set(entries.map(entry => entry.date.slice(0, 4)))].sort().reverse();

  host.replaceChildren();

  for (const { value, label } of [{ value: '', label: 'All years' }, ...years.map(year => ({ value: year, label: year }))]) {
    const tab = el('button', 'diary-year-tab', label);
    tab.type = 'button';
    tab.dataset.year = value;
    tab.addEventListener('click', () => {
      state.year = value;
      syncControls();
      rerender();
    });
    host.append(tab);
  }
}

function markYears() {
  for (const tab of document.querySelectorAll('[data-years] .diary-year-tab')) {
    const active = tab.dataset.year === state.year;
    tab.classList.toggle('is-active', active);
    tab.setAttribute('aria-pressed', String(active));
  }
}

/** Push `state` back into every control, after a reset or a URL read. */
function syncControls() {
  const search = $('[data-filter-q]');
  search.value = state.q;
  $('[data-search-clear]').hidden = !state.q;

  $('[data-filter-month]').value = state.month;
  $('[data-filter-released]').value = state.released;
  $('[data-filter-rating]').value = state.rating;
  $('[data-filter-sort]').value = state.sort;

  for (const [selector, key] of [
    ['[data-filter-rewatch]', 'rewatch'],
    ['[data-filter-liked]', 'liked'],
    ['[data-filter-reviewed]', 'reviewed']
  ]) {
    const button = $(selector);
    button.classList.toggle('is-active', state[key]);
    button.setAttribute('aria-pressed', String(state[key]));
  }

  markYears();
}

function resetFilters() {
  Object.assign(state, DEFAULTS);
  syncControls();
  rerender();
}

function setupControls() {
  const search = $('[data-filter-q]');
  const monthSelect = $('[data-filter-month]');
  const releasedSelect = $('[data-filter-released]');
  const ratingSelect = $('[data-filter-rating]');
  const sortSelect = $('[data-filter-sort]');

  const released = [...new Set(entries.map(entry => String(entry.year || '')).filter(Boolean))]
    .sort((a, b) => Number(b) - Number(a));

  buildYears();

  fillSelect(monthSelect, MONTHS.map((name, index) => ({
    value: String(index + 1).padStart(2, '0'),
    label: name
  })), 'Any month');

  fillSelect(releasedSelect, released.map(year => ({ value: year, label: year })), 'Any year');

  fillSelect(ratingSelect, [5, 4.5, 4, 3.5, 3, 2.5, 2, 1.5, 1, 0.5].map(rating => ({
    value: String(rating),
    label: `${stars(rating)} and up`
  })), 'Any rating');

  // Typing re-filters the whole diary, so it waits out a burst of keystrokes
  // rather than sorting a few hundred entries on every one.
  let searchTimer = null;
  search.addEventListener('input', () => {
    $('[data-search-clear]').hidden = !search.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.q = search.value;
      rerender();
    }, SEARCH_DEBOUNCE);
  });

  search.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !search.value) return;
    search.value = '';
    state.q = '';
    $('[data-search-clear]').hidden = true;
    rerender();
  });

  $('[data-search-clear]').addEventListener('click', () => {
    state.q = '';
    syncControls();
    rerender();
    search.focus();
  });

  for (const [select, key] of [
    [monthSelect, 'month'],
    [releasedSelect, 'released'],
    [ratingSelect, 'rating'],
    [sortSelect, 'sort']
  ]) {
    select.addEventListener('change', () => {
      state[key] = select.value;
      rerender();
    });
  }

  for (const [selector, key] of [
    ['[data-filter-rewatch]', 'rewatch'],
    ['[data-filter-liked]', 'liked'],
    ['[data-filter-reviewed]', 'reviewed']
  ]) {
    $(selector).addEventListener('click', () => {
      state[key] = !state[key];
      syncControls();
      rerender();
    });
  }

  $('[data-reset]').addEventListener('click', () => resetFilters());

  $('[data-more]').addEventListener('click', () => {
    const list = filtered();
    const from = shown;
    shown += PAGE_SIZE;
    growTable(list, from);
    renderFooter(list);
  });

  // The toolbar is a form only so phones offer a search key; submitting it
  // would reload the page and lose the filters.
  $('[data-toolbar]').addEventListener('submit', (event) => event.preventDefault());

  // "/" is the search shortcut every list page has; it must not fire while the
  // reader is already typing somewhere.
  document.addEventListener('keydown', (event) => {
    if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
    const active = document.activeElement;
    if (active && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName)) return;
    event.preventDefault();
    search.focus();
    search.select();
  });
}

/* ── The URL ──────────────────────────────────────────────────────────────── */

function syncUrl() {
  const params = new URLSearchParams();

  if (state.q) params.set('q', state.q);
  if (state.year) params.set('year', state.year);
  if (state.month) params.set('month', state.month);
  if (state.released) params.set('released', state.released);
  if (state.rating) params.set('rating', state.rating);
  if (state.rewatch) params.set('rewatch', '1');
  if (state.liked) params.set('liked', '1');
  if (state.reviewed) params.set('reviewed', '1');
  if (state.sort !== DEFAULTS.sort) params.set('sort', state.sort);

  const query = params.toString();
  history.replaceState(null, '', query ? `${location.pathname}?${query}` : location.pathname);
}

function restoreFromUrl() {
  const params = new URLSearchParams(location.search);
  const read = (key) => params.get(key) || '';

  if (params.has('q')) state.q = read('q').slice(0, 100);
  if (/^\d{4}$/.test(read('year'))) state.year = read('year');
  if (/^(0[1-9]|1[0-2])$/.test(read('month'))) state.month = read('month');
  if (/^\d{4}$/.test(read('released'))) state.released = read('released');
  if (/^(0?\.5|[1-5](\.5)?)$/.test(read('rating'))) state.rating = read('rating');
  if (read('rewatch') === '1') state.rewatch = true;
  if (read('liked') === '1') state.liked = true;
  if (read('reviewed') === '1') state.reviewed = true;
  if (SORTS[read('sort')]) state.sort = read('sort');
}

/* ── Boot ─────────────────────────────────────────────────────────────────── */

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`${url} returned ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function showLoadError() {
  $('[data-diary-summary]').textContent = 'The generated diary data is currently unavailable.';
  const errorState = $('[data-load-error]');
  errorState.hidden = false;
  errorState.querySelector('[data-retry]').addEventListener('click', () => location.reload(), { once: true });
}

async function main() {
  setupTheme();
  setupToTop();

  const data = await fetchJson('diary.json');
  if (!data || !Array.isArray(data.entries)) throw new Error('Diary data is incomplete');

  // The build step writes them newest first; sorting here means the page does
  // not depend on that promise holding.
  entries = [...data.entries].sort((a, b) => b.date.localeCompare(a.date));
  user = data.user || null;

  if (user) {
    for (const anchor of document.querySelectorAll('[data-profile-link]')) {
      anchor.href = `https://letterboxd.com/${user}/`;
    }
    for (const anchor of document.querySelectorAll('[data-diary-link]')) {
      anchor.href = `https://letterboxd.com/${user}/films/diary/`;
    }
  }

  if (data.generatedAt) {
    const stamp = new Date(data.generatedAt);
    $('[data-generated]').textContent =
      `Last generated ${stamp.toLocaleString('en-GB', { timeZone: 'UTC', dateStyle: 'medium', timeStyle: 'short' })} UTC.`;
  }

  setupControls();
  restoreFromUrl();
  syncControls();
  renderSummary();
  render();

  $('[data-toolbar]').hidden = false;
}

main().catch((error) => {
  console.error(error);
  showLoadError();
});
