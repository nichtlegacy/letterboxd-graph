/**
 * Web Fetcher for Letterboxd Data
 * Uses fetch API with proper headers for server-side scraping
 */

import * as cheerio from "cheerio"

const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  "Cache-Control": "no-cache",
  "Pragma": "no-cache",
}

export interface DiaryEntry {
  date: Date
  film: string
  year: string
  rating: number | null
  rewatch?: boolean
  url?: string
}

export interface ProfileData {
  username?: string
  profileImage: string | null
  displayName: string
  followers: number
  following: number
  totalEntries: number
  memberStatus: "patron" | "pro" | null
}

/**
 * Fetch page HTML with retry logic
 */
async function fetchPage(url: string, retries = 3): Promise<string> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        headers: BROWSER_HEADERS,
        next: { revalidate: 0 }
      })
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      return await response.text()
    } catch (error) {
      if (attempt === retries) throw error
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt))
    }
  }
  throw new Error("Failed to fetch page")
}

/**
 * Parse diary entries from HTML
 */
function parseDiaryEntries(html: string, year: number): { entries: DiaryEntry[]; hasMore: boolean } {
  const $ = cheerio.load(html)
  const entries: DiaryEntry[] = []
  
  const diaryTable = $("#diary-table")
  if (diaryTable.length === 0) {
    return { entries: [], hasMore: false }
  }

  const entryRows = diaryTable.find("tr.diary-entry-row")
  
  entryRows.each((_, row) => {
    try {
      const $row = $(row)
      const dayElement = $row.find("td.col-daydate a")
      const dayUrl = dayElement.attr("href")
      
      if (!dayUrl) return
      
      const urlParts = dayUrl.split("/").filter((part: string) => part)
      const yearIndex = urlParts.indexOf("for") + 1
      const monthIndex = yearIndex + 1
      const dayIndex = monthIndex + 1

      if (yearIndex === 0 || !urlParts[yearIndex] || !urlParts[monthIndex] || !urlParts[dayIndex]) {
        return
      }

      const entryYear = parseInt(urlParts[yearIndex])
      const month = urlParts[monthIndex]
      const day = urlParts[dayIndex]

      const filmElement = $row.find("h2.name a")
      const film = filmElement.text().trim()
      const filmYearElement = $row.find("td.col-releaseyear span")
      const filmYear = filmYearElement.text().trim()

      if (!film) return

      let rating: number | null = null
      const ratingSpan = $row.find("td.col-rating .rating")
      if (ratingSpan.length > 0) {
        const ratingClass = ratingSpan.attr("class")
        const ratingMatch = ratingClass?.match(/rated-(\d+)/)
        if (ratingMatch?.[1]) {
          rating = Number(ratingMatch[1]) / 2
        }
      }

      const monthNames: Record<string, number> = {
        "01": 0, "02": 1, "03": 2, "04": 3, "05": 4, "06": 5,
        "07": 6, "08": 7, "09": 8, "10": 9, "11": 10, "12": 11
      }

      const monthNum = monthNames[month]
      const filmLink = filmElement.attr("href")

      if (monthNum !== undefined && day && entryYear === year) {
        const date = new Date(Date.UTC(year, monthNum, parseInt(day)))
        const filmUrl = filmLink ? `https://letterboxd.com${filmLink}` : undefined

        entries.push({
          date,
          film,
          year: filmYear,
          rating,
          rewatch: false,
          url: filmUrl
        })
      }
    } catch {
      // Skip invalid entries
    }
  })

  const nextPageLink = $(".paginate-nextprev .next")
  const hasMore = nextPageLink.length > 0 && !nextPageLink.hasClass("disabled")

  return { entries, hasMore }
}

/**
 * Fetch diary entries for a specific year
 */
export async function fetchLetterboxdData(
  username: string, 
  year: number,
  onProgress?: (message: string) => void
): Promise<DiaryEntry[]> {
  const allEntries: DiaryEntry[] = []
  let page = 1
  let hasMorePages = true

  while (hasMorePages) {
    const url = `https://letterboxd.com/${username}/diary/for/${year}/page/${page}/`
    onProgress?.(`Fetching diary page ${page}...`)

    try {
      const html = await fetchPage(url)
      const { entries, hasMore } = parseDiaryEntries(html, year)
      
      if (entries.length === 0) {
        hasMorePages = false
        break
      }
      
      allEntries.push(...entries)
      
      if (!hasMore) {
        hasMorePages = false
      } else {
        page++
        await new Promise(resolve => setTimeout(resolve, 300))
      }
    } catch {
      hasMorePages = false
    }
  }

  return allEntries
}

/**
 * Fetch profile data
 */
export async function fetchProfileData(
  username: string,
  onProgress?: (message: string) => void
): Promise<ProfileData> {
  onProgress?.("Fetching profile data...")
  
  const url = `https://letterboxd.com/${username}/`
  
  try {
    const html = await fetchPage(url)
    const $ = cheerio.load(html)

    const profileImage = $(".profile-avatar img").attr("src") || null
    const displayName = $(".person-display-name .displayname").text().trim() || username

    let followers = 0
    let following = 0
    let totalEntries = 0
    
    const followersLink = $('a[href*="/followers/"]')
    const followingLink = $('a[href*="/following/"]')
    
    if (followersLink.length > 0) {
      const title = followersLink.attr("title") || followersLink.text()
      const match = title.match(/(\d+(,\d+)*)/)
      if (match) followers = parseInt(match[1].replace(/,/g, ""))
    }
    
    if (followingLink.length > 0) {
      const title = followingLink.attr("title") || followingLink.text()
      const match = title.match(/(\d+(,\d+)*)/)
      if (match) following = parseInt(match[1].replace(/,/g, ""))
    }

    const filmsLink = $('a[href*="/films/"]')
    if (filmsLink.length > 0) {
      const valueSpan = filmsLink.find(".value")
      const text = valueSpan.length > 0 ? valueSpan.text() : filmsLink.text()
      const match = text.match(/(\d+(,\d+)*)/)
      if (match) totalEntries = parseInt(match[1].replace(/,/g, ""))
    }

    let memberStatus: "patron" | "pro" | null = null
    if ($(".badge.-patron").length > 0) memberStatus = "patron"
    else if ($(".badge.-pro").length > 0) memberStatus = "pro"

    return {
      profileImage,
      displayName,
      followers,
      following,
      totalEntries,
      memberStatus
    }
  } catch {
    return {
      profileImage: null,
      displayName: username,
      followers: 0,
      following: 0,
      totalEntries: 0,
      memberStatus: null
    }
  }
}

/**
 * Convert image URL to Base64 data URI
 */
export async function imageToBase64(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, { headers: BROWSER_HEADERS })
    if (!response.ok) throw new Error(`Failed to fetch ${url}`)
    
    const arrayBuffer = await response.arrayBuffer()
    const base64 = Buffer.from(arrayBuffer).toString("base64")
    const mimeType = response.headers.get("content-type") || "image/png"
    
    return `data:${mimeType};base64,${base64}`
  } catch {
    return null
  }
}
