"use client"

import { useState, useCallback } from "react"
import { GeneratorForm, type GeneratorOptions } from "@/components/generator-form"
import { LoadingAnimation, ScrapingStatus } from "@/components/loading-animation"
import { GraphResult } from "@/components/graph-result"
import { LetterboxdLogo } from "@/components/icons"

type GeneratorState = 
  | { status: "idle" }
  | { status: "loading"; step: number; message: string }
  | { status: "success"; darkSvg: string; lightSvg: string; username: string; year: number }
  | { status: "error"; message: string }

const SCRAPING_STEPS = [
  "Fetching profile data",
  "Loading diary entries",
  "Processing film data",
  "Generating graphs"
]

export default function Home() {
  const [state, setState] = useState<GeneratorState>({ status: "idle" })
  const [lastOptions, setLastOptions] = useState<GeneratorOptions | null>(null)

  const generateGraph = useCallback(async (options: GeneratorOptions) => {
    console.log("[v0] Starting graph generation for:", options.username, options.year)
    setState({ status: "loading", step: 0, message: "Starting..." })
    setLastOptions(options)

    try {
      const url = `/api/generate?username=${encodeURIComponent(options.username)}&year=${options.year}&weekStart=${options.weekStart}&mode=${options.mode}&gradient=${options.usernameGradient}`
      console.log("[v0] Connecting to EventSource:", url)
      
      const eventSource = new EventSource(url)

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          console.log("[v0] Received event:", data.type, data.message || "")
          
          if (data.type === "progress") {
            setState({ 
              status: "loading", 
              step: data.step, 
              message: data.message 
            })
          } else if (data.type === "complete") {
            console.log("[v0] Graph generation complete")
            setState({
              status: "success",
              darkSvg: data.darkSvg,
              lightSvg: data.lightSvg,
              username: options.username,
              year: options.year
            })
            eventSource.close()
          } else if (data.type === "error") {
            console.log("[v0] Error from server:", data.message)
            setState({
              status: "error",
              message: data.message
            })
            eventSource.close()
          }
        } catch (parseError) {
          console.error("[v0] Failed to parse event data:", parseError)
        }
      }

      eventSource.onerror = (err) => {
        console.error("[v0] EventSource error:", err)
        eventSource.close()
        setState({
          status: "error",
          message: "Connection lost. Please try again."
        })
      }
    } catch (error) {
      console.error("[v0] Failed to start generation:", error)
      setState({
        status: "error",
        message: error instanceof Error ? error.message : "An unexpected error occurred"
      })
    }
  }, [])

  const handleReset = useCallback(() => {
    setState({ status: "idle" })
  }, [])

  return (
    <main className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border">
        <div className="container max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <LetterboxdLogo className="h-8 w-8" />
            <div>
              <h1 className="text-lg font-semibold tracking-tight">
                <span className="letterboxd-gradient">Letterboxd</span>{" "}
                <span className="text-foreground">Graph Generator</span>
              </h1>
              <p className="text-xs text-muted-foreground">
                Create GitHub-style contribution graphs from your diary
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="container max-w-4xl mx-auto px-4 py-8">
        {state.status === "idle" && (
          <div className="grid gap-8 md:grid-cols-2 items-start">
            {/* Left: Form */}
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-balance">
                  Visualize your{" "}
                  <span className="letterboxd-gradient">film watching</span>{" "}
                  habits
                </h2>
                <p className="mt-2 text-muted-foreground">
                  Enter your Letterboxd username to generate a beautiful contribution graph 
                  showing your movie watching activity throughout the year.
                </p>
              </div>
              
              <GeneratorForm 
                onSubmit={generateGraph}
                isLoading={state.status === "loading"}
              />
            </div>

            {/* Right: Preview/Info */}
            <div className="hidden md:block space-y-6">
              <div className="relative aspect-[16/9] rounded-lg overflow-hidden bg-card border border-border">
                {/* Sample graph preview */}
                <div className="absolute inset-0 flex items-center justify-center p-6">
                  <div className="w-full space-y-3">
                    {/* Mini contribution grid */}
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[hsl(var(--letterboxd-orange))] to-[hsl(var(--letterboxd-green))]" />
                        <div className="space-y-1">
                          <div className="h-3 w-24 bg-muted rounded animate-pulse" />
                          <div className="h-2 w-16 bg-muted/50 rounded" />
                        </div>
                      </div>
                      <LetterboxdLogo className="h-6 w-6 opacity-50" />
                    </div>
                    
                    <div className="grid grid-cols-[repeat(52,1fr)] gap-[2px] opacity-70">
                      {Array.from({ length: 364 }).map((_, i) => {
                        // Deterministic pattern based on index to avoid hydration mismatch
                        const seed = (i * 7 + 13) % 100
                        const color = seed > 80 ? "bg-[#39d353]" :
                                     seed > 60 ? "bg-[#26a641]" :
                                     seed > 40 ? "bg-[#006d32]" :
                                     seed > 20 ? "bg-[#0e4429]" :
                                     "bg-[#161b22]"
                        return (
                          <div 
                            key={i} 
                            className={`aspect-square rounded-[2px] ${color}`}
                          />
                        )
                      })}
                    </div>
                    
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                      <span>Jan</span>
                      <span>Apr</span>
                      <span>Jul</span>
                      <span>Oct</span>
                      <span>Dec</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="font-semibold text-sm">Features</h3>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <span className="text-primary mt-0.5">&#10003;</span>
                    <span>Automatic profile data and avatar fetching</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary mt-0.5">&#10003;</span>
                    <span>Dark and light theme variants</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary mt-0.5">&#10003;</span>
                    <span>Count or rating-based color modes</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary mt-0.5">&#10003;</span>
                    <span>SVG and PNG export options</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {state.status === "loading" && (
          <div className="flex flex-col items-center justify-center min-h-[400px] gap-8">
            <LoadingAnimation 
              status={state.message} 
              progress={((state.step + 1) / SCRAPING_STEPS.length) * 100}
            />
            <ScrapingStatus 
              currentStep={state.step} 
              steps={SCRAPING_STEPS} 
            />
          </div>
        )}

        {state.status === "success" && (
          <GraphResult
            darkSvg={state.darkSvg}
            lightSvg={state.lightSvg}
            username={state.username}
            year={state.year}
            onReset={handleReset}
          />
        )}

        {state.status === "error" && (
          <div className="flex flex-col items-center justify-center min-h-[400px] gap-6">
            <div className="text-center space-y-2">
              <div className="w-16 h-16 mx-auto rounded-full bg-destructive/10 flex items-center justify-center">
                <svg className="w-8 h-8 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold">Something went wrong</h2>
              <p className="text-muted-foreground max-w-md">{state.message}</p>
            </div>
            <button
              onClick={handleReset}
              className="px-6 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
            >
              Try Again
            </button>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="border-t border-border mt-auto">
        <div className="container max-w-4xl mx-auto px-4 py-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
            <p>
              Built with Next.js. Not affiliated with Letterboxd.
            </p>
            <a 
              href="https://github.com/nichtlegacy/letterboxd-graph"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 hover:text-foreground transition-colors"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
              </svg>
              View on GitHub
            </a>
          </div>
        </div>
      </footer>
    </main>
  )
}
