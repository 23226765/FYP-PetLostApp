import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Pet } from '../../types/pet'
import PosterModal from '../PosterModal.vue'

const apiMocks = vi.hoisted(() => ({ getPublicPet: vi.fn() }))
const qrMocks = vi.hoisted(() => ({ toString: vi.fn() }))

vi.mock('../../services/api', () => apiMocks)
vi.mock('qrcode', () => ({ default: qrMocks }))

const exactOwnerPet: Pet = {
  id: 'maple-id',
  name: 'Maple',
  species: 'Dog',
  breed: 'Golden Retriever',
  district: 'Sha Tin',
  photo: '',
  description: 'Golden coat',
  owner: 'FYP Owner',
  ownerPhone: '+852 5555 0101',
  canViewContact: true,
  reportedBy: 'owner-id',
  status: 'lost',
  location: 'Exact bench beside Sha Tin Park fountain',
  locationPrecision: 'exact',
  coordinates: [114.188123, 22.381456],
  lastSeen: 'Today',
  postedAgo: 'Today',
  mapX: 50,
  mapY: 50,
}

describe('PosterModal public projection', () => {
  beforeEach(() => {
    apiMocks.getPublicPet.mockReset()
    qrMocks.toString.mockReset()
    qrMocks.toString.mockResolvedValue('<svg aria-label="qr"></svg>')
  })

  it('never renders exact owner-only location or contact while public data is loading', async () => {
    apiMocks.getPublicPet.mockReturnValue(new Promise(() => undefined))
    const wrapper = mount(PosterModal, {
      props: { pet: exactOwnerPet },
      global: { stubs: { AppIcon: { template: '<span />' } } },
    })
    await flushPromises()

    expect(apiMocks.getPublicPet).toHaveBeenCalledWith('maple-id')
    expect(wrapper.text()).toContain('Sha Tin')
    expect(wrapper.text()).not.toContain('Exact bench beside Sha Tin Park fountain')
    expect(wrapper.text()).not.toContain('+852 5555 0101')
    expect(wrapper.text()).toContain('Report through PawRadar')
  })

  it('renders only the forced-public DTO returned by the API', async () => {
    apiMocks.getPublicPet.mockResolvedValue({
      ...exactOwnerPet,
      ownerPhone: undefined,
      canViewContact: false,
      location: 'Sha Tin',
      locationPrecision: 'approximate',
      coordinates: [114.187, 22.379],
    })
    const wrapper = mount(PosterModal, {
      props: { pet: exactOwnerPet },
      global: { stubs: { AppIcon: { template: '<span />' } } },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('Sha Tin')
    expect(wrapper.text()).not.toContain('Exact bench beside Sha Tin Park fountain')
    expect(wrapper.text()).not.toContain('+852 5555 0101')
    expect(qrMocks.toString).toHaveBeenCalledWith(
      expect.stringContaining('/pets/maple-id'),
      expect.objectContaining({ type: 'svg' }),
    )
  })
})
