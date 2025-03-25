import * as core from "@actions/core"
import * as fs from "fs"
import * as path from "path"
import { fetchLetterboxdData } from "./fetch-data"
import { generateSvg } from "./generate-svg"

async function run(): Promise<void> {
  try {
    // Get inputs from GitHub Action environment variables
    const username = process.env.INPUT_LETTERBOXD_USERNAME || core.getInput("letterboxd-username")
    const outputPath =
      process.env.INPUT_OUTPUT_PATH || core.getInput("output-path") || "letterboxd-contribution-graph.svg"
    const year = process.env.INPUT_YEAR || core.getInput("year") || new Date().getFullYear().toString()

    console.log(`Fetching Letterboxd data for user: ${username} for year: ${year}`)

    // Fetch Letterboxd diary data
    const filmEntries = await fetchLetterboxdData(username, Number.parseInt(year))
    console.log(`Found ${filmEntries.length} film entries`)

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

    // Set output variables
    core.setOutput("film-count", filmEntries.length.toString())
    core.setOutput("svg-path", outputPath)
  } catch (error) {
    if (error instanceof Error) {
      console.error(error.message)
      core.setFailed(error.message)
    }
  }
}

run()

