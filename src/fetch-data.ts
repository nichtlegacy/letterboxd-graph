import fetch from "node-fetch"
import * as cheerio from "cheerio"

export interface FilmEntry {
  date: Date
  title: string
  year?: string
  rating?: number
  url?: string
}

export async function fetchLetterboxdData(username: string, year: number): Promise<FilmEntry[]> {
  const entries: FilmEntry[] = []
  let page = 1
  let hasMorePages = true

  while (hasMorePages) {
    console.log(`Fetching page ${page} of diary entries...`)

    // Letterboxd diary URL structure
    const url = `https://letterboxd.com/${username}/films/diary/for/${year}/page/${page}/`

    try {
      const response = await fetch(url)

      if (!response.ok) {
        if (response.status === 404) {
          console.log(`Page ${page} not found, finished fetching`)
          hasMorePages = false
          break
        }
        throw new Error(`Failed to fetch data: ${response.statusText}`)
      }

      const html = await response.text()
      const $ = cheerio.load(html)

      // Check if we found any entries on this page
      const entryElements = $(".diary-entry-row")

      if (entryElements.length === 0) {
        hasMorePages = false
        break
      }

      // Parse each diary entry
      entryElements.each((_, element) => {
        try {
          const dateStr = $(element).find(".diary-date").text().trim()
          const title = $(element).find(".film-title").text().trim()
          const year = $(element).find(".film-year").text().trim().replace(/[()]/g, "")
          const url = $(element).find(".film-title").attr("href")

          // Extract rating (0-5 stars)
          const ratingClass = $(element).find(".rating").attr("class") || ""
          const ratingMatch = ratingClass.match(/rated-(\d+)/)
          const rating = ratingMatch ? Number.parseInt(ratingMatch[1]) / 2 : undefined

          // Parse date (format: 2023-12-31)
          const dateParts = dateStr.split("-").map((part) => Number.parseInt(part.trim()))
          if (dateParts.length === 3) {
            const date = new Date(dateParts[0], dateParts[1] - 1, dateParts[2])

            entries.push({
              date,
              title,
              year,
              rating,
              url: url ? `https://letterboxd.com${url}` : undefined,
            })
          }
        } catch (err) {
          console.warn(`Error parsing entry: ${err}`)
        }
      })

      page++

      // Add a small delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 500))
    } catch (error) {
      console.warn(`Error fetching page ${page}: ${error}`)
      hasMorePages = false
    }
  }

  return entries
}

