/**
 * SVG Graph Generator for Letterboxd Activity
 * New layout based on single-year-2024-example.svg
 */

import { calculateStreak, calculateDaysActive, groupEntriesByDate } from './stats.js';

/**
 * Escape XML special characters
 */
function escapeXml(unsafe) {
  if (unsafe === undefined || unsafe === null) return "";
  return String(unsafe).replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case "<": return "&lt;";
      case ">": return "&gt;";
      case "&": return "&amp;";
      case "'": return "&apos;";
      case '"': return "&quot;";
    }
  });
}

/**
 * Generate the SVG contribution graph
 */
export function generateSvg(entries, options = {}) {
  const { 
    theme = 'dark', 
    year = new Date().getFullYear(),
    weekStart = 'sunday',
    username = 'letterboxd',
    profileImage = null,
    displayName = username,
    usernameGradient = true,
    logoBase64 = null,
    followers = 0,
    following = 0,
    mode = 'count' // 'count' or 'rating'
  } = options;

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

  // Theme colors - GitHub contribution graph style
  const themes = {
    dark: {
      bg: '#0d1117',
      cardBorder: '#21262d',
      text: '#e6edf3',
      textMuted: '#7d8590',
      tooltipBg: '#161b22',
      tooltipBorder: '#30363d',
      tooltipText: '#f0f6fc',
      colors: ['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353']
    },
    light: {
      bg: '#ffffff',
      cardBorder: '#d1d9e0',
      text: '#1f2328',
      textMuted: '#656d76',
      tooltipBg: '#ffffff',
      tooltipBorder: '#d1d9e0',
      tooltipText: '#1f2328',
      colors: ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39']
    }
  };

  const t = themes[theme] || themes.dark;

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
      <stop offset="0%" stop-color="#ff8001"/>
      <stop offset="25%" stop-color="#b3c02e"/>
      <stop offset="50%" stop-color="#00e054"/>
      <stop offset="75%" stop-color="#1fc5a4"/>
      <stop offset="100%" stop-color="#3fbcf4"/>
    </linearGradient>
    <style type="text/css">
      <![CDATA[
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
      ]]>
    </style>
  </defs>
  
  <!-- Main Card -->
  <rect width="100%" height="100%" rx="12" fill="${t.bg}" stroke="${t.cardBorder}" stroke-width="1" filter="url(#shadow)"/>

  <!-- Header Section -->
  <g transform="translate(25, 20)">
    <!-- Profile Image (clickable) -->
    <a href="https://letterboxd.com/${username}/" target="_blank">
      <circle cx="40" cy="40" r="42" fill="${t.cardBorder}"/>
      ${profileImage ? `<image href="${profileImage}" x="0" y="0" width="80" height="80" clip-path="url(#profileClip)" style="cursor: pointer;"/>` : `<circle cx="40" cy="40" r="40" fill="${t.colors[2]}"/>`}
    </a>

    <!-- Name and Info (clickable) -->
    <a href="https://letterboxd.com/${username}/" target="_blank">
      <text x="100" y="35" font-family="'Segoe UI', Arial, sans-serif" font-size="28" font-weight="600" fill="${usernameGradient ? 'url(#usernameGradient)' : t.text}" style="cursor: pointer;">${escapeXml(displayName)}</text>
    </a>
    <a href="https://letterboxd.com/${username}/" target="_blank">
      <text x="100" y="60" font-family="'Segoe UI', Arial, sans-serif" font-size="14" font-weight="500" style="cursor: pointer;">
        <tspan fill="${t.textMuted}">@${escapeXml(username)}</tspan>
      </text>
    </a>
    <text x="185" y="60" font-family="'Segoe UI', Arial, sans-serif" font-size="14" font-weight="500">
      <tspan fill="${t.textMuted}">•</tspan>
      <tspan dx="8" fill="${t.text}">${followers}</tspan>
      <tspan fill="${t.textMuted}"> Followers</tspan>
      <tspan dx="8" fill="${t.textMuted}">•</tspan>
      <tspan dx="8" fill="${t.text}">${following}</tspan>
      <tspan fill="${t.textMuted}"> Following</tspan>
    </text>

    <!-- Letterboxd Logo (clickable, links to main site) -->
    ${logoBase64 ? `<a href="https://letterboxd.com/" target="_blank">
      <g transform="translate(${SVG_WIDTH - 117}, 0)">
        <image href="${logoBase64}" x="0" y="4" width="72" height="72" style="cursor: pointer;"/>
      </g>
    </a>` : ''}
  </g>

  <!-- Stats Row -->
  <g transform="translate(25, 115)" font-family="'Segoe UI', Arial, sans-serif">
    <text x="0" y="20" font-size="16" font-weight="600" fill="${t.text}">${displayYear}</text>
    <text x="60" y="20" font-size="14" font-weight="500" fill="${t.textMuted}">${totalFilms} Movies</text>
    
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
      ${streak.length > 0 ? `<g class="streak-tooltip" transform="translate(0, -45)">
        <rect x="-10" y="0" width="180" height="36" rx="6" fill="${t.tooltipBg}" stroke="${t.tooltipBorder}" stroke-width="1"/>
        <text x="5" y="23" font-size="12" fill="${t.tooltipText}">${streak.startDate} → ${streak.endDate}</text>
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
  <g transform="translate(${GRID_OFFSET_X}, ${GRID_OFFSET_Y - 8})" font-family="'Segoe UI', Arial, sans-serif">`;

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
  <g transform="translate(26, ${GRID_OFFSET_Y})" font-family="'Segoe UI', Arial, sans-serif">
    <text x="0" y="${0 * (CELL_SIZE + CELL_GAP) + 11}" font-size="10" fill="${t.textMuted}" text-anchor="end">${DAYS[0].charAt(0)}</text>
    <text x="0" y="${2 * (CELL_SIZE + CELL_GAP) + 11}" font-size="10" fill="${t.textMuted}" text-anchor="end">${DAYS[2].charAt(0)}</text>
    <text x="0" y="${4 * (CELL_SIZE + CELL_GAP) + 11}" font-size="10" fill="${t.textMuted}" text-anchor="end">${DAYS[4].charAt(0)}</text>
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

      // Diary URL for this date
      const yearStr = cellDate.getUTCFullYear();
      const monthStr = String(cellDate.getUTCMonth() + 1).padStart(2, '0');
      const dayStr = String(cellDate.getUTCDate()).padStart(2, '0');
      const diaryUrl = `https://letterboxd.com/${username}/films/diary/for/${yearStr}/${monthStr}/${dayStr}/`;

      // Films for this day (already fetched above)
      
      // Tooltip content
      const dateObj = new Date(cellDate);
      const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dateObj.getUTCDay()];
      const dayNum = dateObj.getUTCDate();
      const monthName = MONTHS[dateObj.getUTCMonth()];
      const tooltipTitle = `${dayName}, ${dayNum}. ${monthName} ${yearStr}: ${count} movie${count !== 1 ? 's' : ''} watched`;
      
      const lineHeight = 18;
      const tooltipHeight = 38 + filmsForDay.length * lineHeight;
      const tooltipWidth = Math.max(240, Math.max(...[tooltipTitle, ...filmsForDay.map(f => `• ${f.title} (${f.year})${f.rating ? ` - ${f.rating}★` : ''}`)].map(s => s.length * 7)));

      // Position tooltip to avoid overflow
      const tooltipX = Math.min(x, SVG_WIDTH - GRID_OFFSET_X - tooltipWidth - 10);
      
      svg += `
    <g class="cell-group">
      <a href="${diaryUrl}" target="_blank">
        <rect class="cell"
          x="${x}"
          y="${y}"
          width="${CELL_SIZE}"
          height="${CELL_SIZE}"
          rx="2"
          fill="${color}"
        />
        <g class="tooltip-group" transform="translate(${tooltipX}, ${y - tooltipHeight - 8})">
          <rect x="0" y="0" width="${tooltipWidth}" height="${tooltipHeight}" rx="6" fill="${t.tooltipBg}" stroke="${t.tooltipBorder}" stroke-width="1"/>
          <text font-family="'Segoe UI', Arial, sans-serif" font-size="12" fill="${t.tooltipText}">
            <tspan x="10" dy="22" font-weight="600">${escapeXml(tooltipTitle)}</tspan>`;
      
      filmsForDay.forEach((film) => {
        const ratingStr = film.rating ? ` - ${film.rating}★` : "";
        svg += `
            <tspan x="10" dy="${lineHeight}">${escapeXml(`• ${film.title} (${film.year})${ratingStr}`)}</tspan>`;
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

  return svg;
}

/**
 * Generate a multi-year SVG contribution graph
 * Shows multiple years stacked vertically with a shared header
 */
export function generateMultiYearSvg(entries, options = {}) {
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
    mode = 'count' // 'count' or 'rating'
  } = options;

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

  // Theme colors - GitHub contribution graph style
  const themes = {
    dark: {
      bg: '#0d1117',
      cardBorder: '#21262d',
      text: '#e6edf3',
      textMuted: '#7d8590',
      tooltipBg: '#161b22',
      tooltipBorder: '#30363d',
      tooltipText: '#f0f6fc',
      colors: ['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353']
    },
    light: {
      bg: '#ffffff',
      cardBorder: '#d1d9e0',
      text: '#1f2328',
      textMuted: '#656d76',
      tooltipBg: '#ffffff',
      tooltipBorder: '#d1d9e0',
      tooltipText: '#1f2328',
      colors: ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39']
    }
  };

  const t = themes[theme] || themes.dark;

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
      <stop offset="0%" stop-color="#ff8001"/>
      <stop offset="25%" stop-color="#b3c02e"/>
      <stop offset="50%" stop-color="#00e054"/>
      <stop offset="75%" stop-color="#1fc5a4"/>
      <stop offset="100%" stop-color="#3fbcf4"/>
    </linearGradient>
    <style type="text/css">
      <![CDATA[
      .tooltip-group { opacity: 0; transition: opacity 0.2s ease; pointer-events: none; }
      .cell-group:hover .tooltip-group { opacity: 1; }
      .cell-group:hover .cell { filter: brightness(1.3); }
      .cell { transition: filter 0.2s ease; }
      .streak-tooltip { opacity: 0; transition: opacity 0.2s ease; pointer-events: none; }
      .streak-group:hover .streak-tooltip { opacity: 1; }
      .streak-group:hover { cursor: pointer; }
      .days-active-tooltip { opacity: 0; transition: opacity 0.2s ease; pointer-events: none; }
      .days-active-group:hover .days-active-tooltip { opacity: 1; }
      .days-active-group:hover { cursor: pointer; }
      ]]>
    </style>
  </defs>
  
  <!-- Main Card -->
  <rect width="100%" height="100%" rx="12" fill="${t.bg}" stroke="${t.cardBorder}" stroke-width="1" filter="url(#shadow)"/>

  <!-- Header Section -->
  <g transform="translate(25, 20)">
    <!-- Profile Image (clickable) -->
    <a href="https://letterboxd.com/${username}/" target="_blank">
      <circle cx="40" cy="40" r="42" fill="${t.cardBorder}"/>
      ${profileImage ? `<image href="${profileImage}" x="0" y="0" width="80" height="80" clip-path="url(#profileClip)" style="cursor: pointer;"/>` : `<circle cx="40" cy="40" r="40" fill="${t.colors[2]}"/>`}
    </a>

    <!-- Name and Info (clickable) -->
    <a href="https://letterboxd.com/${username}/" target="_blank">
      <text x="100" y="35" font-family="'Segoe UI', Arial, sans-serif" font-size="28" font-weight="600" fill="${usernameGradient ? 'url(#usernameGradient)' : t.text}" style="cursor: pointer;">${escapeXml(displayName)}</text>
    </a>
    <a href="https://letterboxd.com/${username}/" target="_blank">
      <text x="100" y="60" font-family="'Segoe UI', Arial, sans-serif" font-size="14" font-weight="500" style="cursor: pointer;">
        <tspan fill="${t.textMuted}">@${escapeXml(username)}</tspan>
      </text>
    </a>
    <text x="185" y="60" font-family="'Segoe UI', Arial, sans-serif" font-size="14" font-weight="500">
      <tspan fill="${t.textMuted}">•</tspan>
      <tspan dx="8" fill="${t.text}">${followers}</tspan>
      <tspan fill="${t.textMuted}"> Followers</tspan>
      <tspan dx="8" fill="${t.textMuted}">•</tspan>
      <tspan dx="8" fill="${t.text}">${following}</tspan>
      <tspan fill="${t.textMuted}"> Following</tspan>
    </text>

    <!-- Letterboxd Logo (clickable, links to main site) -->
    ${logoBase64 ? `<a href="https://letterboxd.com/" target="_blank">
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
  <g transform="translate(25, ${yearOffset})" font-family="'Segoe UI', Arial, sans-serif">
    <text x="0" y="20" font-size="16" font-weight="600" fill="${t.text}">${year}</text>
    <text x="60" y="20" font-size="14" font-weight="500" fill="${t.textMuted}">${totalFilms} Movies</text>
    
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
      ${streak.length > 0 ? `<g class="streak-tooltip" transform="translate(0, -45)">
        <rect x="-10" y="0" width="180" height="36" rx="6" fill="${t.tooltipBg}" stroke="${t.tooltipBorder}" stroke-width="1"/>
        <text x="5" y="23" font-size="12" fill="${t.tooltipText}">${streak.startDate} → ${streak.endDate}</text>
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
  <g transform="translate(51, ${yearOffset + 42})" font-family="'Segoe UI', Arial, sans-serif">`;

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
  <g transform="translate(26, ${yearOffset + 50})" font-family="'Segoe UI', Arial, sans-serif">
    <text x="0" y="${0 * (CELL_SIZE + CELL_GAP) + 11}" font-size="10" fill="${t.textMuted}" text-anchor="end">${DAYS[0].charAt(0)}</text>
    <text x="0" y="${2 * (CELL_SIZE + CELL_GAP) + 11}" font-size="10" fill="${t.textMuted}" text-anchor="end">${DAYS[2].charAt(0)}</text>
    <text x="0" y="${4 * (CELL_SIZE + CELL_GAP) + 11}" font-size="10" fill="${t.textMuted}" text-anchor="end">${DAYS[4].charAt(0)}</text>
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

        const yearStr = cellDate.getUTCFullYear();
        const monthStr = String(cellDate.getUTCMonth() + 1).padStart(2, '0');
        const dayStr = String(cellDate.getUTCDate()).padStart(2, '0');
        const diaryUrl = `https://letterboxd.com/${username}/films/diary/for/${yearStr}/${monthStr}/${dayStr}/`;

        // Tooltip content
        const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][cellDate.getUTCDay()];
        const dayNum = cellDate.getUTCDate();
        const monthName = MONTHS[cellDate.getUTCMonth()];
        const tooltipTitle = `${dayName}, ${dayNum}. ${monthName} ${yearStr}: ${count} movie${count !== 1 ? 's' : ''} watched`;
        
        const lineHeight = 18;
        const tooltipHeight = 38 + filmsForDay.length * lineHeight;
        const tooltipWidth = Math.max(240, Math.max(...[tooltipTitle, ...filmsForDay.map(f => `• ${f.title} (${f.year})${f.rating ? ` - ${f.rating}★` : ''}`)].map(s => s.length * 7)));

        // Position tooltip
        const tooltipX = Math.min(x, SVG_WIDTH - 51 - tooltipWidth - 10);
        
        svg += `
    <g class="cell-group">
      <a href="${diaryUrl}" target="_blank">
        <rect class="cell"
          x="${x}"
          y="${y}"
          width="${CELL_SIZE}"
          height="${CELL_SIZE}"
          rx="2"
          fill="${color}"
        />
        <g class="tooltip-group" transform="translate(${tooltipX}, ${y - tooltipHeight - 8})">
          <rect x="0" y="0" width="${tooltipWidth}" height="${tooltipHeight}" rx="6" fill="${t.tooltipBg}" stroke="${t.tooltipBorder}" stroke-width="1"/>
          <text font-family="'Segoe UI', Arial, sans-serif" font-size="12" fill="${t.tooltipText}">
            <tspan x="10" dy="22" font-weight="600">${escapeXml(tooltipTitle)}</tspan>`;
      
      filmsForDay.forEach((film) => {
        const ratingStr = film.rating ? ` - ${film.rating}★` : "";
        svg += `
            <tspan x="10" dy="${lineHeight}">${escapeXml(`• ${film.title} (${film.year})${ratingStr}`)}</tspan>`;
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

  return svg;
}
