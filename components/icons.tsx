export function FilmReelIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="3" />
      <circle cx="12" cy="5" r="1.5" fill="currentColor" />
      <circle cx="5" cy="12" r="1.5" fill="currentColor" />
      <circle cx="12" cy="19" r="1.5" fill="currentColor" />
      <circle cx="19" cy="12" r="1.5" fill="currentColor" />
    </svg>
  )
}

export function LetterboxdLogo({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 500 500"
      className={className}
    >
      <circle cx="125" cy="250" r="105" fill="#FF8000" />
      <circle cx="250" cy="250" r="105" fill="#00E054" />
      <circle cx="375" cy="250" r="105" fill="#40BCF4" />
      <path
        d="M187.5 170 A105 105 0 0 0 187.5 330 A105 105 0 0 1 187.5 170"
        fill="#566B27"
      />
      <path
        d="M312.5 170 A105 105 0 0 1 312.5 330 A105 105 0 0 0 312.5 170"
        fill="#00A86B"
      />
    </svg>
  )
}

export function ContributionGridIcon({ className }: { className?: string }) {
  // Deterministic pattern to avoid hydration mismatch
  const getOpacity = (row: number, col: number) => {
    const seed = (row * 7 + col * 13 + 5) % 10
    return 0.2 + seed * 0.08
  }
  
  const getColor = (row: number, col: number) => {
    const seed = (row * 7 + col * 13) % 10
    return seed > 5 ? `rgba(0, 224, 84, ${getOpacity(row, col)})` : "currentColor"
  }
  
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      className={className}
    >
      {[0, 1, 2, 3, 4, 5, 6].map((row) =>
        [0, 1, 2, 3, 4, 5, 6].map((col) => (
          <rect
            key={`${row}-${col}`}
            x={1 + col * 3.2}
            y={1 + row * 3.2}
            width="2.8"
            height="2.8"
            rx="0.5"
            fill={getColor(row, col)}
            opacity={getOpacity(row, col)}
          />
        ))
      )}
    </svg>
  )
}

export function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}
