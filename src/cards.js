/**
 * Shareable card generators
 *
 * Two 1200x630 SVGs built from the same parts: a year-in-review card, and a
 * profile card that is not tied to a single year. That aspect ratio is the Open
 * Graph default, so either can be dropped into a README, a blog post or a
 * social preview as is.
 */

import {
  calculateStreak,
  calculateDaysActive,
  calculateAverageRating,
  filmKey
} from './stats.js';

import {
  FONT_FACE_PLACEHOLDER,
  inlineFonts,
  escapeXml,
  calculateTextWidth,
  getTheme
} from './svg-utils.js';

const CARD_WIDTH = 1200;
const CARD_HEIGHT = 630;
const CARD_RADIUS = 20;

// Content area. The card is full bleed, so PADDING is a plain margin on all
// four sides and everything else is derived from it, which keeps the two
// columns and the two cards in step when it changes.
const PADDING = 38;
const COLUMN_GAP = 16;
const CONTENT_TOP = PADDING;
const CONTENT_LEFT = PADDING;
const CONTENT_RIGHT = CARD_WIDTH - PADDING;
const CONTENT_WIDTH = CONTENT_RIGHT - CONTENT_LEFT;

const LEFT_WIDTH = 556;
const DIVIDER_X = CONTENT_LEFT + LEFT_WIDTH + COLUMN_GAP;
const RIGHT_X = DIVIDER_X + COLUMN_GAP;
const RIGHT_WIDTH = CONTENT_RIGHT - RIGHT_X;

// Top rated rows. With nothing above them the list starts level with the
// profile block; a heading pushes it down and the rows give up the difference,
// so both columns still finish on the same line.
const CONTENT_BOTTOM = CARD_HEIGHT - PADDING;
const ROW_GAP = 11;
const POSTER_WIDTH = 51;
const POSTER_HEIGHT = 76;
const TOP_FILM_COUNT = 5;
const LIST_HEADING_Y = CONTENT_TOP + 14;
const LIST_HEADING_SPACE = 28;

/**
 * Row height that makes the list end exactly at the content bottom
 * @param {number} top - Where the first row starts
 * @returns {number}
 */
function rowHeightFrom(top) {
  return (CONTENT_BOTTOM - top - (TOP_FILM_COUNT - 1) * ROW_GAP) / TOP_FILM_COUNT;
}

// Hero block between the profile and the tiles
const HERO_BASELINE = 202;
const HERO_RULE_Y = 229;
const HERO_LABEL_Y = 234;

// Stat tile grid: three columns, two rows
const TILE_GAP = 14;
const TILE_TOP = 266;
const TILE_WIDTH = (LEFT_WIDTH - 2 * TILE_GAP) / 3;
const TILE_HEIGHT = (CONTENT_BOTTOM - TILE_TOP - TILE_GAP) / 2;

export const POSTER_PIXEL_WIDTH = POSTER_WIDTH * 2;
export const POSTER_PIXEL_HEIGHT = POSTER_HEIGHT * 2;

// Letterboxd renders ratings in its signature green, so the stars follow suit
// rather than using a generic gold.
const STAR_COLOR = '#00e054';

/**
 * 24x24 icon paths, drawn with a stroke so they stay legible when scaled down
 */
const ICONS = {
  films: '<rect x="2" y="9" width="20" height="12" rx="2"/><path d="M2 9V5.5A1.5 1.5 0 0 1 3.5 4h17A1.5 1.5 0 0 1 22 5.5V9"/><path d="m7 4-2 5M12 4l-2 5M17 4l-2 5"/>',
  daysActive: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 11h18"/>',
  streak: '<path d="M12 2c.5 3 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3a2.5 2.5 0 0 0 2.5 2.5A2.5 2.5 0 0 0 11 11c0-1.4-.5-2-1-3-1.1-2.1-.2-4 2-6Z"/>',
  rating: '<path d="m12 3 2.6 5.6 6 .8-4.4 4.2 1.1 6.1L12 16.8 6.7 19.7l1.1-6.1L3.4 9.4l6-.8L12 3Z"/>',
  rewatches: '<path d="M3 12a9 9 0 0 1 15.3-6.4L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.3 6.4L3 16"/><path d="M3 21v-5h5"/>',
  liked: '<path d="M12 20.3 4.6 13a4.6 4.6 0 0 1 6.5-6.5l.9.9.9-.9A4.6 4.6 0 1 1 19.4 13L12 20.3Z"/>'
};

// One accent per tile, matching the roles the colors already have elsewhere:
// Letterboxd orange, green and blue, then the streak and like accents.
const TILE_ACCENTS = ['#ff8000', '#00e054', '#40bcf4', '#a78bfa', '#ff6b35', '#ff5c8a'];
// The three Letterboxd brand colors, grouped so the ranks read as tiers rather
// than as five unrelated colors: the top two, the middle two, then the last.
const RANK_ACCENTS = ['#FF8000', '#FF8000', '#00E054', '#00E054', '#40BCF4'];

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

// Ranking weights. A rating step is 0.5, and the bonuses add up to at most
// 0.46, so a film can never overtake one rated half a star higher. They only
// decide the order *within* a rating, which is where the real problem is: a
// typical year has a handful of films at the top rating and a dozen tied one
// step below, and the last slots would otherwise be filled arbitrarily.
const LIKE_BONUS = 0.3;
const REWATCH_BONUS = 0.08;
const MAX_REWATCH_BONUS = 0.16;

/**
 * Draw the Pro or Patron badge over the bottom left of the avatar.
 *
 * Same placement and colors as the contribution graph, scaled down for the
 * card's smaller avatar so a profile looks the same wherever it is rendered.
 *
 * @param {string|null} memberStatus - 'patron', 'pro' or null
 * @returns {string} SVG markup, empty for a member with neither
 */
function renderMemberBadge(memberStatus) {
  if (memberStatus !== 'patron' && memberStatus !== 'pro') return '';

  const isPatron = memberStatus === 'patron';
  const width = isPatron ? 44 : 30;

  return `<g transform="translate(-4, 44)">
      <rect x="0" y="0" width="${width}" height="17" rx="3" fill="${isPatron ? '#40bcf4' : '#ff8000'}"/>
      <text x="${width / 2}" y="12" font-size="9" font-weight="700" fill="#ffffff" text-anchor="middle" letter-spacing="0.5">${isPatron ? 'PATRON' : 'PRO'}</text>
    </g>`;
}

/**
 * Format a runtime in minutes the way a viewer thinks about it
 * @param {number} minutes
 * @returns {string} e.g. "1h 57m" or "48m"
 */
function formatRuntime(minutes) {
  if (!minutes || minutes <= 0) return '';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours > 0 ? `${hours}h ${rest}m` : `${rest}m`;
}

/**
 * Build the secondary line of a film row.
 *
 * The community average is set apart from the viewer's own rating, which sits
 * on the right in Letterboxd green, by being muted and prefixed with a star
 * rather than drawn as one.
 *
 * @param {Object} film - Aggregated film record
 * @param {Object} detail - Extra data read from the film page
 * @returns {string}
 */
function filmMetaLine(film, detail = {}) {
  return [
    film.year || '',
    formatRuntime(detail.runtime),
    detail.averageRating ? `★ ${detail.averageRating.toFixed(1)}` : ''
  ].filter(Boolean).join('  ·  ');
}

/**
 * Link target for an aggregated film.
 *
 * A rewatch is logged at /<user>/film/<slug>/2/, which is that one viewing. The
 * card shows the film, not a viewing, so the trailing index is dropped.
 *
 * @param {Object} film - Aggregated film record
 * @param {string} fallback - Used when the film carries no URL
 * @returns {string}
 */
function filmLink(film, fallback) {
  if (!film.url) return fallback;
  return film.url.replace(/\/\d+\/?$/, '/');
}

/**
 * Score a film for the top rated list.
 *
 * Rating is the primary signal. A like is the strongest secondary one — people
 * like sparingly, so it says more than a rewatch. Repeat viewings add a little,
 * with diminishing returns, so a comfort watch does not outrank everything.
 *
 * @param {Object} film - Aggregated film record
 * @returns {number}
 */
function scoreFilm(film) {
  const rewatchBonus = Math.min((film.watches - 1) * REWATCH_BONUS, MAX_REWATCH_BONUS);
  return film.rating + (film.liked ? LIKE_BONUS : 0) + rewatchBonus;
}

/**
 * Aggregate diary entries into one record per film.
 *
 * A rewatch is a separate diary entry, so without this a film could take
 * several of the available slots. The best rating wins, and the like and
 * rewatch signals are merged across all viewings of that film.
 *
 * @param {Array} entries - Diary entries for the period
 * @returns {Array} One record per film, carrying watches/liked/rating
 */
export function aggregateFilms(entries) {
  const films = new Map();

  for (const entry of entries) {
    // Keyed on the film, not the title: two different films can share one.
    const key = filmKey(entry);
    const existing = films.get(key);

    if (!existing) {
      films.set(key, {
        ...entry,
        rating: entry.rating || 0,
        watches: 1,
        liked: Boolean(entry.liked)
      });
      continue;
    }

    existing.watches++;
    existing.liked = existing.liked || Boolean(entry.liked);
    if ((entry.rating || 0) > existing.rating) {
      existing.rating = entry.rating;
      existing.url = entry.url;
      existing.year = entry.year;
    }
    if (entry.date > existing.date) existing.date = entry.date;
  }

  return [...films.values()];
}

/**
 * Break text into at most `maxLines` lines that each fit a pixel width.
 *
 * Breaks on spaces so a title reads as words rather than being sliced
 * mid-syllable. Only the final line is ellipsised, and only if the text still
 * does not fit.
 *
 * @param {string} text
 * @param {number} fontSize
 * @param {number} maxWidth
 * @param {number} maxLines
 * @returns {string[]}
 */
function wrapToWidth(text, fontSize, maxWidth, maxLines = 2) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;

    if (calculateTextWidth(candidate, fontSize) <= maxWidth) {
      current = candidate;
      continue;
    }

    if (current) lines.push(current);
    current = word;

    if (lines.length === maxLines - 1) break;
  }

  if (lines.length < maxLines) lines.push(current);

  // Whatever is left over goes on the last line, truncated if it has to be.
  const consumed = lines.join(' ').split(/\s+/).filter(Boolean).length;
  if (consumed < words.length) {
    lines[lines.length - 1] = words.slice(consumed - lines[lines.length - 1].split(' ').length).join(' ');
  }
  lines[lines.length - 1] = truncateToWidth(lines[lines.length - 1], fontSize, maxWidth);

  return lines.filter(Boolean);
}

/**
 * Pick the top rated films of a period, best first.
 *
 * @param {Array} entries - Diary entries for the period
 * @param {number} limit
 * @returns {Array} Aggregated film records, highest scoring first
 */
export function pickTopFilms(entries, limit = TOP_FILM_COUNT) {
  return aggregateFilms(entries)
    .filter(film => film.rating > 0)
    .sort((a, b) =>
      scoreFilm(b) - scoreFilm(a)
      || b.watches - a.watches
      || b.date.getTime() - a.date.getTime())
    .slice(0, limit);
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

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
 * Select the entries belonging to one period.
 *
 * A period is a year, or a single month within one. The card is the same
 * either way, so the only thing that changes is what falls inside it.
 *
 * @param {Array} entries
 * @param {{year: number, month?: number|null}} period - month is 1-12
 * @returns {Array}
 */
export function entriesForPeriod(entries, { year, month = null }) {
  return entries.filter(entry =>
    entry.date.getUTCFullYear() === year
    && (month === null || entry.date.getUTCMonth() + 1 === month));
}

/**
 * Headline and subtitle for a period.
 *
 * A year is its own headline. A month leads with its name and carries the year
 * in the subtitle, so "August 2026" does not have to compete for the same line.
 *
 * @param {{year: number, month?: number|null}} period
 * @returns {{headline: string, subtitle: string}}
 */
export function periodLabels({ year, month = null }) {
  return month === null
    ? { headline: String(year), subtitle: 'IN REVIEW' }
    : { headline: MONTH_NAMES[month - 1], subtitle: `${year} IN REVIEW` };
}

/**
 * Largest font size at which the headline still fits the column.
 *
 * "September" is a good deal wider than "2026" at the same size, so the
 * headline is measured rather than assumed to fit.
 *
 * @param {string} headline
 * @param {number} maxWidth
 * @returns {number}
 */
function headlineFontSize(headline, maxWidth) {
  let size = 88;
  while (size > 40 && calculateTextWidth(headline, size) > maxWidth) size -= 2;
  return size;
}

/**
 * Rules flanking the hero subtitle.
 *
 * The subtitle is wider for a month than for a year ("2026 IN REVIEW" against
 * "IN REVIEW"), so the rules are measured against it rather than pinned, and
 * dropped entirely when there is no room left for them.
 *
 * @param {string} subtitle
 * @param {number} fontSize
 * @param {number} letterSpacing
 * @returns {{left: [number, number], right: [number, number]}|null}
 */
function heroRules(subtitle, fontSize, letterSpacing) {
  const centre = CONTENT_LEFT + LEFT_WIDTH / 2;
  const textWidth = calculateTextWidth(subtitle, fontSize) + letterSpacing * Math.max(subtitle.length - 1, 0);
  const innerEdge = textWidth / 2 + 22;
  const outerEdge = LEFT_WIDTH / 2 - 40;

  if (outerEdge - innerEdge < 30) return null;

  return {
    left: [centre - outerEdge, centre - innerEdge],
    right: [centre + innerEdge, centre + outerEdge]
  };
}

/**
 * File name stem for a period's cards, e.g. "2026" or "2026-08"
 * @param {{year: number, month?: number|null}} period
 * @returns {string}
 */
export function periodSlug({ year, month = null }) {
  return month === null ? String(year) : `${year}-${String(month).padStart(2, '0')}`;
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
 * @param {number|null} options.month - Month 1-12 to narrow it to, or null for the whole year
 * @param {string} options.topFilms - 'watched' ranks everything seen in the period,
 *   'released' keeps only films released in its year. Year cards only; a month
 *   card always ranks everything watched.
 * @param {string} options.theme - 'dark' or 'light'
 * @param {string} options.username - Letterboxd username
 * @param {string} options.displayName - Profile display name
 * @param {string|null} options.profileImage - Data URI for the avatar
 * @param {string|null} options.logoBase64 - Data URI for the Letterboxd logo
 * @param {Map<string, string>} options.posters - Film URL to poster data URI
 * @param {Map<string, Object>} options.details - Film URL to runtime and community rating
 * @param {string|null} options.memberStatus - 'patron', 'pro' or null
 * @param {boolean} options.usernameGradient - Color the display name
 * @param {boolean} options.yearGradient - Color the year headline
 * @returns {Promise<string>} SVG markup
 */
export async function generateReviewCard(entries, options = {}) {
  const {
    year = new Date().getFullYear(),
    month = null,
    topFilms: topFilmScope = 'watched',
    theme = 'dark',
    username = '',
    displayName = username,
    profileImage = null,
    logoBase64 = null,
    posters = new Map(),
    details = new Map(),
    memberStatus = null,
    usernameGradient = true,
    yearGradient = true
  } = options;

  const t = getTheme(theme);
  const isDark = theme !== 'light';
  const profileUrl = `https://letterboxd.com/${username}/`;

  // Surfaces sit slightly above the card background so the tiles read as raised
  // without needing shadows, which rasterise poorly at small sizes.
  const surface = isDark ? '#171c23' : '#f4f6f8';
  const surfaceBorder = isDark ? '#252c35' : '#e2e6ea';
  const cardBg = isDark ? '#12161c' : '#ffffff';

  const period = { year, month };
  const { headline, subtitle } = periodLabels(period);
  const rules = heroRules(subtitle, 14, 7);
  const yearEntries = entriesForPeriod(entries, period);
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
    ${renderIcon(ICONS[stat.icon], centerX - 14, y + 30, 28, TILE_ACCENTS[index])}
    <text x="${centerX}" y="${y + 108}" font-size="38" font-weight="700" fill="${t.text}" text-anchor="middle">${escapeXml(stat.value)}</text>
    <text x="${centerX}" y="${y + 136}" font-size="14" font-weight="500" fill="${t.textMuted}" text-anchor="middle">${escapeXml(stat.label)}</text>`;
  }).join('');

  // 'released' turns the list from "the best I watched" into "the best of that
  // year", which is a different claim and so gets a heading to say which it is.
  //
  // It applies to years only. A month is far too small a window to also demand
  // the film came out that year: one month of 2026 releases is a handful of
  // titles at best and usually none at all.
  const releasesOnly = topFilmScope === 'released' && month === null;
  const listEntries = releasesOnly
    ? yearEntries.filter(entry => String(entry.year) === String(year))
    : yearEntries;
  const topFilms = pickTopFilms(listEntries);

  const listTop = releasesOnly ? CONTENT_TOP + LIST_HEADING_SPACE : CONTENT_TOP;
  const rowHeight = rowHeightFrom(listTop);

  // An empty period gets a panel the size of the list it replaces. A single
  // short row left the column looking broken rather than quiet.
  const emptyHeight = CONTENT_BOTTOM - listTop;
  const rowsMarkup = topFilms.length === 0
    ? `
    <rect x="${RIGHT_X}" y="${listTop}" width="${RIGHT_WIDTH}" height="${emptyHeight}" rx="14" fill="${surface}" stroke="${surfaceBorder}" stroke-width="1" stroke-dasharray="6 6"/>
    ${renderIcon(ICONS.films, RIGHT_X + RIGHT_WIDTH / 2 - 22, listTop + emptyHeight / 2 - 62, 44, t.textMuted)}
    <text x="${RIGHT_X + RIGHT_WIDTH / 2}" y="${listTop + emptyHeight / 2 + 6}" font-size="19" font-weight="600" fill="${t.text}" text-anchor="middle">${releasesOnly ? `No ${year} releases logged` : `Nothing logged ${month === null ? 'this year' : 'this month'}`}</text>
    <text x="${RIGHT_X + RIGHT_WIDTH / 2}" y="${listTop + emptyHeight / 2 + 32}" font-size="14" font-weight="500" fill="${t.textMuted}" text-anchor="middle">${escapeXml(headline)}${month === null ? '' : ` ${year}`} is still waiting for its first film</text>`
    : topFilms.map((film, index) => {
      const y = listTop + index * (rowHeight + ROW_GAP);
      const midY = y + rowHeight / 2;
      const stars = formatStars(film.rating);
      const starsWidth = calculateTextWidth(stars, 18);
      const posterX = RIGHT_X + 58;
      const titleX = posterX + POSTER_WIDTH + 20;
      const titleMax = CONTENT_RIGHT - 26 - starsWidth - 18 - titleX;
      const posterY = y + (rowHeight - POSTER_HEIGHT) / 2;
      const poster = posters.get(film.url);

      return `
    <rect x="${RIGHT_X}" y="${y}" width="${RIGHT_WIDTH}" height="${rowHeight}" rx="14" fill="${surface}" stroke="${surfaceBorder}" stroke-width="1"/>
    <circle cx="${RIGHT_X + 32}" cy="${midY}" r="16" fill="${RANK_ACCENTS[index]}" fill-opacity="0.16" stroke="${RANK_ACCENTS[index]}" stroke-opacity="0.5" stroke-width="1"/>
    <text x="${RIGHT_X + 32}" y="${midY + 7}" font-size="19" font-weight="700" fill="${RANK_ACCENTS[index]}" text-anchor="middle">${index + 1}</text>
    <a href="${filmLink(film, profileUrl)}">
      <rect x="${posterX}" y="${posterY}" width="${POSTER_WIDTH}" height="${POSTER_HEIGHT}" rx="5" fill="${isDark ? '#0d1117' : '#dfe4e9'}"/>
      ${poster ? `<image href="${poster}" x="${posterX}" y="${posterY}" width="${POSTER_WIDTH}" height="${POSTER_HEIGHT}" clip-path="url(#posterClip${index})" preserveAspectRatio="xMidYMid slice"/>` : ''}
      <rect x="${posterX}" y="${posterY}" width="${POSTER_WIDTH}" height="${POSTER_HEIGHT}" rx="5" fill="none" stroke="${isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)'}" stroke-width="1"/>
    </a>
    <a href="${filmLink(film, profileUrl)}">
      <text x="${titleX}" y="${midY - 4}" font-size="20" font-weight="600" fill="${t.text}">${escapeXml(truncateToWidth(film.title, 20, titleMax))}</text>
    </a>
    <text x="${titleX}" y="${midY + 20}" font-size="14" font-weight="500" fill="${t.textMuted}">${escapeXml(filmMetaLine(film, details.get(film.url)))}</text>
    <text x="${CONTENT_RIGHT - 26}" y="${midY + 6}" font-size="18" fill="${STAR_COLOR}" text-anchor="end">${escapeXml(stars)}</text>`;
    }).join('');

  const posterClips = topFilms.map((film, index) => `
    <clipPath id="posterClip${index}">
      <rect x="${RIGHT_X + 58}" y="${listTop + index * (rowHeight + ROW_GAP) + (rowHeight - POSTER_HEIGHT) / 2}" width="${POSTER_WIDTH}" height="${POSTER_HEIGHT}" rx="5"/>
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
    <style type="text/css">
      <![CDATA[
      ${FONT_FACE_PLACEHOLDER}
      text { font-family: 'Inter', 'Segoe UI', Arial, sans-serif; }
      a { cursor: pointer; }
      ]]>
    </style>
  </defs>

  <rect width="100%" height="100%" rx="${CARD_RADIUS}" fill="${cardBg}"/>

  <!-- Profile -->
  <g transform="translate(${CONTENT_LEFT}, ${CONTENT_TOP})">
    <a href="${profileUrl}">
      <circle cx="30" cy="30" r="31" fill="${surfaceBorder}"/>
      ${profileImage
        ? `<image href="${profileImage}" x="0" y="0" width="60" height="60" clip-path="url(#reviewAvatarClip)"/>`
        : `<circle cx="30" cy="30" r="30" fill="${t.colors[2]}"/>`}
    </a>
    ${renderMemberBadge(memberStatus)}
    <a href="${profileUrl}">
      <text x="76" y="27" font-size="27" font-weight="700" fill="${usernameGradient ? 'url(#reviewGradient)' : t.text}">${escapeXml(displayName)}</text>
    </a>
    <a href="${profileUrl}">
      <text x="76" y="50" font-size="15" font-weight="500" fill="${t.textMuted}">@${escapeXml(username)}</text>
    </a>
    <a href="https://letterboxd.com/">
      ${logoBase64
        ? `<image href="${logoBase64}" x="${LEFT_WIDTH - 60}" y="0" width="60" height="60"/>`
        : `<circle cx="${LEFT_WIDTH - 46}" cy="30" r="8" fill="#FF8000"/>
      <circle cx="${LEFT_WIDTH - 24}" cy="30" r="8" fill="#00E054"/>
      <circle cx="${LEFT_WIDTH - 2}" cy="30" r="8" fill="#40BCF4"/>`}
    </a>
  </g>

  <!-- Hero -->
  <text x="${CONTENT_LEFT + LEFT_WIDTH / 2}" y="${HERO_BASELINE}" font-size="${headlineFontSize(headline, LEFT_WIDTH - 40)}" font-weight="700" fill="${yearGradient ? 'url(#reviewGradient)' : t.text}" text-anchor="middle">${escapeXml(headline)}</text>
  ${rules ? `<line x1="${rules.left[0]}" y1="${HERO_RULE_Y}" x2="${rules.left[1]}" y2="${HERO_RULE_Y}" stroke="${surfaceBorder}" stroke-width="1"/>
  <line x1="${rules.right[0]}" y1="${HERO_RULE_Y}" x2="${rules.right[1]}" y2="${HERO_RULE_Y}" stroke="${surfaceBorder}" stroke-width="1"/>` : ''}
  <text x="${CONTENT_LEFT + LEFT_WIDTH / 2}" y="${HERO_LABEL_Y}" font-size="14" font-weight="600" fill="${t.textMuted}" text-anchor="middle" letter-spacing="7">${escapeXml(subtitle)}</text>

  <!-- Headline figures -->
  ${tilesMarkup}

  <line x1="${DIVIDER_X}" y1="${CONTENT_TOP}" x2="${DIVIDER_X}" y2="${CONTENT_BOTTOM}" stroke="${surfaceBorder}" stroke-width="1"/>

  <!-- Top rated -->
  ${releasesOnly ? `<text x="${RIGHT_X}" y="${LIST_HEADING_Y}" font-size="13" font-weight="700" fill="${t.textMuted}" letter-spacing="3">TOP ${year} RELEASES</text>` : ''}
  ${rowsMarkup}
</svg>`;

  return await inlineFonts(svg);
}

// Profile card: favourites row on the right, then a compact top rated list
const FAV_COUNT = 4;
const FAV_GAP = 18;
const FAV_POSTER_WIDTH = (RIGHT_WIDTH - (FAV_COUNT - 1) * FAV_GAP) / FAV_COUNT;
const FAV_POSTER_HEIGHT = Math.round(FAV_POSTER_WIDTH * 1.5);
const FAV_HEADING_Y = CONTENT_TOP + 14;
const FAV_TOP = CONTENT_TOP + 25;
const FAV_LABEL_TOP = FAV_TOP + FAV_POSTER_HEIGHT + 20;
const FAV_LINE_HEIGHT = 16;
const FAV_TITLE_LINES = 2;
// The year follows its own title, so a one line title keeps it close instead of
// leaving a gap. The block below still has to clear the tallest caption, so the
// heading below is placed against the two line case.
const FAV_BLOCK_BOTTOM = FAV_LABEL_TOP + (FAV_TITLE_LINES - 1) * FAV_LINE_HEIGHT + 17;

const PROFILE_HEADING_Y = FAV_BLOCK_BOTTOM + 22;
const PROFILE_ROW_TOP = PROFILE_HEADING_Y + 14;
const PROFILE_ROW_COUNT = 3;
const PROFILE_ROW_GAP = 8;
const PROFILE_ROW_HEIGHT =
  (CONTENT_BOTTOM - PROFILE_ROW_TOP - (PROFILE_ROW_COUNT - 1) * PROFILE_ROW_GAP) / PROFILE_ROW_COUNT;
const PROFILE_POSTER_HEIGHT = Math.round(PROFILE_ROW_HEIGHT - 22);
const PROFILE_POSTER_WIDTH = Math.round(PROFILE_POSTER_HEIGHT / 1.5);

export const FAV_PIXEL_WIDTH = FAV_POSTER_WIDTH * 2;
export const FAV_PIXEL_HEIGHT = FAV_POSTER_HEIGHT * 2;

/**
 * Generate the profile card.
 *
 * Not tied to a year: the figures cover every entry the run fetched, and the
 * headline is the all-time film count taken from the profile itself. The year
 * range is spelled out so the two are not mistaken for each other.
 *
 * @param {Array} entries - All fetched diary entries
 * @param {Object} options
 * @param {Array<number>} options.years - Years the entries cover
 * @param {boolean} options.allTime - Whether the entries are the complete diary
 * @param {number} options.totalEntries - All-time film count from the profile
 * @param {Array} options.favourites - Favourite films pinned on the profile
 * @param {Map<string, string>} options.posters - Film URL to poster data URI for the list
 * @param {Map<string, string>} options.favouritePosters - Larger posters for the favourites row
 * @param {Map<string, Object>} options.details - Film URL to runtime and community rating
 * @param {string|null} options.memberStatus - 'patron', 'pro' or null
 * @returns {Promise<string>} SVG markup
 */
export async function generateProfileCard(entries, options = {}) {
  const {
    years = [],
    allTime = false,
    totalEntries = 0,
    favourites = [],
    theme = 'dark',
    username = '',
    displayName = username,
    profileImage = null,
    logoBase64 = null,
    posters = new Map(),
    favouritePosters = new Map(),
    details = new Map(),
    memberStatus = null,
    usernameGradient = true,
    yearGradient = true
  } = options;

  const t = getTheme(theme);
  const isDark = theme !== 'light';
  const profileUrl = `https://letterboxd.com/${username}/`;
  const surface = isDark ? '#171c23' : '#f4f6f8';
  const surfaceBorder = isDark ? '#252c35' : '#e2e6ea';
  const cardBg = isDark ? '#12161c' : '#ffffff';

  // The range is only spelled out when the figures cover part of the diary.
  // Labelling a complete diary with its year span would read as a restriction
  // that is not there.
  const profileRules = heroRules('FILMS WATCHED', 14, 7);
  const covered = [...new Set(years)].sort((a, b) => a - b);
  const range = allTime || covered.length === 0
    ? ''
    : covered.length === 1 ? String(covered[0]) : `${covered[0]}–${covered[covered.length - 1]}`;

  const streak = calculateStreak(entries);
  const average = calculateAverageRating(entries);
  const stats = [
    // A profile counts films watched, the diary counts logged viewings, and the
    // two can differ wildly: a profile with 3,653 films may hold 1,254 diary
    // entries. Calling both "Films" put two different numbers under one word.
    { icon: 'films', value: String(entries.length), label: range ? `Diary Entries ${range}` : 'Diary Entries' },
    { icon: 'daysActive', value: String(calculateDaysActive(entries)), label: 'Days Active' },
    { icon: 'streak', value: String(streak.length), label: 'Day Streak' },
    { icon: 'rating', value: average === null ? '–' : average.toFixed(1), label: 'Average Rating' },
    { icon: 'rewatches', value: String(entries.filter(entry => entry.rewatch).length), label: 'Rewatches' },
    { icon: 'liked', value: String(entries.filter(entry => entry.liked).length), label: 'Liked' }
  ];

  const tilesMarkup = stats.map((stat, index) => {
    const x = CONTENT_LEFT + (index % 3) * (TILE_WIDTH + TILE_GAP);
    const y = TILE_TOP + Math.floor(index / 3) * (TILE_HEIGHT + TILE_GAP);
    const centerX = x + TILE_WIDTH / 2;


    return `
    <rect x="${x}" y="${y}" width="${TILE_WIDTH}" height="${TILE_HEIGHT}" rx="14" fill="${surface}" stroke="${surfaceBorder}" stroke-width="1"/>
    ${renderIcon(ICONS[stat.icon], centerX - 14, y + 30, 28, TILE_ACCENTS[index])}
    <text x="${centerX}" y="${y + 108}" font-size="38" font-weight="700" fill="${t.text}" text-anchor="middle">${escapeXml(stat.value)}</text>
    <text x="${centerX}" y="${y + 136}" font-size="14" font-weight="500" fill="${t.textMuted}" text-anchor="middle">${escapeXml(stat.label)}</text>`;
  }).join('');

  // Favourites are left aligned rather than centred: a profile with two of them
  // then reads as a short row instead of a row with holes in it.
  const favouritesMarkup = favourites.length === 0
    ? `
    <rect x="${RIGHT_X}" y="${FAV_TOP}" width="${RIGHT_WIDTH}" height="${FAV_POSTER_HEIGHT}" rx="12" fill="${surface}" stroke="${surfaceBorder}" stroke-width="1"/>
    <text x="${RIGHT_X + RIGHT_WIDTH / 2}" y="${FAV_TOP + FAV_POSTER_HEIGHT / 2 + 6}" font-size="15" font-weight="500" fill="${t.textMuted}" text-anchor="middle">No favourites pinned</text>`
    : favourites.map((film, index) => {
      const x = RIGHT_X + index * (FAV_POSTER_WIDTH + FAV_GAP);
      const poster = favouritePosters.get(film.url);
      const titleLines = wrapToWidth(film.title, 13, FAV_POSTER_WIDTH, FAV_TITLE_LINES);
      return `
    <a href="${film.url}">
    <rect x="${x}" y="${FAV_TOP}" width="${FAV_POSTER_WIDTH}" height="${FAV_POSTER_HEIGHT}" rx="8" fill="${isDark ? '#0d1117' : '#dfe4e9'}"/>
    ${poster ? `<image href="${poster}" x="${x}" y="${FAV_TOP}" width="${FAV_POSTER_WIDTH}" height="${FAV_POSTER_HEIGHT}" clip-path="url(#favClip${index})" preserveAspectRatio="xMidYMid slice"/>` : ''}
    <rect x="${x}" y="${FAV_TOP}" width="${FAV_POSTER_WIDTH}" height="${FAV_POSTER_HEIGHT}" rx="8" fill="none" stroke="${isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)'}" stroke-width="1"/>
    ${titleLines.map((line, lineIndex) => `<text x="${x + FAV_POSTER_WIDTH / 2}" y="${FAV_LABEL_TOP + lineIndex * FAV_LINE_HEIGHT}" font-size="13" font-weight="600" fill="${t.text}" text-anchor="middle">${escapeXml(line)}</text>`).join('')}
    <text x="${x + FAV_POSTER_WIDTH / 2}" y="${FAV_LABEL_TOP + (titleLines.length - 1) * FAV_LINE_HEIGHT + 17}" font-size="12" font-weight="500" fill="${t.textMuted}" text-anchor="middle">${escapeXml(film.year || '')}</text>
    </a>`;
    }).join('');

  const topFilms = pickTopFilms(entries, PROFILE_ROW_COUNT);

  const rowsMarkup = topFilms.length === 0
    ? `
    <rect x="${RIGHT_X}" y="${PROFILE_ROW_TOP}" width="${RIGHT_WIDTH}" height="${PROFILE_ROW_HEIGHT}" rx="14" fill="${surface}" stroke="${surfaceBorder}" stroke-width="1"/>
    <text x="${RIGHT_X + RIGHT_WIDTH / 2}" y="${PROFILE_ROW_TOP + PROFILE_ROW_HEIGHT / 2 + 6}" font-size="15" font-weight="500" fill="${t.textMuted}" text-anchor="middle">No rated films yet</text>`
    : topFilms.map((film, index) => {
      const y = PROFILE_ROW_TOP + index * (PROFILE_ROW_HEIGHT + PROFILE_ROW_GAP);
      const midY = y + PROFILE_ROW_HEIGHT / 2;
      const stars = formatStars(film.rating);
      const starsWidth = calculateTextWidth(stars, 17);
      const posterX = RIGHT_X + 54;
      const titleX = posterX + PROFILE_POSTER_WIDTH + 18;
      const titleMax = CONTENT_RIGHT - 24 - starsWidth - 16 - titleX;
      const posterY = y + (PROFILE_ROW_HEIGHT - PROFILE_POSTER_HEIGHT) / 2;
      const poster = posters.get(film.url);

      return `
    <rect x="${RIGHT_X}" y="${y}" width="${RIGHT_WIDTH}" height="${PROFILE_ROW_HEIGHT}" rx="14" fill="${surface}" stroke="${surfaceBorder}" stroke-width="1"/>
    <circle cx="${RIGHT_X + 30}" cy="${midY}" r="15" fill="${RANK_ACCENTS[index]}" fill-opacity="0.16" stroke="${RANK_ACCENTS[index]}" stroke-opacity="0.5" stroke-width="1"/>
    <text x="${RIGHT_X + 30}" y="${midY + 6}" font-size="18" font-weight="700" fill="${RANK_ACCENTS[index]}" text-anchor="middle">${index + 1}</text>
    <a href="${filmLink(film, profileUrl)}">
      <rect x="${posterX}" y="${posterY}" width="${PROFILE_POSTER_WIDTH}" height="${PROFILE_POSTER_HEIGHT}" rx="4" fill="${isDark ? '#0d1117' : '#dfe4e9'}"/>
      ${poster ? `<image href="${poster}" x="${posterX}" y="${posterY}" width="${PROFILE_POSTER_WIDTH}" height="${PROFILE_POSTER_HEIGHT}" clip-path="url(#profilePosterClip${index})" preserveAspectRatio="xMidYMid slice"/>` : ''}
      <rect x="${posterX}" y="${posterY}" width="${PROFILE_POSTER_WIDTH}" height="${PROFILE_POSTER_HEIGHT}" rx="4" fill="none" stroke="${isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)'}" stroke-width="1"/>
    </a>
    <a href="${filmLink(film, profileUrl)}">
      <text x="${titleX}" y="${midY - 3}" font-size="18" font-weight="600" fill="${t.text}">${escapeXml(truncateToWidth(film.title, 18, titleMax))}</text>
    </a>
    <text x="${titleX}" y="${midY + 18}" font-size="13" font-weight="500" fill="${t.textMuted}">${escapeXml(filmMetaLine(film, details.get(film.url)))}</text>
    <text x="${CONTENT_RIGHT - 24}" y="${midY + 6}" font-size="17" fill="${STAR_COLOR}" text-anchor="end">${escapeXml(stars)}</text>`;
    }).join('');

  const clips = `${favourites.map((film, index) => `
    <clipPath id="favClip${index}">
      <rect x="${RIGHT_X + index * (FAV_POSTER_WIDTH + FAV_GAP)}" y="${FAV_TOP}" width="${FAV_POSTER_WIDTH}" height="${FAV_POSTER_HEIGHT}" rx="8"/>
    </clipPath>`).join('')}${topFilms.map((film, index) => `
    <clipPath id="profilePosterClip${index}">
      <rect x="${RIGHT_X + 54}" y="${PROFILE_ROW_TOP + index * (PROFILE_ROW_HEIGHT + PROFILE_ROW_GAP) + (PROFILE_ROW_HEIGHT - PROFILE_POSTER_HEIGHT) / 2}" width="${PROFILE_POSTER_WIDTH}" height="${PROFILE_POSTER_HEIGHT}" rx="4"/>
    </clipPath>`).join('')}`;

  const svg = `<svg width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <clipPath id="reviewAvatarClip">
      <circle cx="30" cy="30" r="30"/>
    </clipPath>${clips}
    <linearGradient id="reviewGradient" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#FF8000"/>
      <stop offset="50%" stop-color="#00E054"/>
      <stop offset="100%" stop-color="#40BCF4"/>
    </linearGradient>
    <style type="text/css">
      <![CDATA[
      ${FONT_FACE_PLACEHOLDER}
      text { font-family: 'Inter', 'Segoe UI', Arial, sans-serif; }
      a { cursor: pointer; }
      ]]>
    </style>
  </defs>

  <rect width="100%" height="100%" rx="${CARD_RADIUS}" fill="${cardBg}"/>

  <!-- Profile -->
  <g transform="translate(${CONTENT_LEFT}, ${CONTENT_TOP})">
    <a href="${profileUrl}">
      <circle cx="30" cy="30" r="31" fill="${surfaceBorder}"/>
      ${profileImage
        ? `<image href="${profileImage}" x="0" y="0" width="60" height="60" clip-path="url(#reviewAvatarClip)"/>`
        : `<circle cx="30" cy="30" r="30" fill="${t.colors[2]}"/>`}
    </a>
    ${renderMemberBadge(memberStatus)}
    <a href="${profileUrl}">
      <text x="76" y="27" font-size="27" font-weight="700" fill="${usernameGradient ? 'url(#reviewGradient)' : t.text}">${escapeXml(displayName)}</text>
    </a>
    <a href="${profileUrl}">
      <text x="76" y="50" font-size="15" font-weight="500" fill="${t.textMuted}">@${escapeXml(username)}</text>
    </a>
    ${logoBase64
      ? `<a href="https://letterboxd.com/"><image href="${logoBase64}" x="${LEFT_WIDTH - 60}" y="0" width="60" height="60"/></a>`
      : ''}
  </g>

  <!-- Headline -->
  <text x="${CONTENT_LEFT + LEFT_WIDTH / 2}" y="${HERO_BASELINE}" font-size="88" font-weight="700" fill="${yearGradient ? 'url(#reviewGradient)' : t.text}" text-anchor="middle">${totalEntries}</text>
  ${profileRules ? `<line x1="${profileRules.left[0]}" y1="${HERO_RULE_Y}" x2="${profileRules.left[1]}" y2="${HERO_RULE_Y}" stroke="${surfaceBorder}" stroke-width="1"/>
  <line x1="${profileRules.right[0]}" y1="${HERO_RULE_Y}" x2="${profileRules.right[1]}" y2="${HERO_RULE_Y}" stroke="${surfaceBorder}" stroke-width="1"/>` : ''}
  <text x="${CONTENT_LEFT + LEFT_WIDTH / 2}" y="${HERO_LABEL_Y}" font-size="14" font-weight="600" fill="${t.textMuted}" text-anchor="middle" letter-spacing="7">FILMS WATCHED</text>

  ${tilesMarkup}

  <line x1="${DIVIDER_X}" y1="${CONTENT_TOP}" x2="${DIVIDER_X}" y2="${CONTENT_BOTTOM}" stroke="${surfaceBorder}" stroke-width="1"/>

  <text x="${RIGHT_X}" y="${FAV_HEADING_Y}" font-size="13" font-weight="700" fill="${t.textMuted}" letter-spacing="3">FAVOURITES</text>
  ${favouritesMarkup}

  <text x="${RIGHT_X}" y="${PROFILE_HEADING_Y}" font-size="13" font-weight="700" fill="${t.textMuted}" letter-spacing="3">TOP RATED${range ? ` ${range}` : ''}</text>
  ${rowsMarkup}
</svg>`;

  return await inlineFonts(svg);
}
