const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch");
const cheerio = require("cheerio");

async function fetchLetterboxdData(username, year) {
  const entries = [];
  let page = 1;
  let hasMorePages = true;
  let currentMonth = null;
  let currentYear = year.toString();

  console.log(`Fetching Letterboxd diary for user: ${username} for year: ${year}`);

  while (hasMorePages) {
    console.log(`Fetching page ${page} of diary entries...`);
    const url = `https://letterboxd.com/${username}/films/diary/for/${year}/page/${page}/`;
    console.log(`URL: ${url}`);

    try {
      const response = await fetch(url);
      if (!response.ok) {
        if (response.status === 404) {
          console.log(`Page ${page} not found, finished fetching`);
          hasMorePages = false;
          break;
        }
        throw new Error(`Failed to fetch data: ${response.statusText} (${response.status})`);
      }

      const html = await response.text();
      if (page === 1) {
        fs.writeFileSync(`letterboxd-page-${page}.html`, html);
        console.log(`Saved HTML to letterboxd-page-${page}.html for debugging`);
      }

      const $ = cheerio.load(html);
      const diaryTable = $("#diary-table");
      if (diaryTable.length === 0) {
        console.log("No diary table found on this page");
        hasMorePages = false;
        break;
      }

      const entryRows = diaryTable.find("tr.diary-entry-row");
      console.log(`Found ${entryRows.length} diary entries on page ${page}`);
      if (entryRows.length === 0) {
        hasMorePages = false;
        break;
      }

      entryRows.each((_, row) => {
        try {
          const $row = $(row);
          const calendarCell = $row.find("td.td-calendar");
          const monthElement = calendarCell.find(".date strong a");
          const yearElement = calendarCell.find(".date small");

          if (monthElement.length > 0) currentMonth = monthElement.text().trim();
          if (yearElement.length > 0) currentYear = yearElement.text().trim();

          const dayElement = $row.find("td.td-day a");
          const day = dayElement.text().trim();

          const titleElement = $row.find("h3.headline-3 a");
          const title = titleElement.text().trim();

          const filmYearElement = $row.find("td.td-released");
          const filmYear = filmYearElement.text().trim();

          let rating = null;
          const ratingSpan = $row.find("td.td-rating .rating");
          if (ratingSpan.length > 0) {
            const ratingClass = ratingSpan.attr("class");
            const ratingMatch = ratingClass.match(/rated-(\d+)/);
            if (ratingMatch && ratingMatch[1]) {
              rating = Number(ratingMatch[1]) / 2;
            }
          }

          const monthNames = {
            Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
            Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
          };
          const monthNum = monthNames[currentMonth];

          if (monthNum !== undefined && day && currentYear) {
            const date = new Date(Number.parseInt(currentYear), monthNum, Number.parseInt(day));
            const filmUrl = titleElement.attr("href");

            console.log(`Found entry: ${date.toISOString().split("T")[0]} - ${title} (${filmYear}) - Rating: ${rating}`);

            entries.push({
              date,
              title,
              year: filmYear,
              rating,
              url: filmUrl ? `https://letterboxd.com${filmUrl}` : undefined,
            });
          } else {
            console.warn(`Skipping entry with incomplete date: Month=${currentMonth}, Day=${day}, Year=${currentYear}`);
          }
        } catch (err) {
          console.warn(`Error parsing entry: ${err}`);
        }
      });

      const nextPageLink = $(".paginate-nextprev .next");
      if (nextPageLink.length === 0 || nextPageLink.hasClass("disabled")) {
        console.log("No next page link found, finished fetching");
        hasMorePages = false;
      } else {
        page++;
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    } catch (error) {
      console.warn(`Error fetching page ${page}: ${error}`);
      hasMorePages = false;
    }
  }

  return entries;
}

async function tryFetchMultipleYears(username, startYear) {
  let allEntries = [];
  const currentYear = new Date().getFullYear();

  let entries = await fetchLetterboxdData(username, startYear);
  allEntries = allEntries.concat(entries);

  if (allEntries.length === 0) {
    console.log(`No entries found for ${startYear}, trying previous years...`);
    for (let year = startYear - 1; year >= startYear - 2; year--) {
      console.log(`Trying year ${year}...`);
      entries = await fetchLetterboxdData(username, year);
      allEntries = allEntries.concat(entries);
      if (entries.length > 0) {
        console.log(`Found ${entries.length} entries for year ${year}`);
        break;
      }
    }
  }

  return allEntries;
}

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

function generateSvg(entries) {
  const sortedEntries = [...entries].sort((a, b) => a.date.getTime() - b.date.getTime());
  if (sortedEntries.length === 0) return generateEmptySvg("No film entries found");

  const year = sortedEntries[0].date.getFullYear();
  const startDate = new Date(year, 0, 1);
  const endDate = new Date(year, 11, 31);
  const startDay = startDate.getDay();
  startDate.setDate(startDate.getDate() - startDay);

  const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  const totalWeeks = Math.ceil(totalDays / 7);

  const grid = Array(7).fill(0).map(() => Array(totalWeeks).fill(0));
  let totalFilms = 0;
  let maxCount = 0;
  const filmsPerDay = new Map();

  sortedEntries.forEach((entry) => {
    const daysSinceStart = Math.floor((entry.date.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const weekIndex = Math.floor(daysSinceStart / 7);
    const dayIndex = entry.date.getDay();

    if (weekIndex >= 0 && weekIndex < totalWeeks) {
      grid[dayIndex][weekIndex]++;
      totalFilms++;
      maxCount = Math.max(maxCount, grid[dayIndex][weekIndex]);

      const dateKey = entry.date.toISOString().split("T")[0];
      if (!filmsPerDay.has(dateKey)) filmsPerDay.set(dateKey, []);
      filmsPerDay.get(dateKey).push({ title: entry.title, year: entry.year, rating: entry.rating });
    }
  });

  const CELL_SIZE = 11;
  const CELL_MARGIN = 2;
  const GRID_WIDTH = totalWeeks * (CELL_SIZE + CELL_MARGIN);
  const GRID_HEIGHT = 7 * (CELL_SIZE + CELL_MARGIN);
  const SVG_WIDTH = GRID_WIDTH + 60;
  const SVG_HEIGHT = GRID_HEIGHT + 60; // Increased height for more space below

  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const colors = ["#ebedf0", "#9be9a8", "#40c463", "#30a14e", "#216e39"];

  function getColor(count) {
    if (count === 0) return colors[0];
    const level = Math.ceil((count / maxCount) * 4);
    return colors[Math.min(level, 4)];
  }

  let svg = `<svg width="${SVG_WIDTH}" height="${SVG_HEIGHT}" viewBox="0 0 ${SVG_WIDTH} ${SVG_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <style>
    text {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
      font-size: 11px;
      fill: #767676;
    }
    .title-text { font-size: 13px; fill: #24292e; }
    .subtitle-text { font-size: 11px; fill: #767676; }
    .tooltip {
      opacity: 0;
      pointer-events: none;
    }
    rect:hover + .tooltip {
      opacity: 1;
    }
  </style>
  <!-- Title and films watched in top-left -->
  <text x="10" y="15" class="title-text">Letterboxd ${year}</text>
  <text x="10" y="30" class="subtitle-text">${totalFilms} films watched</text>
  
  <!-- Legend in top-right -->
  <g transform="translate(${SVG_WIDTH - 140}, 10)">
    <text x="0" y="10">Less</text>`;
  for (let i = 0; i < 5; i++) {
    svg += `
    <rect x="${40 + i * 15}" y="2" width="10" height="10" rx="2" ry="2" fill="${colors[i]}"/>`;
  }
  svg += `
    <text x="${40 + 5 * 15 + 5}" y="10">More</text>
  </g>
  
  <!-- Month labels -->
  <g transform="translate(30, 50)">`;
  for (let i = 0; i < 12; i++) {
    const firstDayOfMonth = new Date(year, i, 1);
    const daysSinceStart = Math.floor((firstDayOfMonth.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    if (daysSinceStart < 0) continue;
    const weekIndex = Math.floor(daysSinceStart / 7);
    const x = weekIndex * (CELL_SIZE + CELL_MARGIN);
    svg += `<text x="${x}" y="0">${MONTHS[i]}</text>`;
  }

  svg += `</g>
  <!-- Day of week labels -->
  <g transform="translate(10, 60)">`;
  for (let i = 0; i < 7; i++) {
    svg += `<text x="0" y="${i * (CELL_SIZE + CELL_MARGIN) + CELL_SIZE / 2 + 4}">${DAYS[i][0]}</text>`;
  }

  svg += `</g>
  <!-- Contribution cells -->
  <g transform="translate(30, 60)">`;
  for (let day = 0; day < 7; day++) {
    for (let week = 0; week < totalWeeks; week++) {
      const count = grid[day][week];
      const color = getColor(count);
      const cellDate = new Date(startDate);
      cellDate.setDate(cellDate.getDate() + week * 7 + day);

      const tooltipDate = cellDate.toISOString().split("T")[0];
      const x = week * (CELL_SIZE + CELL_MARGIN);
      const y = day * (CELL_SIZE + CELL_MARGIN);

      const filmsForDay = filmsPerDay.get(tooltipDate) || [];
      let tooltipContent = `${tooltipDate}: ${count} film${count !== 1 ? "s" : ""} watched`;
      if (filmsForDay.length > 0) {
        filmsForDay.forEach((film) => {
          const ratingStr = film.rating ? ` - ${film.rating}★` : "";
          tooltipContent += `\n${escapeXml(film.title)} (${escapeXml(film.year)})${ratingStr}`;
        });
      }

      const tooltipLines = tooltipContent.split("\n").length;
      const tooltipHeight = tooltipLines * 15;
      const tooltipWidth = 150;

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
      <g class="tooltip" transform="translate(${x - 20}, ${y - tooltipHeight - 10})">
        <rect x="0" y="0" width="${tooltipWidth}" height="${tooltipHeight}" rx="3" fill="black" opacity="0.8" />
        <text x="5" y="15" fill="white">${tooltipContent.split("\n").map((line, i) => `
          <tspan x="5" dy="${i === 0 ? 0 : 15}">${escapeXml(line)}</tspan>`).join("")}</text>
      </g>`;
    }
  }

  svg += `</g></svg>`;
  return svg;
}

function generateEmptySvg(message) {
  return `<svg width="600" height="100" xmlns="http://www.w3.org/2000/svg">
    <rect width="600" height="100" fill="#f6f8fa" rx="3" ry="3" />
    <text x="50%" y="50%" font-family="Arial" font-size="14" fill="#24292e" text-anchor="middle" dominant-baseline="middle">${escapeXml(message)}</text>
  </svg>`;
}

async function main() {
  try {
    const username = process.argv[2] || process.env.INPUT_LETTERBOXD_USERNAME || "nichtlegacy";
    const year = Number.parseInt(process.argv[3] || process.env.INPUT_YEAR || new Date().getFullYear());
    const outputPath = process.argv[4] || process.env.INPUT_OUTPUT_PATH || "letterboxd-graph.svg";

    console.log(`Starting Letterboxd contribution graph generation for user: ${username}`);
    const filmEntries = await tryFetchMultipleYears(username, year);
    console.log(`Found ${filmEntries.length} film entries in total`);

    const svg = generateSvg(filmEntries);
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    fs.writeFileSync(outputPath, svg);
    console.log(`SVG contribution graph saved to ${outputPath}`);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

main();