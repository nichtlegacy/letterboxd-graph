import type { FilmEntry } from "./fetch-data"

export function generateSvg(entries: FilmEntry[]): string {
  // Sort entries by date
  const sortedEntries = [...entries].sort((a, b) => a.date.getTime() - b.date.getTime())

  if (sortedEntries.length === 0) {
    return generateEmptySvg("No film entries found")
  }

  // Determine date range
  const year = sortedEntries[0].date.getFullYear()
  const startDate = new Date(year, 0, 1) // January 1st of the year
  const endDate = new Date(year, 11, 31) // December 31st of the year

  // Adjust startDate to the beginning of the week (Sunday)
  const startDay = startDate.getDay() // 0 = Sunday, 6 = Saturday
  startDate.setDate(startDate.getDate() - startDay)

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

  // Generate SVG
  const CELL_SIZE = 11
  const CELL_MARGIN = 2
  const GRID_WIDTH = totalWeeks * (CELL_SIZE + CELL_MARGIN)
  const GRID_HEIGHT = 7 * (CELL_SIZE + CELL_MARGIN)
  const SVG_WIDTH = GRID_WIDTH + 60 // Add space for labels
  const SVG_HEIGHT = GRID_HEIGHT + 30 // Add space for labels

  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

  // GitHub-like color scheme
  const colors = [
    "#ebedf0", // 0 contributions
    "#9be9a8", // Level 1
    "#40c463", // Level 2
    "#30a14e", // Level 3
    "#216e39", // Level 4
  ]

  function getColor(count: number): string {
    if (count === 0) return colors[0]
    const level = Math.ceil((count / maxCount) * 4)
    return colors[Math.min(level, 4)]
  }

  let svg = `<svg width="${SVG_WIDTH}" height="${SVG_HEIGHT}" viewBox="0 0 ${SVG_WIDTH} ${SVG_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <style>
    text {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
      font-size: 9px;
      fill: #767676;
    }
    .tooltip {
      opacity: 0;
      pointer-events: none;
    }
    rect:hover + .tooltip {
      opacity: 1;
    }
  </style>
  
  <!-- Title -->
  <text x="10" y="10" font-size="12" fill="#24292e">Letterboxd Contribution Graph (${totalFilms} films watched in ${year})</text>
  
  <!-- Month labels -->
  <g transform="translate(30, 20)">`

  // Add month labels
  for (let i = 0; i < 12; i++) {
    const firstDayOfMonth = new Date(year, i, 1)
    const daysSinceStart = Math.floor((firstDayOfMonth.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))

    if (daysSinceStart < 0) continue

    const weekIndex = Math.floor(daysSinceStart / 7)
    const x = weekIndex * (CELL_SIZE + CELL_MARGIN)

    svg += `<text x="${x}" y="0">${MONTHS[i]}</text>`
  }

  svg += `</g>
  
  <!-- Day of week labels -->
  <g transform="translate(10, 30)">`

  // Add day of week labels
  for (let i = 0; i < 7; i++) {
    svg += `<text x="0" y="${i * (CELL_SIZE + CELL_MARGIN) + CELL_SIZE / 2 + 4}">${DAYS[i][0]}</text>`
  }

  svg += `</g>
  
  <!-- Contribution cells -->
  <g transform="translate(30, 30)">`

  // Add contribution cells
  for (let day = 0; day < 7; day++) {
    for (let week = 0; week < totalWeeks; week++) {
      const count = grid[day][week]
      const color = getColor(count)

      const cellDate = new Date(startDate)
      cellDate.setDate(cellDate.getDate() + week * 7 + day)

      const tooltipDate = cellDate.toISOString().split("T")[0]
      const x = week * (CELL_SIZE + CELL_MARGIN)
      const y = day * (CELL_SIZE + CELL_MARGIN)

      svg += `
      <rect
        x="${x}"
        y="${y}"
        width="${CELL_SIZE}"
        height="${CELL_SIZE}"
        rx="2"
        ry="2"
        fill="${color}"
        data-date="${tooltipDate}"
        data-count="${count}"
      />
      <g class="tooltip" transform="translate(${x - 20}, ${y - 30})">
        <rect x="0" y="0" width="100" height="30" rx="3" fill="black" opacity="0.8" />
        <text x="5" y="15" fill="white">${tooltipDate}: ${count} film${count !== 1 ? "s" : ""}</text>
      </g>`
    }
  }

  svg += `</g>
  
  <!-- Legend -->
  <g transform="translate(${SVG_WIDTH - 120}, ${SVG_HEIGHT - 15})">
    <text x="0" y="7">Less</text>`

  // Add legend colors
  for (let i = 0; i < 5; i++) {
    svg += `
    <rect
      x="${40 + i * 15}"
      y="0"
      width="10"
      height="10"
      rx="2"
      ry="2"
      fill="${colors[i]}"
    />`
  }

  svg += `
    <text x="${40 + 5 * 15 + 5}" y="7">More</text>
  </g>
</svg>`

  return svg
}

function generateEmptySvg(message: string): string {
  return `<svg width="600" height="100" xmlns="http://www.w3.org/2000/svg">
    <rect width="600" height="100" fill="#f6f8fa" rx="3" ry="3" />
    <text x="50%" y="50%" font-family="Arial" font-size="14" fill="#24292e" text-anchor="middle" dominant-baseline="middle">${message}</text>
  </svg>`
}

