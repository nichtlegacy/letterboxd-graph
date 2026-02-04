/**
 * SVG Graph Generator for Web
 * Simplified version without file system dependencies
 */

import type { DiaryEntry, ProfileData } from "./web-fetcher"

interface GeneratorOptions {
  theme: "dark" | "light"
  year: number
  weekStart: "sunday" | "monday"
  username: string
  profileImage: string | null
  displayName: string
  logoBase64: string | null
  usernameGradient: boolean
  followers: number
  following: number
  totalEntries: number
  memberStatus: "patron" | "pro" | null
  mode: "count" | "rating"
}

/**
 * Escape XML special characters
 */
function escapeXml(unsafe: string | undefined | null): string {
  if (unsafe === undefined || unsafe === null) return ""
  return String(unsafe).replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case "<": return "&lt;"
      case ">": return "&gt;"
      case "&": return "&amp;"
      case "'": return "&apos;"
      case '"': return "&quot;"
      default: return c
    }
  })
}

/**
 * Calculate text width (rough estimation)
 */
function calculateTextWidth(text: string, fontSize: number): number {
  if (!text) return 0
  return text.length * fontSize * 0.55
}

/**
 * Calculate streak
 */
function calculateStreak(entries: DiaryEntry[]): { length: number; startDate: string | null; endDate: string | null } {
  if (!entries || entries.length === 0) {
    return { length: 0, startDate: null, endDate: null }
  }

  const uniqueDates = [...new Set(
    entries.map(e => e.date.toISOString().split("T")[0])
  )].sort()

  if (uniqueDates.length === 0) {
    return { length: 0, startDate: null, endDate: null }
  }

  let maxStreak = 1
  let currentStreak = 1
  let maxStart = uniqueDates[0]
  let maxEnd = uniqueDates[0]
  let currentStart = uniqueDates[0]

  for (let i = 1; i < uniqueDates.length; i++) {
    const prevDate = new Date(uniqueDates[i - 1])
    const currDate = new Date(uniqueDates[i])
    const diffDays = Math.round((currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24))

    if (diffDays === 1) {
      currentStreak++
      if (currentStreak > maxStreak) {
        maxStreak = currentStreak
        maxStart = currentStart
        maxEnd = uniqueDates[i]
      }
    } else {
      currentStreak = 1
      currentStart = uniqueDates[i]
    }
  }

  return { length: maxStreak, startDate: maxStart, endDate: maxEnd }
}

/**
 * Calculate days active
 */
function calculateDaysActive(entries: DiaryEntry[]): number {
  if (!entries || entries.length === 0) return 0
  return new Set(entries.map(e => e.date.toISOString().split("T")[0])).size
}

/**
 * Group entries by date
 */
function groupEntriesByDate(entries: DiaryEntry[]): Map<string, DiaryEntry[]> {
  const grouped = new Map<string, DiaryEntry[]>()
  for (const entry of entries) {
    const dateKey = entry.date.toISOString().split("T")[0]
    if (!grouped.has(dateKey)) {
      grouped.set(dateKey, [])
    }
    grouped.get(dateKey)!.push(entry)
  }
  return grouped
}

/**
 * Generate the SVG contribution graph
 */
export function generateSvg(entries: DiaryEntry[], options: GeneratorOptions): string {
  const { 
    theme, 
    year,
    weekStart,
    profileImage,
    displayName,
    username,
    usernameGradient,
    logoBase64,
    followers,
    following,
    totalEntries,
    memberStatus,
    mode
  } = options

  const nameWidth = calculateTextWidth(displayName, 28)

  // Filter entries for the requested year
  const sortedEntries = [...entries].filter(entry => {
    return entry.date.getFullYear() === year
  }).sort((a, b) => a.date.getTime() - b.date.getTime())

  // Calculate stats
  const streak = calculateStreak(sortedEntries)
  const daysActive = calculateDaysActive(sortedEntries)
  const totalFilms = sortedEntries.length
  const filmsPerDay = groupEntriesByDate(sortedEntries)
  
  // Calculate weekly distribution
  const weeklyDistribution = [0, 0, 0, 0, 0, 0, 0]
  sortedEntries.forEach(entry => {
    const dayOfWeek = entry.date.getUTCDay()
    weeklyDistribution[dayOfWeek]++
  })
  const maxWeeklyCount = Math.max(...weeklyDistribution)

  // Calculate rating distribution
  const ratingDistribution: Record<string, number> = {}
  const ratingLabels = ["0.5", "1", "1.5", "2", "2.5", "3", "3.5", "4", "4.5", "5"]
  ratingLabels.forEach(r => ratingDistribution[r] = 0)
  ratingDistribution["unrated"] = 0
  
  sortedEntries.forEach(entry => {
    if (entry.rating && entry.rating > 0) {
      const ratingKey = String(entry.rating)
      if (ratingDistribution.hasOwnProperty(ratingKey)) {
        ratingDistribution[ratingKey]++
      }
    } else {
      ratingDistribution["unrated"]++
    }
  })
  const maxRatingCount = Math.max(...ratingLabels.map(r => ratingDistribution[r]))

  // Setup date range
  const displayYear = year
  const startDate = new Date(Date.UTC(displayYear, 0, 1))
  const endDate = new Date(Date.UTC(displayYear, 11, 31))
  
  const startDay = startDate.getUTCDay()
  const dayShift = weekStart === "monday" ? (startDay + 6) % 7 : startDay
  if (dayShift > 0) {
    startDate.setUTCDate(startDate.getUTCDate() - dayShift)
  }

  const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1
  const totalWeeks = Math.ceil(totalDays / 7)

  // Build activity grid
  const grid: number[][] = Array(7).fill(0).map(() => Array(totalWeeks).fill(0))
  let maxCount = 0

  sortedEntries.forEach((entry) => {
    const daysSinceStart = Math.floor((entry.date.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
    const weekIndex = Math.floor(daysSinceStart / 7)
    const dayIndex = weekStart === "monday" ? (entry.date.getUTCDay() + 6) % 7 : entry.date.getUTCDay()

    if (weekIndex >= 0 && weekIndex < totalWeeks) {
      grid[dayIndex][weekIndex]++
      maxCount = Math.max(maxCount, grid[dayIndex][weekIndex])
    }
  })

  // Dimensions
  const CELL_SIZE = 14
  const CELL_GAP = 3
  const GRID_WIDTH = totalWeeks * (CELL_SIZE + CELL_GAP)
  const SVG_WIDTH = Math.max(1000, GRID_WIDTH + 100)
  const SVG_HEIGHT = 290
  const GRID_OFFSET_X = 51
  const GRID_OFFSET_Y = 165

  const DAYS_SUNDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
  const DAYS_MONDAY = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
  const DAYS = weekStart === "monday" ? DAYS_MONDAY : DAYS_SUNDAY
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

  const themes = {
    dark: {
      bg: "#0d1117",
      cardBorder: "#21262d",
      text: "#e6edf3",
      textMuted: "#7d8590",
      tooltipBg: "#161b22",
      tooltipBorder: "#30363d",
      tooltipText: "#f0f6fc",
      colors: ["#161b22", "#0e4429", "#006d32", "#26a641", "#39d353"]
    },
    light: {
      bg: "#ffffff",
      cardBorder: "#d1d9e0",
      text: "#1f2328",
      textMuted: "#656d76",
      tooltipBg: "#ffffff",
      tooltipBorder: "#d1d9e0",
      tooltipText: "#1f2328",
      colors: ["#ebedf0", "#9be9a8", "#40c463", "#30a14e", "#216e39"]
    }
  }

  const t = themes[theme]

  function getColor(count: number): string {
    if (count === 0) return t.colors[0]
    if (maxCount === 0) return t.colors[0]
    const level = Math.ceil((count / maxCount) * 4)
    return t.colors[Math.min(level, 4)]
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
      <stop offset="0%" stop-color="#FF8000"/>
      <stop offset="50%" stop-color="#00E054"/>
      <stop offset="100%" stop-color="#40BCF4"/>
    </linearGradient>
    <style type="text/css">
      <![CDATA[
      .tooltip-group { opacity: 0; transition: opacity 0.2s ease; pointer-events: none; }
      .cell-group:hover .tooltip-group { opacity: 1; }
      .cell-group:hover .cell { filter: brightness(1.3); }
      .cell { transition: filter 0.2s ease; }
      ]]>
    </style>
  </defs>
  
  <rect width="100%" height="100%" rx="12" fill="${t.bg}" stroke="${t.cardBorder}" stroke-width="1" filter="url(#shadow)"/>

  <g transform="translate(25, 20)">
    <a href="https://letterboxd.com/${username}/" target="_blank">
      <circle cx="40" cy="40" r="42" fill="${t.cardBorder}"/>
      ${profileImage ? `<image href="${profileImage}" x="0" y="0" width="80" height="80" clip-path="url(#profileClip)" style="cursor: pointer;"/>` : `<circle cx="40" cy="40" r="40" fill="${t.colors[2]}"/>`}
    </a>
    
    ${memberStatus ? `
    <g transform="translate(-5, 58)">
      <rect x="0" y="0" width="${memberStatus === "patron" ? 48 : 32}" height="18" rx="3" fill="${memberStatus === "patron" ? "#40bcf4" : "#ff8000"}"/>
      <text x="${memberStatus === "patron" ? 24 : 16}" y="13" font-family="'Segoe UI', Inter, Arial, sans-serif" font-size="10" font-weight="700" fill="#ffffff" text-anchor="middle">${memberStatus === "patron" ? "PATRON" : "PRO"}</text>
    </g>` : ""}

    <a href="https://letterboxd.com/${username}/" target="_blank">
      <text x="100" y="35" font-family="'Segoe UI', Inter, Arial, sans-serif" font-size="28" font-weight="600" fill="${usernameGradient ? "url(#usernameGradient)" : t.text}" style="cursor: pointer;">${escapeXml(displayName)}</text>
    </a>

    <text x="100" y="60" font-family="'Segoe UI', Inter, Arial, sans-serif" font-size="14" font-weight="500">
      <a href="https://letterboxd.com/${username}/" target="_blank" style="cursor: pointer;">
        <tspan fill="${t.textMuted}">@${escapeXml(username)}</tspan>
      </a>
      <tspan dx="5" fill="${t.textMuted}">•</tspan>
      <tspan dx="5" fill="${t.text}">${totalEntries}</tspan>
      <tspan fill="${t.textMuted}"> Films</tspan>
      <tspan dx="5" fill="${t.textMuted}">•</tspan>
      <tspan dx="5" fill="${t.text}">${followers}</tspan>
      <tspan fill="${t.textMuted}"> Followers</tspan>
    </text>

    ${logoBase64 ? `<a href="https://letterboxd.com/" target="_blank">
      <g transform="translate(${SVG_WIDTH - 117}, 0)">
        <image href="${logoBase64}" x="0" y="4" width="72" height="72" style="cursor: pointer;"/>
      </g>
    </a>` : ""}
  </g>

  <g transform="translate(25, 115)" font-family="'Segoe UI', Inter, Arial, sans-serif">
    <text x="0" y="20" font-size="16" font-weight="600" fill="${t.text}">${displayYear}</text>
    <g transform="translate(60, 5)">
      <text x="0" y="15" font-size="14" font-weight="500" fill="${t.textMuted}">${totalFilms} Movies</text>
    </g>
    <g transform="translate(170, 5)">
      <text x="0" y="15" font-size="14" font-weight="500" fill="${t.textMuted}">${daysActive} Days Active</text>
    </g>
    <g transform="translate(310, 5)">
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"
            stroke="${streak.length > 0 ? "#f97316" : t.textMuted}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="${streak.length > 0 ? "#f97316" : "none"}" fill-opacity="0.2" transform="scale(0.75)"/>
      <text x="18" y="13" font-size="14" font-weight="500" fill="${t.textMuted}">${streak.length} Day Streak</text>
    </g>

    <g transform="translate(${SVG_WIDTH - 200}, 0)">
      <text x="0" y="20" font-size="12" fill="${t.textMuted}">${mode === "rating" ? "Low" : "Less"}</text>`

  for (let i = 0; i < 5; i++) {
    svg += `
      <rect x="${35 + i * 18}" y="7" width="13" height="13" rx="2" fill="${t.colors[i]}"/>`
  }

  svg += `
      <text x="${35 + 5 * 18 + 5}" y="20" font-size="12" fill="${t.textMuted}">${mode === "rating" ? "High" : "More"}</text>
    </g>
  </g>

  <g transform="translate(${GRID_OFFSET_X}, ${GRID_OFFSET_Y - 8})" font-family="'Segoe UI', Inter, Arial, sans-serif">`

  for (let i = 0; i < 12; i++) {
    const firstDayOfMonth = new Date(Date.UTC(displayYear, i, 1))
    const daysSinceStart = Math.floor((firstDayOfMonth.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
    if (daysSinceStart < 0) continue
    const weekIndex = Math.floor(daysSinceStart / 7)
    const x = weekIndex * (CELL_SIZE + CELL_GAP)
    svg += `<text x="${x}" y="0" font-size="11" fill="${t.textMuted}" font-weight="500">${MONTHS[i]}</text>`
  }

  svg += `
  </g>

  <g transform="translate(26, ${GRID_OFFSET_Y})" font-family="'Segoe UI', Inter, Arial, sans-serif">`

  for (let d = 0; d < 7; d++) {
    svg += `
    <text x="0" y="${d * (CELL_SIZE + CELL_GAP) + 11}" font-size="10" fill="${t.textMuted}" text-anchor="end">${DAYS[d].charAt(0)}</text>`
  }

  svg += `
  </g>

  <g transform="translate(${GRID_OFFSET_X}, ${GRID_OFFSET_Y})">`

  // Generate cells
  for (let week = 0; week < totalWeeks; week++) {
    for (let day = 0; day < 7; day++) {
      const count = grid[day][week]
      const color = getColor(count)
      const x = week * (CELL_SIZE + CELL_GAP)
      const y = day * (CELL_SIZE + CELL_GAP)
      
      const cellDate = new Date(startDate.getTime() + (week * 7 + day) * 24 * 60 * 60 * 1000)
      
      if (cellDate <= endDate) {
        svg += `
    <g class="cell-group">
      <rect class="cell" x="${x}" y="${y}" width="${CELL_SIZE}" height="${CELL_SIZE}" rx="2" fill="${color}"/>
    </g>`
      }
    }
  }

  svg += `
  </g>
</svg>`

  return svg
}

/**
 * Generate both dark and light SVGs
 */
export function generateGraphs(
  entries: DiaryEntry[],
  profileData: ProfileData,
  options: {
    year: number
    weekStart: "sunday" | "monday"
    username: string
    usernameGradient: boolean
    mode: "count" | "rating"
    logoBase64: string | null
  }
): { darkSvg: string; lightSvg: string } {
  const baseOptions = {
    year: options.year,
    weekStart: options.weekStart,
    username: options.username,
    profileImage: profileData.profileImage,
    displayName: profileData.displayName,
    logoBase64: options.logoBase64,
    usernameGradient: options.usernameGradient,
    followers: profileData.followers,
    following: profileData.following,
    totalEntries: profileData.totalEntries,
    memberStatus: profileData.memberStatus,
    mode: options.mode
  }

  const darkSvg = generateSvg(entries, { ...baseOptions, theme: "dark" })
  const lightSvg = generateSvg(entries, { ...baseOptions, theme: "light" })

  return { darkSvg, lightSvg }
}
