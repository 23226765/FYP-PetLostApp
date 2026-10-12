import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { legacyImagePath, protectedImagePath } from '../managedImages'
import { createProtectedMapImages } from '../protectedMapImages'
import { setSessionToken } from '../../services/authSession'

const mocks = vi.hoisted(() => ({ readManagedImage: vi.fn() }))
vi.mock('../../services/api', () => mocks)

describe('protected legacy image URLs and Leaflet image lifecycle', () => {
  beforeEach(() => {
    mocks.readManagedImage.mockReset()
    document.body.innerHTML = ''
    URL.createObjectURL = vi.fn(() => 'blob:protected-map-image')
    URL.revokeObjectURL = vi.fn()
    setSessionToken('fictional-owner')
  })
  it('normalizes relative/encoded paths and strips query data instead of sending it to the API', () => {
    expect(legacyImagePath('/uploads/%70et.webp')).toBe('/uploads/legacy/pet.webp')
    expect(legacyImagePath('/uploads/nested/pet.webp?version=1')).toBe('/uploads/legacy/nested/pet.webp')
    expect(legacyImagePath('http://localhost:5000/uploads/pet.webp')).toBe('/uploads/legacy/pet.webp')
    expect(legacyImagePath('https://example.test/uploads/pet.webp')).toBeNull()
    expect(protectedImagePath(`/api/uploads/managed/${'a'.repeat(24)}/content`)).toBe(`/uploads/managed/${'a'.repeat(24)}/content`)
  })
  it('never normalizes malicious paths into an authorized image path', () => {
    for (const value of ['/uploads/../pet.webp', '/uploads/%2e%2e/pet.webp', '/uploads/%252e%252e/pet.webp', '/uploads/a%2fb.webp', '/uploads/a%5cb.webp', '/uploads//pet.webp', '/uploads/%00pet.webp']) {
      expect(legacyImagePath(value)).toBeNull()
    }
  })
  it('hydrates a Leaflet image with a blob, then revokes it on authorization clearing', async () => {
    mocks.readManagedImage.mockResolvedValue(new Blob(['safe']))
    const image = document.createElement('img'); document.body.append(image)
    const loader = createProtectedMapImages()
    await loader.load(image, '/uploads/private.webp')
    expect(mocks.readManagedImage).toHaveBeenCalledWith('/uploads/legacy/private.webp', expect.any(AbortSignal))
    expect(image.getAttribute('src')).toBe('blob:protected-map-image')
    loader.clear()
    expect(image.hasAttribute('src')).toBe(false)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:protected-map-image')
    loader.dispose()
  })
  it('late map-image responses cannot survive logout, detached nodes or disposal', async () => {
    for (const action of ['logout', 'detach', 'dispose']) {
      let finish!: (value: Blob) => void
      mocks.readManagedImage.mockReturnValueOnce(new Promise((resolve) => { finish = resolve }))
      const image = document.createElement('img'); document.body.append(image)
      const loader = createProtectedMapImages(), pending = loader.load(image, '/uploads/private.webp')
      if (action === 'logout') setSessionToken(null)
      if (action === 'detach') image.remove()
      if (action === 'dispose') loader.dispose()
      finish(new Blob(['obsolete'])); await pending
      expect(image.hasAttribute('src')).toBe(false)
      loader.dispose(); image.remove()
    }
    expect(URL.createObjectURL).not.toHaveBeenCalled()
  })
  it('session reauthorization can reload still-permitted images without recreating map nodes', async () => {
    mocks.readManagedImage.mockResolvedValue(new Blob(['safe']))
    const image = document.createElement('img'); document.body.append(image)
    const loader = createProtectedMapImages()
    await loader.load(image, '/uploads/public.webp')
    loader.clear(true); await flushPromises()
    expect(mocks.readManagedImage).toHaveBeenCalledTimes(2)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:protected-map-image')
    expect(image.getAttribute('src')).toBe('blob:protected-map-image')
    loader.dispose()
  })
})
