<template>
  <div class="detail">
    <div class="hero">
      <img
        v-if="heroPhotoUrl && !heroPhotoFailed"
        :src="heroPhotoUrl"
        alt=""
        aria-hidden="true"
        @error="heroPhotoFailed = true"
      />
      <div v-else class="photo-placeholder hero-placeholder" aria-hidden="true">
        <AppIcon name="paw" :size="58" />
      </div>
      <span class="sr-only">Photo of {{ pet.name }}, a missing {{ pet.breed }}</span>
      <button class="back" aria-label="Go back" @click="emit('close')">
        <AppIcon name="back" :size="20" />
      </button>
      <button class="share" aria-label="Share this pet's poster" @click="emit('poster')">
        <AppIcon name="share" :size="19" />
      </button>
      <span class="badge" :class="pet.status">
        {{ pet.status === 'lost' ? 'LOST' : 'SIGHTED NEARBY' }}
      </span>
    </div>

    <div class="sheet">
      <div class="grab" />
      <div class="title-row">
        <div>
          <h2>{{ pet.name }}</h2>
          <p class="sub">{{ pet.breed }} · {{ pet.species }}</p>
        </div>
        <span class="distance">
          <AppIcon name="pin" :size="15" />
          {{ pet.distanceKm }} km away
        </span>
      </div>

      <div class="facts">
        <div class="fact">
          <span class="label">Last seen</span>
          <span class="value">{{ pet.lastSeen }}</span>
        </div>
        <div class="fact">
          <span class="label">Location</span>
          <span class="value">{{ pet.location }}</span>
        </div>
        <div v-if="pet.district" class="fact">
          <span class="label">District</span>
          <span class="value">{{ pet.district }}</span>
        </div>
        <div v-if="pet.reward" class="fact">
          <span class="label">Reward</span>
          <span class="value reward">{{ pet.reward }}</span>
        </div>
      </div>

      <section class="sighting-history" aria-labelledby="sighting-history-title">
        <h3 id="sighting-history-title">Sighting history</h3>
        <p v-if="sightingsLoading" class="timeline-state" role="status">
          Loading sightings...
        </p>
        <p v-else-if="sightingsError" class="timeline-state error" role="alert">
          {{ sightingsError }}
        </p>
        <p v-else-if="sightings.length === 0" class="timeline-state">No sightings yet.</p>
        <template v-else>
          <div class="trajectory-card">
            <div class="trajectory-heading">
              <strong>Movement trace</strong>
              <span>{{ trajectorySightings.length }} recorded locations</span>
            </div>
            <MapView
              class="trajectory-map"
              :pets="[pet]"
              :sightings="trajectorySightings"
              :center="trajectoryCenter"
              :radius-km="0"
            />
          </div>
        <ol class="timeline">
          <li v-for="sighting in trajectorySightings" :key="sighting.id" class="timeline-item">
            <span class="timeline-dot" aria-hidden="true" />
            <div class="timeline-content">
              <div class="timeline-head">
                <strong>{{ sighting.locationName || 'Location not provided' }}</strong>
                <time v-if="sighting.createdAt" :datetime="String(sighting.createdAt)">
                  {{ relativeTime(sighting.createdAt) }}
                </time>
              </div>
              <p v-if="sighting.note">{{ sighting.note }}</p>
              <div class="sighting-thumbnail" role="img" :aria-label="`Sighting of ${pet.name}`">
                <img
                  v-if="normalizedImageUrl(sighting.photo) && !failedSightingPhotos.has(sightingImageKey(sighting))"
                  :src="normalizedImageUrl(sighting.photo)"
                  alt=""
                  aria-hidden="true"
                  loading="lazy"
                  @error="markSightingPhotoFailed(sightingImageKey(sighting))"
                />
                <div v-else class="photo-placeholder" aria-hidden="true">
                  <AppIcon name="paw" :size="25" />
                </div>
              </div>
              <div v-if="sighting.id" class="verification-row">
                <span class="confirmation-count">
                  {{ sighting.confirmationCount || 0 }}
                  {{ (sighting.confirmationCount || 0) === 1 ? 'confirmation' : 'confirmations' }}
                </span>
                <button
                  class="confirm-button"
                  :class="{ confirmed: sighting.confirmedByMe }"
                  type="button"
                  :disabled="sighting.confirmedByMe || confirmingSightings.has(sighting.id)"
                  :aria-pressed="Boolean(sighting.confirmedByMe)"
                  @click="confirmSightingEntry(sighting)"
                >
                  <AppIcon name="check" :size="15" />
                  {{
                    sighting.confirmedByMe
                      ? 'Confirmed'
                      : confirmingSightings.has(sighting.id)
                        ? 'Confirming...'
                        : 'I saw this too'
                  }}
                </button>
              </div>
              <p
                v-if="sighting.id && confirmationErrors[sighting.id]"
                class="confirmation-error"
                role="alert"
              >
                {{ confirmationErrors[sighting.id] }}
              </p>
            </div>
          </li>
        </ol>
        </template>
      </section>

      <h3>About {{ pet.name }}</h3>
      <p class="desc">{{ pet.description }}</p>

      <div class="owner">
        <button
          class="owner-info"
          type="button"
          :aria-label="`Message ${pet.owner}`"
          @click="emit('chat')"
        >
          <span class="owner-name">{{ pet.owner }}</span>
          <span class="owner-role">Owner · posted {{ pet.postedAgo }}</span>
        </button>
        <div v-if="contactActions" class="contact-actions">
          <a
            class="contact-action call"
            :href="contactActions.callHref"
            :aria-label="`Call ${pet.owner || 'the owner'}`"
          >
            <AppIcon name="phone" :size="19" />
          </a>
          <a
            class="contact-action whatsapp"
            :href="contactActions.whatsappHref"
            target="_blank"
            rel="noopener noreferrer"
            :aria-label="`Message ${pet.owner || 'the owner'} on WhatsApp`"
          >
            WhatsApp
          </a>
        </div>
        <span v-else class="contact-unavailable" aria-label="Owner phone number unavailable">
          Phone unavailable
        </span>
      </div>

      <button class="found-cta" @click="emit('found')">
        <AppIcon name="eye" :size="20" />
        Found it? Report a sighting
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Pet, Sighting } from '../types/pet'
import type { User } from '../types/user'
import { confirmSighting, getPetSightings } from '../services/api'
import { createContactActions } from '../utils/contact'
import AppIcon from './AppIcon.vue'
import MapView from './MapView.vue'

const props = defineProps<{ pet: Pet; user?: User | null }>()
const emit = defineEmits<{
  close: []
  found: []
  poster: []
  chat: []
  'auth-needed': []
}>()

const sightings = ref<Sighting[]>([])
const sightingsLoading = ref(true)
const sightingsError = ref('')
const heroPhotoFailed = ref(false)
const failedSightingPhotos = ref<Set<string>>(new Set())
const confirmingSightings = ref<Set<string>>(new Set())
const confirmationErrors = ref<Record<string, string>>({})
const heroPhotoUrl = computed(() => normalizedImageUrl(props.pet.photo))
const trajectorySightings = computed(() =>
  [...sightings.value].sort((a, b) => {
    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0
    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0
    return aTime - bTime
  }),
)
const trajectoryCenter = computed(() => {
  const first = trajectorySightings.value.find((sighting) => sighting.coordinates?.length === 2)
  if (first) return { lat: first.coordinates[1], lng: first.coordinates[0] }
  if (props.pet.coordinates?.length === 2) {
    return { lat: props.pet.coordinates[1], lng: props.pet.coordinates[0] }
  }
  return null
})
const contactActions = computed(() => {
  const location = props.pet.location ? `, last seen near ${props.pet.location}` : ''
  const message = `Hi, I'm contacting you through PawRadar about ${props.pet.name}${location}.`
  return createContactActions(props.pet.ownerPhone, message)
})

watch(heroPhotoUrl, () => {
  heroPhotoFailed.value = false
})

function normalizedImageUrl(value: string | null | undefined): string {
  const photo = value?.trim()
  if (!photo) return ''

  try {
    const apiUrl = new URL(
      import.meta.env.VITE_API_BASE_URL || '/api',
      window.location.origin,
    )
    const resolved = new URL(photo, `${apiUrl.origin}/`)
    return ['http:', 'https:', 'data:', 'blob:'].includes(resolved.protocol) ? resolved.href : ''
  } catch {
    return ''
  }
}

function markSightingPhotoFailed(id: string) {
  failedSightingPhotos.value = new Set([...failedSightingPhotos.value, id])
}

function sightingImageKey(sighting: Sighting): string {
  return String(sighting.id ?? sighting.createdAt ?? sighting.photo ?? '')
}

async function confirmSightingEntry(sighting: Sighting) {
  const sightingId = sighting.id
  if (!sightingId || sighting.confirmedByMe || confirmingSightings.value.has(sightingId)) {
    return
  }
  if (!props.user) {
    emit('auth-needed')
    return
  }

  confirmingSightings.value = new Set([...confirmingSightings.value, sightingId])
  const nextErrors = { ...confirmationErrors.value }
  delete nextErrors[sightingId]
  confirmationErrors.value = nextErrors

  try {
    const result = await confirmSighting(props.pet.id, sightingId)
    sighting.confirmationCount = result.confirmationCount
    sighting.confirmedByMe = result.confirmedByMe
  } catch (error) {
    confirmationErrors.value = {
      ...confirmationErrors.value,
      [sightingId]: error instanceof Error ? error.message : 'Unable to confirm this sighting.',
    }
  } finally {
    const next = new Set(confirmingSightings.value)
    next.delete(sightingId)
    confirmingSightings.value = next
  }
}

async function loadSightings() {
  sightingsLoading.value = true
  sightingsError.value = ''
  failedSightingPhotos.value = new Set()
  confirmingSightings.value = new Set()
  confirmationErrors.value = {}
  try {
    sightings.value = await getPetSightings(props.pet.id)
  } catch (error) {
    sightings.value = []
    sightingsError.value = error instanceof Error ? error.message : 'Failed to load sightings.'
  } finally {
    sightingsLoading.value = false
  }
}

function relativeTime(value: string | Date) {
  const elapsed = Math.max(0, Date.now() - new Date(value).getTime())
  const minutes = Math.floor(elapsed / 60000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

watch(() => props.pet.id, loadSightings, { immediate: true })
</script>

<style scoped>
.detail {
  position: fixed;
  inset: 0;
  z-index: 45;
  background: var(--bg);
  overflow-y: auto;
}

.hero {
  position: relative;
  aspect-ratio: 1 / 1;
  max-height: 55vh;
  width: 100%;
  overflow: hidden;
  background: #fcf9f2;
}

.hero img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.photo-placeholder {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background:
    radial-gradient(circle at 50% 42%, rgba(29, 99, 96, 0.12), transparent 34%),
    #fcf9f2;
  color: rgba(29, 99, 96, 0.55);
}

.back,
.share {
  position: absolute;
  top: calc(var(--safe-top) + 14px);
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.92);
  color: var(--ink);
  box-shadow: var(--shadow-card);
}

.back {
  left: 16px;
}

.share {
  right: 16px;
}

.badge {
  position: absolute;
  bottom: 40px;
  left: 18px;
  padding: 5px 14px;
  border-radius: 999px;
  font-size: 12.5px;
  font-weight: 800;
  letter-spacing: 0.06em;
  color: #fff;
}

.badge.lost {
  background: var(--coral);
}

.badge.sighted {
  background: var(--teal);
}

.sheet {
  position: relative;
  margin-top: -26px;
  background: var(--bg);
  border-radius: 26px 26px 0 0;
  padding: 10px 20px calc(var(--safe-bottom) + 28px);
  max-width: 480px;
  margin-left: auto;
  margin-right: auto;
}

.grab {
  width: 42px;
  height: 5px;
  border-radius: 999px;
  background: var(--line);
  margin: 0 auto 16px;
}

.title-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 18px;
}

h2 {
  font-size: 26px;
  font-weight: 800;
}

.sub {
  color: var(--ink-muted);
  font-size: 14.5px;
  font-weight: 600;
}

.distance {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 7px 13px;
  border-radius: 999px;
  background: var(--teal-soft);
  color: var(--teal);
  font-size: 13px;
  font-weight: 800;
  white-space: nowrap;
}

.facts {
  display: flex;
  flex-direction: column;
  gap: 1px;
  background: var(--line);
  border-radius: var(--radius-md);
  overflow: hidden;
  margin-bottom: 20px;
}

.fact {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 13px 16px;
  background: var(--surface);
}

.label {
  font-size: 13.5px;
  font-weight: 700;
  color: var(--ink-muted);
}

.value {
  font-size: 14px;
  font-weight: 700;
  text-align: right;
}

.value.reward {
  color: var(--coral);
}

.sighting-history {
  margin-bottom: 20px;
}

.timeline-state {
  padding: 16px;
  border-radius: var(--radius-md);
  background: var(--surface);
  color: var(--ink-muted);
  font-size: 13.5px;
  font-weight: 700;
  text-align: center;
}

.timeline-state.error {
  color: var(--coral);
}

.trajectory-card {
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background: var(--surface);
  box-shadow: var(--shadow-card);
}

.trajectory-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  margin: 0 2px 10px;
}

.trajectory-heading strong {
  font-size: 14px;
}

.trajectory-heading span {
  color: var(--ink-muted);
  font-size: 11.5px;
  font-weight: 700;
}

.trajectory-map :deep(.leaflet-map) {
  height: 280px;
}

.timeline {
  list-style: none;
  display: flex;
  flex-direction: column;
  margin-top: 14px;
}

.timeline-item {
  position: relative;
  display: grid;
  grid-template-columns: 18px 1fr;
  gap: 10px;
  padding-bottom: 14px;
}

.timeline-item:not(:last-child)::before {
  content: '';
  position: absolute;
  top: 16px;
  bottom: 0;
  left: 7px;
  width: 2px;
  background: var(--line);
}

.timeline-dot {
  width: 16px;
  height: 16px;
  margin-top: 14px;
  border: 4px solid var(--teal-soft);
  border-radius: 50%;
  background: var(--teal);
  z-index: 1;
}

.timeline-content {
  min-width: 0;
  padding: 12px 14px;
  border-radius: var(--radius-md);
  background: var(--surface);
  box-shadow: var(--shadow-card);
}

.timeline-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}

.timeline-head strong {
  font-size: 14px;
}

.timeline-head time {
  flex-shrink: 0;
  color: var(--ink-muted);
  font-size: 11.5px;
  font-weight: 700;
}

.timeline-content p {
  margin-top: 5px;
  color: var(--ink-muted);
  font-size: 13px;
  line-height: 1.45;
}

.sighting-thumbnail {
  position: relative;
  width: 72px;
  height: 72px;
  margin-top: 10px;
  border-radius: var(--radius-sm);
  overflow: hidden;
  background: #fcf9f2;
}

.sighting-thumbnail img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.verification-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--line);
}

.confirmation-count {
  color: var(--ink-muted);
  font-size: 11.5px;
  font-weight: 700;
}

.confirm-button {
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0 13px;
  border-radius: 999px;
  background: rgba(29, 99, 96, 0.1);
  color: #1d6360;
  font-size: 12px;
  font-weight: 800;
  transition:
    transform 0.2s cubic-bezier(0.4, 0, 0.2, 1),
    background-color 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.confirm-button:not(:disabled):active {
  transform: scale(0.98);
}

.confirm-button.confirmed {
  background: #1d6360;
  color: #fff;
}

.confirm-button:disabled {
  cursor: default;
  opacity: 0.78;
}

.confirmation-error {
  margin-top: 8px;
  color: #ef6351;
  font-size: 11.5px;
  font-weight: 700;
}

h3 {
  font-size: 16px;
  font-weight: 800;
  margin-bottom: 6px;
}

.desc {
  font-size: 14.5px;
  color: var(--ink-muted);
  line-height: 1.6;
  margin-bottom: 20px;
}

.owner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--surface);
  border-radius: var(--radius-md);
  padding: 14px 16px;
  box-shadow: var(--shadow-card);
  margin-bottom: 20px;
}

.owner-info {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  padding: 0;
  background: transparent;
  color: inherit;
  text-align: left;
}

.contact-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: 12px;
  flex-shrink: 0;
}

.owner-name {
  font-weight: 800;
  font-size: 15px;
}

.owner-role {
  font-size: 13px;
  color: var(--ink-muted);
  font-weight: 600;
}

.contact-action {
  min-height: 46px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  font-size: 12.5px;
  font-weight: 800;
  text-decoration: none;
  transition:
    transform 0.18s ease,
    box-shadow 0.18s ease,
    background-color 0.18s ease;
}

.contact-action:active {
  transform: scale(0.96);
}

.call {
  width: 46px;
  background: var(--teal);
  color: #fff;
  box-shadow: 0 5px 14px rgba(29, 99, 96, 0.2);
}

.whatsapp {
  padding: 0 13px;
  border: 1px solid rgba(29, 99, 96, 0.18);
  background: rgba(29, 99, 96, 0.1);
  color: #1d6360;
}

.contact-unavailable {
  max-width: 82px;
  margin-left: 12px;
  color: var(--ink-muted);
  font-size: 11.5px;
  font-weight: 700;
  line-height: 1.25;
  text-align: right;
}

.found-cta {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  padding: 17px 0;
  border-radius: var(--radius-md);
  background: var(--teal);
  color: #fff;
  font-size: 16px;
  font-weight: 800;
  box-shadow: var(--shadow-float);
  transition: transform 0.15s ease;
}

.found-cta:active {
  transform: scale(0.98);
}
</style>
