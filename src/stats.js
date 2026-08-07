/**
 * Statistics calculations for Letterboxd diary entries
 */

/**
 * Stable identity for a film.
 *
 * Titles are not unique: remakes and unrelated films share them, and even the
 * year does not separate them — two different 2023 films are both called "Leo".
 * The slug in the diary link is the only thing that identifies a film, so it is
 * preferred and the title is only a fallback for entries without a URL.
 *
 * @param {Object} entry - Diary entry
 * @returns {string}
 */
export function filmKey(entry) {
  const slug = (entry.url || '').match(/\/film\/([^/]+)/);
  return slug ? `film:${slug[1]}` : `title:${entry.title}|${entry.year || ''}`;
}

/**
 * Mark every viewing that is not the first one of its film as a rewatch.
 *
 * Letterboxd's rewatch flag is set by hand, so it misses repeat viewings that
 * were logged without ticking it. Deriving it from repeats alone would be worse
 * though: a film first seen before the diary begins has only one entry in it,
 * and only the flag knows that entry was a rewatch. One profile here has 761
 * such viewings. Taking either signal catches both cases and loses neither.
 *
 * @param {Array} entries - Diary entries, any order
 * @returns {Array} The same entries with `rewatch` filled in
 */
export function markRewatches(entries) {
  const seen = new Set();

  return [...entries]
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .map((entry) => {
      const key = filmKey(entry);
      const isRepeat = seen.has(key);
      seen.add(key);

      return { ...entry, rewatch: Boolean(entry.rewatch) || isRepeat };
    });
}

/**
 * Calculate the longest streak of consecutive days with movies watched
 * @param {Array} entries - Array of diary entries with date property
 * @returns {Object} Streak info: { length, startDate, endDate, films }
 */
export function calculateStreak(entries) {
  if (!entries || entries.length === 0) {
    return { length: 0, startDate: null, endDate: null, films: 0 };
  }

  // Get unique dates, sorted
  const dateStrings = entries.map(e => e.date.toISOString().split('T')[0]);
  const uniqueDates = [...new Set(dateStrings)].sort();

  if (uniqueDates.length === 0) {
    return { length: 0, startDate: null, endDate: null, films: 0 };
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

  // Count all films watched within the winning streak window
  const films = dateStrings.filter(d => d >= maxStart && d <= maxEnd).length;

  return {
    length: maxStreak,
    startDate: maxStart,
    endDate: maxEnd,
    films
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
      rating: entry.rating,
      rewatch: Boolean(entry.rewatch),
      liked: Boolean(entry.liked)
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
 * Group entries by the release decade of the film
 * @param {Array} entries - Array of diary entries
 * @returns {Array<{decade: number, label: string, count: number}>} Decades in ascending order, gaps omitted
 */
export function calculateDecadeDistribution(entries) {
  const counts = new Map();

  for (const entry of entries) {
    const filmYear = Number.parseInt(entry.year, 10);
    if (!Number.isFinite(filmYear) || filmYear < 1870 || filmYear > 2999) continue;

    const decade = Math.floor(filmYear / 10) * 10;
    counts.set(decade, (counts.get(decade) || 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([decade, count]) => ({ decade, label: `${decade}s`, count }));
}

/**
 * Aggregate the whole diary, not just the years the graph covers.
 *
 * Everything here is derived from entries that were already fetched, so it
 * costs no further requests. The figures are aggregates rather than a second
 * copy of the diary: a consumer gets the shape of a viewing history without
 * having to walk thousands of entries itself.
 *
 * @param {Array} entries - Diary entries, any order
 * @param {Object} options
 * @param {number|null} options.totalFilms - Films watched per the profile page, which
 *   counts films ticked off without a diary entry and is therefore higher
 * @param {string} options.scope - "all" when the whole diary was fetched, "years" otherwise
 * @param {number} options.milestoneStep - Diary entry interval to mark, 0 to skip
 * @returns {Object|null} Aggregates, or null without entries
 */
export function buildAllTimeStats(entries, options = {}) {
  const { totalFilms = null, scope = 'all', milestoneStep = 100 } = options;
  if (!entries || entries.length === 0) return null;

  const sorted = [...entries].sort((a, b) => a.date.getTime() - b.date.getTime());
  const iso = (date) => date.toISOString().split('T')[0];
  const rated = sorted.filter((entry) => entry.rating !== null && entry.rating !== undefined);

  const days = new Map();
  const perYear = new Map();
  const perWeekday = new Array(7).fill(0);
  const perMonthOfYear = new Array(12).fill(0);
  const perMonth = new Map();
  const ratings = new Map();
  const views = new Map();

  for (const entry of sorted) {
    const date = iso(entry.date);
    const year = entry.date.getUTCFullYear();
    const month = `${date.slice(0, 7)}`;

    days.set(date, (days.get(date) || 0) + 1);
    perMonth.set(month, (perMonth.get(month) || 0) + 1);
    perWeekday[entry.date.getUTCDay()] += 1;
    perMonthOfYear[entry.date.getUTCMonth()] += 1;

    const yearEntry = perYear.get(year) || { year, films: 0, days: new Set() };
    yearEntry.films += 1;
    yearEntry.days.add(date);
    perYear.set(year, yearEntry);

    if (entry.rating !== null && entry.rating !== undefined) {
      ratings.set(entry.rating, (ratings.get(entry.rating) || 0) + 1);
    }

    const key = filmKey(entry);
    const seen = views.get(key) || { title: entry.title, year: entry.year, url: entry.url || null, views: 0 };
    seen.views += 1;
    views.set(key, seen);
  }

  // A continuous series, zeros included: a month with nothing logged is a fact
  // about the year, and dropping it would compress the gaps out of the chart.
  const firstDate = new Date(`${iso(sorted[0].date).slice(0, 7)}-01T00:00:00Z`);
  const lastDate = new Date(`${iso(sorted.at(-1).date).slice(0, 7)}-01T00:00:00Z`);
  const monthSeries = [];

  for (let cursor = new Date(firstDate); cursor <= lastDate; cursor.setUTCMonth(cursor.getUTCMonth() + 1)) {
    const month = iso(cursor).slice(0, 7);
    monthSeries.push({ month, count: perMonth.get(month) || 0 });
  }

  const dayList = [...days.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const busiest = dayList.reduce((best, day) => (day[1] > best[1] ? day : best), dayList[0]);

  // The longest the diary ever went quiet, measured between active days.
  let longestGap = { days: 0, from: null, to: null };
  for (let index = 1; index < dayList.length; index++) {
    const from = dayList[index - 1][0];
    const to = dayList[index][0];
    const gap = Math.round((Date.parse(to) - Date.parse(from)) / 86400000) - 1;
    if (gap > longestGap.days) longestGap = { days: gap, from, to };
  }

  const milestone = (entry, position) => ({
    n: position,
    date: iso(entry.date),
    title: entry.title,
    year: entry.year || null,
    rating: entry.rating ?? null,
    url: entry.url || null
  });

  const milestones = [milestone(sorted[0], 1)];
  if (milestoneStep > 0) {
    for (let position = milestoneStep; position <= sorted.length; position += milestoneStep) {
      milestones.push(milestone(sorted[position - 1], position));
    }
  }
  if (sorted.length > 1 && milestones.at(-1).n !== sorted.length) {
    milestones.push(milestone(sorted.at(-1), sorted.length));
  }

  const spanDays = Math.round((sorted.at(-1).date.getTime() - sorted[0].date.getTime()) / 86400000) + 1;
  const round = (value, digits = 1) => Math.round(value * 10 ** digits) / 10 ** digits;

  return {
    scope,
    films: totalFilms,
    entries: sorted.length,
    distinctFilms: views.size,
    firstEntry: iso(sorted[0].date),
    lastEntry: iso(sorted.at(-1).date),
    spanDays,
    daysActive: days.size,
    rewatches: sorted.filter((entry) => entry.rewatch).length,
    liked: sorted.filter((entry) => entry.liked).length,
    rated: rated.length,
    averageRating: calculateAverageRating(sorted),
    perDay: round(sorted.length / spanDays, 2),
    perWeek: round((sorted.length / spanDays) * 7),
    perMonth: round((sorted.length / spanDays) * 30.44),
    streak: calculateStreak(sorted),
    busiestDay: busiest ? { date: busiest[0], count: busiest[1] } : null,
    longestGap,
    perYear: [...perYear.values()]
      .map(({ year, films, days: active }) => ({ year, films, days: active.size }))
      .sort((a, b) => a.year - b.year),
    perWeekday,
    perMonthOfYear,
    monthSeries,
    ratings: [...ratings.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([rating, count]) => ({ rating, count })),
    decades: calculateDecadeDistribution(sorted),
    mostRewatched: [...views.values()]
      .filter((film) => film.views > 1)
      .sort((a, b) => b.views - a.views || a.title.localeCompare(b.title))
      .slice(0, 5),
    milestones
  };
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
 * @param {Array} options.allEntries - The whole diary, when more than the export years was fetched
 * @param {number|null} options.totalFilms - Films watched per the profile page
 * @param {string} options.scope - Diary scope the run used
 * @returns {Object} JSON-serializable export object
 */
export function buildJsonExport(entries, options = {}) {
  const {
    username = '',
    year = null,
    years = [],
    weekStart = 'sunday',
    recentLimit = 10,
    allEntries = null,
    totalFilms = null,
    scope = 'all'
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
    const url = `https://letterboxd.com/${username}/diary/films/for/${cellYear}/${cellMonth}/${cellDay}/`;

    return {
      date,
      count: dayEntries.length,
      ratingAvg,
      films: dayEntries.map((item) => ({
        title: item.title,
        year: item.year,
        rating: item.rating,
        rewatch: Boolean(item.rewatch),
        liked: Boolean(item.liked),
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
    const url = `https://letterboxd.com/${username}/diary/films/for/${cellYear}/${cellMonth}/${cellDay}/`;
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
        rewatch: Boolean(item.rewatch),
        liked: Boolean(item.liked),
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

  const streakInfo = calculateStreak(sortedEntries);

  const recent = [...sortedEntries]
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, recentLimit)
    .map((entry) => ({
      date: entry.date.toISOString().split('T')[0],
      title: entry.title,
      year: entry.year,
      rating: entry.rating,
      rewatch: Boolean(entry.rewatch),
      liked: Boolean(entry.liked),
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
      streak: streakInfo.length,
      streakFilms: streakInfo.films,
      rewatches: sortedEntries.filter((entry) => entry.rewatch).length,
      liked: sortedEntries.filter((entry) => entry.liked).length
    },
    monthLabels,
    calendar,
    cells,
    recent,
    allTime: buildAllTimeStats(allEntries || sortedEntries, { totalFilms, scope })
  };
}
