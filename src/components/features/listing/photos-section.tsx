'use client'

import { useState } from 'react'
import Image from 'next/image'
import { X } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { MultiImageUpload } from '@/components/features/multi-image-upload'
import { SubmittedForApprovalNotice } from '@/components/features/approvals/submitted-for-approval-notice'
import { gymApi } from '@/lib/api/gym'
import { describeRequestError } from '@/lib/api/request-errors'
import { useToast } from '@/hooks/use-toast'
import { asStringList, MAX_PHOTOS } from '@/lib/listing/content'
import { listingContentKey, useListingSave } from './use-listing-save'
import type { SectionEditorProps } from './types'

/**
 * Photos. Adding uploads to POST /gyms/branches/:id/images (needs branch.settings), which also
 * writes the branch's list on the server, so the list is simply read again afterwards. Removing
 * saves the shorter list through listing-content, the way the mobile editor does.
 */
export function PhotosSection({ branchId, branch, access }: SectionEditorProps) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { save, saving, error: saveError, approval } = useListingSave(branchId)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const photos = asStringList(branch.imagesJson)

  const upload = async (files: File[]) => {
    if (files.length === 0) return
    setUploadError(null)
    if (photos.length + files.length > MAX_PHOTOS) {
      setUploadError(`A listing holds up to ${MAX_PHOTOS} photos. Remove one to add another.`)
      return
    }
    setUploading(true)
    try {
      await gymApi.uploadBranchImages(branchId, files)
      await queryClient.invalidateQueries({ queryKey: listingContentKey(branchId) })
      toast({ title: files.length === 1 ? 'Photo added' : `${files.length} photos added` })
    } catch (err) {
      setUploadError(
        describeRequestError(err, 'The photos could not be uploaded. Check your connection and try again.', {
          403: 'You are not allowed to upload photos for this branch.',
        })
      )
    } finally {
      setUploading(false)
    }
  }

  const remove = async (url: string) => {
    setUploadError(null)
    await save({ imagesJson: photos.filter((p) => p !== url) }, 'Photo removed')
  }

  const message = uploadError ?? saveError

  return (
    <div className="space-y-4">
      {message && (
        <Alert variant="destructive" data-testid="save-error">
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}
      {approval?.pending && <SubmittedForApprovalNotice summary={approval.summary} />}
      {access.settings ? (
        <MultiImageUpload
          existingUrls={photos}
          onFilesSelected={upload}
          onRemoveExisting={remove}
          maxCount={MAX_PHOTOS}
          uploading={uploading || saving}
        />
      ) : (
        <>
          <p className="text-sm text-muted-foreground" data-testid="photos-readonly">
            Adding photos needs the "Edit branch settings" permission. Ask the owner if you need it.
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {photos.map((url) => (
              <div key={url} className="relative aspect-square overflow-hidden rounded-lg border bg-muted">
                <Image src={url} alt="Branch photo" fill className="object-cover" />
                <button
                  type="button"
                  aria-label="Remove image"
                  disabled={saving}
                  onClick={() => remove(url)}
                  className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-md"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
