"use client"

import type React from "react"

import { useState, useRef } from "react"
import { Upload } from "lucide-react"

interface FileUploaderProps {
  onFileUpload: (file: File) => void
  isLoading: boolean
}

export function FileUploader({ onFileUpload, isLoading }: FileUploaderProps) {
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = () => {
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0]
      if (file.type === "text/csv") {
        onFileUpload(file)
      }
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFileUpload(e.target.files[0])
    }
  }

  const handleButtonClick = () => {
    fileInputRef.current?.click()
  }

  return (
    <div
      className={`border-2 border-dashed rounded-lg p-8 text-center ${
        isDragging ? "border-blue-500 bg-blue-50" : "border-gray-300"
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".csv" className="hidden" />

      <div className="flex flex-col items-center justify-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
          <Upload className="w-6 h-6 text-gray-500" />
        </div>
        <div>
          <p className="text-sm text-gray-600">
            {isLoading ? "Processing..." : "Drag and drop your Letterboxd CSV file, or"}
          </p>
          {!isLoading && (
            <button
              onClick={handleButtonClick}
              className="text-blue-500 font-medium hover:text-blue-700 focus:outline-none"
              disabled={isLoading}
            >
              browse to upload
            </button>
          )}
        </div>
        <p className="text-xs text-gray-500">Only CSV files exported from Letterboxd are supported</p>
      </div>
    </div>
  )
}

