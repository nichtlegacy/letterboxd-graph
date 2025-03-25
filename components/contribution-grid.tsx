"use client"

import { useState } from "react"
import { getContributionColor } from "@/lib/get-contribution-color"

interface ContributionGridProps {
  grid: number[][]
  maxCount: number
  startDate: Date
}

export function ContributionGrid({ grid, maxCount, startDate }: ContributionGridProps) {
  const [hoveredCell, setHoveredCell] = useState<{ row: number; col: number } | null>(null)

  const CELL_SIZE = 11
  const CELL_MARGIN = 2
  const GRID_WIDTH = grid[0].length * (CELL_SIZE + CELL_MARGIN)
  const GRID_HEIGHT = grid.length * (CELL_SIZE + CELL_MARGIN)

  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  const DAYS = ["", "Mon", "", "Wed", "", "Fri", ""]

  const getCellDate = (row: number, col: number): Date => {
    const date = new Date(startDate)
    date.setDate(date.getDate() + col * 7 + row)
    return date
  }

  const formatTooltipDate = (date: Date): string => {
    return date.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    })
  }

  return (
    <div className="relative">
      <svg width={GRID_WIDTH + 40} height={GRID_HEIGHT + 30}>
        {/* Month labels */}
        <g transform="translate(40, 0)">
          {grid[0].map((_, colIndex) => {
            const date = getCellDate(0, colIndex)
            const firstDayOfMonth = new Date(date.getFullYear(), date.getMonth(), 1)
            const showMonth = colIndex === 0 || date.getDate() <= 7

            if (showMonth) {
              return (
                <text
                  key={`month-${colIndex}`}
                  x={(CELL_SIZE + CELL_MARGIN) * colIndex}
                  y="10"
                  fontSize="10"
                  textAnchor="start"
                  fill="#767676"
                >
                  {MONTHS[date.getMonth()]}
                </text>
              )
            }
            return null
          })}
        </g>

        {/* Day of week labels */}
        <g>
          {DAYS.map((day, index) => (
            <text
              key={`day-${index}`}
              x="20"
              y={(CELL_SIZE + CELL_MARGIN) * index + CELL_SIZE / 2 + 4}
              fontSize="10"
              textAnchor="end"
              fill="#767676"
            >
              {day}
            </text>
          ))}
        </g>

        {/* Contribution cells */}
        <g transform="translate(40, 15)">
          {grid.map((row, rowIndex) =>
            row.map((count, colIndex) => {
              const cellDate = getCellDate(rowIndex, colIndex)
              const color = getContributionColor(count, maxCount)

              return (
                <rect
                  key={`cell-${rowIndex}-${colIndex}`}
                  x={(CELL_SIZE + CELL_MARGIN) * colIndex}
                  y={(CELL_SIZE + CELL_MARGIN) * rowIndex}
                  width={CELL_SIZE}
                  height={CELL_SIZE}
                  rx={2}
                  ry={2}
                  fill={color}
                  onMouseEnter={() => setHoveredCell({ row: rowIndex, col: colIndex })}
                  onMouseLeave={() => setHoveredCell(null)}
                  className="cursor-pointer"
                />
              )
            }),
          )}
        </g>
      </svg>

      {/* Tooltip */}
      {hoveredCell && (
        <div
          className="absolute bg-black text-white text-xs rounded py-1 px-2 z-10 pointer-events-none"
          style={{
            left: (CELL_SIZE + CELL_MARGIN) * hoveredCell.col + 40,
            top: (CELL_SIZE + CELL_MARGIN) * hoveredCell.row + 15 - 30,
          }}
        >
          <div>{formatTooltipDate(getCellDate(hoveredCell.row, hoveredCell.col))}</div>
          <div>
            {grid[hoveredCell.row][hoveredCell.col]} film{grid[hoveredCell.row][hoveredCell.col] !== 1 ? "s" : ""}{" "}
            watched
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center justify-end mt-2 text-xs text-gray-600">
        <span className="mr-2">Less</span>
        {[0, 1, 2, 3, 4].map((level) => (
          <div
            key={`legend-${level}`}
            className="w-3 h-3 mr-1 rounded-sm"
            style={{ backgroundColor: getContributionColor(level, 4) }}
          />
        ))}
        <span className="ml-1">More</span>
      </div>
    </div>
  )
}

