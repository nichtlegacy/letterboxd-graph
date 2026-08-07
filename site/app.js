/**
 * Letterboxd Graph — Pages front end
 *
 * The page ships as empty section shells and fills itself from two files the
 * build step writes next to it: `manifest.json` (which SVGs exist, paired by
 * theme and measured) and `data.json` (the headline figures and recent films).
 * Nothing here knows which years or months were generated.
 *
 * Cards are embedded with <object> rather than <img>. An <img> receives no
 * mouse events, which is exactly why the tooltips do not work inside a README;
 * an <object> renders the SVG as its own document, so hover states, links and
 * the reveal animation all behave. It also keeps each card's ids and <style>
 * block to itself — inlining several of them into this document would collide,
 * since every card names its clip paths and gradients the same way.
 */

const THEME_MODES = ['system', 'light', 'dark'];
const STORAGE_KEY = 'lbg-theme';

const systemQuery = matchMedia('(prefers-color-scheme: light)');
const frames = new Set();

let mode = THEME_MODES.includes(localStorage.getItem(STORAGE_KEY))
  ? localStorage.getItem(STORAGE_KEY)
  : 'system';

/* ── Theme ────────────────────────────────────────────────────────────────── */

function activeTheme() {
  if (mode !== 'system') return mode;
  return systemQuery.matches ? 'light' : 'dark';
}

function applyTheme() {
  const theme = activeTheme();
  document.documentElement.dataset.theme = theme;

  const toggle = document.getElementById('theme-toggle');
  toggle.dataset.mode = mode;
  toggle.querySelector('[data-theme-label]').textContent =
    mode.charAt(0).toUpperCase() + mode.slice(1);
  toggle.setAttribute('aria-label', `Theme: ${mode}. Click to change.`);

  for (const frame of frames) frame.setTheme(theme);
}

function setupTheme() {
  document.getElementById('theme-toggle').addEventListener('click', () => {
    mode = THEME_MODES[(THEME_MODES.indexOf(mode) + 1) % THEME_MODES.length];
    localStorage.setItem(STORAGE_KEY, mode);
    applyTheme();
  });

  systemQuery.addEventListener('change', () => {
    if (mode === 'system') applyTheme();
  });

  applyTheme();
}

/* ── Helpers ──────────────────────────────────────────────────────────────── */

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function formatNumber(value) {
  return typeof value === 'number' ? value.toLocaleString('en-US') : '—';
}

function formatDate(iso, options) {
  const date = new Date(`${iso.length === 10 ? iso : iso.slice(0, 10)}T00:00:00Z`);
  return date.toLocaleDateString('en-GB', { timeZone: 'UTC', ...options });
}

function stars(rating) {
  if (!rating) return '';
  return '★'.repeat(Math.floor(rating)) + (rating % 1 ? '½' : '');
}

let toastTimer = null;

function toast(message) {
  const node = document.querySelector('[data-toast]');
  node.textContent = message;
  node.hidden = false;

  requestAnimationFrame(() => node.classList.add('is-visible'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    node.classList.remove('is-visible');
    toastTimer = setTimeout(() => { node.hidden = true; }, 250);
  }, 2000);
}

/* ── Frames ───────────────────────────────────────────────────────────────── */

const lazy = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    lazy.unobserve(entry.target);
    entry.target.__load?.();
  }
}, { rootMargin: '300px' });

/**
 * Build one card frame: the embed, its filename and the two actions under it.
 * The embed is only fetched once the frame is close to the viewport — the SVGs
 * carry inlined fonts and poster art and run to a few hundred kilobytes each.
 *
 * @param {object} asset - Manifest entry
 * @param {object} manifest - Full manifest, for the raw URL base
 * @returns {HTMLElement}
 */
function createFrame(asset, manifest) {
  const frame = el('figure', 'frame');
  const media = el('div', 'frame-media');
  media.style.aspectRatio = `${asset.width} / ${asset.height}`;

  const foot = el('figcaption', 'frame-foot');
  const file = el('span', 'frame-file');
  const actions = el('span', 'frame-actions');

  const open = el('a', 'chip', 'Open SVG');
  open.target = '_blank';
  open.rel = 'noopener';

  const copy = el('button', 'chip', 'Copy embed');
  copy.type = 'button';

  actions.append(open, copy);
  foot.append(file, actions);
  frame.append(media, foot);

  let theme = activeTheme();
  let loaded = false;

  const embed = () => {
    media.classList.remove('is-loaded');
    media.replaceChildren();

    const object = document.createElement('object');
    object.type = 'image/svg+xml';
    object.data = asset.svg[theme];
    object.setAttribute('aria-label', asset.label);

    // The generated links carry no target, so inside an <object> they would
    // navigate the embed itself. Same origin, so they can be retargeted once
    // the document is there.
    object.addEventListener('load', () => {
      media.classList.add('is-loaded');
      const doc = object.contentDocument;
      if (!doc) return;

      for (const link of doc.querySelectorAll('a')) {
        link.setAttribute('target', '_blank');
        link.setAttribute('rel', 'noopener');
      }
    });

    const fallback = el('img');
    fallback.src = asset.svg[theme];
    fallback.alt = asset.label;
    object.append(fallback);

    media.append(object);
  };

  const paint = () => {
    file.textContent = asset.svg[theme];
    open.href = asset.svg[theme];
    if (loaded) embed();
  };

  frame.__load = () => {
    loaded = true;
    embed();
  };

  copy.addEventListener('click', async () => {
    const base = manifest.rawBase;
    const snippet = [
      '<picture>',
      `  <source media="(prefers-color-scheme: dark)" srcset="${base}/${asset.svg.dark}">`,
      `  <source media="(prefers-color-scheme: light)" srcset="${base}/${asset.svg.light}">`,
      `  <img alt="Letterboxd ${asset.label.toLowerCase()}" src="${base}/${asset.svg.light}" width="100%">`,
      '</picture>'
    ].join('\n');

    try {
      await navigator.clipboard.writeText(snippet);
      toast('Embed copied to clipboard');
    } catch {
      toast('Clipboard blocked — open the SVG instead');
    }
  });

  frames.add({
    setTheme(next) {
      if (next === theme) return;
      theme = next;
      paint();
    }
  });

  paint();
  lazy.observe(frame);
  return frame;
}

/**
 * Render a section: one frame if the kind has a single asset, otherwise a tab
 * strip with one frame per period and only the selected one mounted.
 *
 * @param {HTMLElement} section
 * @param {Array<object>} assets
 * @param {object} manifest
 */
function renderSection(section, assets, manifest) {
  if (!assets.length) return;

  const body = section.querySelector('.section-body');
  section.hidden = false;

  if (assets.length === 1) {
    body.append(createFrame(assets[0], manifest));
    return;
  }

  const tabs = el('div', 'tabs');
  tabs.setAttribute('role', 'tablist');

  const built = assets.map((asset) => {
    const frame = createFrame(asset, manifest);
    frame.hidden = true;
    return frame;
  });

  assets.forEach((asset, index) => {
    const tab = el('button', 'tab', asset.label);
    tab.type = 'button';
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', String(index === 0));

    tab.addEventListener('click', () => {
      for (const other of tabs.children) other.setAttribute('aria-selected', 'false');
      tab.setAttribute('aria-selected', 'true');
      built.forEach((frame, position) => { frame.hidden = position !== index; });
    });

    tabs.append(tab);
  });

  built[0].hidden = false;
  body.append(tabs, ...built);
}

/* ── Data ─────────────────────────────────────────────────────────────────── */

const STAT_LABELS = {
  films: 'Films',
  daysActive: 'Days active',
  streak: 'Longest streak',
  rewatches: 'Rewatches',
  liked: 'Liked'
};

function renderHero(data, manifest) {
  const profile = `https://letterboxd.com/${data.user}/`;

  document.querySelector('[data-hero-title]').textContent = `@${data.user}`;
  document.title = `@${data.user} — Letterboxd Graph`;
  document.querySelector('[data-profile-link]').href = profile;

  const years = data.years?.length ? data.years.slice().sort((a, b) => a - b) : [];
  const span = years.length > 1 ? `${years[0]}–${years.at(-1)}` : years[0];
  document.querySelector('[data-hero-eyebrow]').textContent =
    span ? `Film diary · ${span}` : 'Film diary';

  for (const link of document.querySelectorAll('[data-repo-link]')) {
    link.href = `https://github.com/${manifest.repository}`;
  }
  document.querySelector('[data-export-link]').href = manifest.export;

  if (data.generatedAt) {
    const stamp = new Date(data.generatedAt);
    document.querySelector('[data-generated]').textContent =
      `Last generated ${stamp.toLocaleString('en-GB', { timeZone: 'UTC', dateStyle: 'medium', timeStyle: 'short' })} UTC.`;
  }
}

function renderStats(stats) {
  if (!stats) return;

  const list = document.querySelector('[data-stats]');
  for (const [key, label] of Object.entries(STAT_LABELS)) {
    if (stats[key] === undefined) continue;

    const group = el('div');
    group.append(el('dd', null, formatNumber(stats[key])), el('dt', null, label));
    list.append(group);
  }

  list.hidden = false;
}

function renderDiary(recent) {
  if (!recent?.length) return;

  const list = document.querySelector('[data-diary-list]');

  for (const entry of recent) {
    const row = el('li', 'diary-row');
    row.append(el('span', 'diary-date', formatDate(entry.date, { day: '2-digit', month: 'short' })));

    const main = el('div', 'diary-main');
    const title = entry.url ? el('a', 'diary-title', entry.title) : el('span', 'diary-title', entry.title);
    if (entry.url) {
      title.href = entry.url;
      title.target = '_blank';
      title.rel = 'noopener';
    }
    main.append(title);

    if (entry.year) main.append(el('span', 'diary-year', entry.year));

    const markers = el('span', 'markers');
    if (entry.rewatch) {
      const mark = el('span', 'marker marker-rewatch', '↻');
      mark.title = 'Rewatch';
      markers.append(mark);
    }
    if (entry.liked) {
      const mark = el('span', 'marker marker-like', '♥');
      mark.title = 'Liked';
      markers.append(mark);
    }
    if (markers.childElementCount) main.append(markers);

    const rating = el('span', 'diary-rating', entry.rating ? stars(entry.rating) : '—');
    if (!entry.rating) rating.classList.add('is-empty');
    rating.title = entry.rating ? `${entry.rating} out of 5` : 'Not rated';

    row.append(main, rating);
    list.append(row);
  }

  document.querySelector('[data-diary]').hidden = false;
}

/* ── Scroll spy ───────────────────────────────────────────────────────────── */

function setupScrollSpy() {
  const links = [...document.querySelectorAll('.nav-links a')];
  const sections = links
    .map(link => document.querySelector(link.getAttribute('href')))
    .filter(Boolean);

  const spy = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      for (const link of links) {
        link.classList.toggle('is-active', link.getAttribute('href') === `#${entry.target.id}`);
      }
    }
  }, { rootMargin: '-56px 0px -70% 0px' });

  for (const section of sections) spy.observe(section);
}

/* ── Boot ─────────────────────────────────────────────────────────────────── */

async function main() {
  setupTheme();

  const [manifest, data] = await Promise.all([
    fetch('manifest.json').then(response => response.json()),
    fetch('data.json').then(response => response.json()).catch(() => null)
  ]);

  if (data) {
    renderHero(data, manifest);
    renderStats(data.stats);
    renderDiary(data.recent);
  }

  for (const section of document.querySelectorAll('[data-section]')) {
    renderSection(section, manifest.assets.filter(asset => asset.kind === section.dataset.section), manifest);
  }

  setupScrollSpy();
}

main().catch((error) => {
  console.error(error);
  document.querySelector('[data-hero-eyebrow]').textContent =
    'Could not load the generated files';
});
