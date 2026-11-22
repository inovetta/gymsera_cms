'use client'

import { useRef, useState } from 'react'
import { ImagePlus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { hostApi } from '@/lib/api/host'
import { resolveApiError } from '@/lib/api/error-copy'
import { MIN_BRANCH_PHOTOS } from '@/lib/branches/rules'

interface Props {
  idPrefix: string
  value: string[]
  onChange: (urls: string[]) => void
}

/**
 * Branch photos (enterprise D8: at least 3). Each file is stored first through
 * POST /host/businesses/staging-images, which writes to no business; the URLs go with the
 * create call. "added" only once the upload answered (copy fix §3.5).
 */
export function BranchPhotosField({ idPrefix, value, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const add = async (files: File[]) => {
    const images = files.filter((f) => f.type.startsWith('image/'))
    if (images.length === 0) return
    setUploading(true)
    setError(null)
    try {
      const urls = await hostApi.uploadStagingImages(images)
      onChange([...value, ...urls])
    } catch (err) {
      setError(resolveApiError(err).message)
    } finally {
      setUploading(false)
    }
  }

  const short = value.length < MIN_BRANCH_PHOTOS
  return (
    <div className="space-y-2">
      <Label htmlFor={`${idPrefix}-photos`}>Photos * (at least {MIN_BRANCH_PHOTOS})</Label>
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Photos added">
          {value.map((url) => (
            <li key={url} className="relative h-16 w-16 overflow-hidden rounded-md border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="h-full w-full object-cover" />
              <button
                type="button"
                aria-label="Remove photo"
                className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white"
                onClick={() => onChange(value.filter((u) => u !== url))}
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <input
        ref={inputRef}
        id={`${idPrefix}-photos`}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          void add(Array.from(e.target.files ?? []))
          e.target.value = ''
        }}
      />
      <div className="flex items-center gap-3">
        <Button type="button" variant="outline" size="sm" loading={uploading} onClick={() => inputRef.current?.click()}>
          <ImagePlus className="mr-2 h-4 w-4" /> Add photos
        </Button>
        <span data-testid={`${idPrefix}-photo-count`} className={short ? 'text-xs text-warning' : 'text-xs text-muted-foreground'}>
          {value.length} of {MIN_BRANCH_PHOTOS} photos added
        </span>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
