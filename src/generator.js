/**
 * SVG Graph Generator for Letterboxd Activity
 * New layout based on single-year-2024-example.svg
 */

import {
  calculateStreak,
  calculateDaysActive,
  groupEntriesByDate,
  calculateAverageRating,
  calculateDecadeDistribution
} from './stats.js';

import {
  FONT_FACE_PLACEHOLDER,
  inlineFonts,
  escapeXml,
  calculateTextWidth,
  DEFAULT_PALETTE,
  getTheme
} from './svg-utils.js';

// Shared tooltip geometry so single-year and multi-year layouts stay in sync
// Heights are constrained by the card top edge: the stats row sits at y=115, so a
// tooltip taller than ~110px would be clipped out of the viewBox.
const MOVIES_TOOLTIP_HEIGHT = 108;
const DECADE_TOOLTIP_HEIGHT = 94;
const TOOLTIP_GAP = 8;
const TOOLTIP_BAR_MAX = 40;
const TOOLTIP_BAR_BASELINE = 70;
const DECADE_SLOT_WIDTH = 26;

/**
 * CSS for the cell reveal animation. Cells keep their final style as the base
 * declaration so static renderers (sharp/librsvg for PNG export) are unaffected.
 * @param {boolean} enabled - Whether the animation is active
 * @returns {string} CSS rules
 */
function buildAnimationCss(enabled) {
  if (!enabled) return '';
  return `
      @keyframes cell-reveal {
        from { opacity: 0; transform: scale(0.4); }
        to   { opacity: 1; transform: scale(1); }
      }
      .cell {
        transform-box: fill-box;
        transform-origin: center;
        animation: cell-reveal 0.45s cubic-bezier(0.34, 1.4, 0.64, 1) backwards;
      }
      @media (prefers-reduced-motion: reduce) {
        .cell { animation: none; }
      }`;
}

/**
 * Per-cell animation delay, producing a left-to-right wave across the grid
 * @param {boolean} enabled - Whether the animation is active
 * @param {number} week - Week column index
 * @param {number} day - Day row index
 * @param {number} yearIndex - Index of the year block (multi-year layouts)
 * @returns {string} style attribute, or an empty string
 */
function buildCellDelay(enabled, week, day, yearIndex = 0) {
  if (!enabled) return '';
  const delay = yearIndex * 180 + week * 11 + day * 5;
  return ` style="animation-delay:${delay}ms"`;
}

/**
 * Format one film line of a day tooltip.
 *
 * Rewatches and likes ride along as markers on the line that already exists,
 * so they cost no extra space. Shared with the tooltip width calculation so the
 * measured string and the rendered string cannot drift apart.
 *
 * @param {Object} film - Diary entry
 * @returns {string} e.g. "• ↻ Sicario (2015) - 4★ ♥"
 */
function formatFilmLine(film) {
  const rewatch = film.rewatch ? '↻ ' : '';
  const rating = film.rating ? ` - ${film.rating}★` : '';
  const liked = film.liked ? ' ♥' : '';
  return `• ${rewatch}${film.title} (${film.year})${rating}${liked}`;
}

/**
 * Build the "X Movies" hover tooltip: rating distribution plus a summary line
 * @param {Array} entries - Diary entries for the year
 * @param {Object} t - Theme colors
 * @returns {string} SVG markup
 */
function buildMoviesTooltip(entries, t) {
  const ratingLabels = ['0.5', '1', '1.5', '2', '2.5', '3', '3.5', '4', '4.5', '5'];
  const ratingDistribution = {};
  ratingLabels.forEach(r => ratingDistribution[r] = 0);
  ratingDistribution['unrated'] = 0;

  entries.forEach(entry => {
    const ratingKey = String(entry.rating);
    if (entry.rating && entry.rating > 0 && ratingDistribution.hasOwnProperty(ratingKey)) {
      ratingDistribution[ratingKey]++;
    } else {
      ratingDistribution['unrated']++;
    }
  });

  const maxRatingCount = Math.max(...ratingLabels.map(r => ratingDistribution[r]));
  const ratedCount = entries.length - ratingDistribution['unrated'];
  const average = calculateAverageRating(entries);
  const rewatchCount = entries.filter(entry => entry.rewatch).length;
  const likedCount = entries.filter(entry => entry.liked).length;

  // One line, not one row per figure: the tooltip cannot grow past ~110px
  // without being clipped by the top of the card.
  const summaryParts = [
    average === null ? 'No ratings yet' : `Ø ${average.toFixed(1)}★ · ${ratedCount} rated`
  ];
  if (rewatchCount > 0) summaryParts.push(`↻ ${rewatchCount}`);
  if (likedCount > 0) summaryParts.push(`♥ ${likedCount}`);
  const summaryLine = summaryParts.join(' · ');

  const bars = ratingLabels.map((rating, i) => {
    const count = ratingDistribution[rating];
    const barHeight = maxRatingCount > 0 ? Math.round((count / maxRatingCount) * TOOLTIP_BAR_MAX) : 0;
    const x = 15 + i * 24;
    return `
        <text x="${x + 7}" y="${TOOLTIP_BAR_BASELINE - barHeight - 3}" font-size="8" fill="${t.tooltipText}" text-anchor="middle">${count > 0 ? count : ''}</text>
        <rect x="${x}" y="${TOOLTIP_BAR_BASELINE - barHeight}" width="14" height="${Math.max(barHeight, 1)}" rx="2" fill="${t.colors[Math.min(Math.floor(i / 2) + 1, 4)]}"/>
        <text x="${x + 7}" y="84" font-size="7" fill="${t.text}" text-anchor="middle">${rating}</text>`;
  }).join('');

  return `<g class="movies-tooltip" transform="translate(-30, ${-(MOVIES_TOOLTIP_HEIGHT + TOOLTIP_GAP)})">
        <rect x="0" y="0" width="260" height="${MOVIES_TOOLTIP_HEIGHT}" rx="6" fill="${t.tooltipBg}" stroke="${t.tooltipBorder}" stroke-width="1"/>
        <text x="130" y="15" font-size="11" font-weight="600" fill="${t.tooltipText}" text-anchor="middle">Rating Distribution${ratingDistribution['unrated'] > 0 ? ` (${ratingDistribution['unrated']} unrated)` : ''}</text>${bars}
        <line x1="12" y1="90" x2="248" y2="90" stroke="${t.tooltipBorder}" stroke-width="1"/>
        <text x="130" y="102" font-size="10" font-weight="500" fill="${t.textMuted}" text-anchor="middle">${escapeXml(summaryLine)}</text>
      </g>`;
}

/**
 * Build the year-label hover tooltip showing the release-decade breakdown
 * @param {Array} entries - Diary entries for the year
 * @param {Object} t - Theme colors
 * @returns {string} SVG markup, or an empty string when no release years are known
 */
function buildDecadeTooltip(entries, t) {
  const decades = calculateDecadeDistribution(entries);
  if (decades.length === 0) return '';

  const maxCount = Math.max(...decades.map(d => d.count));
  const width = Math.max(180, 30 + decades.length * DECADE_SLOT_WIDTH);

  const bars = decades.map((d, i) => {
    const barHeight = maxCount > 0 ? Math.round((d.count / maxCount) * TOOLTIP_BAR_MAX) : 0;
    const x = 15 + i * DECADE_SLOT_WIDTH;
    return `
        <text x="${x + 8}" y="${TOOLTIP_BAR_BASELINE - barHeight - 3}" font-size="8" fill="${t.tooltipText}" text-anchor="middle">${d.count}</text>
        <rect x="${x}" y="${TOOLTIP_BAR_BASELINE - barHeight}" width="16" height="${Math.max(barHeight, 1)}" rx="2" fill="${t.colors[3]}"/>
        <text x="${x + 8}" y="84" font-size="7" fill="${t.text}" text-anchor="middle">${d.label}</text>`;
  }).join('');

  return `<g class="year-tooltip" transform="translate(-5, ${-(DECADE_TOOLTIP_HEIGHT + TOOLTIP_GAP)})">
      <rect x="0" y="0" width="${width}" height="${DECADE_TOOLTIP_HEIGHT}" rx="6" fill="${t.tooltipBg}" stroke="${t.tooltipBorder}" stroke-width="1"/>
      <text x="${width / 2}" y="15" font-size="11" font-weight="600" fill="${t.tooltipText}" text-anchor="middle">Films by Release Decade</text>${bars}
    </g>`;
}

/**
 * Generate the SVG contribution graph
 */
export async function generateSvg(entries, options = {}) {
  const { 
    theme = 'dark', 
    year = new Date().getFullYear(),
    weekStart = 'sunday',
    profileImage = null,
    displayName = '',
    username = '',
    usernameGradient = true,
    logoBase64 = null,
    followers = 0,
    following = 0,
    totalEntries = 0,
    memberStatus = null, // 'patron', 'pro', or null
    mode = 'count', // 'count' or 'rating'
    animate = true, // reveal cells with a CSS animation
    palette = DEFAULT_PALETTE // 'github' or 'letterboxd'
  } = options;

  // Calculate precise width for badge placement (28px font) + 4px gap
  const nameWidth = calculateTextWidth(displayName, 28);
  const badgeX = 90 + nameWidth;

  // Filter entries for the requested year
  const sortedEntries = [...entries].filter(entry => {
    return entry.date.getFullYear() === year;
  }).sort((a, b) => a.date.getTime() - b.date.getTime());

  // Calculate stats
  const streak = calculateStreak(sortedEntries);
  const daysActive = calculateDaysActive(sortedEntries);
  const totalFilms = sortedEntries.length;
  const filmsPerDay = groupEntriesByDate(sortedEntries);
  
  // Calculate weekly distribution (films per weekday)
  const weeklyDistribution = [0, 0, 0, 0, 0, 0, 0]; // Sun, Mon, Tue, Wed, Thu, Fri, Sat
  sortedEntries.forEach(entry => {
    const dayOfWeek = entry.date.getUTCDay();
    weeklyDistribution[dayOfWeek]++;
  });
  const maxWeeklyCount = Math.max(...weeklyDistribution);

  // Setup date range
  const yearIndex = 0; // single-year layout has no year offset for the reveal animation
  const displayYear = year;
  const startDate = new Date(Date.UTC(displayYear, 0, 1));
  const endDate = new Date(Date.UTC(displayYear, 11, 31));
  
  const startDay = startDate.getUTCDay();
  const dayShift = weekStart === 'monday' ? (startDay + 6) % 7 : startDay;
  if (dayShift > 0) {
    startDate.setUTCDate(startDate.getUTCDate() - dayShift);
  }

  const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  const totalWeeks = Math.ceil(totalDays / 7);

  // Build activity grid
  const grid = Array(7).fill(0).map(() => Array(totalWeeks).fill(0));
  let maxCount = 0;

  sortedEntries.forEach((entry) => {
    const daysSinceStart = Math.floor((entry.date.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const weekIndex = Math.floor(daysSinceStart / 7);
    const dayIndex = weekStart === 'monday' ? (entry.date.getUTCDay() + 6) % 7 : entry.date.getUTCDay();

    if (weekIndex >= 0 && weekIndex < totalWeeks) {
      grid[dayIndex][weekIndex]++;
      maxCount = Math.max(maxCount, grid[dayIndex][weekIndex]);
    }
  });

  // Dimensions
  const CELL_SIZE = 14;
  const CELL_GAP = 3;
  const GRID_WIDTH = totalWeeks * (CELL_SIZE + CELL_GAP);
  const GRID_HEIGHT = 7 * (CELL_SIZE + CELL_GAP);
  const SVG_WIDTH = Math.max(1000, GRID_WIDTH + 100);
  const SVG_HEIGHT = 290;
  const GRID_OFFSET_X = 51;
  const GRID_OFFSET_Y = 165;

  // Day/Month labels
  const DAYS_SUNDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const DAYS_MONDAY = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const DAYS = weekStart === 'monday' ? DAYS_MONDAY : DAYS_SUNDAY;
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  const t = getTheme(theme, palette);

  function getColor(count, films) {
    if (count === 0) return t.colors[0];

    if (mode === 'rating' && films && films.length > 0) {
      const totalRating = films.reduce((sum, f) => sum + (f.rating || 0), 0);
      const avgRating = totalRating / count;
      
      // Rating mapping: 0.5-2.0 -> 1, 2.5-3.0 -> 2, 3.5-4.0 -> 3, >= 4.5 -> 4
      if (avgRating < 2.5) return t.colors[1];
      if (avgRating < 3.5) return t.colors[2];
      if (avgRating < 4.5) return t.colors[3];
      return t.colors[4];
    }
    
    // Count mode
    if (maxCount === 0) return t.colors[0];
    const level = Math.ceil((count / maxCount) * 4);
    return t.colors[Math.min(level, 4)];
  }

  // Start building SVG
  let svg = `<svg width="${SVG_WIDTH}" height="${SVG_HEIGHT}" viewBox="0 0 ${SVG_WIDTH} ${SVG_HEIGHT}" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="#000000" flood-opacity="0.1"/>
    </filter>
    <clipPath id="profileClip">
      <circle cx="40" cy="40" r="40"/>
    </clipPath>
    <linearGradient id="usernameGradient" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#FF8000"/>
      <stop offset="50%" stop-color="#00E054"/>
      <stop offset="100%" stop-color="#40BCF4"/>
    </linearGradient>
    <style type="text/css">
      <![CDATA[
      ${FONT_FACE_PLACEHOLDER}
      .tooltip-group {
        opacity: 0;
        transition: opacity 0.2s ease;
        pointer-events: none;
      }
      .cell-group:hover .tooltip-group {
        opacity: 1;
      }
      .cell-group:hover .cell {
        filter: brightness(1.3);
      }
      .cell {
        transition: filter 0.2s ease;
      }
      .streak-tooltip {
        opacity: 0;
        transition: opacity 0.2s ease;
        pointer-events: none;
      }
      .streak-group:hover .streak-tooltip {
        opacity: 1;
      }
      .streak-group:hover {
        cursor: pointer;
      }
      .streak-cell {
        transition: filter 0.2s ease, stroke 0.2s ease, stroke-width 0.2s ease;
      }
      svg:has(.streak-group:hover) .streak-cell {
        filter: brightness(1.4) saturate(1.2);
        stroke: #22d3ee;
        stroke-width: 2;
      }
      .days-active-tooltip {
        opacity: 0;
        transition: opacity 0.2s ease;
        pointer-events: none;
      }
      .days-active-group:hover .days-active-tooltip {
        opacity: 1;
      }
      .days-active-group:hover {
        cursor: pointer;
      }
      .movies-tooltip {
        opacity: 0;
        transition: opacity 0.2s ease;
        pointer-events: none;
      }
      .movies-group:hover .movies-tooltip {
        opacity: 1;
      }
      .movies-group:hover {
        cursor: pointer;
      }
      .year-tooltip {
        opacity: 0;
        transition: opacity 0.2s ease;
        pointer-events: none;
      }
      .year-group:hover .year-tooltip {
        opacity: 1;
      }
      .year-group:hover {
        cursor: pointer;
      }
      ${buildAnimationCss(animate)}
      ]]>
    </style>
  </defs>
  
  <!-- Main Card -->
  <rect width="100%" height="100%" rx="12" fill="${t.bg}" stroke="${t.cardBorder}" stroke-width="1" filter="url(#shadow)"/>

  <!-- Header Section -->
  <g transform="translate(25, 20)">
    <!-- Profile Image (clickable) -->
    <a href="https://letterboxd.com/${username}/">
      <circle cx="40" cy="40" r="42" fill="${t.cardBorder}"/>
      ${profileImage ? `<image href="${profileImage}" x="0" y="0" width="80" height="80" clip-path="url(#profileClip)" style="cursor: pointer;"/>` : `<circle cx="40" cy="40" r="40" fill="${t.colors[2]}"/>`}
    </a>
    
    ${memberStatus ? `
    <!-- Member Badge (bottom-left overlay) -->
    <g transform="translate(-5, 58)">
      <rect x="0" y="0" width="${memberStatus === 'patron' ? 48 : 32}" height="18" rx="3" fill="${memberStatus === 'patron' ? '#40bcf4' : '#ff8000'}"/>
      <text x="${memberStatus === 'patron' ? 24 : 16}" y="13" font-family="'Segoe UI', Inter, Arial, sans-serif" font-size="10" font-weight="700" fill="#ffffff" text-anchor="middle">${memberStatus === 'patron' ? 'PATRON' : 'PRO'}</text>
    </g>` : ''}

    <!-- Name and Info (clickable) -->

    <a href="https://letterboxd.com/${username}/">
      <text x="100" y="35" font-family="'Segoe UI', Inter, Arial, sans-serif" font-size="28" font-weight="600" fill="${usernameGradient ? 'url(#usernameGradient)' : t.text}" style="cursor: pointer;">${escapeXml(displayName)}</text>
    </a>

    <text x="100" y="60" font-family="'Segoe UI', Inter, Arial, sans-serif" font-size="14" font-weight="500">
      <a href="https://letterboxd.com/${username}/" style="cursor: pointer;">
        <tspan fill="${t.textMuted}">@${escapeXml(username)}</tspan>
      </a>
      <tspan dx="5" fill="${t.textMuted}">•</tspan>
      <tspan dx="5" fill="${t.text}">${totalEntries}</tspan>
      <tspan fill="${t.textMuted}"> Films</tspan>
      <tspan dx="5" fill="${t.textMuted}">•</tspan>
      <tspan dx="5" fill="${t.text}">${followers}</tspan>
      <tspan fill="${t.textMuted}"> Followers</tspan>
    </text>

    <!-- Letterboxd Logo (clickable, links to main site) -->
    ${logoBase64 ? `<a href="https://letterboxd.com/">
      <g transform="translate(${SVG_WIDTH - 117}, 0)">
        <image href="${logoBase64}" x="0" y="4" width="72" height="72" style="cursor: pointer;"/>
      </g>
    </a>` : ''}
  </g>

  <!-- Stats Row -->
  <g transform="translate(25, 115)" font-family="'Segoe UI', Inter, Arial, sans-serif">
    <!-- Year with release-decade tooltip -->
    <g class="year-group">
      <text x="0" y="20" font-size="16" font-weight="600" fill="${t.text}">${displayYear}</text>
      ${buildDecadeTooltip(sortedEntries, t)}
    </g>

    <!-- Movies with rating distribution tooltip -->
    <g class="movies-group" transform="translate(60, 5)">
      <text x="0" y="15" font-size="14" font-weight="500" fill="${t.textMuted}">${totalFilms} Movies</text>
      ${buildMoviesTooltip(sortedEntries, t)}
    </g>

    <!-- Days Active with hover tooltip -->
    <g class="days-active-group" transform="translate(170, 5)">
      <text x="0" y="15" font-size="14" font-weight="500" fill="${t.textMuted}">${daysActive} Days Active</text>
      <g class="days-active-tooltip" transform="translate(-20, -115)">
        <rect x="0" y="0" width="200" height="105" rx="6" fill="${t.tooltipBg}" stroke="${t.tooltipBorder}" stroke-width="1"/>
        <text x="100" y="18" font-size="11" font-weight="600" fill="${t.tooltipText}" text-anchor="middle">Weekly Distribution</text>
        ${(weekStart === 'monday' ? ['M','T','W','T','F','S','S'] : ['S','M','T','W','T','F','S']).map((day, i) => {
          const dayIndex = weekStart === 'monday' ? (i + 1) % 7 : i;
          const count = weeklyDistribution[dayIndex];
          const barHeight = maxWeeklyCount > 0 ? Math.round((count / maxWeeklyCount) * 45) : 0;
          const x = 20 + i * 24;
          return `
        <text x="${x + 7}" y="${80 - barHeight - 3}" font-size="9" fill="${t.tooltipText}" text-anchor="middle">${count}</text>
        <rect x="${x}" y="${80 - barHeight}" width="14" height="${barHeight}" rx="2" fill="${t.colors[3]}"/>
        <text x="${x + 7}" y="100" font-size="9" fill="${t.text}" text-anchor="middle">${day}</text>`;
        }).join('')}
      </g>
    </g>
    
    <!-- Streak with hover tooltip -->
    <g class="streak-group" transform="translate(310, 5)">
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"
            stroke="${streak.length > 0 ? '#f97316' : t.textMuted}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="${streak.length > 0 ? '#f97316' : 'none'}" fill-opacity="0.2" transform="scale(0.75)"/>
      <text x="18" y="13" font-size="14" font-weight="500" fill="${t.textMuted}">${streak.length} Day Streak</text>
      ${streak.length > 0 ? `<g class="streak-tooltip" transform="translate(0, -63)">
        <rect x="-10" y="0" width="180" height="54" rx="6" fill="${t.tooltipBg}" stroke="${t.tooltipBorder}" stroke-width="1"/>
        <text x="5" y="21" font-size="12" fill="${t.tooltipText}">${streak.startDate} → ${streak.endDate}</text>
        <text x="5" y="41" font-size="11" font-weight="500" fill="${t.textMuted}"><tspan fill="#f97316" font-weight="600">${streak.films}</tspan> ${streak.films === 1 ? 'Movie' : 'Movies'} watched</text>
      </g>` : ''}
    </g>

    <!-- Legend (right side) -->
    <g transform="translate(${SVG_WIDTH - 200}, 0)">
      <text x="0" y="20" font-size="12" fill="${t.textMuted}">${mode === 'rating' ? 'Low' : 'Less'}</text>`;

  // Legend squares
  for (let i = 0; i < 5; i++) {
    svg += `
      <rect x="${35 + i * 18}" y="7" width="13" height="13" rx="2" fill="${t.colors[i]}"/>`;
  }

  svg += `
      <text x="${35 + 5 * 18 + 5}" y="20" font-size="12" fill="${t.textMuted}">${mode === 'rating' ? 'High' : 'More'}</text>
    </g>
  </g>

  <!-- Month Labels -->
  <g transform="translate(${GRID_OFFSET_X}, ${GRID_OFFSET_Y - 8})" font-family="'Segoe UI', Inter, Arial, sans-serif">`;

  for (let i = 0; i < 12; i++) {
    const firstDayOfMonth = new Date(Date.UTC(displayYear, i, 1));
    const daysSinceStart = Math.floor((firstDayOfMonth.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    if (daysSinceStart < 0) continue;
    const weekIndex = Math.floor(daysSinceStart / 7);
    const x = weekIndex * (CELL_SIZE + CELL_GAP);
    svg += `<text x="${x}" y="0" font-size="11" fill="${t.textMuted}" font-weight="500">${MONTHS[i]}</text>`;
  }

  svg += `
  </g>

  <!-- Day Labels -->
  <g transform="translate(26, ${GRID_OFFSET_Y})" font-family="'Segoe UI', Inter, Arial, sans-serif">
    <text x="0" y="${0 * (CELL_SIZE + CELL_GAP) + 11}" font-size="10" fill="${t.textMuted}" text-anchor="end">${DAYS[0].charAt(0)}</text>
    <text x="0" y="${1 * (CELL_SIZE + CELL_GAP) + 11}" font-size="10" fill="${t.textMuted}" text-anchor="end">${DAYS[1].charAt(0)}</text>
    <text x="0" y="${2 * (CELL_SIZE + CELL_GAP) + 11}" font-size="10" fill="${t.textMuted}" text-anchor="end">${DAYS[2].charAt(0)}</text>
    <text x="0" y="${3 * (CELL_SIZE + CELL_GAP) + 11}" font-size="10" fill="${t.textMuted}" text-anchor="end">${DAYS[3].charAt(0)}</text>
    <text x="0" y="${4 * (CELL_SIZE + CELL_GAP) + 11}" font-size="10" fill="${t.textMuted}" text-anchor="end">${DAYS[4].charAt(0)}</text>
    <text x="0" y="${5 * (CELL_SIZE + CELL_GAP) + 11}" font-size="10" fill="${t.textMuted}" text-anchor="end">${DAYS[5].charAt(0)}</text>
    <text x="0" y="${6 * (CELL_SIZE + CELL_GAP) + 11}" font-size="10" fill="${t.textMuted}" text-anchor="end">${DAYS[6].charAt(0)}</text>
  </g>

  <!-- Activity Grid -->
  <g transform="translate(${GRID_OFFSET_X}, ${GRID_OFFSET_Y})">`;

  // Generate cells
  for (let day = 0; day < 7; day++) {
    for (let week = 0; week < totalWeeks; week++) {
      const cellDate = new Date(startDate);
      cellDate.setUTCDate(cellDate.getUTCDate() + week * 7 + day);
      const tooltipDate = cellDate.toISOString().split("T")[0];
      const filmsForDay = filmsPerDay.get(tooltipDate) || [];
      const count = filmsForDay.length; // Use actual length which should handle multiple entries correctly
      
      const color = getColor(count, filmsForDay);
      const x = week * (CELL_SIZE + CELL_GAP);
      const y = day * (CELL_SIZE + CELL_GAP);

      const isOutsideYear = cellDate < new Date(Date.UTC(displayYear, 0, 1)) || cellDate > new Date(Date.UTC(displayYear, 11, 31));
      
      if (isOutsideYear) {
        // Hide cells outside the year completely
        continue;
      }

      // Days without films render as a bare rect: no link, no tooltip. That skips
      // the tooltip markup for most of the grid and keeps the SVG small. A day
      // inside a streak always has at least one film, so it never lands here.
      if (count === 0) {
        svg += `
    <rect class="cell" x="${x}" y="${y}" width="${CELL_SIZE}" height="${CELL_SIZE}" rx="2" fill="${color}"${buildCellDelay(animate, week, day, yearIndex)}/>`;
        continue;
      }

      // Diary URL for this date
      const yearStr = cellDate.getUTCFullYear();
      const monthStr = String(cellDate.getUTCMonth() + 1).padStart(2, '0');
      const dayStr = String(cellDate.getUTCDate()).padStart(2, '0');
      const diaryUrl = `https://letterboxd.com/${username}/diary/films/for/${yearStr}/${monthStr}/${dayStr}/`;

      // Films for this day (already fetched above)
      
      // Tooltip content
      const dateObj = new Date(cellDate);
      const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dateObj.getUTCDay()];
      const dayNum = dateObj.getUTCDate();
      const monthName = MONTHS[dateObj.getUTCMonth()];
      const tooltipTitle = `${dayName}, ${dayNum}. ${monthName} ${yearStr}: ${count} movie${count !== 1 ? 's' : ''} watched`;
      
      const lineHeight = 18;
      const tooltipHeight = 38 + filmsForDay.length * lineHeight;
      const tooltipWidth = Math.max(240, Math.max(...[tooltipTitle, ...filmsForDay.map(formatFilmLine)].map(s => s.length * 7)));

      // Position tooltip to avoid overflow
      const tooltipX = Math.min(x, SVG_WIDTH - GRID_OFFSET_X - tooltipWidth - 10);
      
      // Check if this cell is part of the streak
      const isStreakCell = streak.length > 0 && streak.startDate && streak.endDate && 
        tooltipDate >= streak.startDate && tooltipDate <= streak.endDate;
      const cellClass = isStreakCell ? 'cell streak-cell' : 'cell';

      svg += `
    <g class="cell-group">
      <a href="${diaryUrl}">
        <rect class="${cellClass}"
          x="${x}"
          y="${y}"
          width="${CELL_SIZE}"
          height="${CELL_SIZE}"
          rx="2"
          fill="${color}"${buildCellDelay(animate, week, day, yearIndex)}
        />
        <g class="tooltip-group" transform="translate(${tooltipX}, ${y - tooltipHeight - 8})">
          <rect x="0" y="0" width="${tooltipWidth}" height="${tooltipHeight}" rx="6" fill="${t.tooltipBg}" stroke="${t.tooltipBorder}" stroke-width="1"/>
          <text font-family="'Segoe UI', Inter, Arial, sans-serif" font-size="12" fill="${t.tooltipText}">
            <tspan x="10" dy="22" font-weight="600">${escapeXml(tooltipTitle)}</tspan>`;
      
      filmsForDay.forEach((film) => {
        svg += `
            <tspan x="10" dy="${lineHeight}">${escapeXml(formatFilmLine(film))}</tspan>`;
      });

      svg += `
          </text>
        </g>
      </a>
    </g>`;
    }
  }

  svg += `
  </g>
</svg>`;

  return await inlineFonts(svg);
}

/**
 * Generate a multi-year SVG contribution graph
 * Shows multiple years stacked vertically with a shared header
 */
export async function generateMultiYearSvg(entries, options = {}) {
  const { 
    theme = 'dark', 
    years = [new Date().getFullYear()],
    weekStart = 'sunday',
    username = 'letterboxd',
    profileImage = null,
    displayName = username,
    usernameGradient = true,
    logoBase64 = null,
    followers = 0,
    following = 0,
    totalEntries = 0,
    memberStatus = null,
    mode = 'count', // 'count' or 'rating'
    animate = true, // reveal cells with a CSS animation
    palette = DEFAULT_PALETTE // 'github' or 'letterboxd'
  } = options;

  // Calculate precise width for badge placement (28px font) + 4px gap
  const nameWidth = calculateTextWidth(displayName, 28);
  const badgeX = 100 + nameWidth + 4;

  // Sort years descending (newest first)
  const sortedYears = [...years].sort((a, b) => b - a);
  
  // Dimensions
  const CELL_SIZE = 14;
  const CELL_GAP = 3;
  const YEAR_HEIGHT = 180; // Spacing between years
  const HEADER_HEIGHT = 75; // So first year stats start at y=115 like single-year
  const SVG_WIDTH = 1000;
  const SVG_HEIGHT = HEADER_HEIGHT + 40 + (sortedYears.length * YEAR_HEIGHT);

  // Day/Month labels
  const DAYS_SUNDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const DAYS_MONDAY = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const DAYS = weekStart === 'monday' ? DAYS_MONDAY : DAYS_SUNDAY;
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  const t = getTheme(theme, palette);

  // Start building SVG
  let svg = `<svg width="${SVG_WIDTH}" height="${SVG_HEIGHT}" viewBox="0 0 ${SVG_WIDTH} ${SVG_HEIGHT}" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="#000000" flood-opacity="0.1"/>
    </filter>
    <clipPath id="profileClip">
      <circle cx="40" cy="40" r="40"/>
    </clipPath>
    <linearGradient id="usernameGradient" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#FF8000"/>
      <stop offset="50%" stop-color="#00E054"/>
      <stop offset="100%" stop-color="#40BCF4"/>
    </linearGradient>
    <style type="text/css">
      <![CDATA[
      ${FONT_FACE_PLACEHOLDER}
      .tooltip-group { opacity: 0; transition: opacity 0.2s ease; pointer-events: none; }
      .cell-group:hover .tooltip-group { opacity: 1; }
      .cell-group:hover .cell { filter: brightness(1.3); }
      .cell { transition: filter 0.2s ease; }
      .streak-tooltip { opacity: 0; transition: opacity 0.2s ease; pointer-events: none; }
      .streak-group:hover .streak-tooltip { opacity: 1; }
      .streak-group:hover { cursor: pointer; }
      .streak-cell { transition: filter 0.2s ease, stroke 0.2s ease, stroke-width 0.2s ease; }
      ${sortedYears.map(y => `svg:has(.streak-group-${y}:hover) .streak-cell-${y} { filter: brightness(1.4) saturate(1.2); stroke: #22d3ee; stroke-width: 2; }`).join('\n      ')}
      .days-active-tooltip { opacity: 0; transition: opacity 0.2s ease; pointer-events: none; }
      .days-active-group:hover .days-active-tooltip { opacity: 1; }
      .days-active-group:hover { cursor: pointer; }
      .movies-tooltip { opacity: 0; transition: opacity 0.2s ease; pointer-events: none; }
      .movies-group:hover .movies-tooltip { opacity: 1; }
      .movies-group:hover { cursor: pointer; }
      .year-tooltip { opacity: 0; transition: opacity 0.2s ease; pointer-events: none; }
      .year-group:hover .year-tooltip { opacity: 1; }
      .year-group:hover { cursor: pointer; }
      ${buildAnimationCss(animate)}
      ]]>
    </style>
  </defs>
  
  <!-- Main Card -->
  <rect width="100%" height="100%" rx="12" fill="${t.bg}" stroke="${t.cardBorder}" stroke-width="1" filter="url(#shadow)"/>

  <!-- Header Section -->
  <g transform="translate(25, 20)">
    <!-- Profile Image (clickable) -->
    <a href="https://letterboxd.com/${username}/">
      <circle cx="40" cy="40" r="42" fill="${t.cardBorder}"/>
      ${profileImage ? `<image href="${profileImage}" x="0" y="0" width="80" height="80" clip-path="url(#profileClip)" style="cursor: pointer;"/>` : `<circle cx="40" cy="40" r="40" fill="${t.colors[2]}"/>`}
    </a>
    
    ${memberStatus ? `
    <!-- Member Badge (bottom-left overlay) -->
    <g transform="translate(-5, 58)">
      <rect x="0" y="0" width="${memberStatus === 'patron' ? 48 : 32}" height="18" rx="3" fill="${memberStatus === 'patron' ? '#40bcf4' : '#ff8000'}"/>
      <text x="${memberStatus === 'patron' ? 24 : 16}" y="13" font-family="'Segoe UI', Inter, Arial, sans-serif" font-size="10" font-weight="700" fill="#ffffff" text-anchor="middle">${memberStatus === 'patron' ? 'PATRON' : 'PRO'}</text>
    </g>` : ''}

    <!-- Name and Info (clickable) -->
    <a href="https://letterboxd.com/${username}/">
      <text x="100" y="35" font-family="'Segoe UI', Inter, Arial, sans-serif" font-size="28" font-weight="600" fill="${usernameGradient ? 'url(#usernameGradient)' : t.text}" style="cursor: pointer;">${escapeXml(displayName)}</text>
    </a>

    <text x="100" y="60" font-family="'Segoe UI', Inter, Arial, sans-serif" font-size="14" font-weight="500">
      <a href="https://letterboxd.com/${username}/" style="cursor: pointer;">
        <tspan fill="${t.textMuted}">@${escapeXml(username)}</tspan>
      </a>
      <tspan dx="5" fill="${t.textMuted}">•</tspan>
      <tspan dx="5" fill="${t.text}">${totalEntries}</tspan>
      <tspan fill="${t.textMuted}"> Films</tspan>
      <tspan dx="5" fill="${t.textMuted}">•</tspan>
      <tspan dx="5" fill="${t.text}">${followers}</tspan>
      <tspan fill="${t.textMuted}"> Followers</tspan>
    </text>

    <!-- Letterboxd Logo (clickable, links to main site) -->
    ${logoBase64 ? `<a href="https://letterboxd.com/">
      <g transform="translate(${SVG_WIDTH - 117}, 0)">
        <image href="${logoBase64}" x="0" y="4" width="72" height="72" style="cursor: pointer;"/>
      </g>
    </a>` : ''}
  </g>`;

  // Generate each year
  sortedYears.forEach((year, yearIndex) => {
    const yearOffset = HEADER_HEIGHT + 40 + (yearIndex * YEAR_HEIGHT);
    
    // Filter entries for this year
    const yearEntries = entries.filter(entry => entry.date.getFullYear() === year);
    const streak = calculateStreak(yearEntries);
    const daysActive = calculateDaysActive(yearEntries);
    const totalFilms = yearEntries.length;
    const filmsPerDay = groupEntriesByDate(yearEntries);
    
    // Calculate weekly distribution for this year
    const weeklyDistribution = [0, 0, 0, 0, 0, 0, 0];
    yearEntries.forEach(entry => {
      weeklyDistribution[entry.date.getUTCDay()]++;
    });
    const maxWeeklyCount = Math.max(...weeklyDistribution);

    // Setup date range for this year
    const startDate = new Date(Date.UTC(year, 0, 1));
    const endDate = new Date(Date.UTC(year, 11, 31));
    
    const startDay = startDate.getUTCDay();
    const dayShift = weekStart === 'monday' ? (startDay + 6) % 7 : startDay;
    if (dayShift > 0) {
      startDate.setUTCDate(startDate.getUTCDate() - dayShift);
    }

    const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    const totalWeeks = Math.ceil(totalDays / 7);

    // Build activity grid for this year
    const grid = Array(7).fill(0).map(() => Array(totalWeeks).fill(0));
    let maxCount = 0;

    yearEntries.forEach(entry => {
      const daysSinceStart = Math.floor((entry.date.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      const weekIndex = Math.floor(daysSinceStart / 7);
      const dayIndex = weekStart === 'monday' ? (entry.date.getUTCDay() + 6) % 7 : entry.date.getUTCDay();

      if (weekIndex >= 0 && weekIndex < totalWeeks) {
        grid[dayIndex][weekIndex]++;
        maxCount = Math.max(maxCount, grid[dayIndex][weekIndex]);
      }
    });

    function getColor(count, films) {
      if (count === 0) return t.colors[0];

      if (mode === 'rating' && films && films.length > 0) {
        const totalRating = films.reduce((sum, f) => sum + (f.rating || 0), 0);
        const avgRating = totalRating / count;
        
        if (avgRating < 2.5) return t.colors[1];
        if (avgRating < 3.5) return t.colors[2];
        if (avgRating < 4.5) return t.colors[3];
        return t.colors[4];
      }

      if (maxCount === 0) return t.colors[0];
      const level = Math.ceil((count / maxCount) * 4);
      return t.colors[Math.min(level, 4)];
    }

    // Stats Row for this year
    svg += `
  <!-- Year ${year} -->
  <g transform="translate(25, ${yearOffset})" font-family="'Segoe UI', Inter, Arial, sans-serif">
    <!-- Year with release-decade tooltip -->
    <g class="year-group">
      <text x="0" y="20" font-size="16" font-weight="600" fill="${t.text}">${year}</text>
      ${buildDecadeTooltip(yearEntries, t)}
    </g>

    <!-- Movies with rating distribution tooltip -->
    <g class="movies-group" transform="translate(60, 5)">
      <text x="0" y="15" font-size="14" font-weight="500" fill="${t.textMuted}">${totalFilms} Movies</text>
      ${buildMoviesTooltip(yearEntries, t)}
    </g>

    <!-- Days Active with hover tooltip -->
    <g class="days-active-group" transform="translate(170, 5)">
      <text x="0" y="15" font-size="14" font-weight="500" fill="${t.textMuted}">${daysActive} Days Active</text>
      <g class="days-active-tooltip" transform="translate(-20, -115)">
        <rect x="0" y="0" width="200" height="105" rx="6" fill="${t.tooltipBg}" stroke="${t.tooltipBorder}" stroke-width="1"/>
        <text x="100" y="18" font-size="11" font-weight="600" fill="${t.tooltipText}" text-anchor="middle">Weekly Distribution</text>
        ${(weekStart === 'monday' ? ['M','T','W','T','F','S','S'] : ['S','M','T','W','T','F','S']).map((day, i) => {
          const dayIndex = weekStart === 'monday' ? (i + 1) % 7 : i;
          const count = weeklyDistribution[dayIndex];
          const barHeight = maxWeeklyCount > 0 ? Math.round((count / maxWeeklyCount) * 45) : 0;
          const x = 20 + i * 24;
          return `
        <text x="${x + 7}" y="${80 - barHeight - 3}" font-size="9" fill="${t.tooltipText}" text-anchor="middle">${count}</text>
        <rect x="${x}" y="${80 - barHeight}" width="14" height="${barHeight}" rx="2" fill="${t.colors[3]}"/>
        <text x="${x + 7}" y="100" font-size="9" fill="${t.text}" text-anchor="middle">${day}</text>`;
        }).join('')}
      </g>
    </g>
    <!-- Streak with hover tooltip -->
    <g class="streak-group streak-group-${year}" transform="translate(310, 5)">
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"
            stroke="${streak.length > 0 ? '#f97316' : t.textMuted}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="${streak.length > 0 ? '#f97316' : 'none'}" fill-opacity="0.2" transform="scale(0.75)"/>
      <text x="18" y="13" font-size="14" font-weight="500" fill="${t.textMuted}">${streak.length} Day Streak</text>
      ${streak.length > 0 ? `<g class="streak-tooltip" transform="translate(0, -63)">
        <rect x="-10" y="0" width="180" height="54" rx="6" fill="${t.tooltipBg}" stroke="${t.tooltipBorder}" stroke-width="1"/>
        <text x="5" y="21" font-size="12" fill="${t.tooltipText}">${streak.startDate} → ${streak.endDate}</text>
        <text x="5" y="41" font-size="11" font-weight="500" fill="${t.textMuted}"><tspan fill="#f97316" font-weight="600">${streak.films}</tspan> ${streak.films === 1 ? 'Movie' : 'Movies'} watched</text>
      </g>` : ''}
    </g>
    ${yearIndex === 0 ? `<g transform="translate(${SVG_WIDTH - 200}, 0)">
      <text x="0" y="20" font-size="12" fill="${t.textMuted}">${mode === 'rating' ? 'Low' : 'Less'}</text>
      <rect x="35" y="7" width="13" height="13" rx="2" fill="${t.colors[0]}"/>
      <rect x="53" y="7" width="13" height="13" rx="2" fill="${t.colors[1]}"/>
      <rect x="71" y="7" width="13" height="13" rx="2" fill="${t.colors[2]}"/>
      <rect x="89" y="7" width="13" height="13" rx="2" fill="${t.colors[3]}"/>
      <rect x="107" y="7" width="13" height="13" rx="2" fill="${t.colors[4]}"/>
      <text x="130" y="20" font-size="12" fill="${t.textMuted}">${mode === 'rating' ? 'High' : 'More'}</text>
    </g>` : ''}
  </g>

  <!-- Month Labels ${year} -->
  <g transform="translate(51, ${yearOffset + 42})" font-family="'Segoe UI', Inter, Arial, sans-serif">`;

    // Generate month labels for this year
    for (let i = 0; i < 12; i++) {
      const firstDayOfMonth = new Date(Date.UTC(year, i, 1));
      const daysSinceStart = Math.floor((firstDayOfMonth.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      if (daysSinceStart < 0) continue;
      const weekIndex = Math.floor(daysSinceStart / 7);
      const x = weekIndex * (CELL_SIZE + CELL_GAP);
      svg += `<text x="${x}" y="0" font-size="11" fill="${t.textMuted}" font-weight="500">${MONTHS[i]}</text>`;
    }

    svg += `
  </g>

  <!-- Day Labels ${year} -->
  <g transform="translate(26, ${yearOffset + 50})" font-family="'Segoe UI', Inter, Arial, sans-serif">
    <text x="0" y="${0 * (CELL_SIZE + CELL_GAP) + 11}" font-size="10" fill="${t.textMuted}" text-anchor="end">${DAYS[0].charAt(0)}</text>
    <text x="0" y="${1 * (CELL_SIZE + CELL_GAP) + 11}" font-size="10" fill="${t.textMuted}" text-anchor="end">${DAYS[1].charAt(0)}</text>
    <text x="0" y="${2 * (CELL_SIZE + CELL_GAP) + 11}" font-size="10" fill="${t.textMuted}" text-anchor="end">${DAYS[2].charAt(0)}</text>
    <text x="0" y="${3 * (CELL_SIZE + CELL_GAP) + 11}" font-size="10" fill="${t.textMuted}" text-anchor="end">${DAYS[3].charAt(0)}</text>
    <text x="0" y="${4 * (CELL_SIZE + CELL_GAP) + 11}" font-size="10" fill="${t.textMuted}" text-anchor="end">${DAYS[4].charAt(0)}</text>
    <text x="0" y="${5 * (CELL_SIZE + CELL_GAP) + 11}" font-size="10" fill="${t.textMuted}" text-anchor="end">${DAYS[5].charAt(0)}</text>
    <text x="0" y="${6 * (CELL_SIZE + CELL_GAP) + 11}" font-size="10" fill="${t.textMuted}" text-anchor="end">${DAYS[6].charAt(0)}</text>
  </g>

  <!-- Activity Grid ${year} -->
  <g transform="translate(51, ${yearOffset + 50})">`;

    // Generate cells for this year
    for (let day = 0; day < 7; day++) {
    for (let week = 0; week < totalWeeks; week++) {
        // Calculate date and fetch films first
        const cellDate = new Date(startDate);
        cellDate.setUTCDate(cellDate.getUTCDate() + week * 7 + day);
        const tooltipDate = cellDate.toISOString().split("T")[0];
        const filmsForDay = filmsPerDay.get(tooltipDate) || [];
        const count = filmsForDay.length;
        
        const color = getColor(count, filmsForDay);

        const x = week * (CELL_SIZE + CELL_GAP);
        const y = day * (CELL_SIZE + CELL_GAP);

        const isOutsideYear = cellDate < new Date(Date.UTC(year, 0, 1)) || cellDate > new Date(Date.UTC(year, 11, 31));
        
        if (isOutsideYear) continue;

        // See the single-year generator: empty days need no link or tooltip.
        if (count === 0) {
          svg += `
    <rect class="cell" x="${x}" y="${y}" width="${CELL_SIZE}" height="${CELL_SIZE}" rx="2" fill="${color}"${buildCellDelay(animate, week, day, yearIndex)}/>`;
          continue;
        }

        const yearStr = cellDate.getUTCFullYear();
        const monthStr = String(cellDate.getUTCMonth() + 1).padStart(2, '0');
        const dayStr = String(cellDate.getUTCDate()).padStart(2, '0');
        const diaryUrl = `https://letterboxd.com/${username}/diary/films/for/${yearStr}/${monthStr}/${dayStr}/`;

        // Tooltip content
        const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][cellDate.getUTCDay()];
        const dayNum = cellDate.getUTCDate();
        const monthName = MONTHS[cellDate.getUTCMonth()];
        const tooltipTitle = `${dayName}, ${dayNum}. ${monthName} ${yearStr}: ${count} movie${count !== 1 ? 's' : ''} watched`;
        
        const lineHeight = 18;
        const tooltipHeight = 38 + filmsForDay.length * lineHeight;
        const tooltipWidth = Math.max(240, Math.max(...[tooltipTitle, ...filmsForDay.map(formatFilmLine)].map(s => s.length * 7)));

        // Position tooltip
        const tooltipX = Math.min(x, SVG_WIDTH - 51 - tooltipWidth - 10);
        
        // Check if this cell is part of the streak
        const isStreakCell = streak.length > 0 && streak.startDate && streak.endDate && 
          tooltipDate >= streak.startDate && tooltipDate <= streak.endDate;
        const cellClass = isStreakCell ? `cell streak-cell streak-cell-${year}` : 'cell';

        svg += `
    <g class="cell-group">
      <a href="${diaryUrl}">
        <rect class="${cellClass}"
          x="${x}"
          y="${y}"
          width="${CELL_SIZE}"
          height="${CELL_SIZE}"
          rx="2"
          fill="${color}"${buildCellDelay(animate, week, day, yearIndex)}
        />
        <g class="tooltip-group" transform="translate(${tooltipX}, ${y - tooltipHeight - 8})">
          <rect x="0" y="0" width="${tooltipWidth}" height="${tooltipHeight}" rx="6" fill="${t.tooltipBg}" stroke="${t.tooltipBorder}" stroke-width="1"/>
          <text font-family="'Segoe UI', Inter, Arial, sans-serif" font-size="12" fill="${t.tooltipText}">
            <tspan x="10" dy="22" font-weight="600">${escapeXml(tooltipTitle)}</tspan>`;
      
      filmsForDay.forEach((film) => {
        svg += `
            <tspan x="10" dy="${lineHeight}">${escapeXml(formatFilmLine(film))}</tspan>`;
      });

      svg += `
          </text>
        </g>
      </a>
    </g>`;
      }
    }

    svg += `
  </g>`;
  });

  svg += `
</svg>`;

  return await inlineFonts(svg);
}
