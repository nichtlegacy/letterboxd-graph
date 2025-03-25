interface LetterboxdEntry {
  date: Date
  name: string
  year: string
}

export function parseLetterboxdData(csvContent: string): LetterboxdEntry[] {
  // Skip the header row
  const lines = csvContent.split("\n").slice(1)

  return lines
    .filter((line) => line.trim() !== "")
    .map((line) => {
      // CSV parsing - handle quoted fields correctly
      const fields = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || []

      // Letterboxd CSV format: Date,Name,Year,Letterboxd URI,...
      const dateStr = fields[0]?.replace(/"/g, "").trim() || ""
      const name = fields[1]?.replace(/"/g, "").trim() || ""
      const year = fields[2]?.replace(/"/g, "").trim() || ""

      // Parse date (Letterboxd format: YYYY-MM-DD)
      const date = new Date(dateStr)

      return {
        date,
        name,
        year,
      }
    })
    .filter((entry) => !isNaN(entry.date.getTime())) // Filter out invalid dates
}

