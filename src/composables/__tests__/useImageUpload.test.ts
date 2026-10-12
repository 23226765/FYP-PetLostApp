import { effectScope } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useImageUpload } from '../useImageUpload'
import type { ImagePurpose } from '../../services/api'

const mocks = vi.hoisted(() => ({ uploadManagedImage: vi.fn(), discardManagedImage: vi.fn() }))
vi.mock('../../services/api', () => mocks)
describe('managed image upload state', () => {
  beforeEach(() => {
    localStorage.clear(); localStorage.setItem('token', 'fictional-owner-token')
    mocks.uploadManagedImage.mockReset(); mocks.discardManagedImage.mockResolvedValue(undefined)
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:fictional-preview'), revokeObjectURL: vi.fn() }))
  })
  function setup(purpose: ImagePurpose) {
    const scope = effectScope()
    const state = scope.run(() => useImageUpload(purpose))!
    state.select(new Blob(['fictional-raster'], { type: 'image/png' }))
    return { state, stop: () => scope.stop() }
  }
  for (const purpose of ['avatar', 'pet', 'sighting', 'stray', 'message'] as const) {
    it(`${purpose}: sends multipart bytes, reports progress and reuses its ID on retries`, async () => {
      mocks.uploadManagedImage.mockImplementation(async (_file, requestedPurpose, _key, options) => {
        expect(requestedPurpose).toBe(purpose)
        options.onProgress(50)
        return { id: 'a'.repeat(24) }
      })
      const { state, stop } = setup(purpose)
      expect(await state.ensure()).toEqual(['a'.repeat(24)])
      expect(await state.ensure()).toEqual(['a'.repeat(24)])
      expect(mocks.uploadManagedImage).toHaveBeenCalledTimes(1)
      expect(state.progress).toBe(50)
      state.finish(); stop()
      expect(mocks.discardManagedImage).not.toHaveBeenCalled()
    })
  }
  it('a failed upload retains the source and same request ID for an explicit retry', async () => {
    mocks.uploadManagedImage.mockRejectedValueOnce(new Error('Network Error')).mockResolvedValueOnce({ id: 'b'.repeat(24) })
    const { state, stop } = setup('pet')
    await expect(state.ensure()).rejects.toThrow()
    expect(state.preview).toBe('blob:fictional-preview')
    expect(state.error).not.toContain('failure')
    await state.ensure()
    expect(mocks.uploadManagedImage.mock.calls[0][2]).toBe(mocks.uploadManagedImage.mock.calls[1][2])
    state.finish(); stop()
  })
  it('explicit compensated provider failures use a fresh reservation on retry', async () => {
    mocks.uploadManagedImage.mockRejectedValueOnce(Object.assign(new Error('failure'), { apiCode: 'IMAGE_STORAGE_UNAVAILABLE' })).mockResolvedValueOnce({ id: 'b'.repeat(24) })
    const { state, stop } = setup('pet')
    await expect(state.ensure()).rejects.toThrow()
    await state.ensure()
    expect(mocks.uploadManagedImage.mock.calls[0][2]).not.toBe(mocks.uploadManagedImage.mock.calls[1][2])
    state.finish(); stop()
  })

  it('a server-confirmed terminal reservation can be retried once with a new key', async () => {
    mocks.uploadManagedImage.mockRejectedValueOnce(Object.assign(new Error('ended'), { apiCode: 'IMAGE_UPLOAD_RETRY_REQUIRED' })).mockResolvedValueOnce({ id: 'e'.repeat(24) })
    const { state, stop } = setup('sighting')
    expect(await state.ensure()).toEqual(['e'.repeat(24)])
    expect(mocks.uploadManagedImage.mock.calls[0][2]).not.toBe(mocks.uploadManagedImage.mock.calls[1][2])
    state.finish(); stop()
  })
  it('cancel aborts the request and cannot publish its late result', async () => {
    let finish: (value: { id: string }) => void = () => {}
    mocks.uploadManagedImage.mockImplementation(() => new Promise((resolve) => { finish = resolve }))
    const { state, stop } = setup('message'), pending = state.ensure()
    state.cancel()
    finish({ id: 'c'.repeat(24) })
    await expect(pending).rejects.toThrow('Cancelled')
    expect(state.id).toBe('')
    expect(state.preview).toBe('blob:fictional-preview')
    stop()
  })
  it('logout/account switch clears IDs and ignores a stale upload response without deleting under the new identity', async () => {
    let finish: (value: { id: string }) => void = () => {}
    mocks.uploadManagedImage.mockImplementation(() => new Promise((resolve) => { finish = resolve }))
    const { state, stop } = setup('avatar'), pending = state.ensure()
    localStorage.setItem('token', 'fictional-finder-token'); window.dispatchEvent(new Event('auth:changed'))
    finish({ id: 'd'.repeat(24) })
    await expect(pending).rejects.toThrow('Cancelled')
    expect(state.id).toBe(''); expect(state.preview).toBe('')
    expect(mocks.discardManagedImage).not.toHaveBeenCalled()
    stop()
  })
  it('language/theme storage events do not reset an in-progress selection', () => {
    const { state, stop } = setup('stray')
    window.dispatchEvent(new StorageEvent('storage', { key: 'pawradar_preferences_v1' }))
    expect(state.preview).toBe('blob:fictional-preview')
    stop()
  })

  it('a disposed upload scope cannot start work from a late camera/form continuation', async () => {
    const { state, stop } = setup('avatar')
    stop()
    state.select(new Blob(['late-camera-result'], { type: 'image/png' }))
    await expect(state.ensure()).rejects.toMatchObject({ apiCode: 'IMAGE_CANCELLED' })
    expect(mocks.uploadManagedImage).not.toHaveBeenCalled()
  })
})
