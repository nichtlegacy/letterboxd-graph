/**
 * Badge generator — shields.io-style but self-contained and theme-matched
 *
 * Badges are small SVGs intended for GitHub README lines:
 *   ![Films](images/badge-films.svg)
 *
 * Unlike the contribution graph they are not theme split (dark/light) — a badge
 * is a single asset that works on both. Styles mirror the shields palette so
 * the README can pick the look that fits the rest of the profile.
 *
 * Styles:
 *   flat        — 20px, rounded 3, subtle shadow (default, most common)
 *   flat-square — same but square (no radius)
 *   for-the-badge — 28px, uppercase, heavier weight
 *   plastic     — flat + light gradient highlight
 */

import { escapeXml } from './svg-utils.js';

const STYLES = {
  flat:        { height: 20, radius: 3, fontSize: 11, labelWeight: 400, valueWeight: 600, uppercase: false },
  'flat-square': { height: 20, radius: 0, fontSize: 11, labelWeight: 400, valueWeight: 600, uppercase: false },
  'for-the-badge': { height: 28, radius: 3, fontSize: 11, labelWeight: 600, valueWeight: 700, uppercase: true },
  plastic:     { height: 20, radius: 3, fontSize: 11, labelWeight: 400, valueWeight: 600, uppercase: false, plastic: true },
};

const DEFAULT_LABEL_COLOR = '#2c3440';
const DEFAULT_VALUE_COLOR = '#00e054';

// Letterboxd-ish palette for value sides, picked per stat so badges are
// distinguishable at a glance without being rainbow.
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
  const h = cfg.height;
  const r = cfg.radius;
  const labelText = cfg.uppercase ? label.toUpperCase() : label;
  const valueText = cfg.uppercase ? value.toUpperCase() : value;

  const leftW = Math.max(28, measure(labelText, cfg.fontSize, cfg.labelWeight, false) + 10);
  const rightW = Math.max(28, measure(valueText, cfg.fontSize, cfg.valueWeight, false) + 10);
  const width = leftW + rightW;

  const fontFamily = "Inter, 'Segoe UI', system-ui, sans-serif";

  // Plastic highlight — exactly the way shields does it: a white gradient over
  // the top half of the badge.
  const plasticOverlay = cfg.plastic
    ? `<linearGradient id="p" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#fff" stop-opacity="0.25"/><stop offset="100%" stop-color="#fff" stop-opacity="0"/></linearGradient><rect width="${width}" height="${h/2}" rx="${r}" fill="url(#p)"/>`
    : '';

  // For square badges the divider between label and value must be a sharp line;
  // for rounded ones the two rects share the same outer radius and are clipped.
  const labelRect = r === 0
    ? `<rect width="${leftW}" height="${h}" fill="${labelColor}"/>`
    : `<rect width="${width}" height="${h}" rx="${r}" fill="${labelColor}"/><rect x="${leftW}" width="${rightW}" height="${h}" fill="${valueColor}"/>`;

  // Rounded case needs clipping so the value rect does not square the right edge
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
