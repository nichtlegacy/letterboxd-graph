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
 * @param {number} options.recentLimit - Number of recent entries to include
 * @returns {Object} JSON-serializable export object
 */
export function buildJsonExport(entries, options = {}) {
  const {
    username = '',
    year = null,
    years = [],
    recentLimit = 10
  } = options;

  const sortedEntries = [...entries].sort((a, b) => a.date.getTime() - b.date.getTime());
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
    years,
    generatedAt: new Date().toISOString(),
    stats: {
      films: sortedEntries.length,
      daysActive: calculateDaysActive(sortedEntries),
      streak: calculateStreak(sortedEntries).length
    },
    cells,
    recent
  };
}
