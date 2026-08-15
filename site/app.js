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

import { availableYears, periodPath, resolvePeriod } from './period.js';
import { buildDonutSegments } from './donut.js';

const THEMES = ['dark', 'light'];
const STORAGE_KEY = 'lbg-theme';
const SCROLL_POSITION_KEY = `lbg-scroll:${location.pathname}${location.search}`;

if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEKDAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
// The diary counts weekdays from Sunday, the way `getUTCDay` does; the strip is
// read from Monday, the way a week is.
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

const systemQuery = matchMedia('(prefers-color-scheme: light)');
const frames = new Set();

// The system setting is the starting point, not a mode of its own: until the
// switch is used the page follows it, and after that it stays where it is put.
let pageTheme = THEMES.includes(localStorage.getItem(STORAGE_KEY))
  ? localStorage.getItem(STORAGE_KEY)
  : (systemQuery.matches ? 'light' : 'dark');

/* ── Theme ────────────────────────────────────────────────────────────────── */

function activeTheme() {
  return pageTheme;
}

function applyTheme() {
  document.documentElement.dataset.theme = pageTheme;

  const toggle = document.getElementById('theme-toggle');
  const next = pageTheme === 'dark' ? 'light' : 'dark';
  toggle.dataset.mode = pageTheme;
  toggle.querySelector('[data-theme-label]').textContent =
    pageTheme.charAt(0).toUpperCase() + pageTheme.slice(1);
  toggle.setAttribute('aria-label', `Theme: ${pageTheme}. Switch to ${next}.`);

  for (const frame of frames) frame.setTheme(pageTheme);
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

function formatRating(value) {
  return typeof value === 'number'
    ? (Number.isInteger(value) ? formatNumber(value) : formatDecimal(value))
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

function formatWeekSpan(startIso, endIso) {
  const start = new Date(`${startIso}T00:00:00Z`);
  const end = new Date(`${endIso}T00:00:00Z`);
  const month = date => date.toLocaleDateString('en-GB', { timeZone: 'UTC', month: 'short' });
  const day = date => date.getUTCDate();

  return start.getUTCMonth() === end.getUTCMonth()
    ? `${month(start)} ${day(start)}–${day(end)}`
    : `${month(start)} ${day(start)} – ${month(end)} ${day(end)}`;
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
  image: ['M4 6h16v12H4z', 'M4 15.5 8.5 11l3.5 3.5L15 12l5 4.5', 'M9 9.5h.01'],
  arrowUp: ['M12 19V6', 'm6 12 6-6 6 6'],
  arrowRight: ['M3 12h17', 'm14 6 6 6-6 6']
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

const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 300));

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

// Whether the page is being read with a finger. A bar's figures live in a
// tooltip, and a tooltip that only answers to hover is a figure a phone can
// never see.
const coarsePointer = matchMedia('(hover: none)');

let readBar = null;
let dismissBar = () => {};

document.addEventListener('pointerdown', (event) => {
  if (readBar && !event.target.closest('.column')) dismissBar();
});

/**
 * A column chart with a tooltip that follows the hovered bar. Used for the month
 * series and, in a smaller variant, for the weekday and rating distributions.
 *
 * A bar with an `href` becomes a link, which is what makes the rating
 * distribution more than a picture: every step has a diary page behind it.
 *
 * @param {HTMLElement} host - Element to render into
 * @param {Array<{value: number, label: string, meta?: string, caption?: string, href?: string}>} bars
 * @param {{variant?: string, axis?: [string, string], colorScale?: [string, string], captionInside?: boolean}} options
 */
function columnChart(host, bars, { variant = '', axis = null, colorScale = null, captionInside = false } = {}) {
  host.replaceChildren();
  if (!bars.length) return;

  const max = Math.max(1, ...bars.map(bar => bar.value));
  const plot = el('div', `plot ${variant}`.trim());
  const tooltip = el('div', 'chart-tip');
  tooltip.hidden = true;

  bars.forEach((bar, index) => {
    const column = bar.href ? link(bar.href, 'column') : el('div', 'column');
    const fill = el('span', 'column-fill');
    // A zero stays flat; everything else keeps a sliver so a single film is
    // still visible next to a month of thirty.
    fill.style.height = bar.value === 0 ? '0' : `${Math.max((bar.value / max) * 100, 3)}%`;
    if (colorScale) fill.style.background = interpolateColor(colorScale, index, bars.length);
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

      // Sit just above the bar, but keep the whole tooltip inside the plot.
      // Mobile charts scroll horizontally, which also clips anything that
      // escapes vertically from the chart host; a full-height bar must not
      // push its tooltip through the top edge.
      const half = tooltip.offsetWidth / 2;
      const centre = column.offsetLeft + column.offsetWidth / 2;
      const gap = 10;
      const tooltipHeight = tooltip.offsetHeight;
      const desiredTop = plot.clientHeight - fill.offsetHeight - gap - tooltipHeight;
      const latestTop = Math.max(8, plot.clientHeight - tooltipHeight - 8);

      tooltip.style.left = `${Math.min(Math.max(centre, half), plot.clientWidth - half)}px`;
      tooltip.style.top = `${Math.max(8, Math.min(desiredTop, latestTop))}px`;
      tooltip.style.bottom = 'auto';
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

    // A finger cannot hover. On a touch screen the first tap reads the bar and
    // a second one follows it, which is the only way a bar can be both a figure
    // and a link to the diary behind it.
    column.addEventListener('click', (tapped) => {
      if (!coarsePointer.matches) return;

      if (tapped.target.closest('.column') === readBar) {
        if (!bar.href) dismissBar();
        return;
      }

      if (bar.href) tapped.preventDefault();
      dismissBar();
      readBar = column;
      dismissBar = () => {
        hide();
        readBar = null;
        dismissBar = () => {};
      };
      show();
    });

    const accessibleLabel = [bar.label, bar.meta].filter(Boolean).join(', ');
    if (bar.href) {
      column.setAttribute('aria-label', `${accessibleLabel}: ${bar.value}. Open in the diary.`);
    } else {
      // A link is focusable already; a plain bar has to be made so.
      column.tabIndex = 0;
      column.setAttribute('role', 'img');
      column.setAttribute('aria-label', `${accessibleLabel}: ${bar.value}`);
    }

    // A caption under the bar needs the room; one inside it rides along, which
    // is what turns the weekday strip into seven labelled blocks.
    if (bar.caption) (captionInside ? fill : column).append(el('span', 'column-caption', bar.caption));
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

function interpolateColor([start, end], index, count) {
  const ratio = count < 2 ? 0 : index / (count - 1);
  const channels = (color) => color.match(/[\da-f]{2}/gi).map(value => parseInt(value, 16));
  const from = channels(start);
  const to = channels(end);
  const blended = from.map((value, channel) => Math.round(value + (to[channel] - value) * ratio));
  return `rgb(${blended.join(', ')})`;
}

const DONUT_COLORS = ['var(--brand-green)', 'var(--donut-muted)', 'var(--accent-orange)'];

function donutArcPath(offset, percentage, radius = 41) {
  const point = angle => {
    const radians = angle * Math.PI * 2;
    return [50 + radius * Math.cos(radians), 50 + radius * Math.sin(radians)];
  };

  const [startX, startY] = point(offset / 100);
  const [endX, endY] = point((offset + percentage) / 100);
  const largeArc = percentage > 50 ? 1 : 0;
  return `M ${startX} ${startY} A ${radius} ${radius} 0 ${largeArc} 1 ${endX} ${endY}`;
}

function donutCard(title, segments) {
  const visible = buildDonutSegments(segments);
  if (!visible.length) return null;

  const card = el('article', 'donut-card');
  const chart = el('div', 'donut-chart');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'donut-svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('role', 'group');
  svg.setAttribute('aria-label', title);
  const tooltip = el('div', 'donut-tip');
  tooltip.hidden = true;

  const track = document.createElementNS(svg.namespaceURI, 'circle');
  track.setAttribute('class', 'donut-track');
  track.setAttribute('cx', '50');
  track.setAttribute('cy', '50');
  track.setAttribute('r', '41');
  track.setAttribute('fill', 'none');
  track.setAttribute('stroke', 'var(--surface-elevated)');
  track.setAttribute('stroke-width', '18');
  track.setAttribute('pathLength', '100');
  svg.append(track);

  const copy = el('div', 'donut-copy');
  copy.append(el('h3', 'donut-title', title));
  const legend = el('div', 'donut-legend');
  const interactive = [];

  visible.forEach((segment) => {
    const color = DONUT_COLORS[segment.index] || 'var(--donut-muted)';
    const circle = document.createElementNS(
      svg.namespaceURI,
      segment.percentage >= 99.999 ? 'circle' : 'path'
    );
    circle.setAttribute('class', 'donut-segment');
    if (segment.percentage >= 99.999) {
      circle.setAttribute('cx', '50');
      circle.setAttribute('cy', '50');
      circle.setAttribute('r', '41');
    } else {
      circle.setAttribute('d', donutArcPath(segment.offset, segment.percentage));
    }
    circle.setAttribute('fill', 'none');
    circle.setAttribute('stroke', color);
    circle.setAttribute('stroke-width', '18');
    circle.setAttribute('stroke-linecap', 'butt');
    circle.setAttribute('transform', 'rotate(-90 50 50)');
    circle.setAttribute('tabindex', '0');
    circle.setAttribute(
      'aria-label',
      `${segment.label}: ${formatDecimal(segment.percentage)}%, ${formatNumber(segment.value)} of ${formatNumber(segment.total)}`
    );
    svg.append(circle);

    const row = el('div', 'donut-legend-row');
    const swatch = el('span', 'donut-swatch');
    swatch.style.background = color;
    swatch.setAttribute('aria-hidden', 'true');
    const detail = el('span', 'donut-legend-copy');
    detail.append(
      el('span', 'donut-label', segment.label),
      el('span', 'donut-value', `${formatNumber(segment.value)} ${segment.value === 1 ? 'entry' : 'entries'} · ${formatDecimal(segment.percentage)}%`)
    );
    row.append(swatch, detail);
    legend.append(row);
    interactive.push({ circle, row, segment });
  });

  const hideTooltip = () => {
    tooltip.hidden = true;
    svg.classList.remove('is-interacting');
    legend.classList.remove('is-interacting');
    interactive.forEach(({ circle, row }) => {
      circle.classList.remove('is-active');
      row.classList.remove('is-active');
    });
  };

  const showTooltip = (active) => {
    const { circle, row, segment } = active;
    tooltip.replaceChildren(
      el('strong', null, `${formatDecimal(segment.percentage)}%`),
      el('span', null, `${formatNumber(segment.value)} of ${formatNumber(segment.total)}`)
    );
    tooltip.hidden = false;
    svg.classList.add('is-interacting');
    legend.classList.add('is-interacting');
    interactive.forEach((item) => {
      item.circle.classList.toggle('is-active', item === active);
      item.row.classList.toggle('is-active', item === active);
    });
  };

  interactive.forEach((item) => {
    item.circle.addEventListener('mouseenter', () => showTooltip(item));
    item.circle.addEventListener('mouseleave', hideTooltip);
    item.circle.addEventListener('focus', () => showTooltip(item));
    item.circle.addEventListener('blur', hideTooltip);
    item.circle.addEventListener('click', () => showTooltip(item));
  });

  chart.append(svg, tooltip);
  copy.append(legend);
  card.append(chart, copy);
  return card;
}

function renderBreakdown(all, year) {
  const cards = [
    donutCard('Release timing', [
      {
        label: year ? `${year} releases` : 'Watched in release year',
        value: all.releaseBreakdown?.sameYear || 0
      },
      { label: 'Older', value: all.releaseBreakdown?.older || 0 },
      { label: 'Other', value: all.releaseBreakdown?.other || 0 }
    ]),
    donutCard('Viewing mix', [
      { label: 'First watches', value: all.watchBreakdown?.firstWatches || 0 },
      { label: 'Rewatches', value: all.watchBreakdown?.rewatches || 0 }
    ])
  ];

  if ((all.reviewBreakdown?.reviewed || 0) > 0) {
    cards.push(donutCard('Reviews', [
      { label: 'Reviewed', value: all.reviewBreakdown.reviewed },
      { label: 'Not reviewed', value: all.reviewBreakdown.notReviewed || 0 }
    ]));
  }

  const visible = cards.filter(Boolean);
  document.querySelector('[data-breakdown-grid]').replaceChildren(...visible);
  document.querySelector('[data-breakdown]').hidden = visible.length === 0;
}

/* ── When you watched ─────────────────────────────────────────────────────── */

/**
 * The years as figures rather than as bars.
 *
 * A bar per year is a chart that outgrows its section: a diary spanning twenty
 * years wants twenty rows, and the whole point of the comparison is legible in
 * the numbers alone. Written as a wrapping row of figures it costs three lines
 * per year and reads the same at three years as at thirty.
 */
function renderYears(all, diary) {
  const years = (all.perYear || []).slice().sort((a, b) => a.year - b.year);
  if (years.length < 2) return;

  const nodes = years.map((year) => {
    const node = diary ? link(`${diary}/for/${year.year}/`, 'year') : el('div', 'year');
    // The year leads, not the count: it is what a reader scans the row for, and
    // the counts only mean anything once you know which year you are looking at.
    node.append(
      el('span', 'year-value', String(year.year)),
      el('span', 'year-label', `${formatNumber(year.films)} films`),
      el('span', 'year-days', `${formatNumber(year.days)} days`)
    );
    return node;
  });

  document.querySelector('[data-when-year-list]').replaceChildren(...nodes);

  document.querySelector('[data-when-years-note]').textContent = all.scope === 'all'
    ? `Every entry from ${formatDate(all.firstEntry)} to ${formatDate(all.lastEntry)}.`
    : `Covers ${formatDate(all.firstEntry)} to ${formatDate(all.lastEntry)} — the run fetched only the graph years, so this is not the whole diary.`;

  document.querySelector('[data-when-years]').hidden = false;
}

function renderOnThisDay(snapshot, year) {
  const entries = (snapshot?.films || []).filter(entry => {
    if (!year) return true;
    return entry.date?.slice(0, 4) === String(year);
  });

  // An empty day is deliberately not an empty section: the daily page should
  // simply carry on to the next section when there is nothing to remember.
  if (!entries.length) return;

  const groups = new Map();
  for (const entry of entries) {
    const watchYear = entry.date?.slice(0, 4) || '—';
    if (!groups.has(watchYear)) groups.set(watchYear, []);
    groups.get(watchYear).push(entry);
  }

  const dateLabel = snapshot.date
    ? formatDate(snapshot.date, { day: 'numeric', month: 'long' })
    : 'This date';
  const filmLabel = `${formatNumber(entries.length)} ${entries.length === 1 ? 'film' : 'films'}`;
  const yearLabel = `${formatNumber(groups.size)} ${groups.size === 1 ? 'year' : 'years'}`;

  document.querySelector('[data-on-this-day-note]').textContent =
    `${dateLabel} · ${filmLabel} · ${yearLabel}`;

  const list = document.querySelector('[data-on-this-day-list]');
  const nodes = [...groups.entries()].map(([watchYear, films]) => {
    const group = el('div', 'on-this-day-year');
    group.append(el('span', 'on-this-day-year-label', watchYear));

    const filmList = el('ul', 'on-this-day-films');
    for (const entry of films) filmList.append(onThisDayRow(entry));
    group.append(filmList);
    return group;
  });

  list.replaceChildren(...nodes);
  document.querySelector('[data-on-this-day]').hidden = false;
}

function onThisDayRow(entry) {
  const row = el('li', 'diary-row on-this-day-film');
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
  if (entry.reviewed) {
    const mark = el('span', 'marker marker-review', '✎');
    mark.title = 'Reviewed';
    markers.append(mark);
  }
  if (markers.childElementCount) main.append(markers);

  const rating = el('span', 'diary-rating', entry.rating ? stars(entry.rating) : '—');
  if (!entry.rating) rating.classList.add('is-empty');
  rating.title = entry.rating ? `${entry.rating} out of 5` : 'Not rated';

  row.append(main, rating);
  return row;
}

function renderWhen(all, diary, year, onThisDay) {
  const monthSeries = all?.monthSeries || [];
  if (!monthSeries.length) return;

  const weekSeries = year ? all?.weekSeries || [] : [];
  document.querySelector('[data-when-eyebrow]').textContent = weekSeries.length ? 'By week' : 'Over time';
  const chartBars = weekSeries.length
    ? weekSeries.map(point => ({
        value: point.count,
        label: `Week ${point.week}`,
        meta: formatWeekSpan(point.start, point.end)
      }))
    : monthSeries.map(point => ({ value: point.count, label: formatMonth(point.month) }));

  columnChart(
    document.querySelector('[data-month-chart]'),
    chartBars,
    {
      axis: weekSeries.length
        ? ['Jan', 'Dec']
        : [formatMonth(monthSeries[0].month), formatMonth(monthSeries.at(-1).month)],
      colorScale: ['#00E054', '#40BCF4']
    }
  );

  const blocks = [
    ['Entries logged', formatNumber(all.entries)],
    ['Average per month', formatDecimal(all.perMonth)],
    ['Average per week', formatDecimal(all.perWeek)]
  ];

  const blockNodes = [];
  blocks.forEach(([label, value], index) => {
    // The three figures are one sentence — the same films, divided twice — so an
    // arrow carries the reading from one to the next instead of a bare gap.
    if (index > 0) {
      const arrow = el('span', 'block-arrow');
      arrow.append(icon('arrowRight'));
      blockNodes.push(arrow);
    }
    const node = el('div', 'block');
    node.append(el('span', 'block-value', value), el('span', 'block-label', label));
    blockNodes.push(node);
  });

  document.querySelector('[data-when-blocks]').replaceChildren(...blockNodes);

  const weekday = all.perWeekday || [];
  if (weekday.some(Boolean)) {
    columnChart(
      document.querySelector('[data-weekday-chart]'),
      WEEKDAY_ORDER.map(day => ({
        value: weekday[day] || 0,
        label: WEEKDAYS[day],
        caption: WEEKDAY_INITIALS[day]
      })),
      { variant: 'is-weekday', captionInside: true }
    );
  }

  // The records, each a figure with the date or span it belongs to. Three of
  // them left most of the row empty; these six also put `monthSeries`,
  // `perMonthOfYear` and `streak.films` to use, which the page carried in its
  // data and never showed.
  const facts = [];

  if (all.busiestDay?.count > 1) {
    facts.push([`${all.busiestDay.count} films in a day`, formatDate(all.busiestDay.date)]);
  }

  const fullestMonth = monthSeries.reduce(
    (best, point) => (point.count > best.count ? point : best),
    monthSeries[0]
  );
  if (fullestMonth?.count > 1) {
    facts.push([`${fullestMonth.count} films in a month`, formatMonth(fullestMonth.month)]);
  }

  if (all.streak?.length > 1) {
    const span = `${formatDate(all.streak.startDate)} – ${formatDate(all.streak.endDate)}`;
    facts.push([
      `${all.streak.length}-day streak`,
      all.streak.films ? `${span}, ${formatNumber(all.streak.films)} films` : span
    ]);
  }

  if (all.longestGap?.days > 1) {
    facts.push([`${all.longestGap.days} days quiet`, `${formatDate(all.longestGap.from)} – ${formatDate(all.longestGap.to)}`]);
  }

  if (all.daysActive > 0 && all.spanDays > 0) {
    facts.push([
      `${Math.round((all.daysActive / all.spanDays) * 100)}% of days watched`,
      `${formatNumber(all.daysActive)} of ${formatNumber(all.spanDays)} days`
    ]);
  }

  // Which month of the calendar carries the most, counted across every year —
  // a different reading from the single fullest month above.
  const byMonth = all.perMonthOfYear || [];
  if (byMonth.length === 12 && Math.max(...byMonth) > 0) {
    const peak = byMonth.indexOf(Math.max(...byMonth));
    facts.push([
      `${byMonth[peak]} entries in ${MONTHS[peak]}`,
      'Counted across every year'
    ]);
  }

  document.querySelector('[data-when-facts]').replaceChildren(...facts.map(([value, meta]) => {
    const node = el('div', 'fact');
    node.append(el('span', 'fact-value', value), el('span', 'fact-meta', meta));
    return node;
  }));

  renderYears(all, diary);
  renderOnThisDay(onThisDay, year);

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
      // Every step names itself in the currency it was given in, half stars
      // included, which is what lets the chart go without an axis.
      caption: stars(rating),
      // Letterboxd writes a half star without its leading zero. A step nobody
      // ever gave leads to an empty page, so it stays a plain bar.
      href: diary && count ? `${diary}/rated/${String(rating).replace(/^0/, '')}/` : null
    };
  });

  columnChart(document.querySelector('[data-rating-chart]'), buckets, { variant: 'is-ratings' });

  const top = ratings.reduce((best, entry) => (entry.count > best.count ? entry : best), ratings[0]);
  const side = [
    // The stars under the average are the same currency as the ones under the
    // bars, so they are drawn in the same colour rather than as grey small print.
    ['Average', all.averageRating ? formatDecimal(all.averageRating, 2) : '—', stars(Math.round(all.averageRating * 2) / 2), 'is-stars'],
    ['Most given', formatDecimal(top.rating, 1), `${formatNumber(top.count)} entries`],
    ['Rated', `${Math.round((all.rated / all.entries) * 100)}%`, `${formatNumber(all.rated)} of ${formatNumber(all.entries)}`],
    ['Liked', `${Math.round((all.liked / all.entries) * 100)}%`, `${formatNumber(all.liked)} entries`]
  ].map(([label, value, meta, metaClass]) => {
    const node = el('div', 'side-item');
    node.append(el('span', 'side-label', label), el('span', 'side-value', value));
    if (meta) node.append(el('span', `side-meta ${metaClass || ''}`.trim(), meta));
    return node;
  });

  document.querySelector('[data-rating-side]').replaceChildren(...side);
  document.querySelector('[data-ratings]').hidden = false;
}

/* ── Decades and repeats ──────────────────────────────────────────────────── */

function renderDecades(all, diary) {
  const decades = all?.decades || [];
  const rewatched = (all?.mostRewatched || []).slice(0, Math.max(decades.length - 2, 0));
  if (!decades.length && !rewatched.length) return;

  if (decades.length) {
    const max = Math.max(...decades.map(decade => decade.count));
    const total = decades.reduce((sum, decade) => sum + decade.count, 0);
    const nodes = decades.slice().reverse().map((decade) => {
      // The label is the slug: Letterboxd files a decade under "2020s" too.
      const node = diary
        ? link(`${diary}/decade/${decade.label}/`, 'bar-row')
        : el('div', 'bar-row');
      const track = el('span', 'bar-track');
      const fill = el('span', 'bar-fill');
      fill.style.width = `${Math.max((decade.count / max) * 100, 1.5)}%`;
      track.append(fill);

      const trackWrap = el('span', 'bar-track-wrap');
      trackWrap.append(
        track,
        el('span', 'bar-percent', `${formatDecimal((decade.count / total) * 100)}%`)
      );

      const value = el('span', 'bar-value');
      value.append(el('span', 'bar-count', formatNumber(decade.count)));
      if (typeof decade.averageRating === 'number') {
        const average = el('span', 'bar-average');
        average.append(
          el('span', 'bar-average-symbol', '⌀'),
          document.createTextNode(` ${formatRating(decade.averageRating)}`)
        );
        value.append(el('span', 'bar-separator', '·'), average);
      }

      node.append(
        el('span', 'bar-label', decade.label),
        trackWrap,
        value
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

      const filmInfo = el('span', 'repeat-film');
      filmInfo.append(title);
      if (film.year) filmInfo.append(el('span', 'repeat-year', film.year));
      row.append(filmInfo);

      const meta = el('span', 'repeat-meta');
      const count = el('span', 'repeat-count');
      count.append(el('span', 'repeat-symbol', '↻'), document.createTextNode(` ${film.views}×`));
      meta.append(count);

      if (typeof film.averageRating === 'number') {
        const rating = el('span', 'repeat-rating');
        rating.append(
          el('span', 'repeat-rating-symbol', '★'),
          document.createTextNode(` ${formatRating(film.averageRating)}`)
        );
        meta.append(el('span', 'repeat-separator', '·'), rating);
      }

      row.append(meta);
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

  const nodes = milestones.map((entry) => {
    const node = el('li', 'milestone');
    // The item has no box of its own on wide screens (see `.milestone` in the
    // stylesheet), and a WebKit reader drops the list semantics with it.
    node.setAttribute('role', 'listitem');
    const badge = entry.kind === 'first'
      ? 'First'
      : entry.kind === 'latest'
        ? 'Latest'
        : ordinal(entry.n);

    node.append(el('span', 'milestone-badge', badge));

    // When the diary turned over, directly under the marker it belongs to.
    const meta = el('span', 'milestone-meta');
    meta.append(el('span', 'milestone-date', formatDate(entry.date)));
    node.append(meta);

    // The release year rides with the title the way Letterboxd writes it. Set
    // beside the watch date it read as a second date rather than as the year
    // the film came out.
    const title = el('p', 'milestone-title');
    title.append(entry.url ? link(entry.url, null, entry.title) : el('span', null, entry.title));
    if (entry.year) title.append(el('span', 'milestone-year', `(${entry.year})`));
    node.append(title);

    // Always appended, even unrated: the markers share the rows of the list, so
    // a missing fourth part would pull the next column up a row and the ratings
    // would stop lining up along the foot of the section.
    node.append(el('span', 'milestone-rating', entry.rating ? stars(entry.rating) : ''));
    return node;
  });

  const list = document.querySelector('[data-milestone-list]');
  list.setAttribute('role', 'list');
  list.replaceChildren(...nodes);

  // The interval scales with the diary, so the note has to name the actual one
  // rather than promise every hundredth to a reader who is seeing every 25th.
  const step = milestones.some((entry) => entry.kind === 'step') ? all.milestoneStep : 0;
  document.querySelector('[data-milestone-note]').textContent = step > 0
    ? `The first entry, every ${ordinal(step)} after it, and the latest one.`
    : 'The first entry and the latest one.';

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
  // The card keeps a readable size on a phone and scrolls sideways inside this
  // wrapper; the caption below it stays where a thumb can reach it.
  const scroll = el('div', 'frame-scroll');
  const media = el('div', 'frame-media');
  media.style.aspectRatio = `${asset.width} / ${asset.height}`;
  scroll.append(media);

  const foot = el('figcaption', 'frame-foot');
  const file = el('a', 'frame-file');
  const fileCode = el('code');
  file.append(fileCode);
  file.target = '_blank';
  file.rel = 'noopener';
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
  // Only ever seen where the card is wider than the screen.
  foot.append(file, el('span', 'frame-hint', 'Drag the card sideways'), actions);
  frame.append(scroll, foot);

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

  // Both themes of a card are kept in the frame at once, one shown and one
  // waiting. Swapping used to mean a fresh request, so the page recoloured and
  // the cards followed a beat later; with the other file already parsed the
  // swap is a class change in the same frame as the page's own.
  const embeds = new Map();

  // Same origin, so an embedded document can be told what colour it is sitting
  // on. The card's corners are transparent by design, and left to itself a
  // browser paints the document canvas behind them white; painting it the
  // page's own colour makes the corner read as transparent even where the clip
  // above is ignored. It has to be redone on a theme swap, since an embed can
  // be fetched under one theme and shown under the other.
  const paintCanvas = () => {
    const background = getComputedStyle(document.documentElement)
      .getPropertyValue('--background').trim();

    for (const object of embeds.values()) {
      const doc = object.contentDocument;
      if (doc) doc.documentElement.style.background = background;
    }
  };

  const reveal = () => {
    const wanted = embeds.get(theme);
    // Until the wanted embed has parsed, whatever is up stays up.
    if (wanted?.dataset.ready !== 'true') return;

    for (const [name, object] of embeds) object.classList.toggle('is-current', name === theme);
    media.classList.add('is-loaded');
    paintCanvas();
    fitCorners();
  };

  const mount = (which) => {
    if (embeds.has(which)) return;

    const object = document.createElement('object');
    object.type = 'image/svg+xml';
    object.data = asset.svg[which];
    object.setAttribute('aria-label', asset.label);

    // The generated links carry no target, so inside an <object> they would
    // navigate the embed itself. Same origin, so they can be retargeted once
    // the document is there.
    object.addEventListener('load', () => {
      object.dataset.ready = 'true';
      reveal();

      if (which === theme) {
        frame.dispatchEvent(new CustomEvent('frameload'));
        // The other theme is fetched in the background, so the switch itself
        // never waits on the network.
        idle(() => mount(which === 'dark' ? 'light' : 'dark'));
      }

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
    fallback.src = asset.svg[which];
    fallback.alt = asset.label;
    object.append(fallback);

    media.append(object);
    embeds.set(which, object);
  };

  const paint = () => {
    fileCode.textContent = asset.svg[theme];
    file.href = asset.svg[theme];
    file.title = `Open ${asset.svg[theme]}`;
    open.href = asset.svg[theme];
    media.style.background = asset.background?.[theme] || 'var(--background)';
    fitCorners();

    if (!loaded) return;
    mount(theme);
    reveal();
  };

  frame.__load = () => {
    if (loaded) return;
    loaded = true;
    mount(theme);
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

/* ── Statistics periods ───────────────────────────────────────────────────── */

function resetPeriodSections() {
  dismissBar();

  for (const selector of ['[data-when]', '[data-breakdown]', '[data-ratings]', '[data-decades]', '[data-milestones]', '[data-on-this-day]']) {
    document.querySelector(selector).hidden = true;
  }

  for (const selector of [
    '[data-month-chart]',
    '[data-when-blocks]',
    '[data-weekday-chart]',
    '[data-when-facts]',
    '[data-when-year-list]',
    '[data-on-this-day-list]',
    '[data-breakdown-grid]',
    '[data-rating-chart]',
    '[data-rating-side]',
    '[data-decade-chart]',
    '[data-rewatched]',
    '[data-milestone-list]'
  ]) {
    document.querySelector(selector).replaceChildren();
  }

  document.querySelector('[data-on-this-day-note]').textContent = '';
  document.querySelector('[data-when-years]').hidden = true;
}

function diaryForPeriod(user, year) {
  const base = user ? `https://letterboxd.com/${user}/diary/films` : null;
  return base && year ? `${base}/for/${year}` : base;
}

function renderPeriodMenu(data, activeYear, selectPeriod) {
  const years = availableYears(data.byYear);
  const picker = document.querySelector('[data-period-picker]');

  if (!years.length) {
    picker.hidden = true;
    return;
  }

  const choices = [
    { year: null, label: 'All Time' },
    ...years.map(year => ({ year, label: String(year) }))
  ];

  const options = choices.map(choice => {
    const anchor = el('a', 'period-option');
    anchor.href = periodPath(location.href, choice.year);
    anchor.append(el('span', null, choice.label));

    if (choice.year === activeYear) {
      anchor.setAttribute('aria-current', 'page');
      anchor.append(el('span', 'period-check', '✓'));
    }

    anchor.addEventListener('click', (event) => {
      event.preventDefault();
      history.pushState(null, '', periodPath(location.href, choice.year));
      picker.open = false;
      selectPeriod();
    });

    return anchor;
  });

  document.querySelector('[data-period-menu]').replaceChildren(...options);
  picker.hidden = false;
}

function setupPeriodPicker() {
  const picker = document.querySelector('[data-period-picker]');

  document.addEventListener('pointerdown', (event) => {
    if (picker.open && !event.target.closest('[data-period-picker]')) picker.open = false;
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !picker.open) return;
    picker.open = false;
    picker.querySelector('summary').focus();
  });
}

function animatePeriodSections() {
  for (const section of document.querySelectorAll('.period-section:not([hidden])')) {
    section.classList.remove('is-period-updated');
    void section.offsetWidth;
    section.classList.add('is-period-updated');
  }
}

/* ── Hero and diary ───────────────────────────────────────────────────────── */

function renderHero(data, manifest, all, year) {
  const profile = `https://letterboxd.com/${data.user}/`;
  const title = document.querySelector('[data-hero-title]');
  const row = title.closest('.display-row');

  title.textContent = year ? String(year) : 'A Life in Film';
  title.classList.toggle('is-year', Boolean(year));
  row.classList.toggle('is-year', Boolean(year));
  document.querySelector('.hero').classList.toggle('is-year-period', Boolean(year));
  document.querySelector('[data-hero-user]').textContent = data.user
    ? `${year ? '' : '@'}${data.user}`
    : 'Film diary';

  const avatar = document.querySelector('[data-hero-avatar]');
  avatar.onerror = () => {
    avatar.hidden = true;
    avatar.removeAttribute('src');
  };
  if (data.profileImage) {
    avatar.src = data.profileImage;
    avatar.hidden = false;
  }

  // The build step already wrote this into the served HTML, because a crawler
  // does not get this far. Setting it again keeps a locally served, unbuilt
  // copy of the page honest, and matches what the build writes.
  document.title = `@${data.user}'s film diary — Letterboxd Graph`;

  document.querySelector('[data-period-label]').textContent = year ? 'year in film' : 'all-time stats';

  const kpis = year
    ? [
        ['Films watched', all.distinctFilms],
        ['Diary entries', all.entries],
        ['Rewatches', all.rewatches],
        ['Days active', all.daysActive],
        ['Average rating', typeof all.averageRating === 'number' ? formatDecimal(all.averageRating, 2) : '—'],
        ['Longest streak', all.streak?.length ? `${formatNumber(all.streak.length)}d` : '—']
      ]
    : [
        ['Films watched', all.films ?? all.entries],
        ['Distinct films', all.distinctFilms],
        ['Days active', all.daysActive],
        ['Average rating', typeof all.averageRating === 'number' ? formatDecimal(all.averageRating, 2) : '—'],
        ['Longest streak', all.streak?.length ? `${formatNumber(all.streak.length)}d` : '—'],
        ...(all.multiFilmDays > 0 ? [['2+ Film Days', all.multiFilmDays]] : [])
      ];
  const formatKpiValue = value => typeof value === 'number' ? formatNumber(value) : value ?? '—';
  document.querySelector('[data-hero-kpis]').replaceChildren(...kpis.map(([label, value]) => {
    const item = el('div', 'hero-kpi');
    item.append(
      el('dt', 'hero-kpi-label', label),
      el('dd', 'hero-kpi-value', formatKpiValue(value))
    );
    return item;
  }));

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

const DIARY_LIMIT = 16;

function renderDiary(recent) {
  if (!recent?.length) return;

  const host = document.querySelector('[data-diary-list]');
  const entries = recent.slice(0, DIARY_LIMIT);
  const list = el('ol', 'diary-list');

  // Grid fills rows left to right, so an odd count leaves only the final cell
  // alone instead of creating a long half-empty second column.
  for (const entry of entries) list.append(diaryRow(entry));
  host.append(list);

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

/* ── Navigation ───────────────────────────────────────────────────────────── */

// A heading scrolled to the very top would sit under the sticky bar, which is
// two rows tall on a phone and one on a desktop — so it is measured rather
// than assumed, plus enough air to read as a margin.
const navOffset = () => (document.querySelector('.nav')?.offsetHeight || 56) + 20;

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

let scrolling = null;

function stopScrolling() {
  scrolling = null;
}

/**
 * Where an element sits in the document, read off the layout rather than the
 * painted box: sections carry a transform while they fade in, and a rect would
 * hand back a position they are about to leave.
 *
 * @param {HTMLElement} element
 * @returns {number}
 */
function documentTop(element) {
  let top = 0;
  for (let node = element; node; node = node.offsetParent) top += node.offsetTop;
  return top;
}

/**
 * Scroll the page with an ease of our own. The browser's `smooth` behaviour is
 * a fixed speed regardless of distance, which makes a jump to the foot of the
 * page either a crawl or a blur; this one takes longer for a longer jump, but
 * far from proportionally, and eases at both ends.
 *
 * Any input that means 'stop' — a wheel, a touch, a key — abandons it, so the
 * page never fights the reader for the scroll position.
 *
 * @param {number} to - Document offset to end at
 */
function scrollToY(to) {
  const start = window.scrollY;
  const limit = document.documentElement.scrollHeight - window.innerHeight;
  const end = Math.max(0, Math.min(to, limit));
  const distance = end - start;
  if (Math.abs(distance) < 2) return;

  if (reducedMotion.matches) {
    window.scrollTo(0, end);
    return;
  }

  const duration = Math.min(900, 260 + Math.sqrt(Math.abs(distance)) * 18);
  const began = performance.now();
  const run = Symbol('scroll');
  scrolling = run;

  const step = (now) => {
    if (scrolling !== run) return;

    const progress = Math.min(1, (now - began) / duration);
    // Cubic in and out: leaves and arrives slowly, covers the middle quickly.
    const eased = progress < 0.5
      ? 4 * progress ** 3
      : 1 - ((-2 * progress + 2) ** 3) / 2;

    window.scrollTo(0, start + distance * eased);
    if (progress < 1) requestAnimationFrame(step);
    else scrolling = null;
  };

  requestAnimationFrame(step);
}

function scrollToSection(target) {
  if (!target) return;

  scrollToY(documentTop(target) - navOffset());

  // Nothing loud: the section's own top rule lights up for a moment, so the
  // eye lands where the click pointed even if the heading is short.
  target.classList.remove('is-target');
  void target.offsetWidth;
  target.classList.add('is-target');
  setTimeout(() => target.classList.remove('is-target'), 1400);
}

function removeHash() {
  if (location.hash) history.replaceState(null, '', `${location.pathname}${location.search}`);
}

function readScrollPosition() {
  const stored = sessionStorage.getItem(SCROLL_POSITION_KEY);
  if (stored === null) return null;

  const value = Number(stored);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function saveScrollPosition() {
  sessionStorage.setItem(SCROLL_POSITION_KEY, String(Math.round(window.scrollY)));
}

function restoreScrollPosition(hashTarget) {
  const saved = readScrollPosition();
  const restore = () => {
    const requested = saved ?? (hashTarget ? documentTop(hashTarget) - navOffset() : 0);
    const limit = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    window.scrollTo(0, Math.max(0, Math.min(requested, limit)));
  };

  // Data and card frames fill asynchronously, so wait for two layout passes
  // before calculating the position.
  requestAnimationFrame(() => requestAnimationFrame(restore));
}

function setupNavigation() {
  for (const event of ['wheel', 'touchstart', 'pointerdown', 'keydown']) {
    window.addEventListener(event, stopScrolling, { passive: true });
  }

  const hashTarget = location.hash.length > 1
    ? document.getElementById(location.hash.slice(1))
    : null;
  removeHash();

  for (const anchor of document.querySelectorAll('a[href^="#"]')) {
    anchor.addEventListener('click', (clicked) => {
      const id = anchor.getAttribute('href').slice(1);
      const target = document.getElementById(id);
      if (!target) return;

      clicked.preventDefault();
      scrollToSection(target);
      removeHash();

      // Moving the page is not moving the reader: without this, the next tab
      // press would carry on from the link in the bar.
      target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    });
  }

  restoreScrollPosition(hashTarget);
}

/**
 * Fade each section in as it comes up. A page this long arrives as a wall of
 * figures otherwise, and the movement gives the eye an order to read them in.
 */
function setupReveal() {
  if (reducedMotion.matches) return;

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('is-in');
      observer.unobserve(entry.target);
    }
  }, { rootMargin: '0px 0px -10% 0px', threshold: 0.04 });

  for (const section of document.querySelectorAll('.section:not([hidden])')) {
    section.classList.add('will-reveal');
    observer.observe(section);
  }
}

/**
 * Mark the section the page is actually on. Read off the scroll position
 * rather than from an observer: with several short sections on screen at once,
 * whichever crossed the line last is the one the reader is in.
 */
function setupScrollSpy() {
  const links = [...document.querySelectorAll('.nav-links a')];
  const targets = links
    .map(anchor => ({ anchor, section: document.getElementById(anchor.getAttribute('href').slice(1)) }))
    .filter(entry => entry.section);

  const toTop = el('button', 'to-top');
  toTop.type = 'button';
  toTop.setAttribute('aria-label', 'Back to top');
  toTop.append(icon('arrowUp'));
  toTop.addEventListener('click', () => {
    scrollToY(0);
    removeHash();
  });
  document.body.append(toTop);

  const strip = document.querySelector('.nav-links');
  let queued = false;
  let marked = null;

  const update = () => {
    queued = false;
    saveScrollPosition();
    const line = window.scrollY + navOffset() + 8;

    let current = null;
    for (const entry of targets) {
      if (documentTop(entry.section) <= line) current = entry;
    }

    for (const { anchor } of targets) anchor.classList.toggle('is-active', anchor === current?.anchor);
    toTop.classList.toggle('is-visible', window.scrollY > window.innerHeight * 0.6);

    // On a phone the links are a strip that scrolls sideways, so the one being
    // marked has to be brought into it.
    if (current?.anchor !== marked) {
      marked = current?.anchor || null;

      if (marked && strip.scrollWidth > strip.clientWidth + 4) {
        strip.scrollTo({
          left: Math.max(0, marked.offsetLeft - (strip.clientWidth - marked.offsetWidth) / 2),
          behavior: reducedMotion.matches ? 'auto' : 'smooth'
        });
      }
    }
  };

  window.addEventListener('scroll', () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(update);
  }, { passive: true });

  window.addEventListener('resize', update, { passive: true });
  window.addEventListener('pagehide', saveScrollPosition);
  update();
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
  document.querySelector('[data-hero-title]').textContent = 'Diary unavailable';
  document.querySelector('[data-hero-subtitle]').textContent =
    'The generated diary data is currently unavailable.';
  document.querySelector('[data-hero-kpis]').hidden = true;
  document.querySelector('.nav-links').hidden = true;
  document.querySelector('.footer').hidden = true;

  for (const node of document.querySelectorAll('main > :not(.hero):not([data-load-error])')) {
    node.hidden = true;
  }

  const errorState = document.querySelector('[data-load-error]');
  errorState.hidden = false;
  errorState.querySelector('[data-retry]').addEventListener('click', () => location.reload(), { once: true });
  document.title = 'Letterboxd Graph — data unavailable';
  document.documentElement.classList.remove('is-loading');
}

async function main() {
  setupTheme();

  const [manifest, data] = await Promise.all([
    fetchJson('manifest.json'),
    fetchJson('data.json')
  ]);

  if (
    !manifest ||
    !Array.isArray(manifest.assets) ||
    !data ||
    typeof data !== 'object' ||
    Array.isArray(data) ||
    typeof data.user !== 'string'
  ) {
    throw new Error('Generated site data is incomplete');
  }

  const selectPeriod = () => {
    const resolved = resolvePeriod(location.search, data.byYear);
    if (resolved.invalid) history.replaceState(null, '', periodPath(location.href, null));

    const year = resolved.invalid ? null : resolved.year;
    const all = year ? data.byYear[year] : data.allTime;
    const diary = diaryForPeriod(data.user, year);

    resetPeriodSections();
    renderHero(data, manifest, all, year);
    renderWhen(all, diary, year, data.onThisDay);
    renderBreakdown(all, year);
    renderRatings(all, diary);
    renderDecades(all, diary);
    renderMilestones(all);
    renderPeriodMenu(data, year, selectPeriod);
    animatePeriodSections();
  };

  selectPeriod();
  setupPeriodPicker();
  window.addEventListener('popstate', selectPeriod);
  renderDiary(data.recent);

  for (const section of document.querySelectorAll('[data-section]')) {
    renderSection(section, manifest.assets.filter(asset => asset.kind === section.dataset.section), manifest);
  }

  // The page is its full height now, so the closing block and the footer can
  // come through — and the scroll position restored below lands where it left.
  document.documentElement.classList.remove('is-loading');

  setupNavigation();
  setupReveal();
  setupScrollSpy();
}

main().catch((error) => {
  console.error(error);
  showLoadError();
});
