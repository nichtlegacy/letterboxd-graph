interface LetterboxdEntry {
  date: Date
  name: string
  year: string
}

export function generateContributionGrid(entries: LetterboxdEntry[]) {
  // Sort entries by date
  const sortedEntries = [...entries].sort((a, b) => a.date.getTime() - b.date.getTime())

  if (sortedEntries.length === 0) {
    throw new Error("No valid entries found in the data")
  }

  // Determine date range
  const startDate = new Date(sortedEntries[0].date)
  const endDate = new Date(sortedEntries[sortedEntries.length - 1].date)

  // Adjust startDate to the beginning of the week (Sunday)
  startDate.setDate(startDate.getDate() - startDate.getDay())

  // Calculate the number of weeks needed
  const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1
  const totalWeeks = Math.ceil(totalDays / 7)

  // Initialize the grid (7 rows for days of the week, totalWeeks columns)
  const grid = Array(7)
    .fill(0)
    .map(() => Array(totalWeeks).fill(0))

  // Fill the grid with film counts
  let totalFilms = 0
  let maxCount = 0

  sortedEntries.forEach((entry) => {
    const daysSinceStart = Math.floor((entry.date.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
    const weekIndex = Math.floor(daysSinceStart / 7)
    const dayIndex = entry.date.getDay() // 0 = Sunday, 6 = Saturday

    if (weekIndex >= 0 && weekIndex < totalWeeks) {
      grid[dayIndex][weekIndex]++
      totalFilms++
      maxCount = Math.max(maxCount, grid[dayIndex][weekIndex])
    }
  })

  return {
    grid,
    maxCount,
    totalFilms,
    startDate,
    endDate,
  }
}

