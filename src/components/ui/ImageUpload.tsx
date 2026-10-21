import { useRef, useState } from 'react'
import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage'
import { ImagePlus, Loader2, RefreshCw, Trash2, UploadCloud } from 'lucide-react'
import { storage } from '@/lib/firebase'
import { friendlyFirebaseError } from '@/lib/errors'
import { Button, IconButton } from './Button'
import { cn, uniqueId } from '@/lib/utils'

export const MAX_COMPRESSED_IMAGE_BYTES = 4 * 1024 * 1024

export function assertCompressedImageSize(blob: Blob): void {
  if (blob.size >= MAX_COMPRESSED_IMAGE_BYTES) {
    throw new Error('The compressed image must be smaller than 4 MB. Choose a smaller image.')
  }
}

async function compressImage(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('Choose a JPEG, PNG or WebP image.')
  if (file.size > 8 * 1024 * 1024) throw new Error('The original image must be smaller than 8 MB.')

  const bitmap = await createImageBitmap(file)
  const maxSide = 1200
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Image processing is not supported in this browser.')
  context.drawImage(bitmap, 0, 0, width, height)
  bitmap.close?.()
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Could not process the image.'))
          return
        }
        try {
          assertCompressedImageSize(blob)
          resolve(blob)
        } catch (error) {
          reject(error)
        }
      },
      'image/jpeg',
      0.82,
    )
  })
}

export function ImageUpload({
  imageUrl,
  outletId,
  onChange,
  onUploaded,
  disabled,
  className,
}: {
  imageUrl?: string
  outletId: string
  onChange: (value: { url: string; path: string } | null) => void
  onUploaded?: (value: { url: string; path: string }) => void
  disabled?: boolean
  className?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [failedPreview, setFailedPreview] = useState(false)

  async function handleFile(file: File) {
    setError(null)
    if (!storage) {
      setError('Firebase Storage is not configured. You can paste an image URL instead.')
      return
    }
    try {
      setBusy(true)
      setProgress(5)
      const blob = await compressImage(file)
      const path = `product-images/${outletId || 'shared'}/${uniqueId()}.jpg`
      const storageRef = ref(storage, path)
      const task = uploadBytesResumable(storageRef, blob, {
        contentType: 'image/jpeg',
        cacheControl: 'public,max-age=31536000,immutable',
      })
      await new Promise<void>((resolve, reject) => {
        task.on(
          'state_changed',
          (snapshot) => setProgress(Math.max(5, Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 95))),
          reject,
          () => resolve(),
        )
      })
      const url = await getDownloadURL(task.snapshot.ref)
      onChange({ url, path })
      onUploaded?.({ url, path })
      setFailedPreview(false)
      setProgress(100)
    } catch (uploadError) {
      setError(friendlyFirebaseError(uploadError))
    } finally {
      setBusy(false)
    }
  }

  function handleRemove() {
    // The parent deletes the Storage object only after the product document
    // successfully saves the removal. Deleting here would break the persisted
    // reference whenever the save is cancelled or fails.
    onChange(null)
    setFailedPreview(false)
    setError(null)
  }

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="relative flex h-32 w-32 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-ink-200 bg-ivory-50">
          {imageUrl && !failedPreview ? (
            <img
              src={imageUrl}
              alt="Product image preview"
              className="h-full w-full object-cover"
              onError={() => setFailedPreview(true)}
            />
          ) : (
            <div className="flex flex-col items-center gap-1 p-2 text-center text-ink-400">
              <ImagePlus className="h-6 w-6" />
              <span className="text-[10px] font-medium">{imageUrl ? 'Image unavailable' : 'No image'}</span>
            </div>
          )}
          {busy && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-white/85 text-xs font-semibold text-ink-700">
              <Loader2 className="h-5 w-5 animate-spin text-brand-600" />
              {progress}%
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-xs leading-relaxed text-ink-500">
            JPEG, PNG or WebP up to 8 MB. Images are resized to 1200px and compressed to under 4 MB before upload.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={disabled || busy}
              onClick={() => inputRef.current?.click()}
              leftIcon={<UploadCloud className="h-3.5 w-3.5" />}
            >
              {imageUrl ? 'Replace image' : 'Upload image'}
            </Button>
            {imageUrl && (
              <>
                <IconButton label="Remove image" size="sm" variant="outline" disabled={disabled || busy} onClick={handleRemove}>
                  <Trash2 className="h-3.5 w-3.5" />
                </IconButton>
                {failedPreview && (
                  <IconButton label="Retry preview" size="sm" variant="outline" onClick={() => setFailedPreview(false)}>
                    <RefreshCw className="h-3.5 w-3.5" />
                  </IconButton>
                )}
              </>
            )}
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void handleFile(file)
              event.target.value = ''
            }}
            aria-label="Upload product image"
          />
        </div>
      </div>
      {error && <p className="field-error" role="alert">{error}</p>}
    </div>
  )
}
