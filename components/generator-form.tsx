"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"

interface GeneratorFormProps {
  onSubmit: (data: GeneratorOptions) => void
  isLoading: boolean
}

export interface GeneratorOptions {
  username: string
  year: number
  weekStart: "sunday" | "monday"
  mode: "count" | "rating"
  usernameGradient: boolean
}

const currentYear = new Date().getFullYear()
const years = Array.from({ length: 10 }, (_, i) => currentYear - i)

export function GeneratorForm({ onSubmit, isLoading }: GeneratorFormProps) {
  const [username, setUsername] = useState("")
  const [year, setYear] = useState(currentYear)
  const [weekStart, setWeekStart] = useState<"sunday" | "monday">("sunday")
  const [mode, setMode] = useState<"count" | "rating">("count")
  const [usernameGradient, setUsernameGradient] = useState(true)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!username.trim()) return
    
    onSubmit({
      username: username.trim(),
      year,
      weekStart,
      mode,
      usernameGradient
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Username Input */}
      <div className="space-y-2">
        <Label htmlFor="username" className="text-sm font-medium">
          Letterboxd Username
        </Label>
        <div className="gradient-border">
          <Input
            id="username"
            type="text"
            placeholder="Enter your Letterboxd username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="bg-card border-0 h-12 text-base placeholder:text-muted-foreground"
            disabled={isLoading}
          />
        </div>
      </div>

      {/* Year and Week Start */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="year" className="text-sm font-medium">
            Year
          </Label>
          <Select
            value={year.toString()}
            onValueChange={(v) => setYear(parseInt(v))}
            disabled={isLoading}
          >
            <SelectTrigger id="year" className="h-11 bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={y.toString()}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="weekStart" className="text-sm font-medium">
            Week Starts On
          </Label>
          <Select
            value={weekStart}
            onValueChange={(v) => setWeekStart(v as "sunday" | "monday")}
            disabled={isLoading}
          >
            <SelectTrigger id="weekStart" className="h-11 bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sunday">Sunday</SelectItem>
              <SelectItem value="monday">Monday</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Mode Selection */}
      <div className="space-y-2">
        <Label htmlFor="mode" className="text-sm font-medium">
          Graph Mode
        </Label>
        <Select
          value={mode}
          onValueChange={(v) => setMode(v as "count" | "rating")}
          disabled={isLoading}
        >
          <SelectTrigger id="mode" className="h-11 bg-card">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="count">
              <div className="flex flex-col">
                <span>Count Mode</span>
                <span className="text-xs text-muted-foreground">Color based on number of films</span>
              </div>
            </SelectItem>
            <SelectItem value="rating">
              <div className="flex flex-col">
                <span>Rating Mode</span>
                <span className="text-xs text-muted-foreground">Color based on average rating</span>
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Username Gradient Toggle */}
      <div className="flex items-center justify-between p-4 rounded-lg bg-card">
        <div className="space-y-0.5">
          <Label htmlFor="gradient" className="text-sm font-medium cursor-pointer">
            Letterboxd Gradient Name
          </Label>
          <p className="text-xs text-muted-foreground">
            Display name with signature orange-green-blue gradient
          </p>
        </div>
        <Switch
          id="gradient"
          checked={usernameGradient}
          onCheckedChange={setUsernameGradient}
          disabled={isLoading}
        />
      </div>

      {/* Submit Button */}
      <Button
        type="submit"
        size="lg"
        className="w-full h-12 text-base font-semibold bg-primary hover:bg-primary/90"
        disabled={!username.trim() || isLoading}
      >
        {isLoading ? (
          <span className="flex items-center gap-2">
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Generating Graph...
          </span>
        ) : (
          "Generate Graph"
        )}
      </Button>
    </form>
  )
}
