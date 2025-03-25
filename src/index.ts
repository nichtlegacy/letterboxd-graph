import * as core from "@actions/core"
import * as fs from "fs"
import * as path from "path"
import { fetchLetterboxdData } from "./fetch-data"
import { generateSvg } from "./generate-svg"

async function run(): Promise<void> {
  try {
    // Get inputs from GitHub Action
    const username = core.getInput("letterboxd-username")
    const outputPath = core.getInput("output-path") || "letterboxd-contribution-graph.svg"
    const year = core.getInput("year") || new Date().getFullYear().toString()

    core.info(`Fetching Letterboxd data for user: ${username} for year: ${year}`)

    // Fetch Letterboxd diary data
    const filmEntries = await fetchLetterboxdData(username, Number.parseInt(year))
    core.info(`Found ${filmEntries.length} film entries`)

    // Generate the SVG
    const svg = generateSvg(filmEntries)

    // Ensure directory exists
    const dir = path.dirname(outputPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    // Write the SVG to file
    fs.writeFileSync(outputPath, svg)

    core.info(`SVG contribution graph saved to ${outputPath}`)

    // Set output variables
    core.setOutput("film-count", filmEntries.length.toString())
    core.setOutput("svg-path", outputPath)
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

run()

