// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { ImageUpload, MAX_COMPRESSED_IMAGE_BYTES } from '@/components/ui/ImageUpload'

const storageMocks = vi.hoisted(() => ({
  ref: vi.fn(),
  uploadBytesResumable: vi.fn(),
  getDownloadURL: vi.fn(),
  deleteObject: vi.fn(),
}))

vi.mock('@/lib/firebase', () => ({
  storage: {},
}))

vi.mock('firebase/storage', () => ({
  ref: storageMocks.ref,
  uploadBytesResumable: storageMocks.uploadBytesResumable,
  getDownloadURL: storageMocks.getDownloadURL,
  deleteObject: storageMocks.deleteObject,
}))

function successfulUpload(url = 'https://cdn.example/new.jpg') {
  storageMocks.uploadBytesResumable.mockImplementation(() => ({
    snapshot: { ref: { path: 'uploaded' } },
    on: (
      _event: string,
      progress: (snapshot: { bytesTransferred: number; totalBytes: number }) => void,
      _error: (error: Error) => void,
      complete: () => void,
    ) => {
      progress({ bytesTransferred: 1, totalBytes: 2 })
      complete()
    },
  }))
  storageMocks.getDownloadURL.mockResolvedValue(url)
}

function failedUpload(message = 'Upload failed') {
  storageMocks.uploadBytesResumable.mockImplementation(() => ({
    snapshot: { ref: { path: 'uploaded' } },
    on: (
      _event: string,
      _progress: (snapshot: { bytesTransferred: number; totalBytes: number }) => void,
      error: (error: Error) => void,
    ) => error(new Error(message)),
  }))
}

function ImageUploadHarness({
  initial,
  onUploaded,
}: {
  initial: { url: string; path: string } | null
  onUploaded: (value: { url: string; path: string }) => void
}) {
  const [image, setImage] = useState(initial)
  return (
    <div>
      <ImageUpload
        imageUrl={image?.url}
        outletId="o1"
        onChange={setImage}
        onUploaded={onUploaded}
      />
      <span data-testid="image-url">{image?.url ?? 'none'}</span>
      <span data-testid="image-path">{image?.path ?? 'none'}</span>
    </div>
  )
}

let compressedBlob: Blob

beforeEach(() => {
  compressedBlob = new Blob([new Uint8Array(1024)], { type: 'image/jpeg' })
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ width: 1600, height: 1200, close: vi.fn() })),
  )
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => {
    callback(compressedBlob)
  })
  storageMocks.ref.mockImplementation((_storage: unknown, path: string) => ({ path }))
  storageMocks.uploadBytesResumable.mockReset()
  storageMocks.getDownloadURL.mockReset()
  storageMocks.deleteObject.mockReset()
  successfulUpload()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('ImageUpload', () => {
  it('uploads an image and updates the preview via onChange', async () => {
    const onUploaded = vi.fn()
    render(<ImageUploadHarness initial={null} onUploaded={onUploaded} />)

    fireEvent.change(screen.getByLabelText('Upload product image'), {
      target: { files: [new File([new Uint8Array(64)], 'cake.png', { type: 'image/png' })] },
    })

    await waitFor(() => {
      expect(screen.getByTestId('image-url').textContent).toBe('https://cdn.example/new.jpg')
    })
    expect(screen.getByTestId('image-path').textContent).toMatch(/^product-images\/o1\/.+\.jpg$/)
    expect(screen.getByAltText('Product image preview')).toBeTruthy()
    expect(onUploaded).toHaveBeenCalledWith({
      url: 'https://cdn.example/new.jpg',
      path: expect.stringMatching(/^product-images\/o1\/.+\.jpg$/),
    })
    expect(storageMocks.deleteObject).not.toHaveBeenCalled()
  })

  it('replaces the preview without deleting the previous object', async () => {
    const oldImage = { url: 'https://cdn.example/old.jpg', path: 'product-images/o1/old.jpg' }
    render(<ImageUploadHarness initial={oldImage} onUploaded={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Upload product image'), {
      target: { files: [new File([new Uint8Array(64)], 'new.png', { type: 'image/png' })] },
    })

    await waitFor(() => {
      expect(screen.getByTestId('image-url').textContent).toBe('https://cdn.example/new.jpg')
    })
    expect(storageMocks.deleteObject).not.toHaveBeenCalled()
  })

  it('removes the local reference without deleting the previous object', () => {
    const oldImage = { url: 'https://cdn.example/old.jpg', path: 'product-images/o1/old.jpg' }
    render(<ImageUploadHarness initial={oldImage} onUploaded={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Remove image' }))

    expect(screen.getByTestId('image-url').textContent).toBe('none')
    expect(screen.getByTestId('image-path').textContent).toBe('none')
    expect(storageMocks.deleteObject).not.toHaveBeenCalled()
  })

  it('preserves the current image when an upload fails', async () => {
    failedUpload()
    const oldImage = { url: 'https://cdn.example/old.jpg', path: 'product-images/o1/old.jpg' }
    const onUploaded = vi.fn()
    render(<ImageUploadHarness initial={oldImage} onUploaded={onUploaded} />)

    fireEvent.change(screen.getByLabelText('Upload product image'), {
      target: { files: [new File([new Uint8Array(64)], 'broken.png', { type: 'image/png' })] },
    })

    expect((await screen.findByRole('alert')).textContent).toContain('Upload failed')
    expect(screen.getByAltText('Product image preview').getAttribute('src')).toBe(oldImage.url)
    expect(screen.getByTestId('image-path').textContent).toBe(oldImage.path)
    expect(onUploaded).not.toHaveBeenCalled()
    expect(storageMocks.deleteObject).not.toHaveBeenCalled()
  })

  it('rejects a compressed image at or above the Storage limit before upload', async () => {
    compressedBlob = new Blob([new Uint8Array(MAX_COMPRESSED_IMAGE_BYTES)], { type: 'image/jpeg' })
    render(<ImageUploadHarness initial={null} onUploaded={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Upload product image'), {
      target: { files: [new File([new Uint8Array(64)], 'huge.png', { type: 'image/png' })] },
    })

    expect((await screen.findByRole('alert')).textContent).toContain('smaller than 4 MB')
    expect(storageMocks.uploadBytesResumable).not.toHaveBeenCalled()
    expect(screen.getByTestId('image-url').textContent).toBe('none')
  })
})
