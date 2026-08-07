/**
 * Year-in-Review card generator
 *
 * Renders a 1200x630 SVG summarising one year: the headline figures as icon
 * tiles on the left, the highest rated films as poster rows on the right. That
 * aspect ratio is the Open Graph default, so the card can be dropped into a
 * README, a blog post or a social preview as is.
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

// Content area inside the outer frame and the inner card
const CONTENT_LEFT = 52;
const CONTENT_RIGHT = 1148;
const DIVIDER_X = 606;
const LEFT_WIDTH = 538;
const RIGHT_X = 622;
const RIGHT_WIDTH = CONTENT_RIGHT - RIGHT_X;

// Stat tile grid: three columns, two rows
const TILE_WIDTH = 170;
const TILE_HEIGHT = 116;
const TILE_GAP = 14;
const TILE_TOP = 280;

// Top rated rows
const ROW_HEIGHT = 88;
const ROW_GAP = 8;
const ROW_TOP = 96;
const POSTER_WIDTH = 42;
const POSTER_HEIGHT = 63;
const TOP_FILM_COUNT = 5;

// Poster thumbnails are embedded at twice their rendered size so they stay
// crisp when the card is rasterised at 2x for social previews.
export const POSTER_PIXEL_WIDTH = POSTER_WIDTH * 2;
export const POSTER_PIXEL_HEIGHT = POSTER_HEIGHT * 2;

const STAR_COLOR = '#f5c518';

/**
 * 24x24 icon paths, drawn with a stroke so they stay legible when scaled down
 */
const ICONS = {
  films: '<path d="M3 8h18v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8Z"/><path d="M3 8 5.5 3h3L6 8m4 0 2.5-5h3L13 8m4 0 2.5-5h1.5A1.5 1.5 0 0 1 22.5 4.5V8"/>',
  daysActive: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 11h18"/>',
  streak: '<path d="M12 2c.5 3 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3a2.5 2.5 0 0 0 2.5 2.5A2.5 2.5 0 0 0 11 11c0-1.4-.5-2-1-3-1.1-2.1-.2-4 2-6Z"/>',
  rating: '<path d="m12 3 2.6 5.6 6 .8-4.4 4.2 1.1 6.1L12 16.8 6.7 19.7l1.1-6.1L3.4 9.4l6-.8L12 3Z"/>',
  rewatches: '<path d="M3 12a9 9 0 0 1 15.3-6.4L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.3 6.4L3 16"/><path d="M3 21v-5h5"/>',
  liked: '<path d="M12 20.3 4.6 13a4.6 4.6 0 0 1 6.5-6.5l.9.9.9-.9A4.6 4.6 0 1 1 19.4 13L12 20.3Z"/>',
  crown: '<path d="M3 7l4.5 4L12 4l4.5 7L21 7l-1.8 11H4.8L3 7Z"/>'
};

// One accent per tile, matching the roles the colors already have elsewhere:
// Letterboxd orange, green and blue, then the streak and like accents.
const TILE_ACCENTS = ['#ff8000', '#00e054', '#40bcf4', '#a78bfa', '#ff6b35', '#ff5c8a'];
const RANK_ACCENTS = ['#00e054', '#2ed46a', '#40bcf4', '#5b9dff', '#a78bfa'];

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
export function pickTopFilms(entries, limit = TOP_FILM_COUNT) {
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
 * Select the entries belonging to one calendar year
 * @param {Array} entries
 * @param {number} year
 * @returns {Array}
 */
export function entriesForYear(entries, year) {
  return entries.filter(entry => entry.date.getUTCFullYear() === year);
}

/**
 * Place a 24x24 icon at a given position and size
 * @param {string} path - Icon path markup
 * @param {number} x - Left edge
 * @param {number} y - Top edge
 * @param {number} size - Rendered size in pixels
 * @param {string} color - Stroke color
 * @returns {string} SVG markup
 */
function renderIcon(path, x, y, size, color) {
  const scale = size / 24;
  return `<g transform="translate(${x}, ${y}) scale(${scale.toFixed(4)})" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${path}</g>`;
}

/**
 * Generate the year-in-review card
 *
 * @param {Array} entries - Diary entries, filtered to the year here
 * @param {Object} options
 * @param {number} options.year - Year to summarise
 * @param {string} options.theme - 'dark' or 'light'
 * @param {string} options.palette - 'github' or 'letterboxd'
 * @param {string} options.username - Letterboxd username
 * @param {string} options.displayName - Profile display name
 * @param {string|null} options.profileImage - Data URI for the avatar
 * @param {Map<string, string>} options.posters - Film URL to poster data URI
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
    posters = new Map(),
    usernameGradient = true
  } = options;

  const t = getTheme(theme, palette);
  const isDark = theme !== 'light';

  // Surfaces sit slightly above the card background so the tiles read as raised
  // without needing shadows, which rasterise poorly at small sizes.
  const surface = isDark ? '#171c23' : '#f4f6f8';
  const surfaceBorder = isDark ? '#252c35' : '#e2e6ea';
  const cardBg = isDark ? '#12161c' : '#ffffff';
  const outerBg = isDark ? '#0b0e12' : '#eef1f4';

  const yearEntries = entriesForYear(entries, year);
  const streak = calculateStreak(yearEntries);
  const average = calculateAverageRating(yearEntries);

  const stats = [
    { icon: 'films', value: String(yearEntries.length), label: yearEntries.length === 1 ? 'Film' : 'Films' },
    { icon: 'daysActive', value: String(calculateDaysActive(yearEntries)), label: 'Days Active' },
    { icon: 'streak', value: String(streak.length), label: 'Day Streak' },
    { icon: 'rating', value: average === null ? '–' : average.toFixed(1), label: 'Average Rating' },
    { icon: 'rewatches', value: String(yearEntries.filter(entry => entry.rewatch).length), label: 'Rewatches' },
    { icon: 'liked', value: String(yearEntries.filter(entry => entry.liked).length), label: 'Liked' }
  ];

  const tilesMarkup = stats.map((stat, index) => {
    const x = CONTENT_LEFT + (index % 3) * (TILE_WIDTH + TILE_GAP);
    const y = TILE_TOP + Math.floor(index / 3) * (TILE_HEIGHT + TILE_GAP);
    const centerX = x + TILE_WIDTH / 2;
    return `
    <rect x="${x}" y="${y}" width="${TILE_WIDTH}" height="${TILE_HEIGHT}" rx="14" fill="${surface}" stroke="${surfaceBorder}" stroke-width="1"/>
    ${renderIcon(ICONS[stat.icon], centerX - 12, y + 20, 24, TILE_ACCENTS[index])}
    <text x="${centerX}" y="${y + 80}" font-size="32" font-weight="700" fill="${t.text}" text-anchor="middle">${escapeXml(stat.value)}</text>
    <text x="${centerX}" y="${y + 102}" font-size="13" font-weight="500" fill="${t.textMuted}" text-anchor="middle">${escapeXml(stat.label)}</text>`;
  }).join('');

  const topFilms = pickTopFilms(yearEntries);

  const rowsMarkup = topFilms.length === 0
    ? `
    <rect x="${RIGHT_X}" y="${ROW_TOP}" width="${RIGHT_WIDTH}" height="${ROW_HEIGHT}" rx="14" fill="${surface}" stroke="${surfaceBorder}" stroke-width="1"/>
    <text x="${RIGHT_X + RIGHT_WIDTH / 2}" y="${ROW_TOP + 48}" font-size="16" font-weight="500" fill="${t.textMuted}" text-anchor="middle">No rated films this year</text>`
    : topFilms.map((film, index) => {
      const y = ROW_TOP + index * (ROW_HEIGHT + ROW_GAP);
      const stars = formatStars(film.rating);
      const starsWidth = calculateTextWidth(stars, 17);
      const titleX = RIGHT_X + 112;
      const titleMax = CONTENT_RIGHT - 24 - starsWidth - 16 - titleX;
      const poster = posters.get(film.url);

      return `
    <rect x="${RIGHT_X}" y="${y}" width="${RIGHT_WIDTH}" height="${ROW_HEIGHT}" rx="14" fill="${surface}" stroke="${surfaceBorder}" stroke-width="1"/>
    <text x="${RIGHT_X + 28}" y="${y + 50}" font-size="22" font-weight="700" fill="${RANK_ACCENTS[index]}" text-anchor="middle">${index + 1}</text>
    <rect x="${RIGHT_X + 52}" y="${y + 12}" width="${POSTER_WIDTH}" height="${POSTER_HEIGHT}" rx="5" fill="${isDark ? '#0d1117' : '#dfe4e9'}"/>
    ${poster ? `<image href="${poster}" x="${RIGHT_X + 52}" y="${y + 12}" width="${POSTER_WIDTH}" height="${POSTER_HEIGHT}" clip-path="url(#posterClip${index})" preserveAspectRatio="xMidYMid slice"/>` : ''}
    <text x="${titleX}" y="${y + 40}" font-size="19" font-weight="600" fill="${t.text}">${escapeXml(truncateToWidth(film.title, 19, titleMax))}</text>
    <text x="${titleX}" y="${y + 62}" font-size="14" font-weight="500" fill="${t.textMuted}">${escapeXml(film.year || '')}</text>
    <text x="${CONTENT_RIGHT - 24}" y="${y + 52}" font-size="17" fill="${STAR_COLOR}" text-anchor="end">${escapeXml(stars)}</text>`;
    }).join('');

  const posterClips = topFilms.map((film, index) => `
    <clipPath id="posterClip${index}">
      <rect x="${RIGHT_X + 52}" y="${ROW_TOP + index * (ROW_HEIGHT + ROW_GAP) + 12}" width="${POSTER_WIDTH}" height="${POSTER_HEIGHT}" rx="5"/>
    </clipPath>`).join('');

  const svg = `<svg width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <clipPath id="reviewAvatarClip">
      <circle cx="30" cy="30" r="30"/>
    </clipPath>${posterClips}
    <linearGradient id="reviewGradient" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#FF8000"/>
      <stop offset="50%" stop-color="#00E054"/>
      <stop offset="100%" stop-color="#40BCF4"/>
    </linearGradient>
    <linearGradient id="frameGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#00E054" stop-opacity="0.9"/>
      <stop offset="35%" stop-color="#40BCF4" stop-opacity="0.25"/>
      <stop offset="65%" stop-color="#FF8000" stop-opacity="0.25"/>
      <stop offset="100%" stop-color="#00E054" stop-opacity="0.9"/>
    </linearGradient>
    <style type="text/css">
      <![CDATA[
      ${FONT_FACE_PLACEHOLDER}
      text { font-family: 'Inter', 'Segoe UI', Arial, sans-serif; }
      ]]>
    </style>
  </defs>

  <rect width="100%" height="100%" fill="${outerBg}"/>
  <rect x="8" y="8" width="${CARD_WIDTH - 16}" height="${CARD_HEIGHT - 16}" rx="26" fill="none" stroke="url(#frameGradient)" stroke-width="2"/>
  <rect x="26" y="26" width="${CARD_WIDTH - 52}" height="${CARD_HEIGHT - 52}" rx="18" fill="${cardBg}" stroke="${surfaceBorder}" stroke-width="1"/>

  <!-- Profile -->
  <g transform="translate(${CONTENT_LEFT}, 52)">
    <circle cx="30" cy="30" r="31" fill="${surfaceBorder}"/>
    ${profileImage
      ? `<image href="${profileImage}" x="0" y="0" width="60" height="60" clip-path="url(#reviewAvatarClip)"/>`
      : `<circle cx="30" cy="30" r="30" fill="${t.colors[2]}"/>`}
    <text x="76" y="27" font-size="27" font-weight="700" fill="${usernameGradient ? 'url(#reviewGradient)' : t.text}">${escapeXml(displayName)}</text>
    <text x="76" y="50" font-size="15" font-weight="500" fill="${t.textMuted}">@${escapeXml(username)}</text>
    <circle cx="${LEFT_WIDTH - 54}" cy="24" r="8" fill="#FF8000"/>
    <circle cx="${LEFT_WIDTH - 32}" cy="24" r="8" fill="#00E054"/>
    <circle cx="${LEFT_WIDTH - 10}" cy="24" r="8" fill="#40BCF4"/>
  </g>

  <!-- Hero -->
  <text x="${CONTENT_LEFT + LEFT_WIDTH / 2}" y="216" font-size="88" font-weight="700" fill="url(#reviewGradient)" text-anchor="middle">${year}</text>
  <line x1="${CONTENT_LEFT + 40}" y1="243" x2="${CONTENT_LEFT + 150}" y2="243" stroke="${surfaceBorder}" stroke-width="1"/>
  <line x1="${CONTENT_LEFT + LEFT_WIDTH - 150}" y1="243" x2="${CONTENT_LEFT + LEFT_WIDTH - 40}" y2="243" stroke="${surfaceBorder}" stroke-width="1"/>
  <text x="${CONTENT_LEFT + LEFT_WIDTH / 2}" y="248" font-size="14" font-weight="600" fill="${t.textMuted}" text-anchor="middle" letter-spacing="7">IN REVIEW</text>

  <!-- Headline figures -->
  ${tilesMarkup}

  <line x1="${DIVIDER_X}" y1="52" x2="${DIVIDER_X}" y2="${CARD_HEIGHT - 52}" stroke="${surfaceBorder}" stroke-width="1"/>

  <!-- Top rated -->
  ${renderIcon(ICONS.crown, RIGHT_X, 44, 24, STAR_COLOR)}
  <text x="${RIGHT_X + 36}" y="64" font-size="15" font-weight="700" fill="${t.text}" letter-spacing="3">TOP RATED</text>
  ${rowsMarkup}
</svg>`;

  return await inlineFonts(svg);
}
