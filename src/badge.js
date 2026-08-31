/**
 * Badge generator — editorial, site-matched
 *
 * Badges are small SVGs for GitHub README lines:
 *   ![Films](images/badge-films.svg)
 *
 * Unlike the contribution graph they are not theme split (dark/light) — a badge
 * is a single asset that works on both. The default style (`pill`) is built
 * from the Pages design tokens (site/styles.css:45) — 1px border, pill radius,
 * Inter, uppercase 0.06em — so a README row reads like the site's own filter
 * chips rather than a generic shields row.
 *
 * Styles:
 *   pill        — editorial pill, 26px, border, accent dot (default, site-matched)
 *   card        — panel, 28px, surface + border + rounded 6, stacked KPI feel
 *   dot         — pill with Letterboxd three-dot mark on the left
 *   flat        — legacy shields flat (kept for compat, 20px, 2-tone)
 *   flat-square — legacy shields square
 *   for-the-badge — legacy big uppercase
 *   plastic     — legacy flat with highlight
 */

import { escapeXml } from './svg-utils.js';

// Legacy shields palette kept for `flat*` compat — values are overridden by
// page tokens when the page style is used.
const STYLES = {
  // Page-matched — GitHub badge form (20× radius 3) but site palette
  pill:           { height: 20, radius: 3, fontSize: 11, labelWeight: 500, valueWeight: 700, uppercase: true, kind: 'pill' },
  card:           { height: 20, radius: 4, fontSize: 11, labelWeight: 500, valueWeight: 700, uppercase: true, kind: 'card' },
  dot:            { height: 20, radius: 3, fontSize: 11, labelWeight: 500, valueWeight: 700, uppercase: true, kind: 'dot' },
  // Legacy shields — unchanged geometry, page-tinted colours
  flat:           { height: 20, radius: 3, fontSize: 11, labelWeight: 400, valueWeight: 600, uppercase: false, kind: 'shields' },
  'flat-square':  { height: 20, radius: 0, fontSize: 11, labelWeight: 400, valueWeight: 600, uppercase: false, kind: 'shields' },
  'for-the-badge':{ height: 28, radius: 3, fontSize: 11, labelWeight: 600, valueWeight: 700, uppercase: true, kind: 'shields' },
  plastic:        { height: 20, radius: 3, fontSize: 11, labelWeight: 400, valueWeight: 600, uppercase: false, kind: 'shields', plastic: true },
};

// Page tokens — from site/styles.css:45 (--surface etc.) — dark theme is the
// source of truth, the same values the cards embed.
const PAGE = {
  background: '#12161a',
  surface: '#1c2228',
  surfaceElev: '#2c3440',
  border: '#2c3440',
  borderMed: '#445566',
  textLight: '#ddeeff',
  textPrimary: '#99aabb',
  textSecondary: '#667788',
  textMuted: '#556677',
  green: '#00e054',
  orange: '#ff8000',
  blue: '#40bcf4',
};

const DEFAULT_LABEL_COLOR = PAGE.surfaceElev;
const DEFAULT_VALUE_COLOR = PAGE.green;

// Letterboxd-ish palette for value sides / accent dots, picked per stat so
// badges are distinguishable at a glance without being rainbow.
const STAT_COLORS = {
  films: '#00e054',
  entries: '#00e054',
  days: '#40bcf4',
  streak: '#ff8000',
  rating: '#ff8000',
  liked: '#ff5c8a',
  rewatches: '#a78bfa',
  average: '#ff8000',
};

function measure(text, fontSize, weight = 400, uppercase = false) {
  // Badge text is short and sans — approximate width without pulling in the
  // full opentype subset machinery. The constant was measured against Inter
  // at 11px; close enough that badges do not need a second pass.
  const raw = uppercase ? text.toUpperCase() : text;
  const widths = { narrow: 0.45, normal: 0.55, wide: 0.62 }; // i,l vs m,w
  let w = 0;
  for (const ch of raw) {
    if ('ilI|!'.includes(ch)) w += widths.narrow;
    else if ('mwMW'.includes(ch)) w += widths.wide;
    else w += widths.normal;
  }
  const weightFactor = weight >= 600 ? 1.06 : 1;
  return Math.ceil(Math.ceil(raw.length * fontSize * 0.58 * weightFactor + 6) + (raw.length > 0 ? w * 2 : 0));
}

/**
 * Render a single badge.
 *
 * @param {string} label - Left side, e.g. "films"
 * @param {string} value - Right side, e.g. "626"
 * @param {object} options
 * @param {string} options.style - flat | flat-square | for-the-badge | plastic
 * @param {string} options.labelColor - Left background
 * @param {string} options.valueColor - Right background
 * @returns {string} SVG markup
 */
export function badgeSvg(label, value, { style = 'flat', labelColor = DEFAULT_LABEL_COLOR, valueColor = DEFAULT_VALUE_COLOR } = {}) {
  const cfg = STYLES[style] || STYLES.flat;
  const fontFamily = "Inter, 'Segoe UI', system-ui, -apple-system, sans-serif";

  // ── Page-matched styles: pill / card / dot ─────────────────────────────
  // Editorial, quiet: 1px border, surface background, dot in the stat colour,
  // uppercase 0.08em label (#667788) and tabular value (#ddeeff). The pill
  // reads like the site's own filter chips; the card like its KPI tiles.
  if (cfg.kind === 'pill' || cfg.kind === 'card' || cfg.kind === 'dot') {
    const h = cfg.height;
    const r = cfg.radius;
    const isDot = cfg.kind === 'dot';
    const isCard = cfg.kind === 'card';
    const labelText = cfg.uppercase ? label.toUpperCase() : label;
    const valueText = cfg.uppercase ? value.toUpperCase() : value;

    const labelW = measure(labelText, cfg.fontSize, cfg.labelWeight, true);
    const valueW = measure(valueText, cfg.fontSize, cfg.valueWeight, true);

    const iconW = isDot ? 22 : 0; // three dots + gap
    const dotR = isCard ? 3.5 : 3;
    const pad = isCard ? 12 : 10;
    const gapLabelToDivider = 8;
    const gapDividerToDot = 8;
    const gapDotToValue = 6;

    // divider is 1px line, dot is 7-8px incl. gap
    const dividerX = pad + iconW + labelW + gapLabelToDivider;
    const dotX = dividerX + 1 + gapDividerToDot + dotR;
    const valueX = dotX + dotR + gapDotToValue;
    const width = Math.ceil(valueX + valueW + pad);

    const bg = PAGE.surface;
    const border = PAGE.border;
    const labelFill = PAGE.textSecondary;
    const valueFill = PAGE.textLight;

    const dots = isDot
      ? `<g aria-hidden="true"><circle cx="${pad + 4}" cy="${h/2}" r="3.5" fill="${PAGE.green}"/><circle cx="${pad + 12}" cy="${h/2}" r="3.5" fill="${PAGE.orange}"/><circle cx="${pad + 20}" cy="${h/2}" r="3.5" fill="${PAGE.blue}"/></g>`
      : '';

    const labelX = pad + iconW + labelW / 2;
    const showLabel = !isDot || labelW > 0; // dot style keeps label but after dots

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${h}" role="img" aria-label="${escapeXml(label)}: ${escapeXml(value)}">
  <title>${escapeXml(label)}: ${escapeXml(value)}</title>
  <rect width="${width}" height="${h}" rx="${r}" fill="${bg}" stroke="${border}" stroke-width="1"/>
  ${dots}
  ${showLabel ? `<text x="${isDot ? pad + iconW + labelW/2 : labelX}" y="${h/2 + 3.5}" font-family="${fontFamily}" font-size="${cfg.fontSize}" font-weight="${cfg.labelWeight}" fill="${labelFill}" text-anchor="middle" letter-spacing="0.08em">${escapeXml(labelText)}</text>` : ''}
  <rect x="${dividerX}" y="5" width="1" height="${h - 10}" rx="0.5" fill="${border}"/>
  <circle cx="${dotX}" cy="${h/2}" r="${dotR}" fill="${valueColor}"/>
  <text x="${valueX}" y="${h/2 + 4}" font-family="${fontFamily}" font-size="11" font-weight="${cfg.valueWeight}" fill="${valueFill}" letter-spacing="0" style="font-variant-numeric: tabular-nums" text-anchor="start">${escapeXml(valueText)}</text>
</svg>`;
  }

  // ── Legacy shields path (flat / flat-square / for-the-badge / plastic) ─
  const h = cfg.height;
  const r = cfg.radius;
  const labelText = cfg.uppercase ? label.toUpperCase() : label;
  const valueText = cfg.uppercase ? value.toUpperCase() : value;

  const leftW = Math.max(28, measure(labelText, cfg.fontSize, cfg.labelWeight, false) + 10);
  const rightW = Math.max(28, measure(valueText, cfg.fontSize, cfg.valueWeight, false) + 10);
  const width = leftW + rightW;

  const plasticOverlay = cfg.plastic
    ? `<linearGradient id="p" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#fff" stop-opacity="0.25"/><stop offset="100%" stop-color="#fff" stop-opacity="0"/></linearGradient><rect width="${width}" height="${h/2}" rx="${r}" fill="url(#p)"/>`
    : '';

  const labelRect = r === 0
    ? `<rect width="${leftW}" height="${h}" fill="${labelColor}"/>`
    : `<rect width="${width}" height="${h}" rx="${r}" fill="${labelColor}"/><rect x="${leftW}" width="${rightW}" height="${h}" fill="${valueColor}"/>`;

  const clip = r !== 0 ? `<clipPath id="c"><rect width="${width}" height="${h}" rx="${r}"/></clipPath><g clip-path="url(#c)">` : '';
  const clipClose = r !== 0 ? `</g>` : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${h}" role="img" aria-label="${escapeXml(label)}: ${escapeXml(value)}">
  <title>${escapeXml(label)}: ${escapeXml(value)}</title>
  ${clip}${labelRect}${clipClose}
  ${plasticOverlay}
  <g fill="#fff" text-anchor="middle" font-family="${fontFamily}" font-size="${cfg.fontSize}">
    <text x="${leftW/2}" y="${h/2 + 4}" font-weight="${cfg.labelWeight}" fill="#fff" letter-spacing="${cfg.uppercase ? '0.5' : '0'}">${escapeXml(labelText)}</text>
    <text x="${leftW + rightW/2}" y="${h/2 + 4}" font-weight="${cfg.valueWeight}" fill="#fff" letter-spacing="${cfg.uppercase ? '0.5' : '0'}">${escapeXml(valueText)}</text>
  </g>
</svg>`;
}

/**
 * Pick a value colour for a named stat.
 * @param {string} stat - e.g. "films", "rating", "streak"
 * @returns {string}
 */
export function colorForStat(stat) {
  return STAT_COLORS[stat] || DEFAULT_VALUE_COLOR;
}

export const AVAILABLE_STYLES = Object.keys(STYLES);
export const AVAILABLE_STATS = ['films','days','streak','rating','liked','rewatches','entries'];

/**
 * Build the set of badges for a run.
 *
 * @param {object} stats - From buildAllTimeStats / calculateStreak etc.
 * @param {object} options
 * @param {string} options.style - Badge style
 * @param {string[]} options.stats - Which stats to render
 * @returns {Array<{slug: string, label: string, value: string, svg: string}>}
 */
export function buildBadges(stats, { style = 'flat', stats: wanted = ['films','rating','streak'] } = {}) {
  const all = {
    films: { label: 'films', value: String(stats.entries ?? stats.films ?? 0) },
    entries: { label: 'entries', value: String(stats.entries ?? 0) },
    days: { label: 'days active', value: String(stats.daysActive ?? 0) },
    streak: { label: 'day streak', value: String(stats.streak?.length ?? stats.streak ?? 0) },
    rating: { label: 'avg rating', value: stats.averageRating != null ? Number(stats.averageRating).toFixed(1) : '—' },
    liked: { label: 'liked', value: String(stats.liked ?? 0) },
    rewatches: { label: 'rewatches', value: String(stats.rewatches ?? 0) },
  };

  return wanted.map(key => {
    const entry = all[key];
    if (!entry) return null;
    return {
      slug: `badge-${key}`,
      label: entry.label,
      value: entry.value,
      svg: badgeSvg(entry.label, entry.value, { style, valueColor: colorForStat(key) })
    };
  }).filter(Boolean);
}
