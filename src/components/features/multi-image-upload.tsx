'use client'

import { useRef, useCallback } from 'react'
import { Upload, X, ImageIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import Image from 'next/image'

interface MultiImageUploadProps {
  existingUrls?: string[]
  onFilesSelected: (files: File[]) => void
  onRemoveExisting: (url: string) => void
  maxCount?: number
  maxSizeMB?: number
  className?: string
  uploading?: boolean
}

export function MultiImageUpload({
  existingUrls = [],
  onFilesSelected,
  onRemoveExisting,
  maxCount = 10,
  maxSizeMB = 10,
  className,
  uploading = false,
}: MultiImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const fileList = e.target.files
      if (!fileList) return
      const files = Array.from(fileList).filter((f) => {
        if (!f.type.startsWith('image/')) return false
        if (f.size > maxSizeMB * 1024 * 1024) return false
        return true
      })
      onFilesSelected(files)
      e.target.value = ''
    },
    [maxSizeMB, onFilesSelected]
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      const files = Array.from(e.dataTransfer.files).filter(
        (f) => f.type.startsWith('image/') && f.size <= maxSizeMB * 1024 * 1024
      )
      onFilesSelected(files)
    },
    [maxSizeMB, onFilesSelected]
  )

  const remaining = maxCount - existingUrls.length

  return (
    <div className={cn('space-y-4', className)}>
      {/* Existing uploaded images */}
      {existingUrls.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {existingUrls.map((url) => (
            <div key={url} className="relative group aspect-square rounded-lg overflow-hidden border bg-muted">
              <Image src={url} alt="Branch image" fill className="object-cover" />
              <button
                type="button"
                onClick={() => onRemoveExisting(url)}
                className="absolute top-1.5 right-1.5 h-7 w-7 flex items-center justify-center rounded-full bg-destructive text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity shadow-md"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Upload area */}
      {remaining > 0 && (
        <div
          className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border hover:border-primary/50 hover:bg-accent/30 transition-colors cursor-pointer min-h-[120px] p-6"
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-3">
            {uploading ? (
              <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            ) : (
              <Upload className="h-5 w-5 text-muted-foreground" />
            )}
          </div>
          <p className="text-sm font-medium text-center">
            {uploading ? 'Uploading…' : 'Upload Images'}
          </p>
          <p className="text-xs text-muted-foreground text-center mt-1">
            Drag & drop or click · JPEG, PNG, WebP · Max {maxSizeMB}MB each
          </p>
          <p className="text-xs text-muted-foreground text-center">
            {existingUrls.length} uploaded · {remaining} remaining
          </p>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            onChange={handleChange}
            className="hidden"
          />
        </div>
      )}

      {remaining === 0 && (
        <p className="text-xs text-muted-foreground text-center py-2">
          Maximum of {maxCount} images reached. Remove an image to upload a new one.
        </p>
      )}
    </div>
  )
}
