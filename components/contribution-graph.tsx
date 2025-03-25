"use client"

import { useState } from "react"
import { parseLetterboxdData } from "@/lib/parse-letterboxd-data"
import { generateContributionGrid } from "@/lib/generate-contribution-grid"
import { FileUploader } from "./file-uploader"
import { ContributionGrid } from "./contribution-grid"

export function ContributionGraph() {
  const [contributionData, setContributionData] = useState<{
    grid: number[][]
    maxCount: number
    totalFilms: number
    startDate: Date
    endDate: Date
  } | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleFileUpload = async (file: File) => {
    try {
      setIsLoading(true)
      setError(null)

      const fileContent = await file.text()
      const parsedData = parseLetterboxdData(fileContent)
      const gridData = generateContributionGrid(parsedData)

      setContributionData(gridData)
    } catch (err) {
      setError("Failed to process the Letterboxd data. Please make sure you've uploaded a valid CSV export.")
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {!contributionData && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Upload your Letterboxd data</h2>
          <p className="text-gray-600">
            Export your Letterboxd diary as CSV and upload it here to generate your contribution graph.
          </p>
          <FileUploader onFileUpload={handleFileUpload} isLoading={isLoading} />
          {error && <p className="text-red-500">{error}</p>}
        </div>
      )}

      {contributionData && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Your Film Watching Activity</h2>
            <button onClick={() => setContributionData(null)} className="text-sm text-gray-500 hover:text-gray-700">
              Upload different data
            </button>
          </div>

          <div className="text-sm text-gray-600">
            <p>
              Total films watched: <span className="font-medium">{contributionData.totalFilms}</span>
            </p>
            <p>
              Period:{" "}
              <span className="font-medium">
                {contributionData.startDate.toLocaleDateString()} - {contributionData.endDate.toLocaleDateString()}
              </span>
            </p>
          </div>

          <ContributionGrid
            grid={contributionData.grid}
            maxCount={contributionData.maxCount}
            startDate={contributionData.startDate}
          />
        </div>
      )}
    </div>
  )
}

