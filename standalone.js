const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch");
const cheerio = require("cheerio");

async function fetchLetterboxdData(username, year) {
  const entries = [];
  let page = 1;
  let hasMorePages = true;

  console.log(`Fetching Letterboxd diary for user: ${username} for year: ${year}`);

  while (hasMorePages) {
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
          const dayElement = $row.find("td.td-day a");
          const dayUrl = dayElement.attr('href');
          const urlParts = dayUrl.split('/').filter(part => part);
          const yearIndex = urlParts.indexOf('for') + 1;
          const monthIndex = yearIndex + 1;
          const dayIndex = monthIndex + 1;

          const entryYear = Number.parseInt(urlParts[yearIndex]);
          const month = urlParts[monthIndex];
          const day = urlParts[dayIndex];

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
            '01': 0, '02': 1, '03': 2, '04': 3, '05': 4, '06': 5,
            '07': 6, '08': 7, '09': 8, '10': 9, '11': 10, '12': 11
          };

          const monthNum = monthNames[month];
          const titleLink = titleElement.attr("href");

          if (monthNum !== undefined && day && entryYear === year) {
            // Use UTC to avoid timezone shifts
            const date = new Date(Date.UTC(year, monthNum, Number.parseInt(day)));
            const filmUrl = titleLink ? `https://letterboxd.com${titleLink}` : undefined;

            console.log(`Found entry: ${date.toISOString().split("T")[0]} - ${title} (${filmYear}) - Rating: ${rating}`);

            entries.push({
              date,
              title,
              year: filmYear,
              rating,
              url: filmUrl
            });
          } else {
            console.warn(`Skipping entry with invalid date or year mismatch: Year=${entryYear}, Month=${month}, Day=${day}, Requested Year=${year}`);
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

async function fetchProfileData(username) {
  const url = `https://letterboxd.com/${username}/`;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch profile page: ${response.statusText} (${response.status})`);
    }
    const html = await response.text();
    const $ = cheerio.load(html);

    const profileImage = $('.profile-avatar img').attr('src');
    const displayName = $('.person-display-name .displayname').attr('data-original-title') || $('.person-display-name .displayname').text().trim() || username;

    return {
      profileImage: profileImage || null,
      displayName: displayName || username
    };
  } catch (error) {
    console.warn(`Error fetching profile data for ${username}: ${error}. Using fallback values.`);
    return {
      profileImage: null,
      displayName: username
    };
  }
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

function generateSvg(entries, options = {}) {
  const { 
    theme = 'dark', 
    year = new Date().getFullYear(),
    weekStart = 'sunday',
    username = 'nichtlegacy',
    profileImage = null,
    displayName = username
  } = options;

  const sortedEntries = [...entries].filter(entry => {
    return entry.date.getFullYear() === year;
  }).sort((a, b) => a.date.getTime() - b.date.getTime());

  const displayYear = year;
  const startDate = new Date(Date.UTC(displayYear, 0, 1)); // January 1st UTC
  const endDate = new Date(Date.UTC(displayYear, 11, 31)); // December 31st UTC
  
  const startDay = startDate.getDay();
  const dayShift = weekStart === 'monday' ? (startDay + 6) % 7 : startDay;
  if (dayShift > 0) {
    startDate.setDate(startDate.getDate() - dayShift); // Align to week start, may go into previous year
  }

  const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  const totalWeeks = Math.ceil(totalDays / 7);

  const grid = Array(7).fill(0).map(() => Array(totalWeeks).fill(0));
  let totalFilms = 0;
  let maxCount = 0;
  const filmsPerDay = new Map();

  sortedEntries.forEach((entry) => {
    const daysSinceStart = Math.floor((entry.date.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const weekIndex = Math.floor(daysSinceStart / 7);
    const dayIndex = weekStart === 'monday' ? (entry.date.getDay() + 6) % 7 : entry.date.getDay();

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
  const SVG_HEIGHT = GRID_HEIGHT + 70;

  const DAYS_SUNDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const DAYS_MONDAY = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const DAYS = weekStart === 'monday' ? DAYS_MONDAY : DAYS_SUNDAY;
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  const themes = {
    dark: {
      bg: '#0d1117',
      text: '#c9d1d9',
      title: '#e6edf3',
      subtitle: '#8b949e',
      tooltipBg: '#21262d',
      tooltipText: '#ffffff',
      tooltipBorder: '#ffffff',
      colors: ['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353']
    },
    light: {
      bg: '#ffffff',
      text: '#24292e',
      title: '#000000',
      subtitle: '#6a737d',
      tooltipBg: '#f6f8fa',
      tooltipText: '#24292e',
      tooltipBorder: '#d1d5da',
      colors: ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39']
    }
  };

  const currentTheme = themes[theme] || themes.dark;

  function getColor(count) {
    if (count === 0) return currentTheme.colors[0];
    const level = Math.ceil((count / maxCount) * 4);
    return currentTheme.colors[Math.min(level, 4)];
  }

  const imageWidth = profileImage ? 13 : 0;
  const textWidth = displayName.length * 8;
  const totalHeaderWidth = imageWidth + (profileImage ? 5 : 0) + textWidth;

  let svg = `<svg width="${SVG_WIDTH}" height="${SVG_HEIGHT}" viewBox="0 0 ${SVG_WIDTH} ${SVG_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <style>
    text {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
      font-size: 11px;
      fill: ${currentTheme.text};
    }
    .title-text { font-size: 13px; fill: ${currentTheme.title}; }
    .subtitle-text { font-size: 11px; fill: ${currentTheme.subtitle}; }
    .tooltip {
      opacity: 0;
      pointer-events: none;
    }
    .tooltip text {
      font-size: 12px;
      fill: ${currentTheme.tooltipText};
    }
    rect[opacity="1"]:hover + .tooltip { /* Änderung hier: Nur opacity="1" triggert den Hover */
      opacity: 1;
    }
  </style>
  <rect width="${SVG_WIDTH}" height="${SVG_HEIGHT}" fill="${currentTheme.bg}" rx="6" ry="6"/>
  
  <!-- Profilbild und Name -->
  <g transform="translate(${(SVG_WIDTH - totalHeaderWidth) / 2}, 10)">
    ${profileImage ? `<image href="${profileImage}" x="0" y="0" width="13" height="13" preserveAspectRatio="xMidYMid slice" clip-path="circle(6.5px at 6.5px 6.5px)"/>` : ''}
    <text x="${profileImage ? 18 : 0}" y="11" class="title-text">${escapeXml(displayName)}</text>
  </g>
  
  <!-- Letterboxd-Logo und Titel -->
  <g transform="translate(10, 17)">
    <image href="https://a.ltrbxd.com/logos/letterboxd-decal-dots-pos-rgb-500px.png" x="0" y="-12" width="15" height="15"/>
    <text x="20" y="0" class="title-text">Letterboxd ${displayYear}</text>
  </g>
  <text x="30" y="30" class="subtitle-text">${totalFilms} movies watched</text>
  
  <!-- Legende -->
  <g transform="translate(${SVG_WIDTH - 160}, 10)">
    <text x="0" y="10">Less</text>`;
  for (let i = 0; i < 5; i++) {
    svg += `
    <rect x="${40 + i * 15}" y="2" width="10" height="10" rx="2" ry="2" fill="${currentTheme.colors[i]}"/>`;
  }
  svg += `
    <text x="${40 + 5 * 15 + 5}" y="10">More</text>
  </g>
  
  <g transform="translate(30, 50)">`;
  for (let i = 0; i < 12; i++) {
    const firstDayOfMonth = new Date(Date.UTC(displayYear, i, 1));
    const daysSinceStart = Math.floor((firstDayOfMonth.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    if (daysSinceStart < 0) continue;
    const weekIndex = Math.floor(daysSinceStart / 7);
    const x = weekIndex * (CELL_SIZE + CELL_MARGIN);
    svg += `<text x="${x}" y="0">${MONTHS[i]}</text>`;
  }

  svg += `</g>
  <g transform="translate(10, 60)">`;
  for (let i = 0; i < 7; i++) {
    svg += `<text x="0" y="${i * (CELL_SIZE + CELL_MARGIN) + CELL_SIZE / 2 + 4}">${DAYS[i][0]}</text>`;
  }

  svg += `</g>
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

      const isOutsideYear = cellDate < new Date(Date.UTC(displayYear, 0, 1)) || cellDate > new Date(Date.UTC(displayYear, 11, 31));
      const opacity = isOutsideYear ? "0" : "1";

      const filmsForDay = filmsPerDay.get(tooltipDate) || [];
      let tooltipLines = [`${tooltipDate}: ${count} film${count !== 1 ? "s" : ""} watched`];
      if (filmsForDay.length > 0) {
        filmsForDay.forEach((film) => {
          const ratingStr = film.rating ? ` - ${film.rating}★` : "";
          tooltipLines.push(`• ${film.title} (${film.year})${ratingStr}`);
        });
      }

      const lineHeight = 18;
      const padding = 10;
      const tooltipHeight = tooltipLines.length * lineHeight + padding * 2;
      const maxLineLength = Math.max(...tooltipLines.map(line => line.length));
      const tooltipWidth = Math.min(Math.max(maxLineLength * 7, 150), 300);

      svg += `
      <rect
        x="${x}"
        y="${y}"
        width="${CELL_SIZE}"
        height="${CELL_SIZE}"
        rx="2"
        ry="2"
        fill="${color}"
        opacity="${opacity}"
        data-date="${tooltipDate}"
        data-count="${count}"
      />
      <g class="tooltip" transform="translate(${x - tooltipWidth / 2 + CELL_SIZE / 2}, ${y - tooltipHeight - 10})">
        <rect x="0" y="0" width="${tooltipWidth}" height="${tooltipHeight}" rx="4" fill="${currentTheme.tooltipBg}" stroke="${currentTheme.tooltipBorder}" stroke-width="0.5" opacity="0.95"/>
        <text x="${padding}" y="${padding + 12}">`;
      tooltipLines.forEach((line, i) => {
        svg += `
          <tspan x="${padding}" dy="${i === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`;
      });
      svg += `</text>
      </g>`;
    }
  }

  svg += `</g></svg>`;
  return svg;
}

function generateEmptySvg(message, theme = 'dark') {
  const themes = {
    dark: { bg: '#0d1117', text: '#c9d1d9' },
    light: { bg: '#ffffff', text: '#24292e' }
  };
  const currentTheme = themes[theme] || themes.dark;

  return `<svg width="600" height="100" xmlns="http://www.w3.org/2000/svg">
    <rect width="600" height="100" fill="${currentTheme.bg}" rx="6" ry="6"/>
    <text x="50%" y="50%" font-family="Arial" font-size="14" fill="${currentTheme.text}" text-anchor="middle" dominant-baseline="middle">${escapeXml(message)}</text>
  </svg>`;
}

async function main() {
  try {
    const args = process.argv.slice(2);

    let username = "nichtlegacy";
    let year = new Date().getFullYear();
    let weekStart = "sunday";
    let outputBasePath = path.join("images", "github-letterboxd");

    for (let i = 0; i < args.length; i++) {
      if (args[i].startsWith('-')) {
        const flag = args[i].substring(1).toLowerCase();
        const value = args[i + 1] || "";
        
        switch (flag) {
          case 'y':
            year = Number.parseInt(value) || new Date().getFullYear();
            i++;
            break;
          case 'w':
            weekStart = ['sunday', 'monday'].includes(value) ? value : 'sunday';
            if (!['sunday', 'monday'].includes(value)) {
              console.warn(`Invalid weekStart "${value}", defaulting to "sunday"`);
            }
            i++;
            break;
          case 'o':
            outputBasePath = path.join(path.dirname(value), path.basename(value));
            i++;
            break;
          default:
            console.warn(`Unknown flag "${flag}", ignoring`);
        }
      } else if (i === 0) {
        username = args[i];
      }
    }

    const outputPathDark = `${outputBasePath}-dark.svg`;
    const outputPathLight = `${outputBasePath}-light.svg`;

    console.log(`Starting Letterboxd contribution graph generation for user: ${username}`);
    console.log(`Year: ${year}`);
    console.log(`Week starts on: ${weekStart}`);
    console.log(`Output paths: ${outputPathDark}, ${outputPathLight}`);

    const { profileImage, displayName } = await fetchProfileData(username);
    console.log(`Fetched profile data: Display Name = ${displayName}, Profile Image = ${profileImage || 'none'}`);

    const filmEntries = await tryFetchMultipleYears(username, year);
    console.log(`Found ${filmEntries.length} film entries in total`);

    const svgDark = generateSvg(filmEntries, { theme: 'dark', year, weekStart, username, profileImage, displayName });
    const svgLight = generateSvg(filmEntries, { theme: 'light', year, weekStart, username, profileImage, displayName });

    const dir = path.dirname(outputPathDark);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    fs.writeFileSync(outputPathDark, svgDark);
    fs.writeFileSync(outputPathLight, svgLight);
    console.log(`SVG contribution graphs saved to ${outputPathDark} and ${outputPathLight}`);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

main();