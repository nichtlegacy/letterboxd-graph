const fs = require("fs")
const path = require("path")
const fetch = require("node-fetch")
const cheerio = require("cheerio")

async function fetchLetterboxdData(username, year) {
  const entries = []
  let page = 1
  let hasMorePages = true

  console.log(`Fetching Letterboxd diary for user: ${username} for year: ${year}`)

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

          // Extract month and year
          const monthElement = $row.find("td.td-calendar .date strong a")
          const yearElement = $row.find("td.td-calendar .date small")
          const month = monthElement.text().trim()
          const yearText = yearElement.text().trim()

          // Extract day
          const dayElement = $row.find("td.td-day a")
          const day = dayElement.text().trim()

          // Extract film title
          const titleElement = $row.find("h3.headline-3 a")
          const title = titleElement.text().trim()

          // Extract film year
          const filmYearElement = $row.find("td.td-released")
          const filmYear = filmYearElement.text().trim()

          // Extract rating (if available)
          const ratingElement = $row.find("td.td-rating .rateit-range")
          let rating = null
          if (ratingElement.length > 0) {
            const ratingValue = ratingElement.attr("aria-valuenow")
            if (ratingValue) {
              rating = Number.parseInt(ratingValue) / 2 // Convert from 0-10 to 0-5 scale
            }
          }

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

          const monthNum = monthNames[month]

          if (monthNum !== undefined && day && yearText) {
            // Create date object
            const date = new Date(Number.parseInt(yearText), monthNum, Number.parseInt(day))

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
            console.warn(`Skipping entry with incomplete date: Month=${month}, Day=${day}, Year=${yearText}`)
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

function generateSvg(entries) {
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

  function getColor(count) {
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

function generateEmptySvg(message) {
  return `<svg width="600" height="100" xmlns="http://www.w3.org/2000/svg">
    <rect width="600" height="100" fill="#f6f8fa" rx="3" ry="3" />
    <text x="50%" y="50%" font-family="Arial" font-size="14" fill="#24292e" text-anchor="middle" dominant-baseline="middle">${message}</text>
  </svg>`
}

async function main() {
  try {
    // Get command line arguments or use defaults
    const username = process.argv[2] || process.env.INPUT_LETTERBOXD_USERNAME || "nichtlegacy"
    const year = Number.parseInt(process.argv[3] || process.env.INPUT_YEAR || new Date().getFullYear())
    const outputPath = process.argv[4] || process.env.INPUT_OUTPUT_PATH || "letterboxd-graph.svg"

    console.log(`Starting Letterboxd contribution graph generation for user: ${username}`)

    // Try to fetch data for the specified year and previous years if needed
    const filmEntries = await tryFetchMultipleYears(username, year)
    console.log(`Found ${filmEntries.length} film entries in total`)

    // Generate the SVG
    const svg = generateSvg(filmEntries)

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

