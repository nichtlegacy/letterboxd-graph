/**
 * Year-in-Review card generator
 *
 * Renders a 1200x630 SVG summarising one year: the headline figures plus the
 * highest rated films. That aspect ratio is the Open Graph default, so the card
 * can be dropped into a README, a blog post or a social preview as is.
 */

import {
  calculateStreak,
  calculateDaysActive,
  calculateAverageRating
} from './stats.js';

import {
  FONT_FACE_PLACEHOLDER,
  inlineFonts,
  escapeXml,
  calculateTextWidth,
  DEFAULT_PALETTE,
  getTheme
} from './svg-utils.js';

const CARD_WIDTH = 1200;
const CARD_HEIGHT = 630;
const PADDING = 64;

// Right hand panel holding the top rated films
const PANEL_X = 640;
const PANEL_WIDTH = CARD_WIDTH - PANEL_X - PADDING;
const TOP_FILM_COUNT = 5;
const TOP_FILM_STEP = 62;

/**
 * Render a rating the way Letterboxd does, with a half star for the .5 steps
 * @param {number} rating - Rating from 0.5 to 5
 * @returns {string} e.g. "★★★★½"
 */
function formatStars(rating) {
  const full = Math.floor(rating);
  return '★'.repeat(full) + (rating - full >= 0.5 ? '½' : '');
}

/**
 * Shorten text to fit a pixel width, appending an ellipsis when it is cut.
 * @param {string} text
 * @param {number} fontSize
 * @param {number} maxWidth - Available width in pixels
 * @returns {string}
 */
function truncateToWidth(text, fontSize, maxWidth) {
  if (calculateTextWidth(text, fontSize) <= maxWidth) return text;

  let cut = text;
  while (cut.length > 1 && calculateTextWidth(`${cut}…`, fontSize) > maxWidth) {
    cut = cut.slice(0, -1);
  }
  return `${cut.trimEnd()}…`;
}

/**
 * Pick the highest rated films of the year.
 *
 * Deduplicated by title, because a rewatch is a separate diary entry and would
 * otherwise take two of the five slots. Ties are broken by the more recent
 * watch so the list stays stable rather than depending on input order.
 *
 * @param {Array} entries - Diary entries for the year
 * @param {number} limit
 * @returns {Array} Entries, highest rated first
 */
function pickTopFilms(entries, limit = TOP_FILM_COUNT) {
  const best = new Map();

  for (const entry of entries) {
    if (!entry.rating) continue;

    const existing = best.get(entry.title);
    if (!existing
      || entry.rating > existing.rating
      || (entry.rating === existing.rating && entry.date > existing.date)) {
      best.set(entry.title, entry);
    }
  }

  return [...best.values()]
    .sort((a, b) => b.rating - a.rating || b.date.getTime() - a.date.getTime())
    .slice(0, limit);
}

/**
 * Generate the year-in-review card
 *
 * @param {Array} entries - Diary entries, filtered to the year by the caller or here
 * @param {Object} options
 * @param {number} options.year - Year to summarise
 * @param {string} options.theme - 'dark' or 'light'
 * @param {string} options.palette - 'github' or 'letterboxd'
 * @param {string} options.username - Letterboxd username
 * @param {string} options.displayName - Profile display name
 * @param {string|null} options.profileImage - Data URI for the avatar
 * @param {string|null} options.logoBase64 - Data URI for the Letterboxd logo
 * @param {boolean} options.usernameGradient - Color the display name
 * @returns {Promise<string>} SVG markup
 */
export async function generateReviewCard(entries, options = {}) {
  const {
    year = new Date().getFullYear(),
    theme = 'dark',
    palette = DEFAULT_PALETTE,
    username = '',
    displayName = username,
    profileImage = null,
    logoBase64 = null,
    usernameGradient = true
  } = options;

  const t = getTheme(theme, palette);
  const yearEntries = entries.filter(entry => entry.date.getUTCFullYear() === year);

  const streak = calculateStreak(yearEntries);
  const average = calculateAverageRating(yearEntries);
  const stats = [
    { value: String(yearEntries.length), label: yearEntries.length === 1 ? 'Film' : 'Films' },
    { value: String(calculateDaysActive(yearEntries)), label: 'Days Active' },
    { value: String(streak.length), label: 'Day Streak' },
    // The star is set smaller than the figure so it reads as a unit rather than
    // as another digit.
    { value: average === null ? '–' : average.toFixed(1), suffix: average === null ? '' : '★', label: 'Average Rating' },
    { value: String(yearEntries.filter(entry => entry.rewatch).length), label: 'Rewatches' },
    { value: String(yearEntries.filter(entry => entry.liked).length), label: 'Liked' }
  ];

  const topFilms = pickTopFilms(yearEntries);

  const statsMarkup = stats.map((stat, index) => {
    const x = PADDING + (index % 2) * 236;
    const y = 350 + Math.floor(index / 2) * 90;
    const suffix = stat.suffix
      ? `<tspan font-size="26" fill="${t.textMuted}">${escapeXml(stat.suffix)}</tspan>`
      : '';
    return `
    <text x="${x}" y="${y + 40}" font-size="40" font-weight="600" fill="${t.text}">${escapeXml(stat.value)}${suffix}</text>
    <text x="${x}" y="${y + 64}" font-size="15" font-weight="500" fill="${t.textMuted}">${escapeXml(stat.label)}</text>`;
  }).join('');

  const filmsMarkup = topFilms.length === 0
    ? `
    <text x="${PANEL_X}" y="286" font-size="18" font-weight="500" fill="${t.textMuted}">No rated films this year</text>`
    : topFilms.map((film, index) => {
      const y = 278 + index * TOP_FILM_STEP;
      const rankWidth = 40;
      const title = truncateToWidth(film.title, 22, PANEL_WIDTH - rankWidth);
      const meta = [film.year, formatStars(film.rating)].filter(Boolean).join(' · ');
      return `
    <text x="${PANEL_X}" y="${y}" font-size="20" font-weight="600" fill="${t.colors[3]}">${index + 1}</text>
    <text x="${PANEL_X + rankWidth}" y="${y}" font-size="22" font-weight="600" fill="${t.text}">${escapeXml(title)}</text>
    <text x="${PANEL_X + rankWidth}" y="${y + 22}" font-size="15" font-weight="500" fill="${t.textMuted}">${escapeXml(meta)}</text>`;
    }).join('');

  const svg = `<svg width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <clipPath id="reviewAvatarClip">
      <circle cx="36" cy="36" r="36"/>
    </clipPath>
    <linearGradient id="reviewGradient" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#FF8000"/>
      <stop offset="50%" stop-color="#00E054"/>
      <stop offset="100%" stop-color="#40BCF4"/>
    </linearGradient>
    <style type="text/css">
      <![CDATA[
      ${FONT_FACE_PLACEHOLDER}
      text { font-family: 'Inter', 'Segoe UI', Arial, sans-serif; }
      ]]>
    </style>
  </defs>

  <rect width="100%" height="100%" rx="16" fill="${t.bg}" stroke="${t.cardBorder}" stroke-width="1"/>

  <!-- Header -->
  <g transform="translate(${PADDING}, 56)">
    <circle cx="36" cy="36" r="37" fill="${t.cardBorder}"/>
    ${profileImage
      ? `<image href="${profileImage}" x="0" y="0" width="72" height="72" clip-path="url(#reviewAvatarClip)"/>`
      : `<circle cx="36" cy="36" r="36" fill="${t.colors[2]}"/>`}
    <text x="96" y="34" font-size="30" font-weight="600" fill="${usernameGradient ? 'url(#reviewGradient)' : t.text}">${escapeXml(displayName)}</text>
    <text x="96" y="60" font-size="16" font-weight="500" fill="${t.textMuted}">@${escapeXml(username)}</text>
    ${logoBase64 ? `<image href="${logoBase64}" x="${CARD_WIDTH - 2 * PADDING - 64}" y="4" width="64" height="64"/>` : ''}
  </g>

  <!-- Hero -->
  <text x="${PADDING}" y="272" font-size="96" font-weight="700" fill="url(#reviewGradient)">${year}</text>
  <text x="${PADDING}" y="306" font-size="18" font-weight="500" fill="${t.textMuted}" letter-spacing="3">IN REVIEW</text>

  <!-- Headline figures -->
  ${statsMarkup}

  <!-- Top rated films -->
  <line x1="${PANEL_X - 40}" y1="200" x2="${PANEL_X - 40}" y2="560" stroke="${t.cardBorder}" stroke-width="1"/>
  <text x="${PANEL_X}" y="226" font-size="15" font-weight="600" fill="${t.textMuted}" letter-spacing="2">TOP RATED</text>
  ${filmsMarkup}
</svg>`;

  return await inlineFonts(svg);
}
