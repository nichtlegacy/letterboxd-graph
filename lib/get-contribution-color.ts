export function getContributionColor(count: number, maxCount: number): string {
  // GitHub-like color scheme
  const colors = [
    "#ebedf0", // 0 contributions
    "#9be9a8", // Level 1
    "#40c463", // Level 2
    "#30a14e", // Level 3
    "#216e39", // Level 4
  ]

  if (count === 0) return colors[0]

  // Calculate the level based on the count relative to maxCount
  const level = Math.ceil((count / maxCount) * 4)
  return colors[Math.min(level, 4)]
}

