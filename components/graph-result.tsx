"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DownloadIcon } from "./icons"
import { cn } from "@/lib/utils"

interface GraphResultProps {
  darkSvg: string
  lightSvg: string
  username: string
  year: number
  onReset: () => void
}

export function GraphResult({ darkSvg, lightSvg, username, year, onReset }: GraphResultProps) {
  const [activeTheme, setActiveTheme] = useState<"dark" | "light">("dark")
  const [downloading, setDownloading] = useState(false)

  const downloadSvg = (theme: "dark" | "light") => {
    const svg = theme === "dark" ? darkSvg : lightSvg
    const blob = new Blob([svg], { type: "image/svg+xml" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `letterboxd-${username}-${year}-${theme}.svg`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const downloadPng = async (theme: "dark" | "light") => {
    setDownloading(true)
    try {
      const svg = theme === "dark" ? darkSvg : lightSvg
      
      // Create a canvas and render SVG to it
      const canvas = document.createElement("canvas")
      const ctx = canvas.getContext("2d")
      if (!ctx) throw new Error("Could not get canvas context")
      
      // Parse SVG dimensions
      const widthMatch = svg.match(/width="(\d+)"/)
      const heightMatch = svg.match(/height="(\d+)"/)
      const width = widthMatch ? parseInt(widthMatch[1]) * 2 : 2000
      const height = heightMatch ? parseInt(heightMatch[1]) * 2 : 580
      
      canvas.width = width
      canvas.height = height
      
      // Create image from SVG
      const img = new Image()
      img.crossOrigin = "anonymous"
      
      const svgBlob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" })
      const url = URL.createObjectURL(svgBlob)
      
      await new Promise<void>((resolve, reject) => {
        img.onload = () => {
          ctx.drawImage(img, 0, 0, width, height)
          URL.revokeObjectURL(url)
          resolve()
        }
        img.onerror = () => {
          URL.revokeObjectURL(url)
          reject(new Error("Failed to load SVG"))
        }
        img.src = url
      })
      
      // Download PNG
      canvas.toBlob((blob) => {
        if (!blob) return
        const pngUrl = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = pngUrl
        a.download = `letterboxd-${username}-${year}-${theme}.png`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(pngUrl)
      }, "image/png")
    } catch (error) {
      console.error("PNG download failed:", error)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="w-full space-y-6 animate-in fade-in-0 slide-in-from-bottom-4 duration-500">
      {/* Theme Tabs */}
      <Tabs value={activeTheme} onValueChange={(v) => setActiveTheme(v as "dark" | "light")}>
        <div className="flex items-center justify-between mb-4">
          <TabsList className="bg-card">
            <TabsTrigger value="dark" className="data-[state=active]:bg-secondary">
              Dark Theme
            </TabsTrigger>
            <TabsTrigger value="light" className="data-[state=active]:bg-secondary">
              Light Theme
            </TabsTrigger>
          </TabsList>
          
          <Button
            variant="outline"
            size="sm"
            onClick={onReset}
            className="text-muted-foreground hover:text-foreground"
          >
            Generate Another
          </Button>
        </div>

        {/* Graph Preview */}
        <TabsContent value="dark" className="mt-0">
          <div 
            className={cn(
              "rounded-lg overflow-hidden border border-border",
              "bg-[#0d1117]"
            )}
          >
            <div 
              className="w-full overflow-x-auto"
              dangerouslySetInnerHTML={{ __html: darkSvg }}
            />
          </div>
        </TabsContent>

        <TabsContent value="light" className="mt-0">
          <div 
            className={cn(
              "rounded-lg overflow-hidden border border-border",
              "bg-white"
            )}
          >
            <div 
              className="w-full overflow-x-auto"
              dangerouslySetInnerHTML={{ __html: lightSvg }}
            />
          </div>
        </TabsContent>
      </Tabs>

      {/* Download Buttons */}
      <div className="flex flex-wrap gap-3">
        <Button
          variant="outline"
          onClick={() => downloadSvg(activeTheme)}
          className="flex-1 min-w-[140px]"
        >
          <DownloadIcon className="w-4 h-4 mr-2" />
          Download SVG
        </Button>
        <Button
          variant="outline"
          onClick={() => downloadPng(activeTheme)}
          disabled={downloading}
          className="flex-1 min-w-[140px]"
        >
          <DownloadIcon className="w-4 h-4 mr-2" />
          {downloading ? "Converting..." : "Download PNG"}
        </Button>
      </div>

      {/* Usage Instructions */}
      <div className="p-4 rounded-lg bg-card border border-border">
        <h3 className="font-semibold text-sm mb-2">How to use in your GitHub README</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Download the SVG and add it to your repository, then reference it in your README:
        </p>
        <code className="block p-3 rounded bg-secondary text-xs font-mono overflow-x-auto">
          {`![Letterboxd ${year}](./images/letterboxd-${username}-${year}-${activeTheme}.svg)`}
        </code>
      </div>
    </div>
  )
}
