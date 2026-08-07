/**
 * Letterboxd Graph — Pages front end
 *
 * The page ships as empty section shells and fills itself from two files the
 * build step writes next to it: `manifest.json` (which SVGs exist, paired by
 * theme and measured) and `data.json` (the figures, aggregated at build time).
 * Nothing here knows which years, months or milestones were generated.
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

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEKDAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

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

function formatDecimal(value, digits = 1) {
  return typeof value === 'number'
    ? value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
    : '—';
}

function formatDate(iso, options = { day: '2-digit', month: 'short', year: 'numeric' }) {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`)
    .toLocaleDateString('en-GB', { timeZone: 'UTC', ...options });
}

function formatMonth(iso) {
  return new Date(`${iso}-01T00:00:00Z`)
    .toLocaleDateString('en-GB', { timeZone: 'UTC', month: 'short', year: 'numeric' });
}

function stars(rating) {
  if (!rating) return '';
  return '★'.repeat(Math.floor(rating)) + (rating % 1 ? '½' : '');
}

/**
 * 1st, 2nd, 3rd, 11th — the exceptions in the teens included.
 *
 * @param {number} value
 * @returns {string}
 */
function ordinal(value) {
  const tens = value % 100;
  const ones = value % 10;
  if (tens >= 11 && tens <= 13) return `${value}th`;
  if (ones === 1) return `${value}st`;
  if (ones === 2) return `${value}nd`;
  if (ones === 3) return `${value}rd`;
  return `${value}th`;
}

function link(href, className, text) {
  const node = el('a', className, text);
  node.href = href;
  node.target = '_blank';
  node.rel = 'noopener';
  return node;
}

/* Line icons, 24×24, drawn in the current text colour. */
const ICONS = {
  open: ['M14 4h6v6', 'M20 4 11 13', 'M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6'],
  code: ['m9 8-4 4 4 4', 'm15 8 4 4-4 4'],
  clipboard: ['M9 4h6v3H9z', 'M15 5.5h2a1 1 0 0 1 1 1V19a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V6.5a1 1 0 0 1 1-1h2'],
  image: ['M4 6h16v12H4z', 'M4 15.5 8.5 11l3.5 3.5L15 12l5 4.5', 'M9 9.5h.01']
};

function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'icon');

  for (const d of ICONS[name]) {
    const path = document.createElementNS(svg.namespaceURI, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }

  return svg;
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

/* ── Charts ───────────────────────────────────────────────────────────────── */

/**
 * A column chart with a tooltip that follows the hovered bar. Used for the month
 * series and, in a smaller variant, for the weekday and rating distributions.
 *
 * A bar with an `href` becomes a link, which is what makes the rating
 * distribution more than a picture: every step has a diary page behind it.
 *
 * @param {HTMLElement} host - Element to render into
 * @param {Array<{value: number, label: string, meta?: string, caption?: string, href?: string}>} bars
 * @param {{variant?: string, axis?: [string, string]}} options
 */
function columnChart(host, bars, { variant = '', axis = null } = {}) {
  host.replaceChildren();
  if (!bars.length) return;

  const max = Math.max(1, ...bars.map(bar => bar.value));
  const plot = el('div', `plot ${variant}`.trim());
  const tooltip = el('div', 'chart-tip');
  tooltip.hidden = true;

  bars.forEach((bar) => {
    const column = bar.href ? link(bar.href, 'column') : el('div', 'column');
    const fill = el('span', 'column-fill');
    // A zero stays flat; everything else keeps a sliver so a single film is
    // still visible next to a month of thirty.
    fill.style.height = bar.value === 0 ? '0' : `${Math.max((bar.value / max) * 100, 3)}%`;
    if (bar.value === 0) column.classList.add('is-empty');
    column.append(fill);

    const show = () => {
      tooltip.replaceChildren(
        el('b', null, `${formatNumber(bar.value)} ${bar.value === 1 ? 'film' : 'films'}`),
        el('span', null, bar.label)
      );
      if (bar.meta) tooltip.append(el('span', 'muted', bar.meta));

      tooltip.hidden = false;
      plot.classList.add('is-hovered');
      column.classList.add('is-active');

      // Sit just above the bar rather than above the whole plot, and stay
      // inside it: a tooltip over the first column would otherwise hang off the
      // left edge, and one over a short bar would float far above it.
      const half = tooltip.offsetWidth / 2;
      const centre = column.offsetLeft + column.offsetWidth / 2;

      tooltip.style.left = `${Math.min(Math.max(centre, half), plot.clientWidth - half)}px`;
      tooltip.style.bottom = `${fill.offsetHeight + 10}px`;
    };

    const hide = () => {
      tooltip.hidden = true;
      plot.classList.remove('is-hovered');
      column.classList.remove('is-active');
    };

    column.addEventListener('mouseenter', show);
    column.addEventListener('mouseleave', hide);
    column.addEventListener('focus', show);
    column.addEventListener('blur', hide);

    if (bar.href) {
      column.setAttribute('aria-label', `${bar.label}: ${bar.value}. Open in the diary.`);
    } else {
      // A link is focusable already; a plain bar has to be made so.
      column.tabIndex = 0;
      column.setAttribute('role', 'img');
      column.setAttribute('aria-label', `${bar.label}: ${bar.value}`);
    }

    if (bar.caption) column.append(el('span', 'column-caption', bar.caption));
    plot.append(column);
  });

  plot.append(tooltip);
  host.append(plot);

  if (axis) {
    const scale = el('div', 'axis');
    scale.append(el('span', null, axis[0]), el('span', null, axis[1]));
    host.append(scale);
  }
}

/* ── All time ─────────────────────────────────────────────────────────────── */

function tile(label, value, meta, accent) {
  const node = el('div', `tile${accent ? ' is-accent' : ''}`);
  node.append(el('span', 'tile-label', label), el('span', 'tile-value', value));
  if (meta) node.append(el('span', 'tile-meta', meta));
  return node;
}

function renderAllTime(all, data, diary) {
  const section = document.querySelector('[data-alltime]');
  if (!all) return;

  document.querySelector('[data-alltime-title]').textContent =
    data.user ? `@${data.user} in numbers` : 'The diary in numbers';

  const note = document.querySelector('[data-alltime-note]');
  note.textContent = all.scope === 'all'
    ? `Every entry from ${formatDate(all.firstEntry)} to ${formatDate(all.lastEntry)}.`
    : `Covers ${formatDate(all.firstEntry)} to ${formatDate(all.lastEntry)} — the run fetched only the graph years, so this is not the whole diary.`;

  // Films watched is the profile's own figure and counts films ticked off
  // without a diary entry, which is why it outruns the entry count.
  const headline = [
    all.films
      ? tile('Films watched', formatNumber(all.films), `${formatNumber(all.entries)} of them dated in the diary`, true)
      : tile('Diary entries', formatNumber(all.entries), `${formatNumber(all.distinctFilms)} distinct films`, true),
    tile('Days active', formatNumber(all.daysActive), `${formatDecimal(all.perWeek)} films a week on average`),
    tile('Average rating', all.averageRating ? formatDecimal(all.averageRating, 2) : '—',
      `${formatNumber(all.rated)} of ${formatNumber(all.entries)} rated`)
  ];

  document.querySelector('[data-alltime-tiles]').replaceChildren(...headline);

  const strip = [
    ['Distinct films', formatNumber(all.distinctFilms)],
    ['Rewatches', formatNumber(all.rewatches)],
    ['Liked', formatNumber(all.liked)],
    ['Longest streak', `${formatNumber(all.streak?.length ?? 0)} days`]
  ].map(([label, value]) => {
    const node = el('div', 'strip-item');
    node.append(el('span', 'strip-label', label), el('span', 'strip-value', value));
    return node;
  });

  document.querySelector('[data-alltime-strip]').replaceChildren(...strip);

  const years = (all.perYear || []).slice().sort((a, b) => b.year - a.year);
  if (years.length > 1) {
    const busiest = Math.max(...years.map(year => year.films));
    const nodes = years.map((year) => {
      const node = diary
        ? link(`${diary}/for/${year.year}/`, 'year-cell')
        : el('div', 'year-cell');
      const track = el('span', 'year-track');
      const bar = el('span', 'year-bar');
      bar.style.width = `${Math.max((year.films / busiest) * 100, 2)}%`;
      track.append(bar);

      node.append(
        el('span', 'year-label', String(year.year)),
        track,
        el('span', 'year-count', `${formatNumber(year.films)} films · ${formatNumber(year.days)} days`)
      );
      return node;
    });

    document.querySelector('[data-alltime-years]').replaceChildren(...nodes);
  }

  section.hidden = false;
}

/* ── When you watched ─────────────────────────────────────────────────────── */

function renderWhen(all) {
  const series = all?.monthSeries || [];
  if (series.length < 2) return;

  columnChart(
    document.querySelector('[data-month-chart]'),
    series.map(point => ({ value: point.count, label: formatMonth(point.month) })),
    { axis: [formatMonth(series[0].month), formatMonth(series.at(-1).month)] }
  );

  const blocks = [
    ['Entries logged', formatNumber(all.entries)],
    ['Average per month', formatDecimal(all.perMonth)],
    ['Average per week', formatDecimal(all.perWeek)]
  ];

  const blockNodes = [];
  blocks.forEach(([label, value], index) => {
    if (index > 0) blockNodes.push(el('span', 'block-arrow', '→'));
    const node = el('div', 'block');
    node.append(el('span', 'block-value', value), el('span', 'block-label', label));
    blockNodes.push(node);
  });

  document.querySelector('[data-when-blocks]').replaceChildren(...blockNodes);

  const weekday = all.perWeekday || [];
  if (weekday.some(Boolean)) {
    columnChart(
      document.querySelector('[data-weekday-chart]'),
      weekday.map((count, index) => ({
        value: count,
        label: WEEKDAYS[index],
        caption: WEEKDAY_INITIALS[index]
      })),
      { variant: 'is-small' }
    );
  }

  const facts = [];
  if (all.busiestDay?.count > 1) {
    facts.push([`${all.busiestDay.count} films in a day`, formatDate(all.busiestDay.date)]);
  }
  if (all.streak?.length > 1) {
    facts.push([`${all.streak.length} days running`, `${formatDate(all.streak.startDate)} – ${formatDate(all.streak.endDate)}`]);
  }
  if (all.longestGap?.days > 1) {
    facts.push([`${all.longestGap.days} days quiet`, `${formatDate(all.longestGap.from)} – ${formatDate(all.longestGap.to)}`]);
  }

  document.querySelector('[data-when-facts]').replaceChildren(...facts.map(([value, meta]) => {
    const node = el('div', 'fact');
    node.append(el('span', 'fact-value', value), el('span', 'fact-meta', meta));
    return node;
  }));

  document.querySelector('[data-when]').hidden = false;
}

/* ── Ratings ──────────────────────────────────────────────────────────────── */

function renderRatings(all, diary) {
  const ratings = all?.ratings || [];
  if (!ratings.length) return;

  // Half-star steps with nothing on them still need their slot, or the shape of
  // the distribution is a lie.
  const counts = new Map(ratings.map(entry => [entry.rating, entry.count]));
  const buckets = Array.from({ length: 10 }, (_, index) => {
    const rating = (index + 1) / 2;
    const count = counts.get(rating) || 0;

    return {
      value: count,
      label: `${rating} out of 5`,
      caption: rating % 1 === 0 ? '★'.repeat(rating) : '',
      // Letterboxd writes a half star without its leading zero. A step nobody
      // ever gave leads to an empty page, so it stays a plain bar.
      href: diary && count ? `${diary}/rated/${String(rating).replace(/^0/, '')}/` : null
    };
  });

  columnChart(document.querySelector('[data-rating-chart]'), buckets, { variant: 'is-ratings' });

  const top = ratings.reduce((best, entry) => (entry.count > best.count ? entry : best), ratings[0]);
  const side = [
    ['Average', all.averageRating ? formatDecimal(all.averageRating, 2) : '—', stars(Math.round(all.averageRating * 2) / 2)],
    ['Most given', formatDecimal(top.rating, 1), `${formatNumber(top.count)} entries`],
    ['Rated', `${Math.round((all.rated / all.entries) * 100)}%`, `${formatNumber(all.rated)} of ${formatNumber(all.entries)}`],
    ['Liked', `${Math.round((all.liked / all.entries) * 100)}%`, `${formatNumber(all.liked)} entries`]
  ].map(([label, value, meta]) => {
    const node = el('div', 'side-item');
    node.append(el('span', 'side-label', label), el('span', 'side-value', value));
    if (meta) node.append(el('span', 'side-meta', meta));
    return node;
  });

  document.querySelector('[data-rating-side]').replaceChildren(...side);
  document.querySelector('[data-ratings]').hidden = false;
}

/* ── Decades and repeats ──────────────────────────────────────────────────── */

function renderDecades(all, diary) {
  const decades = all?.decades || [];
  const rewatched = all?.mostRewatched || [];
  if (!decades.length && !rewatched.length) return;

  if (decades.length) {
    const max = Math.max(...decades.map(decade => decade.count));
    const nodes = decades.slice().reverse().map((decade) => {
      // The label is the slug: Letterboxd files a decade under "2020s" too.
      const node = diary
        ? link(`${diary}/decade/${decade.label}/`, 'bar-row')
        : el('div', 'bar-row');
      const track = el('span', 'bar-track');
      const fill = el('span', 'bar-fill');
      fill.style.width = `${Math.max((decade.count / max) * 100, 1.5)}%`;
      track.append(fill);

      node.append(
        el('span', 'bar-label', decade.label),
        track,
        el('span', 'bar-value', formatNumber(decade.count))
      );
      return node;
    });

    document.querySelector('[data-decade-chart]').replaceChildren(...nodes);
  }

  if (rewatched.length) {
    const host = document.querySelector('[data-rewatched]');
    host.append(el('p', 'side-heading', 'Films you returned to'));

    const list = el('ol', 'repeat-list');
    for (const film of rewatched) {
      const row = el('li', 'repeat-row');
      const title = film.url
        ? link(film.url, 'repeat-title', film.title)
        : el('span', 'repeat-title', film.title);

      row.append(title);
      if (film.year) row.append(el('span', 'repeat-year', film.year));
      row.append(el('span', 'repeat-count', `${film.views}×`));
      list.append(row);
    }

    host.append(list);
  }

  document.querySelector('[data-decades]').hidden = false;
}

/* ── Milestones ───────────────────────────────────────────────────────────── */

function renderMilestones(all) {
  const milestones = all?.milestones || [];
  if (milestones.length < 2) return;

  const nodes = milestones.map((entry, index) => {
    const node = el('li', 'milestone');
    const badge = index === 0
      ? 'First'
      : index === milestones.length - 1 && entry.n % 100 !== 0
        ? 'Latest'
        : ordinal(entry.n);

    node.append(el('span', 'milestone-badge', badge));

    const title = entry.url
      ? link(entry.url, 'milestone-title', entry.title)
      : el('span', 'milestone-title', entry.title);
    node.append(title);

    const meta = el('span', 'milestone-meta');
    meta.append(el('span', null, formatDate(entry.date)));
    if (entry.year) meta.append(el('span', 'milestone-year', entry.year));
    node.append(meta);

    if (entry.rating) node.append(el('span', 'milestone-rating', stars(entry.rating)));
    return node;
  });

  document.querySelector('[data-milestone-list]').replaceChildren(...nodes);
  document.querySelector('[data-milestones]').hidden = false;
}

/* ── Frames ───────────────────────────────────────────────────────────────── */

const lazy = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    lazy.unobserve(entry.target);
    entry.target.__load?.();
  }
}, { rootMargin: '300px' });

async function copyText(text, message) {
  try {
    await navigator.clipboard.writeText(text);
    toast(message);
  } catch {
    toast('Clipboard blocked by the browser');
  }
}

/**
 * Draw an SVG file into a canvas and hand back the PNG. The cards carry their
 * fonts and poster art as data URIs, so nothing external is pulled in and the
 * canvas stays readable.
 *
 * @param {string} url
 * @param {number} width - Drawing width, in its own units
 * @param {number} height
 * @param {number} scale - Pixel density of the result
 * @returns {Promise<Blob>}
 */
async function renderToPng(url, width, height, scale = 2) {
  const source = await (await fetch(url)).text();
  const blobUrl = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml' }));

  try {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.addEventListener('load', resolve, { once: true });
      image.addEventListener('error', reject, { once: true });
      image.src = blobUrl;
    });

    const canvas = document.createElement('canvas');
    canvas.width = width * scale;
    canvas.height = height * scale;
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('canvas produced nothing');
    return blob;
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

async function copyImage(url, width, height) {
  if (typeof ClipboardItem === 'undefined') {
    toast('This browser cannot copy images — copy the SVG instead');
    return;
  }

  try {
    // The blob is handed over as a promise: Safari only allows a write it can
    // tie to the click, and awaiting the render first breaks that.
    await navigator.clipboard.write([
      new ClipboardItem({ 'image/png': renderToPng(url, width, height) })
    ]);
    toast('Card copied as a PNG');
  } catch {
    toast('Could not copy the image — copy the SVG instead');
  }
}

/* ── Card menu ────────────────────────────────────────────────────────────── */

let cardMenu = null;

function closeCardMenu() {
  cardMenu?.remove();
  cardMenu = null;
}

/**
 * Open a small menu inside a card. A card is an <object>, so a right click
 * lands in the embedded document and gets the browser's own menu for it, which
 * offers nothing useful — the embed is same origin, so the click can be caught
 * there and answered with this instead.
 *
 * @param {HTMLElement} host - Positioned ancestor the menu is placed in
 * @param {{x: number, y: number}} at - Where the click landed, inside the host
 * @param {Array<{icon: string, label: string, run: Function}>} items
 */
function openCardMenu(host, at, items) {
  closeCardMenu();

  const menu = el('div', 'card-menu');
  menu.setAttribute('role', 'menu');

  for (const item of items) {
    const button = el('button', 'card-menu-item');
    button.type = 'button';
    button.setAttribute('role', 'menuitem');
    button.append(icon(item.icon), el('span', null, item.label));
    button.addEventListener('click', () => {
      closeCardMenu();
      item.run();
    });
    menu.append(button);
  }

  host.append(menu);
  cardMenu = menu;

  // Kept inside the card, so a click near an edge does not push it off.
  const left = Math.min(Math.max(at.x, 8), Math.max(8, host.clientWidth - menu.offsetWidth - 8));
  const top = Math.min(Math.max(at.y, 8), Math.max(8, host.clientHeight - menu.offsetHeight - 8));
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;

  menu.querySelector('button')?.focus({ preventScroll: true });
}

document.addEventListener('pointerdown', (event) => {
  if (!cardMenu?.contains(event.target)) closeCardMenu();
});
document.addEventListener('scroll', closeCardMenu, { capture: true, passive: true });
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeCardMenu();
});

/**
 * Build one card frame: the embed, its filename and the actions under it.
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

  let theme = activeTheme();
  let loaded = false;

  const embedSnippet = () => {
    const base = manifest.rawBase;
    return [
      '<picture>',
      `  <source media="(prefers-color-scheme: dark)" srcset="${base}/${asset.svg.dark}">`,
      `  <source media="(prefers-color-scheme: light)" srcset="${base}/${asset.svg.light}">`,
      `  <img alt="Letterboxd ${asset.label.toLowerCase()}" src="${base}/${asset.svg.light}" width="100%">`,
      '</picture>'
    ].join('\n');
  };

  // The same four things the right-click menu offers, so the card behaves the
  // same whichever way it is asked.
  const commands = {
    image: {
      icon: 'image',
      label: 'Copy image',
      menuLabel: 'Copy as PNG',
      run: () => copyImage(asset.svg[theme], asset.width, asset.height)
    },
    svg: {
      icon: 'code',
      label: 'Copy SVG',
      menuLabel: 'Copy SVG markup',
      run: async () => {
        try {
          const source = await (await fetch(asset.svg[theme])).text();
          await copyText(source, 'SVG markup copied');
        } catch {
          toast('Could not read the SVG');
        }
      }
    },
    embed: {
      icon: 'clipboard',
      label: 'Copy embed',
      menuLabel: 'Copy embed code',
      run: () => copyText(embedSnippet(), 'Embed copied — paste it into a README')
    },
    open: {
      icon: 'open',
      label: 'Open SVG',
      menuLabel: 'Open the SVG in a new tab',
      run: () => window.open(asset.svg[theme], '_blank', 'noopener')
    }
  };

  const open = el('a', 'chip');
  open.target = '_blank';
  open.rel = 'noopener';
  open.append(icon(commands.open.icon), el('span', null, commands.open.label));

  const chip = (command) => {
    const button = el('button', 'chip');
    button.type = 'button';
    button.append(icon(command.icon), el('span', null, command.label));
    button.addEventListener('click', command.run);
    return button;
  };

  actions.append(chip(commands.image), chip(commands.svg), chip(commands.embed), open);
  foot.append(file, actions);
  frame.append(media, foot);

  // The card draws its own rounded background and leaves the corners
  // transparent. In an <object> those corners fall through to the embedded
  // document's canvas, which some browsers paint white, so the page clips the
  // embed to the same radius and paints the same fill behind it. The radius is
  // in the drawing's own units and has to be scaled to how wide it is rendered.
  const fitCorners = () => {
    if (!asset.radius) return;

    const radius = `${(asset.radius * media.clientWidth) / asset.width}px`;
    media.style.borderRadius = radius;

    // The embed carries the radius as well. A clipping ancestor is not enough
    // on its own in WebKit, and an element that rounds its own box needs no
    // help from one. During a theme swap there are two embeds in the frame for
    // a moment, and both are on screen.
    for (const object of media.querySelectorAll('object')) {
      object.style.borderRadius = radius;
    }
  };

  const showMenu = (x, y) => openCardMenu(
    media,
    { x, y },
    [commands.image, commands.svg, commands.embed, commands.open]
      .map(({ icon: name, menuLabel, run }) => ({ icon: name, label: menuLabel, run }))
  );

  media.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    const box = media.getBoundingClientRect();
    showMenu(event.clientX - box.left, event.clientY - box.top);
  });

  // Swapping themes replaces the embed. The outgoing one stays until its
  // replacement has painted, so the card never blinks back to 'Loading…'.
  const embed = () => {
    const object = document.createElement('object');
    object.type = 'image/svg+xml';
    object.data = asset.svg[theme];
    object.setAttribute('aria-label', asset.label);

    // The generated links carry no target, so inside an <object> they would
    // navigate the embed itself. Same origin, so they can be retargeted once
    // the document is there.
    object.addEventListener('load', () => {
      if (object.classList.contains('is-incoming')) {
        // Fade the new embed in over the old one, and only drop the old one
        // once it is covered.
        object.classList.add('is-shown');
        setTimeout(() => {
          for (const previous of [...media.children]) {
            if (previous !== object) previous.remove();
          }
          object.classList.remove('is-incoming', 'is-shown');
        }, 220);
      }
      media.classList.add('is-loaded');
      fitCorners();
      frame.dispatchEvent(new CustomEvent('frameload'));

      const doc = object.contentDocument;
      if (!doc) return;

      // Same origin, so the embedded document can be told two things it has no
      // way of knowing. First, what colour it is sitting on: the card's corners
      // are transparent by design, and left to itself a browser paints the
      // document canvas behind them white. Painting it the page's own colour
      // makes the corner read as transparent even where the clip above is
      // ignored. Second, that its links open out here rather than inside the
      // embed, which the generated markup cannot say either.
      doc.documentElement.style.background =
        getComputedStyle(document.documentElement).getPropertyValue('--background').trim();

      for (const anchor of doc.querySelectorAll('a')) {
        anchor.setAttribute('target', '_blank');
        anchor.setAttribute('rel', 'noopener');
      }

      // A right click on the card lands in here rather than on the page, and
      // the browser's menu for an embedded document offers nothing worth
      // having. The document's viewport is the embed's own box, so its client
      // coordinates are already offsets into the frame.
      doc.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        showMenu(event.clientX, event.clientY);
      });

      doc.addEventListener('pointerdown', closeCardMenu);
    });

    const fallback = el('img');
    fallback.src = asset.svg[theme];
    fallback.alt = asset.label;
    object.append(fallback);

    // Laid over whatever is already there, transparent, until it has loaded.
    if (media.childElementCount) object.classList.add('is-incoming');
    media.append(object);
  };

  const paint = () => {
    file.textContent = asset.svg[theme];
    open.href = asset.svg[theme];
    media.style.background = asset.background?.[theme] || 'var(--background)';
    fitCorners();
    if (loaded) embed();
  };

  frame.__load = () => {
    if (loaded) return;
    loaded = true;
    embed();
  };

  new ResizeObserver(fitCorners).observe(media);

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

const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 300));

/**
 * Render a section: one frame if the kind has a single asset, otherwise a tab
 * strip with the frames stacked on top of one another and the selected one
 * faded in. Every card in a section is the same size, so the stack keeps its
 * height across a switch and nothing below it moves.
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

  const stack = el('div', 'frame-stack');
  const built = assets.map((asset) => createFrame(asset, manifest));

  // `load` is off for the first call: which card shows is decided before the
  // section is anywhere near the viewport, and the lazy observer still owns
  // when the first one is fetched.
  const show = (index, load = true) => {
    built.forEach((frame, position) => {
      const active = position === index;
      frame.toggleAttribute('data-inactive', !active);
      frame.inert = !active;
      // A card that is faded out is still in the layout, so it has to be taken
      // out of the accessibility tree by hand.
      frame.setAttribute('aria-hidden', String(!active));
      if (active && load) frame.__load();
    });
  };

  assets.forEach((asset, index) => {
    const tab = el('button', 'tab', asset.label);
    tab.type = 'button';
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', String(index === 0));

    tab.addEventListener('click', () => {
      for (const other of tabs.children) other.setAttribute('aria-selected', 'false');
      tab.setAttribute('aria-selected', 'true');
      show(index);
    });

    // Pointing at a tab is a good enough sign the card behind it is wanted.
    tab.addEventListener('pointerenter', () => built[index].__load());
    tab.addEventListener('focus', () => built[index].__load());

    tabs.append(tab);
  });

  // The cards behind the other tabs are fetched too, but only once the visible
  // one has painted — a switch should not wait on a request, and the first
  // card should not queue behind its siblings either.
  for (const frame of built.slice(1)) lazy.unobserve(frame);
  built[0].addEventListener('frameload', () => {
    idle(() => { for (const frame of built) frame.__load(); });
  }, { once: true });

  show(0, false);
  stack.append(...built);
  body.append(tabs, stack);
}

/* ── Hero and diary ───────────────────────────────────────────────────────── */

function renderHero(data, manifest) {
  const profile = `https://letterboxd.com/${data.user}/`;

  document.querySelector('[data-hero-title]').textContent = `@${data.user}`;
  document.title = `@${data.user} — Letterboxd Graph`;

  const years = data.years?.length ? data.years.slice().sort((a, b) => a - b) : [];
  const span = years.length > 1 ? `${years[0]}–${years.at(-1)}` : years[0];
  const films = data.allTime?.films || data.allTime?.entries;

  document.querySelector('[data-hero-eyebrow]').textContent = [
    films ? `${formatNumber(films)} films` : null,
    span ? `graph covers ${span}` : null
  ].filter(Boolean).join(' · ') || 'Film diary';

  // A value on the attribute is an anchor into the README, which GitHub renders
  // on the repository page: data-repo-link="#embedding" lands on that section.
  for (const anchor of document.querySelectorAll('[data-repo-link]')) {
    anchor.href = `https://github.com/${manifest.repository}${anchor.dataset.repoLink || ''}`;
  }

  for (const anchor of document.querySelectorAll('[data-export-link]')) {
    anchor.href = manifest.export;
  }

  for (const anchor of document.querySelectorAll('[data-profile-link]')) {
    anchor.href = profile;
  }

  if (data.generatedAt) {
    const stamp = new Date(data.generatedAt);
    document.querySelector('[data-generated]').textContent =
      `Last generated ${stamp.toLocaleString('en-GB', { timeZone: 'UTC', dateStyle: 'medium', timeStyle: 'short' })} UTC.`;
  }
}

const DIARY_PER_COLUMN = 8;

function renderDiary(recent) {
  if (!recent?.length) return;

  const host = document.querySelector('[data-diary-list]');
  const entries = recent.slice(0, DIARY_PER_COLUMN * 2);

  // One list per column, so each column carries its own top rule and the
  // entries read downwards rather than across.
  for (let start = 0; start < entries.length; start += DIARY_PER_COLUMN) {
    const list = el('ol', 'diary-list');
    for (const entry of entries.slice(start, start + DIARY_PER_COLUMN)) {
      list.append(diaryRow(entry));
    }
    host.append(list);
  }

  document.querySelector('[data-diary]').hidden = false;
}

function diaryRow(entry) {
  const row = el('li', 'diary-row');
  row.append(el('span', 'diary-date', formatDate(entry.date, { day: '2-digit', month: 'short' })));

  const main = el('div', 'diary-main');
  const title = entry.url
    ? link(entry.url, 'diary-title', entry.title)
    : el('span', 'diary-title', entry.title);
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
  return row;
}

/* ── Scroll spy ───────────────────────────────────────────────────────────── */

function setupScrollSpy() {
  const links = [...document.querySelectorAll('.nav-links a')];
  const sections = links
    .map(anchor => document.querySelector(anchor.getAttribute('href')))
    .filter(Boolean);

  const spy = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      for (const anchor of links) {
        anchor.classList.toggle('is-active', anchor.getAttribute('href') === `#${entry.target.id}`);
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
    // Both distributions have a diary page behind every bar, filtered the same
    // way the bar is.
    const diary = data.user ? `https://letterboxd.com/${data.user}/diary/films` : null;

    renderHero(data, manifest);
    renderAllTime(data.allTime, data, diary);
    renderWhen(data.allTime);
    renderRatings(data.allTime, diary);
    renderDecades(data.allTime, diary);
    renderMilestones(data.allTime);
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
