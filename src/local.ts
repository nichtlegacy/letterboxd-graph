import * as fs from "fs"
import { fetchLetterboxdData } from "./fetch-data"
import { generateSvg } from "./generate-svg"

async function main() {
  const username = process.argv[2] || "nichtlegacy"
  const year = Number.parseInt(process.argv[3] || new Date().getFullYear().toString())
  const outputPath = process.argv[4] || "letterboxd-graph.svg"

  console.log(`Fetching Letterboxd data for user: ${username} for year: ${year}`)

  try {
    const filmEntries = await fetchLetterboxdData(username, year)
    console.log(`Found ${filmEntries.length} film entries`)

    const svg = generateSvg(filmEntries)
    fs.writeFileSync(outputPath, svg)

    console.log(`SVG contribution graph saved to ${outputPath}`)
  } catch (error) {
    console.error("Error:", error)
  }
}

main()

