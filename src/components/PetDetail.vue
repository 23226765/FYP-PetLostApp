<template>
  <div class="detail">
    <div class="hero">
      <ManagedImage
        v-if="heroPhotoUrl && !heroPhotoFailed"
        :src="heroPhotoUrl"
        alt=""
        aria-hidden="true"
        @error="heroPhotoFailed = true"
      />
      <div v-else class="photo-placeholder hero-placeholder" aria-hidden="true">
        <AppIcon name="paw" :size="58" />
      </div>
      <span class="sr-only">{{ t('pets.missingPhotoAlt', { name: pet.name, type: pet.breed || speciesLabel(pet.species) }) }}</span>
      <button class="back" :aria-label="t('common.back')" @click="emit('close')">
        <AppIcon name="back" :size="20" />
      </button>
      <button
        class="save"
        :class="{ saved: isSaved(pet.id) }"
        type="button"
        :aria-label="isSaved(pet.id) ? t('pets.removeSaved', { name: pet.name }) : t('pets.savePost', { name: pet.name })"
        :aria-pressed="isSaved(pet.id)"
        @click="toggleSave(pet.id)"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          :fill="isSaved(pet.id) ? 'currentColor' : 'none'"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z" />
        </svg>
      </button>
      <button class="share" :aria-label="t('pets.sharePoster')" @click="emit('poster')">
        <AppIcon name="share" :size="19" />
      </button>
      <span class="badge" :class="currentStatus">
        {{ statusLabel }}
      </span>
    </div>

    <div class="sheet">
      <ContentImageEditor v-if="isOwner" type="pet" :id="pet.id" @updated="updatePetImages" />
      <div class="grab" />
      <div v-if="showCelebration" class="celebration-banner" role="status">
        <span aria-hidden="true">🎉</span>
        <div>
          <strong>{{ t('pets.homeTitle', { name: pet.name }) }}</strong>
          <p>{{ t('pets.closedHelp') }}</p>
        </div>
      </div>
      <div class="title-row">
        <div>
          <h2>{{ pet.name }}</h2>
          <p class="sub"><template v-if="pet.breed">{{ pet.breed }} · </template>{{ speciesLabel(pet.species) }}</p>
        </div>
        <span class="distance">
          <AppIcon name="pin" :size="15" />
          {{ t('radar.distanceAway', { distance: pet.distanceKm }) }}
        </span>
      </div>

      <div class="facts">
        <div class="fact">
          <span class="label">{{ t('pets.lastSeenLabel') }}</span>
          <span class="value">{{ pet.lastSeenAt ? formatRelativeDate(pet.lastSeenAt) : pet.lastSeen }}</span>
        </div>
        <div class="fact">
          <span class="label">{{ t('pets.locationLabel') }}</span>
          <span class="value">{{ pet.location }}</span>
        </div>
        <div v-if="pet.district" class="fact">
          <span class="label">{{ t('pets.districtLabel') }}</span>
          <span class="value">{{ districtLabel(pet.district) }}</span>
        </div>
        <div v-if="pet.reward" class="fact">
          <span class="label">{{ t('pets.rewardLabel') }}</span>
          <span class="value reward">{{ pet.reward }}</span>
        </div>
      </div>

      <section class="sighting-history" aria-labelledby="sighting-history-title">
        <h3 id="sighting-history-title">{{ t('sightings.history') }}</h3>
        <p v-if="sightingsLoading" class="timeline-state" role="status">
          {{ t('sightings.loadingHistory') }}
        </p>
        <p v-else-if="sightingsError" class="timeline-state error" role="alert">
          {{ sightingsError }}
        </p>
        <p v-else-if="sightings.length === 0" class="timeline-state">{{ t('sightings.noHistory') }}</p>
        <template v-else>
          <div class="trajectory-card">
            <div class="trajectory-heading">
              <strong>{{ t('sightings.routeTitle') }}</strong>
              <span>{{ t('sightings.recordedLocations', { count: trajectorySightings.length }, trajectorySightings.length) }}</span>
            </div>
            <p class="trajectory-disclaimer">
              {{ t('sightings.routeDisclaimer') }}
            </p>
            <MapView
              class="trajectory-map"
              :pets="[pet]"
              :sightings="trajectorySightings"
              :center="trajectoryCenter"
              :radius-km="0"
              :focused-sighting-id="activeSightingId"
              @sighting-open="focusTimelineSighting"
            />
          </div>
        <ol class="timeline">
          <li
            v-for="sighting in trajectorySightings"
            :id="`sighting-${sighting.id}`"
            :key="sighting.id"
            class="timeline-item"
            :class="{ focused: activeSightingId === sighting.id }"
            tabindex="0"
            @click="focusMapSighting(sighting.id)"
            @keydown.enter.prevent="focusMapSighting(sighting.id)"
            @keydown.space.prevent="focusMapSighting(sighting.id)"
          >
            <span class="timeline-dot" aria-hidden="true" />
            <div class="timeline-content">
              <div class="timeline-head">
                <strong>{{ sighting.locationName || t('sightings.locationNotProvided') }}</strong>
                <time
                  v-if="sighting.sightedAt || sighting.createdAt"
                  :datetime="String(sighting.sightedAt || sighting.createdAt)"
                >
                  {{ relativeTime(sighting.sightedAt || sighting.createdAt || '') }}
                </time>
              </div>
              <p v-if="sighting.note">{{ sighting.note }}</p>
              <ContentImageEditor v-if="user && sighting.reportedBy === user.id" type="sighting" :id="sighting.id" @updated="images => updateSightingImage(sighting.id, images)" />
              <div
                v-if="sighting.reporterName || sighting.reporterPhone"
                class="reporter-details"
              >
                <span>{{ t('sightings.reportedBy', { name: sighting.reporterName || t('sightings.communityMember') }) }}</span>
                <div class="reporter-actions">
                  <button
                    v-if="canMessageReporter(sighting)"
                    type="button"
                    @click="emit('chat-reporter', sighting.reportedBy!, sighting.reporterName)"
                  >
                    {{ t('sightings.messageReporter') }}
                  </button>
                  <a
                    v-if="reporterCallHref(sighting)"
                    :href="reporterCallHref(sighting)"
                    @click.stop
                  >
                    {{ t('sightings.callReporter') }}
                  </a>
                </div>
              </div>
              <div class="sighting-thumbnail" role="img" :aria-label="t('sightings.photoOf', { name: pet.name })">
                <ManagedImage
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
                  {{ t('sightings.confirmations', { count: sighting.confirmationCount || 0 }, sighting.confirmationCount || 0) }}
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
                      ? t('sightings.confirmed')
                      : confirmingSightings.has(sighting.id)
                        ? t('sightings.confirming')
                        : t('sightings.sawToo')
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
              <SafetyActions
                v-if="sighting.id"
                compact
                report-only
                target-type="sighting"
                :target-id="sighting.id"
                :user="user"
                @auth-needed="emit('auth-needed')"
              />
            </div>
          </li>
        </ol>
        </template>
      </section>

      <h3>{{ t('pets.about', { name: pet.name }) }}</h3>
      <p class="desc">{{ pet.description }}</p>

      <div class="owner">
        <div
          class="owner-info"
        >
          <span class="owner-name">{{ pet.owner }}</span>
          <span class="owner-role">{{ t('pets.ownerPosted', { time: pet.createdAt ? formatRelativeDate(pet.createdAt) : pet.postedAgo }) }}</span>
        </div>
        <div class="contact-actions">
          <button
            v-if="canMessageOwner"
            class="contact-action message"
            type="button"
            :aria-label="t('pets.messageOwner', { owner: pet.owner || t('pets.unknownPet') })"
            @click="emit('chat')"
          >
            {{ t('messages.message') }}
          </button>
          <a
            v-if="contactActions"
            class="contact-action call"
            :href="contactActions.callHref"
            :aria-label="t('pets.callOwner', { owner: pet.owner || t('pets.unknownPet') })"
          >
            <AppIcon name="phone" :size="19" />
          </a>
          <a
            v-if="contactActions"
            class="contact-action whatsapp"
            :href="contactActions.whatsappHref"
            target="_blank"
            rel="noopener noreferrer"
            :aria-label="t('pets.whatsappOwner', { owner: pet.owner || t('pets.unknownPet') })"
          >
            WhatsApp
          </a>
        </div>
        <span v-if="!canMessageOwner" class="contact-unavailable">{{ t('pets.yourReport') }}</span>
        <span
          v-else-if="!contactActions"
          class="contact-unavailable"
          :aria-label="t('pets.messagesOnlyA11y')"
        >
          {{ t('pets.messagesOnly') }}
        </span>
      </div>

      <SafetyActions
        v-if="!isOwner && pet.reportedBy"
        target-type="pet"
        :target-id="pet.id"
        :subject-user-id="pet.reportedBy"
        :subject-label="pet.owner"
        :user="user"
        :blocked="blockedOwner"
        @auth-needed="emit('auth-needed')"
        @blocked="blockedOwner = true"
      />

      <button
        v-if="isOwner && ['lost', 'sighted'].includes(currentStatus)"
        class="reunited-cta"
        type="button"
        @click="showReunionConfirm = true"
      >
        <span aria-hidden="true">🎉</span>
        {{ t('pets.markReunited') }}
      </button>
      <p v-if="reunionError" class="reunion-error" role="alert">{{ reunionError }}</p>

      <button
        v-if="currentStatus !== 'reunited'"
        class="found-cta"
        type="button"
        @click="emit('found')"
      >
        <AppIcon name="eye" :size="20" />
        {{ t('sightings.report') }}
      </button>
      <button v-else class="found-cta sightings-closed" type="button" disabled>
        <AppIcon name="check" :size="20" />
        {{ t('pets.sightingsClosed') }}
      </button>
    </div>

    <Transition name="fade">
      <div
        v-if="showReunionConfirm"
        class="reunion-scrim"
        @click.self="closeReunionConfirmation"
      >
        <section
          class="reunion-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reunion-dialog-title"
        >
          <span class="reunion-dialog-icon" aria-hidden="true">🎉</span>
          <h2 id="reunion-dialog-title">{{ t('pets.reunionQuestion') }}</h2>
          <p>{{ t('pets.reunionHelp', { name: pet.name }) }}</p>
          <div class="reunion-dialog-actions">
            <button
              class="cancel-reunion"
              type="button"
              :disabled="reunionSaving"
              @click="closeReunionConfirmation"
            >
              {{ t('pets.notYet') }}
            </button>
            <button
              class="confirm-reunion"
              type="button"
              :disabled="reunionSaving"
              @click="confirmReunion"
            >
              {{ reunionSaving ? t('pets.updating') : t('pets.yesHome') }}
            </button>
          </div>
        </section>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import ManagedImage from "./ManagedImage.vue"
import ContentImageEditor from './ContentImageEditor.vue'
import type { ManagedImage as ManagedImageData } from '../services/api'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { Pet, Sighting } from '../types/pet'
import type { User } from '../types/user'
import { confirmSighting, getPetSightings, updatePetStatus } from '../services/api'
import { useSavedPets } from '../composables/useSavedPets'
import { createContactActions } from '../utils/contact'
import { normalizeSightingHistory } from '../utils/sightings'
import AppIcon from './AppIcon.vue'
import MapView from './MapView.vue'
import SafetyActions from './SafetyActions.vue'
import { translateApiError, useAppI18n } from '../i18n'
import { districtLabel, formatRelativeDate, petStatusLabel, speciesLabel } from '../i18n/formatters'

const props = defineProps<{
  pet: Pet
  user?: User | null
  focusSightingId?: string
}>()
const emit = defineEmits<{
  close: []
  found: []
  poster: []
  chat: []
  'chat-reporter': [participantId: string, participantName?: string]
  'auth-needed': []
  'status-updated': [pet: Pet]
}>()

const { isSaved, toggleSave } = useSavedPets()
const { t } = useAppI18n()

const sightings = ref<Sighting[]>([])
const sightingsLoading = ref(true)
const sightingsError = ref('')
const heroPhotoFailed = ref(false)
const failedSightingPhotos = ref<Set<string>>(new Set())
const confirmingSightings = ref<Set<string>>(new Set())
const confirmationErrors = ref<Record<string, string>>({})
const currentStatus = ref<Pet['status']>(props.pet.status)
const showReunionConfirm = ref(false)
const reunionSaving = ref(false)
const reunionError = ref('')
const showCelebration = ref(false)
const blockedOwner = ref(Boolean(props.pet.interactionBlocked))
const activeSightingId = ref<string | undefined>(props.focusSightingId)
const heroPhotoUrl = computed(() => normalizedImageUrl(props.pet.photo))
function updatePetImages(images: ManagedImageData[]) {
  heroPhotoFailed.value = false
  emit('status-updated', { ...props.pet, photo: images[0]?.url || '', photos: images.map((image) => image.url) })
}
function updateSightingImage(id: string, images: ManagedImageData[]) {
  sightings.value = sightings.value.map((sighting) => sighting.id === id ? { ...sighting, photo: images[0]?.url || '' } : sighting)
  failedSightingPhotos.value = new Set()
}
const isOwner = computed(() => {
  const legacyUserId = (props.user as (User & { _id?: string }) | null | undefined)?._id
  const userId = props.user?.id || legacyUserId
  return Boolean(userId && props.pet.reportedBy && String(props.pet.reportedBy) === String(userId))
})
const statusLabel = computed(() => petStatusLabel(currentStatus.value))
const trajectorySightings = computed(() => normalizeSightingHistory(sightings.value))
const trajectoryCenter = computed(() => {
  const first = trajectorySightings.value.find((sighting) => sighting.coordinates?.length === 2)
  if (first) return { lat: first.coordinates[1], lng: first.coordinates[0] }
  if (props.pet.coordinates?.length === 2) {
    return { lat: props.pet.coordinates[1], lng: props.pet.coordinates[0] }
  }
  return null
})
const contactActions = computed(() => {
  if (blockedOwner.value) return null
  if (!props.pet.canViewContact) return null
  const location = props.pet.location ? `, ${t('pets.lastSeenAt', { location: props.pet.location })}` : ''
  const message = t('pets.contactMessage', { name: props.pet.name, location })
  return createContactActions(props.pet.ownerPhone, message)
})
const canMessageOwner = computed(() => !isOwner.value && !blockedOwner.value)

watch(heroPhotoUrl, () => {
  heroPhotoFailed.value = false
})

watch(
  () => props.pet.status,
  (status) => {
    currentStatus.value = status
  },
)

watch(
  () => props.pet.id,
  () => {
    blockedOwner.value = Boolean(props.pet.interactionBlocked)
    showReunionConfirm.value = false
    reunionSaving.value = false
    reunionError.value = ''
    showCelebration.value = false
  },
)

function closeReunionConfirmation() {
  if (reunionSaving.value) return
  showReunionConfirm.value = false
}

async function confirmReunion() {
  if (!isOwner.value || !['lost', 'sighted'].includes(currentStatus.value) || reunionSaving.value) return

  reunionSaving.value = true
  reunionError.value = ''
  try {
    const updatedPet = await updatePetStatus(props.pet.id, 'reunited')
    currentStatus.value = updatedPet.status
    showReunionConfirm.value = false
    showCelebration.value = true
    emit('status-updated', updatedPet)
  } catch (error) {
    reunionError.value = translateApiError(error, 'errors.markReunited')
    showReunionConfirm.value = false
  } finally {
    reunionSaving.value = false
  }
}

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
  return sighting.id
}

function reporterCallHref(sighting: Sighting): string {
  if (!sighting.canViewContact) return ''
  return createContactActions(sighting.reporterPhone, '')?.callHref || ''
}

function canMessageReporter(sighting: Sighting): boolean {
  return Boolean(isOwner.value && sighting.reportedBy && sighting.reportedBy !== props.user?.id)
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
      [sightingId]: translateApiError(error, 'errors.confirmSighting'),
    }
  } finally {
    const next = new Set(confirmingSightings.value)
    next.delete(sightingId)
    confirmingSightings.value = next
  }
}

async function loadSightings() {
  const request = ++sightingsRequestSequence
  sightingsLoading.value = true
  sightingsError.value = ''
  sightings.value = []
  failedSightingPhotos.value = new Set()
  confirmingSightings.value = new Set()
  confirmationErrors.value = {}
  try {
    const result = await getPetSightings(props.pet.id)
    if (request !== sightingsRequestSequence) return
    sightings.value = normalizeSightingHistory(result)
    await focusRequestedSighting()
  } catch (error) {
    if (request !== sightingsRequestSequence) return
    sightings.value = []
    sightingsError.value = translateApiError(error, 'errors.loadSightings')
  } finally {
    if (request === sightingsRequestSequence) sightingsLoading.value = false
  }
}

let sightingsRequestSequence = 0

async function focusRequestedSighting() {
  if (!props.focusSightingId) return
  activeSightingId.value = props.focusSightingId
  await nextTick()
  document.getElementById(`sighting-${props.focusSightingId}`)?.scrollIntoView({
    behavior: 'smooth',
    block: 'center',
  })
}

async function focusMapSighting(sightingId: string) {
  activeSightingId.value = undefined
  await nextTick()
  activeSightingId.value = sightingId
}

async function focusTimelineSighting(sightingId: string) {
  activeSightingId.value = sightingId
  await nextTick()
  document.getElementById(`sighting-${sightingId}`)?.scrollIntoView({
    behavior: 'smooth',
    block: 'center',
  })
}

const relativeTime = formatRelativeDate

watch(
  [() => props.pet.id, () => props.user?.id],
  () => {
    sightingsRequestSequence += 1
    sightings.value = []
    void loadSightings()
  },
  { immediate: true },
)
watch(() => props.focusSightingId, () => void focusRequestedSighting())

onBeforeUnmount(() => {
  sightingsRequestSequence += 1
})
</script>

<style scoped>
.detail {
  font-family: var(--font-feed);
  max-width: 480px;
  margin: 0 auto;
  position: fixed;
  inset: 0;
  z-index: 45;
  background: var(--bg);
  overflow-y: auto;
}

.hero {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 220px;
  padding-top: calc(var(--safe-top) + 70px);
  width: 100%;
  overflow: hidden;
  background: var(--color-surface-subtle);
}

.hero img {
  width: 100%;
  height: auto;
  object-fit: contain;
}

.photo-placeholder {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background:
    radial-gradient(circle at 50% 42%, rgba(29, 99, 96, 0.12), transparent 34%),
    var(--color-surface-subtle);
  color: rgba(29, 99, 96, 0.55);
}
.hero-placeholder { position: relative; inset: auto; min-height: 220px; }

.back,
.save,
.share {
  position: absolute;
  top: calc(var(--safe-top) + 14px);
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--color-surface);
  color: var(--color-icon-primary);
  box-shadow: var(--shadow-card);
}

.back {
  left: 16px;
}

.save {
  right: 66px;
  color: var(--color-icon-primary);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.save.saved {
  background: #1d6360;
  color: #fff;
}

.save:active {
  transform: scale(0.94);
}

.share {
  right: 16px;
}

.badge {
  position: static;
  align-self: flex-start;
  margin: 12px 16px;
  padding: 5px 14px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-accent);
  background: var(--status-teal-bg);
}

.badge.lost {
  background: var(--status-coral-bg);
  color: var(--color-text-urgent);
}

.badge.sighted {
  background: var(--status-teal-bg);
}

.badge.reunited {
  background: var(--status-teal-bg);
}

.sheet {
  position: relative;
  margin-top: 0;
  background: var(--bg);
  border-radius: 0;
  padding: 10px 16px calc(var(--safe-bottom) + 28px);
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

.celebration-banner {
  display: flex;
  align-items: flex-start;
  gap: 11px;
  margin-bottom: 16px;
  padding: 14px 16px;
  border: 1px solid rgba(29, 99, 96, 0.18);
  border-radius: 14px;
  background: rgba(29, 99, 96, 0.1);
  color: var(--color-text-accent);
}

.celebration-banner > span {
  font-size: 22px;
  line-height: 1;
}

.celebration-banner strong {
  display: block;
  font-size: 14px;
  font-weight: 800;
}

.celebration-banner p {
  margin-top: 3px;
  font-size: 12.5px;
  font-weight: 600;
  line-height: 1.4;
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
  color: var(--color-text-accent);
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
  color: var(--color-text-urgent);
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
  color: var(--color-text-urgent);
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

.trajectory-disclaimer {
  margin: -4px 2px 10px;
  color: var(--ink-muted);
  font-size: 11px;
  font-weight: 600;
  line-height: 1.45;
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

.timeline-item:focus-visible {
  outline: 3px solid rgba(29, 99, 96, 0.22);
  outline-offset: 3px;
  border-radius: 14px;
}

.timeline-item.focused .timeline-content {
  outline: 3px solid rgba(239, 99, 81, 0.3);
  box-shadow:
    0 0 0 1px #ef6351,
    var(--shadow-card);
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

.reporter-details {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 9px;
  padding: 9px 10px;
  border-radius: 10px;
  background: rgba(29, 99, 96, 0.08);
  color: var(--color-text-accent);
  font-size: 12px;
  font-weight: 700;
}

.reporter-details a {
  flex-shrink: 0;
  color: var(--color-icon-primary);
  font-weight: 800;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.reporter-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.reporter-actions button,
.reporter-actions a {
  min-height: 32px;
  padding: 0 10px;
  border-radius: 999px;
  background: #1d6360;
  color: #fff;
  font-size: 11.5px;
  font-weight: 800;
  text-decoration: none;
}

.sighting-thumbnail {
  position: relative;
  width: 72px;
  height: 72px;
  margin-top: 10px;
  border-radius: var(--radius-sm);
  overflow: hidden;
  background: var(--color-surface-subtle);
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
  color: var(--color-text-accent);
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
  border-color: var(--color-disabled-border);
  background: var(--color-disabled-surface);
  color: var(--color-disabled-text);
}

.confirmation-error {
  margin-top: 8px;
  color: var(--color-text-urgent);
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

.contact-action.message {
  min-width: 92px;
  padding: 0 14px;
  border-radius: 999px;
  background: #1d6360;
  color: #fff;
  font-size: 12.5px;
  font-weight: 800;
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
  color: var(--color-text-accent);
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

.reunited-cta {
  width: 100%;
  min-height: 52px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-bottom: 10px;
  border: 1px solid rgba(29, 99, 96, 0.2);
  border-radius: var(--radius-md);
  background: rgba(29, 99, 96, 0.1);
  color: var(--color-icon-primary);
  font-size: 15px;
  font-weight: 800;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.reunited-cta:active {
  transform: scale(0.98);
  background: rgba(29, 99, 96, 0.16);
}

.reunion-error {
  margin: 0 4px 10px;
  color: var(--color-text-urgent);
  font-size: 12.5px;
  font-weight: 700;
  text-align: center;
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

.found-cta.sightings-closed {
  background: rgba(29, 99, 96, 0.12);
  color: var(--color-text-accent);
  box-shadow: none;
  cursor: not-allowed;
  opacity: 1;
}

.reunion-scrim {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 22px;
  background: rgba(20, 35, 34, 0.52);
  backdrop-filter: blur(3px);
}

.reunion-dialog {
  width: min(100%, 400px);
  padding: 24px 20px 20px;
  border-radius: 18px;
  background: var(--color-surface-elevated);
  color: var(--color-text-primary);
  box-shadow: 0 22px 60px rgba(20, 35, 34, 0.3);
  text-align: center;
}

.reunion-dialog-icon {
  width: 54px;
  height: 54px;
  display: grid;
  place-items: center;
  margin: 0 auto 12px;
  border-radius: 50%;
  background: rgba(29, 99, 96, 0.1);
  font-size: 26px;
}

.reunion-dialog h2 {
  color: var(--ink);
  font-size: 20px;
  line-height: 1.25;
}

.reunion-dialog > p {
  margin: 9px auto 20px;
  max-width: 330px;
  color: var(--ink-muted);
  font-size: 13.5px;
  font-weight: 600;
  line-height: 1.5;
}

.reunion-dialog-actions {
  display: grid;
  grid-template-columns: 1fr 1.35fr;
  gap: 10px;
}

.reunion-dialog-actions button {
  min-height: 46px;
  border-radius: 12px;
  font-size: 13.5px;
  font-weight: 800;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.reunion-dialog-actions button:not(:disabled):active {
  transform: scale(0.98);
}

.reunion-dialog-actions button:disabled {
  cursor: wait;
  border-color: var(--color-disabled-border);
  background: var(--color-disabled-surface);
  color: var(--color-disabled-text);
  box-shadow: none;
}

.cancel-reunion {
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--ink-muted);
}

.confirm-reunion {
  background: #1d6360;
  color: #fff;
  box-shadow: 0 8px 20px rgba(29, 99, 96, 0.24);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
