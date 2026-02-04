"use client"

import { cn } from "@/lib/utils"
import { FilmReelIcon } from "./icons"

interface LoadingAnimationProps {
  status: string
  progress?: number
  className?: string
}

export function LoadingAnimation({ status, progress, className }: LoadingAnimationProps) {
  return (
    <div className={cn("flex flex-col items-center gap-6", className)}>
      {/* Animated Film Reel */}
      <div className="relative">
        <FilmReelIcon className="h-20 w-20 text-primary animate-spin-slow" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="h-4 w-4 rounded-full bg-primary animate-pulse" />
        </div>
      </div>
      
      {/* Status Text */}
      <div className="text-center space-y-2">
        <p className="text-lg font-medium text-foreground">{status}</p>
        {progress !== undefined && (
          <div className="w-64 h-2 bg-secondary rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-[hsl(var(--letterboxd-orange))] via-[hsl(var(--letterboxd-green))] to-[hsl(var(--letterboxd-blue))] transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </div>
      
      {/* Animated Contribution Grid Preview */}
      <div className="grid grid-cols-7 gap-1 opacity-50">
        {Array.from({ length: 35 }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "w-3 h-3 rounded-sm",
              i % 7 === 0 ? "bg-[hsl(var(--letterboxd-orange))]" :
              i % 5 === 0 ? "bg-[hsl(var(--letterboxd-green))]" :
              i % 3 === 0 ? "bg-[hsl(var(--letterboxd-blue))]" :
              "bg-muted"
            )}
            style={{
              animation: `pulse-letterboxd ${1 + (i % 5) * 0.2}s ease-in-out infinite`,
              animationDelay: `${i * 0.05}s`
            }}
          />
        ))}
      </div>
    </div>
  )
}

export function ScrapingStatus({ 
  currentStep, 
  steps 
}: { 
  currentStep: number
  steps: string[] 
}) {
  return (
    <div className="space-y-3 w-full max-w-md">
      {steps.map((step, index) => (
        <div 
          key={step}
          className={cn(
            "flex items-center gap-3 text-sm transition-all duration-300",
            index < currentStep ? "text-primary" :
            index === currentStep ? "text-foreground" :
            "text-muted-foreground"
          )}
        >
          <div className={cn(
            "w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium border transition-all",
            index < currentStep ? "bg-primary border-primary text-primary-foreground" :
            index === currentStep ? "border-primary text-primary animate-pulse" :
            "border-muted-foreground"
          )}>
            {index < currentStep ? (
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              index + 1
            )}
          </div>
          <span className={index === currentStep ? "font-medium" : ""}>
            {step}
            {index === currentStep && <span className="scraping-dots" />}
          </span>
        </div>
      ))}
    </div>
  )
}
