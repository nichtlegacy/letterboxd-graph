/**
 * Statistics calculations for Letterboxd diary entries
 */

/**
 * Calculate the longest streak of consecutive days with movies watched
 * @param {Array} entries - Array of diary entries with date property
 * @returns {Object} Streak info: { length, startDate, endDate }
 */
export function calculateStreak(entries) {
  if (!entries || entries.length === 0) {
    return { length: 0, startDate: null, endDate: null };
  }

  // Get unique dates, sorted
  const uniqueDates = [...new Set(
    entries.map(e => e.date.toISOString().split('T')[0])
  )].sort();

  if (uniqueDates.length === 0) {
    return { length: 0, startDate: null, endDate: null };
  }

  let maxStreak = 1;
  let currentStreak = 1;
  let maxStart = uniqueDates[0];
  let maxEnd = uniqueDates[0];
  let currentStart = uniqueDates[0];

  for (let i = 1; i < uniqueDates.length; i++) {
    const prevDate = new Date(uniqueDates[i - 1]);
    const currDate = new Date(uniqueDates[i]);
    
    // Calculate difference in days
    const diffTime = currDate.getTime() - prevDate.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
      // Consecutive day
      currentStreak++;
      if (currentStreak > maxStreak) {
        maxStreak = currentStreak;
        maxStart = currentStart;
        maxEnd = uniqueDates[i];
      }
    } else {
      // Streak broken
      currentStreak = 1;
      currentStart = uniqueDates[i];
    }
  }

  return {
    length: maxStreak,
    startDate: maxStart,
    endDate: maxEnd
  };
}

/**
 * Calculate total number of unique active days
 * @param {Array} entries - Array of diary entries
 * @returns {number} Number of unique days with activity
 */
export function calculateDaysActive(entries) {
  if (!entries || entries.length === 0) return 0;
  
  const uniqueDates = new Set(
    entries.map(e => e.date.toISOString().split('T')[0])
  );
  
  return uniqueDates.size;
}

/**
 * Group entries by date string
 * @param {Array} entries - Array of diary entries
 * @returns {Map} Map of date string -> array of entries
 */
export function groupEntriesByDate(entries) {
  const grouped = new Map();
  
  for (const entry of entries) {
    const dateKey = entry.date.toISOString().split('T')[0];
    if (!grouped.has(dateKey)) {
      grouped.set(dateKey, []);
    }
    grouped.get(dateKey).push({
      title: entry.title,
      year: entry.year,
      rating: entry.rating
    });
  }
  
  return grouped;
}

/**
 * Calculate average rating across all entries
 * @param {Array} entries - Array of diary entries
 * @returns {number|null} Average rating or null if no ratings
 */
export function calculateAverageRating(entries) {
  const rated = entries.filter(e => e.rating !== null);
  if (rated.length === 0) return null;
  
  const sum = rated.reduce((acc, e) => acc + e.rating, 0);
  return Math.round((sum / rated.length) * 10) / 10;
}

/**
 * Build a compact JSON payload for external consumers (e.g. Glance widgets)
 * @param {Array} entries - Array of diary entries
 * @param {Object} options - Export options
 * @param {string} options.username - Letterboxd username
 * @param {number|null} options.year - Primary export year (single-year mode)
 * @param {Array<number>} options.years - Export years
 * @param {string} options.weekStart - "sunday" or "monday"
 * @param {number} options.recentLimit - Number of recent entries to include
 * @returns {Object} JSON-serializable export object
 */
export function buildJsonExport(entries, options = {}) {
  const {
    username = '',
    year = null,
    years = [],
    weekStart = 'sunday',
    recentLimit = 10
  } = options;

  const sortedEntries = [...entries].sort((a, b) => a.date.getTime() - b.date.getTime());
  const normalizedWeekStart = weekStart === 'monday' ? 'monday' : 'sunday';
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const groupedByDate = new Map();

  for (const entry of sortedEntries) {
    const dateKey = entry.date.toISOString().split('T')[0];
    if (!groupedByDate.has(dateKey)) {
      groupedByDate.set(dateKey, []);
    }
    groupedByDate.get(dateKey).push(entry);
  }

  const cells = Array.from(groupedByDate.entries()).map(([date, dayEntries]) => {
    const rated = dayEntries.filter((item) => item.rating !== null);
    const ratingAvg = rated.length > 0
      ? Math.round((rated.reduce((sum, item) => sum + item.rating, 0) / rated.length) * 10) / 10
      : null;

    const [cellYear, cellMonth, cellDay] = date.split('-');
    const url = `https://letterboxd.com/${username}/films/diary/for/${cellYear}/${cellMonth}/${cellDay}/`;

    return {
      date,
      count: dayEntries.length,
      ratingAvg,
      films: dayEntries.map((item) => ({
        title: item.title,
        year: item.year,
        rating: item.rating,
        url: item.url || null
      })),
      url
    };
  });

  const selectedYears = (() => {
    const parsedYears = years
      .map((value) => Number.parseInt(value, 10))
      .filter((value) => Number.isInteger(value));

    if (parsedYears.length > 0) {
      return [...new Set(parsedYears)].sort((a, b) => b - a);
    }

    if (Number.isInteger(year)) {
      return [year];
    }

    const yearsFromEntries = [...new Set(
      sortedEntries.map((entry) => entry.date.getUTCFullYear())
    )].sort((a, b) => b - a);

    if (yearsFromEntries.length > 0) {
      return yearsFromEntries;
    }

    return [new Date().getUTCFullYear()];
  })();

  const minYear = Math.min(...selectedYears);
  const maxYear = Math.max(...selectedYears);
  const rangeStart = new Date(Date.UTC(minYear, 0, 1));
  const rangeEnd = new Date(Date.UTC(maxYear, 11, 31));
  const rangeStartWeekday = normalizedWeekStart === 'monday'
    ? (rangeStart.getUTCDay() + 6) % 7
    : rangeStart.getUTCDay();

  const alignedStart = new Date(rangeStart);
  alignedStart.setUTCDate(alignedStart.getUTCDate() - rangeStartWeekday);

  const totalDays = Math.floor((rangeEnd.getTime() - alignedStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  const calendar = [];
  const monthLabels = [];
  let maxCount = 0;

  for (let dayOffset = 0; dayOffset < totalDays; dayOffset++) {
    const currentDate = new Date(alignedStart);
    currentDate.setUTCDate(alignedStart.getUTCDate() + dayOffset);

    const date = currentDate.toISOString().split('T')[0];
    const dayEntries = groupedByDate.get(date) || [];
    const count = dayEntries.length;

    if (count > maxCount) {
      maxCount = count;
    }

    const rated = dayEntries.filter((item) => item.rating !== null);
    const ratingAvg = rated.length > 0
      ? Math.round((rated.reduce((sum, item) => sum + item.rating, 0) / rated.length) * 10) / 10
      : null;

    const cellWeekday = normalizedWeekStart === 'monday'
      ? (currentDate.getUTCDay() + 6) % 7
      : currentDate.getUTCDay();

    const [cellYear, cellMonth, cellDay] = date.split('-');
    const url = `https://letterboxd.com/${username}/films/diary/for/${cellYear}/${cellMonth}/${cellDay}/`;
    const isPadding = currentDate < rangeStart || currentDate > rangeEnd;

    if (!isPadding && currentDate.getUTCDate() === 1) {
      monthLabels.push({
        month: monthNames[currentDate.getUTCMonth()],
        week: Math.floor(dayOffset / 7)
      });
    }

    calendar.push({
      date,
      week: Math.floor(dayOffset / 7),
      weekday: cellWeekday,
      count,
      ratingAvg,
      films: dayEntries.map((item) => ({
        title: item.title,
        year: item.year,
        rating: item.rating,
        url: item.url || null
      })),
      level: 0,
      inRange: !isPadding,
      url
    });
  }

  for (const day of calendar) {
    if (day.count <= 0 || maxCount <= 0) {
      day.level = 0;
      continue;
    }

    if (maxCount === 1) {
      day.level = 1;
      continue;
    }

    day.level = Math.max(1, Math.min(4, Math.ceil((day.count / maxCount) * 4)));
  }

  const recent = [...sortedEntries]
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, recentLimit)
    .map((entry) => ({
      date: entry.date.toISOString().split('T')[0],
      title: entry.title,
      year: entry.year,
      rating: entry.rating,
      url: entry.url || null
    }));

  return {
    user: username,
    year,
    years: selectedYears,
    generatedAt: new Date().toISOString(),
    meta: {
      weekStart: normalizedWeekStart,
      minYear,
      maxYear,
      startDate: rangeStart.toISOString().split('T')[0],
      endDate: rangeEnd.toISOString().split('T')[0],
      alignedStart: alignedStart.toISOString().split('T')[0],
      weeks: Math.ceil(calendar.length / 7),
      maxCount
    },
    stats: {
      films: sortedEntries.length,
      daysActive: calculateDaysActive(sortedEntries),
      streak: calculateStreak(sortedEntries).length
    },
    monthLabels,
    calendar,
    cells,
    recent
  };
}
