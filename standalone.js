const fs = require("fs")
const path = require("path")
const fetch = require("node-fetch")
const cheerio = require("cheerio")

async function fetchLetterboxdData(username, year) {
  const entries = []
  let page = 1
  let hasMorePages = true

  console.log(`Fetching Letterboxd diary for user: ${username} for year: ${year}`)

  // Keep track of the current month and year for entries that don't have this info
  let currentMonth = null
  let currentYear = year.toString()

  while (hasMorePages) {
    console.log(`Fetching page ${page} of diary entries...`)

    // Letterboxd diary URL structure
    const url = `https://letterboxd.com/${username}/films/diary/for/${year}/page/${page}/`
    console.log(`URL: ${url}`)

    try {
      const response = await fetch(url)

      if (!response.ok) {
        if (response.status === 404) {
          console.log(`Page ${page} not found, finished fetching`)
          hasMorePages = false
          break
        }
        throw new Error(`Failed to fetch data: ${response.statusText} (${response.status})`)
      }

      const html = await response.text()

      // Debug: Save the HTML to a file for inspection
      if (page === 1) {
        fs.writeFileSync(`letterboxd-page-${page}.html`, html)
        console.log(`Saved HTML to letterboxd-page-${page}.html for debugging`)
      }

      const $ = cheerio.load(html)

      // Find the diary table
      const diaryTable = $("#diary-table")

      if (diaryTable.length === 0) {
        console.log("No diary table found on this page")
        hasMorePages = false
        break
      }

      // Find all diary entry rows
      const entryRows = diaryTable.find("tr.diary-entry-row")
      console.log(`Found ${entryRows.length} diary entries on page ${page}`)

      if (entryRows.length === 0) {
        hasMorePages = false
        break
      }

      // Process each entry row
      entryRows.each((_, row) => {
        try {
          const $row = $(row)

          // Extract month and year if available
          const calendarCell = $row.find("td.td-calendar")
          const monthElement = calendarCell.find(".date strong a")
          const yearElement = calendarCell.find(".date small")

          // If month is available, update the current month
          if (monthElement.length > 0) {
            currentMonth = monthElement.text().trim()
          }

          // If year is available, update the current year
          if (yearElement.length > 0) {
            currentYear = yearElement.text().trim()
          }

          // Extract day
          const dayElement = $row.find("td.td-day a")
          const day = dayElement.text().trim()

          // Extract film title
          const titleElement = $row.find("h3.headline-3 a")
          const title = titleElement.text().trim()

          // Extract film year
          const filmYearElement = $row.find("td.td-released")
          const filmYear = filmYearElement.text().trim()

          // DETAILED RATING DEBUGGING
          console.log(`\n--- RATING DEBUG for ${title} ---`)

          // Get the HTML of the rating cell for debugging
          const ratingCell = $row.find("td.td-rating")
          console.log(`Rating cell found: ${ratingCell.length > 0}`)
          if (ratingCell.length > 0) {
            console.log(`Rating cell HTML: ${ratingCell.html().substring(0, 200)}...`)
          }

          // Try to find all divs with class containing "rateit"
          const rateitDivs = $row.find("div[class*='rateit']")
          console.log(`Found ${rateitDivs.length} divs with 'rateit' in class`)

          rateitDivs.each((i, el) => {
            console.log(`Rateit div ${i + 1} class: ${$(el).attr("class")}`)
            console.log(`Rateit div ${i + 1} aria-valuenow: ${$(el).attr("aria-valuenow")}`)
          })

          // Try a more direct approach - look for the specific div
          const rateitRange = $row.find(".rateit-range")
          console.log(`Found ${rateitRange.length} elements with class 'rateit-range'`)

          // Extract rating
          let rating = null
          if (rateitRange.length > 0) {
            const ratingValue = rateitRange.attr("aria-valuenow")
            console.log(`Rating value from aria-valuenow: ${ratingValue}`)
            if (ratingValue) {
              rating = Number(ratingValue) / 2 // Convert from 0-10 to 0-5 scale
              console.log(`Converted rating: ${rating}`)
            }
          }

          // If still no rating, try another approach
          if (rating === null) {
            // Try to find the rating directly from the HTML
            const html = $row.html()
            const ratingMatch = html.match(/aria-valuenow="(\d+)"/)
            if (ratingMatch && ratingMatch[1]) {
              rating = Number(ratingMatch[1]) / 2
              console.log(`Rating extracted from HTML: ${rating}`)
            }
          }

          console.log(`--- END RATING DEBUG ---\n`)

          // Convert month name to month number
          const monthNames = {
            Jan: 0,
            Feb: 1,
            Mar: 2,
            Apr: 3,
            May: 4,
            Jun: 5,
            Jul: 6,
            Aug: 7,
            Sep: 8,
            Oct: 9,
            Nov: 10,
            Dec: 11,
          }

          const monthNum = monthNames[currentMonth]

          if (monthNum !== undefined && day && currentYear) {
            // Create date object
            const date = new Date(Number.parseInt(currentYear), monthNum, Number.parseInt(day))

            // Get film URL
            const filmUrl = titleElement.attr("href")

            console.log(`Found entry: ${date.toISOString().split("T")[0]} - ${title} (${filmYear}) - Rating: ${rating}`)

            entries.push({
              date,
              title,
              year: filmYear,
              rating,
              url: filmUrl ? `https://letterboxd.com${filmUrl}` : undefined,
            })
          } else {
            console.warn(
              `Skipping entry with incomplete date: Month=${currentMonth}, Day=${day}, Year=${currentYear}, MonthNum=${monthNum}`,
            )
          }
        } catch (err) {
          console.warn(`Error parsing entry: ${err}`)
        }
      })

      // Check if there's a next page
      const nextPageLink = $(".paginate-nextprev .next")
      if (nextPageLink.length === 0 || nextPageLink.hasClass("disabled")) {
        console.log("No next page link found, finished fetching")
        hasMorePages = false
      } else {
        page++
        // Add a small delay to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 1000))
      }
    } catch (error) {
      console.warn(`Error fetching page ${page}: ${error}`)
      hasMorePages = false
    }
  }

  return entries
}

async function tryFetchMultipleYears(username, startYear) {
  let allEntries = []
  const currentYear = new Date().getFullYear()

  // Try the specified year first
  let entries = await fetchLetterboxdData(username, startYear)
  allEntries = allEntries.concat(entries)

  // If no entries found, try previous years
  if (allEntries.length === 0) {
    console.log(`No entries found for ${startYear}, trying previous years...`)

    for (let year = startYear - 1; year >= startYear - 2; year--) {
      console.log(`Trying year ${year}...`)
      entries = await fetchLetterboxdData(username, year)
      allEntries = allEntries.concat(entries)

      if (entries.length > 0) {
        console.log(`Found ${entries.length} entries for year ${year}`)
        break
      }
    }
  }

  return allEntries
}

// Helper function to escape special characters for XML
function escapeXml(unsafe) {
  if (unsafe === undefined || unsafe === null) return ""
  return String(unsafe).replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case "<":
        return "&lt;"
      case ">":
        return "&gt;"
      case "&":
        return "&amp;"
      case "'":
        return "&apos;"
      case '"':
        return "&quot;"
    }
  })
}

function generateSvg(entries, darkMode = true) {
  // Sort entries by date
  const sortedEntries = [...entries].sort((a, b) => a.date.getTime() - b.date.getTime())

  if (sortedEntries.length === 0) {
    return generateEmptySvg("No film entries found", darkMode)
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

  // Create a map to store film titles for each date
  const filmsPerDay = new Map()

  sortedEntries.forEach((entry) => {
    const daysSinceStart = Math.floor((entry.date.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
    const weekIndex = Math.floor(daysSinceStart / 7)
    const dayIndex = entry.date.getDay() // 0 = Sunday, 6 = Saturday

    if (weekIndex >= 0 && weekIndex < totalWeeks) {
      grid[dayIndex][weekIndex]++
      totalFilms++
      maxCount = Math.max(maxCount, grid[dayIndex][weekIndex])

      // Store film title for this date
      const dateKey = entry.date.toISOString().split("T")[0]
      if (!filmsPerDay.has(dateKey)) {
        filmsPerDay.set(dateKey, [])
      }
      filmsPerDay.get(dateKey).push({
        title: entry.title,
        year: entry.year,
        rating: entry.rating,
      })
    }
  })

  // Generate SVG
  const CELL_SIZE = 10 // Smaller cells like GitHub
  const CELL_MARGIN = 2
  const GRID_WIDTH = totalWeeks * (CELL_SIZE + CELL_MARGIN)
  const GRID_HEIGHT = 7 * (CELL_SIZE + CELL_MARGIN)
  const SVG_WIDTH = GRID_WIDTH + 60 // Add space for labels
  const SVG_HEIGHT = GRID_HEIGHT + 60 // Add space for labels and title

  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

  // Color schemes
  const colors = darkMode
    ? [
        "#161b22", // 0 contributions (dark background)
        "#0e4429", // Level 1
        "#006d32", // Level 2
        "#26a641", // Level 3
        "#39d353", // Level 4
      ]
    : [
        "#ebedf0", // 0 contributions
        "#9be9a8", // Level 1
        "#40c463", // Level 2
        "#30a14e", // Level 3
        "#216e39", // Level 4
      ]

  // Text colors
  const textPrimary = darkMode ? "#e6edf3" : "#24292e"
  const textSecondary = darkMode ? "#8b949e" : "#586069"
  const bgColor = darkMode ? "#0d1117" : "transparent"
  const borderColor = darkMode ? "#30363d" : "#eaecef"

  function getColor(count) {
    if (count === 0) return colors[0]
    const level = Math.ceil((count / maxCount) * 4)
    return colors[Math.min(level, 4)]
  }

  // Start building the SVG - COMPLETELY DIFFERENT STRUCTURE
  let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${SVG_WIDTH}" height="${SVG_HEIGHT}" viewBox="0 0 ${SVG_WIDTH} ${SVG_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <style>
    .font-sans { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; }
    .text-secondary { fill: ${textSecondary}; }
    .text-primary { fill: ${textPrimary}; }
    .text-xs { font-size: 9px; }
    .text-sm { font-size: 10px; }
    .text-base { font-size: 12px; }
    .text-lg { font-size: 14px; }
    .font-semibold { font-weight: 600; }
    .text-start { text-anchor: start; }
    .text-middle { dominant-baseline: middle; }
    .text-end { text-anchor: end; }
  </style>
  
  <rect width="${SVG_WIDTH}" height="${SVG_HEIGHT}" fill="${bgColor}" rx="6" ry="6" />
  
  <!-- Title - CHANGED POSITION -->
  <text x="${SVG_WIDTH / 2}" y="20" class="font-sans text-lg font-semibold text-primary" text-anchor="middle">Letterboxd Contribution Graph - ${year}</text>
  <text x="${SVG_WIDTH / 2}" y="40" class="font-sans text-base text-secondary" text-anchor="middle">${totalFilms} films watched</text>
  
  <!-- Legend - MOVED TO TOP CENTER -->
  <g transform="translate(${SVG_WIDTH / 2 - 75}, 55)">
    <text x="0" y="7" class="font-sans text-xs text-secondary text-start text-middle">Less</text>
`

  // Add legend colors
  for (let i = 0; i < 5; i++) {
    svg += `
    <rect
      x="${30 + i * 15}"
      y="0"
      width="10"
      height="10"
      rx="2"
      ry="2"
      fill="${colors[i]}"
      stroke="${i === 0 ? borderColor : "none"}"
      stroke-width="1"
    />`
  }

  svg += `
    <text x="${30 + 5 * 15 + 5}" y="7" class="font-sans text-xs text-secondary text-start text-middle">More</text>
  </g>
  
  <!-- Month labels -->
  <g transform="translate(30, 80)">`

  // Add month labels
  for (let i = 0; i < 12; i++) {
    const firstDayOfMonth = new Date(year, i, 1)
    const daysSinceStart = Math.floor((firstDayOfMonth.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))

    if (daysSinceStart < 0) continue

    const weekIndex = Math.floor(daysSinceStart / 7)
    const x = weekIndex * (CELL_SIZE + CELL_MARGIN)

    svg += `<text x="${x}" y="0" class="font-sans text-sm text-secondary text-start">${MONTHS[i]}</text>`
  }

  svg += `</g>
  
  <!-- Day of week labels -->
  <g transform="translate(20, 95)">`

  // Add day of week labels (only Mon, Wed, Fri)
  const daysToShow = [1, 3, 5] // Monday, Wednesday, Friday
  for (let i = 0; i < 7; i++) {
    if (daysToShow.includes(i)) {
      svg += `<text x="0" y="${i * (CELL_SIZE + CELL_MARGIN) + CELL_SIZE / 2}" class="font-sans text-xs text-secondary text-end text-middle">${DAYS[i][0]}</text>`
    }
  }

  svg += `</g>
  
  <!-- Contribution cells with native tooltips -->
  <g transform="translate(30, 95)">`

  // First, add all the cells
  for (let day = 0; day < 7; day++) {
    for (let week = 0; week < totalWeeks; week++) {
      const count = grid[day][week]
      const color = getColor(count)

      const cellDate = new Date(startDate)
      cellDate.setDate(cellDate.getDate() + week * 7 + day)

      // Skip dates outside the year
      if (cellDate.getFullYear() !== year) {
        continue
      }

      const dateStr = cellDate.toISOString().split("T")[0]
      const x = week * (CELL_SIZE + CELL_MARGIN)
      const y = day * (CELL_SIZE + CELL_MARGIN)

      // Add data attributes for tooltip content
      const filmsForDay = filmsPerDay.get(dateStr) || []
      let tooltipContent = `${dateStr}: ${count} film${count !== 1 ? "s" : ""} watched`

      if (filmsForDay.length > 0) {
        filmsForDay.forEach((film) => {
          const ratingStr = film.rating ? ` - ${film.rating}★` : ""
          tooltipContent += `\n• ${escapeXml(film.title)} (${escapeXml(film.year)})${ratingStr}`
        })
      }

      svg += `
      <g>
        <title>${tooltipContent}</title>
        <rect
          x="${x}"
          y="${y}"
          width="${CELL_SIZE}"
          height="${CELL_SIZE}"
          rx="2"
          ry="2"
          fill="${color}"
          stroke="${count === 0 ? borderColor : "none"}"
          stroke-width="1"
        />
      </g>`
    }
  }

  svg += `</g>
</svg>`

  return svg
}

function generateEmptySvg(message, darkMode = true) {
  const textColor = darkMode ? "#e6edf3" : "#24292e"
  const bgColor = darkMode ? "#0d1117" : "#f6f8fa"

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="600" height="100" xmlns="http://www.w3.org/2000/svg">
  <style>
    .font-sans { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; }
    .text-primary { fill: ${textColor}; }
    .text-center { text-anchor: middle; dominant-baseline: middle; }
  </style>
  <rect width="600" height="100" fill="${bgColor}" rx="4" ry="4" />
  <text x="50%" y="50%" class="font-sans text-primary text-center" font-size="14">${escapeXml(message)}</text>
</svg>`
}

async function main() {
  try {
    // Get command line arguments or use defaults
    const username = process.argv[2] || process.env.INPUT_LETTERBOXD_USERNAME || "nichtlegacy"
    const year = Number.parseInt(process.argv[3] || process.env.INPUT_YEAR || new Date().getFullYear())
    const outputPath = process.argv[4] || process.env.INPUT_OUTPUT_PATH || "letterboxd-graph.svg"
    const darkMode = true // Set to true for dark mode

    console.log(`Starting Letterboxd contribution graph generation for user: ${username}`)

    // Try to fetch data for the specified year and previous years if needed
    const filmEntries = await tryFetchMultipleYears(username, year)
    console.log(`Found ${filmEntries.length} film entries in total`)

    // Generate the SVG
    const svg = generateSvg(filmEntries, darkMode)

    // Ensure directory exists
    const dir = path.dirname(outputPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    // Write the SVG to file
    fs.writeFileSync(outputPath, svg)

    console.log(`SVG contribution graph saved to ${outputPath}`)
  } catch (error) {
    console.error("Error:", error)
    process.exit(1)
  }
}

// Run the script
main()

