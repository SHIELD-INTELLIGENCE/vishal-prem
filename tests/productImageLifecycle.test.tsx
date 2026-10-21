// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { Department, Outlet, Product, UserProfile } from '@/types/models'
import { defaultPermissionsForRole } from '@/auth/permissions'
import { ProductFormPage } from '@/features/products/ProductFormPage'

const documentState = vi.hoisted(() => ({
  current: {
    data: null as unknown,
    loading: false,
    error: null as string | null,
    reload: vi.fn(),
  },
}))

const authState = vi.hoisted(() => ({
  current: {
    profile: null as unknown,
  },
}))

const workspaceState = vi.hoisted(() => ({
  current: {
    business: { defaultTaxPercent: 5, pricesIncludeTax: true },
    outlets: [] as unknown[],
    departments: [] as unknown[],
    selectedOutletId: 'o1' as string | null,
    selectedOutlet: null as unknown,
    setSelectedOutletId: vi.fn(),
    loading: false,
    error: null as string | null,
    reload: vi.fn(),
    sidebarCollapsed: false,
    setSidebarCollapsed: vi.fn(),
    allowedOutlets: vi.fn(() => []),
  },
}))

const productMocks = vi.hoisted(() => ({
  saveProduct: vi.fn(),
  deleteProductImage: vi.fn(),
}))

const toastMocks = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}))

const storageMocks = vi.hoisted(() => ({
  ref: vi.fn(),
  uploadBytesResumable: vi.fn(),
  getDownloadURL: vi.fn(),
}))

vi.mock('@/data/hooks', () => ({
  useDocumentData: () => documentState.current,
}))

vi.mock('@/data/products', () => ({
  saveProduct: productMocks.saveProduct,
  deleteProductImage: productMocks.deleteProductImage,
}))

vi.mock('@/auth/AuthProvider', () => ({
  useAuth: () => authState.current,
}))

vi.mock('@/auth/WorkspaceProvider', () => ({
  useWorkspace: () => workspaceState.current,
}))

vi.mock('sonner', () => ({
  toast: toastMocks,
}))

vi.mock('@/lib/firebase', () => ({
  storage: {},
}))

vi.mock('firebase/storage', () => ({
  ref: storageMocks.ref,
  uploadBytesResumable: storageMocks.uploadBytesResumable,
  getDownloadURL: storageMocks.getDownloadURL,
}))

const NOW = '2026-10-01T10:00:00.000Z'

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'p1',
    name: 'Chocolate Cake',
    alias: '',
    printName: 'CHOCOLATE CAKE',
    group: 'Cakes',
    category: 'Celebration Cakes',
    departmentId: 'd1',
    outletIds: ['o1'],
    pricingMode: 'fixed',
    unit: 'piece',
    conversionFactor: 1,
    cakeSizes: [],
    salePricePaise: 10000,
    taxPercent: 5,
    trackStock: false,
    batchTracking: false,
    expiryTracking: false,
    description: '',
    imageUrl: 'https://cdn.example/old.jpg',
    imagePath: 'product-images/o1/old.jpg',
    active: true,
    available: true,
    createdAt: NOW,
    updatedAt: NOW,
    createdBy: 'u1',
    updatedBy: 'u1',
    ...overrides,
  }
}

function makeProfile(): UserProfile {
  return {
    uid: 'u1',
    displayName: 'Owner',
    email: 'owner@example.com',
    role: 'super_admin',
    permissions: defaultPermissionsForRole('super_admin'),
    outletIds: ['o1'],
    departmentIds: [],
    active: true,
    createdAt: NOW,
    updatedAt: NOW,
  }
}

function makeOutlet(): Outlet {
  return {
    id: 'o1',
    code: 'MAIN',
    name: 'Main Outlet',
    address: 'Main Road',
    phone: '9876543210',
    active: true,
    createdAt: NOW,
    updatedAt: NOW,
  }
}

function makeDepartment(): Department {
  return {
    id: 'd1',
    code: 'cake',
    name: 'Cake',
    outletIds: ['o1'],
    color: '#C8102E',
    active: true,
    createdAt: NOW,
    updatedAt: NOW,
  }
}

function page() {
  return (
    <MemoryRouter initialEntries={['/admin/products/p1']}>
      <Routes>
        <Route path="/admin/products/:id" element={<ProductFormPage />} />
      </Routes>
    </MemoryRouter>
  )
}

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

beforeEach(() => {
  documentState.current = {
    data: makeProduct(),
    loading: false,
    error: null,
    reload: vi.fn(),
  }
  authState.current = { profile: makeProfile() }
  workspaceState.current = {
    ...workspaceState.current,
    outlets: [makeOutlet()],
    departments: [makeDepartment()],
    selectedOutletId: 'o1',
    selectedOutlet: makeOutlet(),
  }
  productMocks.saveProduct.mockReset()
  productMocks.saveProduct.mockResolvedValue('p1')
  productMocks.deleteProductImage.mockReset()
  productMocks.deleteProductImage.mockResolvedValue(undefined)
  toastMocks.success.mockReset()
  toastMocks.error.mockReset()

  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ width: 1600, height: 1200, close: vi.fn() })),
  )
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => {
    callback(new Blob([new Uint8Array(1024)], { type: 'image/jpeg' }))
  })
  storageMocks.ref.mockImplementation((_storage: unknown, path: string) => ({ path }))
  storageMocks.uploadBytesResumable.mockReset()
  storageMocks.getDownloadURL.mockReset()
  successfulUpload()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function uploadReplacement() {
  fireEvent.change(screen.getByLabelText('Upload product image'), {
    target: { files: [new File([new Uint8Array(64)], 'new.png', { type: 'image/png' })] },
  })
}

describe('ProductFormPage image lifecycle', () => {
  it('replaces an image but deletes the old object only after the product saves', async () => {
    render(page())

    uploadReplacement()
    await waitFor(() => {
      expect(screen.getByAltText('Product image preview').getAttribute('src')).toBe(
        'https://cdn.example/new.jpg',
      )
    })
    expect(productMocks.deleteProductImage).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() => {
      expect(productMocks.deleteProductImage).toHaveBeenCalledWith('product-images/o1/old.jpg')
    })
    expect(productMocks.saveProduct).toHaveBeenCalledWith(
      expect.objectContaining({
        image: {
          url: 'https://cdn.example/new.jpg',
          path: expect.stringMatching(/^product-images\/o1\/.+\.jpg$/),
        },
        existing: expect.objectContaining({ imagePath: 'product-images/o1/old.jpg' }),
      }),
    )
    expect(productMocks.saveProduct.mock.invocationCallOrder[0]).toBeLessThan(
      productMocks.deleteProductImage.mock.invocationCallOrder[0],
    )
  })

  it('removes an image but deletes the old object only after the product saves', async () => {
    render(page())

    fireEvent.click(screen.getByRole('button', { name: 'Remove image' }))
    expect(screen.getByText('No image')).toBeTruthy()
    expect(productMocks.deleteProductImage).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() => {
      expect(productMocks.deleteProductImage).toHaveBeenCalledWith('product-images/o1/old.jpg')
    })
    expect(productMocks.saveProduct).toHaveBeenCalledWith(
      expect.objectContaining({ image: null }),
    )
  })

  it('preserves the old object and persisted reference when the product save fails', async () => {
    productMocks.saveProduct.mockRejectedValueOnce(new Error('Save failed'))
    render(page())

    uploadReplacement()
    await waitFor(() => {
      expect(screen.getByAltText('Product image preview').getAttribute('src')).toBe(
        'https://cdn.example/new.jpg',
      )
    })

    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))

    expect((await screen.findByRole('alert')).textContent).toContain('previous image has not been removed')
    expect(productMocks.deleteProductImage).not.toHaveBeenCalled()
    expect(productMocks.saveProduct).toHaveBeenCalledWith(
      expect.objectContaining({
        image: {
          url: 'https://cdn.example/new.jpg',
          path: expect.stringMatching(/^product-images\/o1\/.+\.jpg$/),
        },
        existing: expect.objectContaining({ imagePath: 'product-images/o1/old.jpg' }),
      }),
    )
  })

  it('includes an image-only change in the unsaved-change guard', async () => {
    render(page())

    uploadReplacement()
    await waitFor(() => {
      expect(screen.getByAltText('Product image preview').getAttribute('src')).toBe(
        'https://cdn.example/new.jpg',
      )
    })

    await waitFor(() => {
      const event = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(event)
      expect(event.defaultPrevented).toBe(true)
    })
  })

  it('does not wipe unsaved form or image state when the live product updates', async () => {
    documentState.current = {
      ...documentState.current,
      data: makeProduct({ trackStock: true, openingStock: 10, stockQty: 10 }),
    }
    const view = render(page())
    const nameInput = screen.getByLabelText(/product name/i)
    fireEvent.change(nameInput, { target: { value: 'Edited Cake' } })
    expect((nameInput as HTMLInputElement).value).toBe('Edited Cake')

    documentState.current = {
      ...documentState.current,
      data: makeProduct({
        name: 'Server Cake',
        trackStock: true,
        openingStock: 10,
        stockQty: 8,
        imageUrl: 'https://cdn.example/server.jpg',
        imagePath: 'product-images/o1/server.jpg',
      }),
    }
    view.rerender(page())

    await waitFor(() => {
      expect((screen.getByLabelText(/product name/i) as HTMLInputElement).value).toBe('Edited Cake')
    })
    expect(screen.getByAltText('Product image preview').getAttribute('src')).toBe(
      'https://cdn.example/old.jpg',
    )

    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))
    await waitFor(() => expect(productMocks.saveProduct).toHaveBeenCalled())
    expect(productMocks.saveProduct.mock.calls[0][0]).toMatchObject({
      existing: { stockQty: 10 },
      values: { name: 'Edited Cake', stockQty: 10 },
    })
  })
})
