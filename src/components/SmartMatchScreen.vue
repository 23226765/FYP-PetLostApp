<template>
  <!--
    ════════════════════════════════════════════════════════════════
    SmartMatchScreen.vue
    ════════════════════════════════════════════════════════════════
    Photo-assisted manual comparison screen. Two visual states:

      1. IDLE      → dashed upload dropzone with paw icon
      2. RESULTS   → "Potential Matches" list reusing the exact
                     PetCard visual language, with an added coral
                     review-priority badge on every card

    Design tokens used (all from style.css — no new colors):
      --teal, --teal-soft, --coral, --surface, --bg, --ink,
      --ink-muted, --line, --radius-lg/md/sm, --shadow-card/float
    ════════════════════════════════════════════════════════════════
  -->
  <div ref="screenRoot" class="smart-match">

    <!-- ─────────── Sticky header ─────────── -->
    <header class="top">
      <button class="back-btn" :aria-label="t('common.back')" @click="emit('close')">
        <AppIcon name="back" :size="22" />
      </button>
      <h1>{{ t('smartMatch.title') }}</h1>
      <span class="spacer" aria-hidden="true" />
    </header>

    <!-- ─────────── Intro copy ─────────── -->
    <section v-if="state === 'idle'" class="intro">
      <h2>{{ t('smartMatch.introTitle') }}</h2>
      <p>{{ t('smartMatch.introHelp') }}</p>
    </section>

    <!-- ═══════════════════════════════════════════
         STATE 1 — IDLE: upload dropzone
    ═══════════════════════════════════════════ -->
    <div v-if="state === 'idle'" class="upload-zone-wrap">
      <div class="criteria-card">
        <label class="criteria-field">
          <span>{{ t('smartMatch.observedSpecies') }}</span>
          <select v-model="observationSpecies">
            <option value="Dog">{{ speciesLabel('Dog') }}</option>
            <option value="Cat">{{ speciesLabel('Cat') }}</option>
            <option value="Other">{{ speciesLabel('Other') }}</option>
          </select>
        </label>
        <label class="criteria-field">
          <span>{{ t('smartMatch.observedBreed') }} <small>({{ t('common.optional') }})</small></span>
          <input
            v-model.trim="observationBreed"
            type="text"
            maxlength="120"
            :placeholder="t('smartMatch.breedPlaceholder')"
          />
        </label>
      </div>

      <div class="location-context">
        <span class="location-context-icon" aria-hidden="true">
          <AppIcon name="pin" :size="18" />
        </span>
        <label for="match-location">
          <strong>{{ t('smartMatch.sightingLocation', { location: selectedDistrict ? districtLabel(selectedDistrict) : t('smartMatch.currentGps') }) }}</strong>
          <span>{{ t('smartMatch.distanceHelp') }}</span>
        </label>
        <select id="match-location" v-model="selectedDistrict" :aria-label="t('smartMatch.sightingLocationLabel')">
          <option value="">{{ t('smartMatch.currentGps') }}</option>
          <option v-for="district in HK_DISTRICTS" :key="district" :value="district">
            {{ districtLabel(district) }}
          </option>
        </select>
      </div>

      <button
        class="upload-zone"
        :class="{ dragging: isDragging, 'has-photo': uploadedPhoto }"
        :disabled="isLoading"
        :aria-label="t('smartMatch.uploadAria')"
        @click="triggerFilePicker"
        @dragover.prevent="isDragging = true"
        @dragleave.prevent="isDragging = false"
        @drop.prevent="onDrop"
      >
        <img
          v-if="normalizedImageUrl(uploadedPhoto) && !uploadedPhotoFailed"
          :src="normalizedImageUrl(uploadedPhoto)"
          class="selected-upload-photo"
          :alt="t('smartMatch.selectedPhotoAlt')"
          @error="uploadedPhotoFailed = true"
        />
        <template v-else>
          <span class="upload-icon">
            <AppIcon name="camera" :size="30" />
          </span>
          <span class="upload-title">
            {{ uploadedPhoto ? t('smartMatch.photoUnavailable') : t('smartMatch.tapUpload') }}
          </span>
          <span class="upload-sub">{{ t('smartMatch.dragDrop') }}</span>
        </template>
        <span v-if="uploadedPhoto && !uploadedPhotoFailed" class="change-photo">
          <AppIcon name="camera" :size="15" />
          {{ t('sightings.changePhoto') }}
        </span>
      </button>

      <!-- Hidden native file input -->
      <input
        ref="fileInput"
        type="file"
        accept="image/*"
        class="sr-only"
        @change="onFileSelected"
      />

      <!-- Demo shortcut so the flow is testable without a real file -->
      <button class="demo-btn" :disabled="isLoading" @click="selectPhoto(demoPhoto)">
        <AppIcon name="paw" :size="17" />
        {{ t('smartMatch.useSample') }}
      </button>

      <button
        class="btn-primary"
        :disabled="isLoading || !uploadedPhoto"
        @click="handleFindMatches"
      >
        <span v-if="isLoading" class="button-spinner" aria-hidden="true" />
        {{ isLoading ? t('smartMatch.finding') : t('smartMatch.find') }}
      </button>
      <p v-if="matchError" class="form-error" role="alert">{{ matchError }}</p>
    </div>

    <!-- ═══════════════════════════════════════════
         STATE 2 — RESULTS: Potential Matches list
    ═══════════════════════════════════════════ -->
    <template v-else>

      <!-- Thumbnail of what was scanned -->
      <div class="scanned-summary">
        <div class="scanned-thumb" role="img" :aria-label="t('smartMatch.uploadedPhotoAria')">
          <img
            v-if="normalizedImageUrl(uploadedPhoto) && !uploadedPhotoFailed"
            :src="normalizedImageUrl(uploadedPhoto)"
            alt=""
            aria-hidden="true"
            @error="uploadedPhotoFailed = true"
          />
          <div v-else class="photo-placeholder" aria-hidden="true">
            <AppIcon name="paw" :size="23" />
          </div>
        </div>
        <div class="scanned-info">
          <span class="scanned-title">{{ t('smartMatch.comparisonReady') }}</span>
          <span class="scanned-sub">{{ t('smartMatch.rankedReports', { count: matches.length, location: resolvedLocationLabel }, matches.length) }}</span>
        </div>
        <button class="rescan-btn" :aria-label="t('smartMatch.scanAnother')" @click="reset">
          <AppIcon name="close" :size="16" />
        </button>
      </div>

      <h2 class="section-title">{{ t('smartMatch.topMatches') }}</h2>

      <!-- Match feed — PetCard structure + confidence badge -->
      <TransitionGroup name="match" tag="div" class="match-feed">
        <article
          v-for="(m, i) in matches"
          :key="m.id"
          class="card"
          :style="{ transitionDelay: i * 60 + 'ms' }"
          @click="emit('open-match', m)"
        >
          <div class="photo-wrap">
            <img
              v-if="normalizedImageUrl(m.photo) && !failedMatchImages.has(m.id)"
              :src="normalizedImageUrl(m.photo)"
              alt=""
              aria-hidden="true"
              loading="lazy"
              @error="markMatchPhotoFailed(m.id)"
            />
            <div v-else class="photo-placeholder" aria-hidden="true">
              <AppIcon name="paw" :size="42" />
            </div>
            <span class="sr-only">{{ t('pets.photoAlt', { name: m.name }) }}</span>

            <!-- Original status badge (unchanged pattern) -->
            <span class="badge" :class="m.status">
              {{ petStatusLabel(m.status).toLocaleUpperCase(locale) }}
            </span>

            <!-- ★ NEW: prominent coral Confidence Score badge ★ -->
            <span class="confidence-badge" :class="confidenceTier(m.confidence)">
              <span class="conf-pct">{{ m.confidence }}%</span>
              <span class="conf-label">{{ t('smartMatch.match') }}</span>
            </span>

            <span v-if="m.breakdown.distanceKm !== null" class="distance">
              <AppIcon name="pin" :size="14" />
              {{ t('common.kilometres', { count: m.breakdown.distanceKm }) }}
            </span>
          </div>

          <div class="body">
            <div class="row">
              <h3>{{ m.name }}</h3>
              <span class="posted">{{ m.createdAt ? formatRelativeDate(m.createdAt) : m.postedAgo }}</span>
            </div>
            <p class="meta">
              {{ m.breed ? `${m.breed} · ` : '' }}{{ t('smartMatch.lastSeen', { value: m.lastSeenAt ? formatRelativeDate(m.lastSeenAt) : m.lastSeen }) }}
            </p>

            <!-- Confidence meter bar -->
            <div class="conf-meter">
              <div
                class="conf-meter-fill"
                :class="confidenceTier(m.confidence)"
                :style="{ width: m.confidence + '%' }"
              />
            </div>
            <p class="conf-reason">
              <AppIcon name="check" :size="13" />
              {{ matchReason(m) }}
            </p>
            <dl class="score-breakdown" :aria-label="t('smartMatch.breakdownAria')">
              <div><dt>{{ t('pets.species') }}</dt><dd>{{ m.breakdown.species }}/30</dd></div>
              <div><dt>{{ t('pets.breed') }}</dt><dd>{{ m.breakdown.breed }}/25</dd></div>
              <div><dt>{{ t('smartMatch.distance') }}</dt><dd>{{ m.breakdown.distance }}/25</dd></div>
              <div><dt>{{ t('smartMatch.recency') }}</dt><dd>{{ m.breakdown.recency }}/20</dd></div>
            </dl>
            <p class="sighting-count">
              <AppIcon name="eye" :size="13" />
              {{ t('smartMatch.sightingsLogged', { count: m.sightingCount }, m.sightingCount) }}
            </p>

            <div class="actions">
              <button class="found-btn" @click.stop="emit('confirm-match', m)">
                <AppIcon name="eye" :size="17" />
                {{ t('smartMatch.thisIsThem') }}
              </button>
              <span v-if="m.reward" class="reward">{{ t('smartMatch.reward', { value: m.reward }) }}</span>
            </div>
          </div>
        </article>
      </TransitionGroup>

      <!-- No-match footer -->
      <div class="no-match">
        <p v-if="matchError" class="match-error" role="alert">{{ matchError }}</p>
        <p v-else-if="matches.length === 0">{{ t('smartMatch.noMatches') }}</p>
        <p v-else>{{ t('smartMatch.noneRight') }}</p>
        <button class="no-match-btn" @click="emit('post-instead')">
          <AppIcon name="plus" :size="17" />
          {{ t('smartMatch.postNewSighting') }}
        </button>
      </div>
    </template>

  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref } from 'vue'
import { Camera, CameraResultType } from '@capacitor/camera'
import { HK_DISTRICTS, type HongKongDistrict, type Pet } from '../types/pet'
import { getSmartMatches, type SmartMatchCandidate } from '../services/api'
import { getCurrentLocation } from '../services/geolocation'
import AppIcon from './AppIcon.vue'
import { translateApiError, useAppI18n } from '../i18n'
import { districtLabel, formatRelativeDate, petStatusLabel, speciesLabel } from '../i18n/formatters'

const { t, locale } = useAppI18n()

const props = defineProps<{
  /** Retained for backwards compatibility; candidates now come from one server request. */
  pets?: Pet[]
  userLocation?: { lat: number; lng: number } | null
}>()

/* ── Emits ──────────────────────────────────────────────
   close          → dismiss the screen
   open-match     → user tapped a match card (open PetDetail)
   confirm-match  → user tapped "This is them"
   post-instead   → user found no match, wants to post new
   ────────────────────────────────────────────────────── */
const emit = defineEmits<{
  close: []
  'open-match': [match: MatchResult]
  'confirm-match': [match: MatchResult]
  'post-instead': []
}>()

/* ── Types ─────────────────────────────────────────── */
type MatchResult = SmartMatchCandidate

type ScreenState = 'idle' | 'results'

type Coordinates = { lat: number; lng: number }

const DISTRICT_CENTERS: Record<HongKongDistrict, Coordinates> = {
  'Central and Western': { lat: 22.2867, lng: 114.145 },
  Eastern: { lat: 22.2841, lng: 114.2242 },
  Southern: { lat: 22.2472, lng: 114.1588 },
  'Wan Chai': { lat: 22.2774, lng: 114.1738 },
  'Kowloon City': { lat: 22.3282, lng: 114.1916 },
  'Kwun Tong': { lat: 22.3133, lng: 114.2258 },
  'Sham Shui Po': { lat: 22.3307, lng: 114.1622 },
  'Wong Tai Sin': { lat: 22.342, lng: 114.193 },
  'Yau Tsim Mong': { lat: 22.3117, lng: 114.1693 },
  Islands: { lat: 22.2622, lng: 113.9461 },
  'Kwai Tsing': { lat: 22.3549, lng: 114.104 },
  North: { lat: 22.4947, lng: 114.1381 },
  'Sai Kung': { lat: 22.383, lng: 114.2708 },
  'Sha Tin': { lat: 22.3872, lng: 114.1953 },
  'Tai Po': { lat: 22.4509, lng: 114.1642 },
  'Tsuen Wan': { lat: 22.3717, lng: 114.1134 },
  'Tuen Mun': { lat: 22.391, lng: 113.9771 },
  'Yuen Long': { lat: 22.4456, lng: 114.0222 },
}

/* ── State ─────────────────────────────────────────── */
const state = ref<ScreenState>('idle')
const uploadedPhoto = ref<string>('')
const uploadedPhotoFailed = ref(false)
const isDragging = ref(false)
const isLoading = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const screenRoot = ref<HTMLElement | null>(null)
const failedMatchImages = ref<Set<string>>(new Set())
const observationSpecies = ref<Pet['species']>('Dog')
const observationBreed = ref('')
const selectedDistrict = ref<HongKongDistrict | ''>('')
const resolvedLocationMode = ref<'gps' | 'district' | 'fallback'>('gps')
const resolvedLocationLabel = computed(() => {
  if (resolvedLocationMode.value === 'district' && selectedDistrict.value) {
    return t('smartMatch.districtCentre', { district: districtLabel(selectedDistrict.value) })
  }
  return resolvedLocationMode.value === 'fallback'
    ? t('smartMatch.hkCentreFallback')
    : t('smartMatch.currentGps')
})
const matchError = ref('')

let matchRequest: AbortController | null = null
let requestSequence = 0

/* Sample photo so the flow is demoable without a real upload */
const demoPhoto =
  'https://images.unsplash.com/photo-1552053831-71594a27632d?w=800&q=80'

/* Server-ranked reports with an explainable score for every factor. */
const matches = ref<MatchResult[]>([])

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

function markMatchPhotoFailed(id: string) {
  failedMatchImages.value = new Set([...failedMatchImages.value, id])
}

/* ── Upload handling ───────────────────────────────── */
async function triggerFilePicker() {
  try {
    const image = await Camera.getPhoto({
      resultType: CameraResultType.DataUrl,
      quality: 85,
      allowEditing: false,
    })

    if (image.dataUrl) selectPhoto(image.dataUrl)
  } catch {
    // Preserve the browser file picker when the Camera plugin is unavailable.
    fileInput.value?.click()
  }
}

function onFileSelected(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) readAndSelect(file)
}

function onDrop(e: DragEvent) {
  isDragging.value = false
  const file = e.dataTransfer?.files?.[0]
  if (file && file.type.startsWith('image/')) readAndSelect(file)
}

function readAndSelect(file: File) {
  if (file.size > 10 * 1024 * 1024) {
    matchError.value = t('smartMatch.imageTooLarge')
    return
  }

  const reader = new FileReader()
  reader.onload = () => {
    if (typeof reader.result === 'string') selectPhoto(reader.result)
  }
  reader.onerror = () => {
    matchError.value = t('errors.readImage')
  }
  reader.readAsDataURL(file)
}

function selectPhoto(photoSrc: string) {
  uploadedPhoto.value = photoSrc
  uploadedPhotoFailed.value = false
  failedMatchImages.value = new Set()
  matchError.value = ''
}

async function handleFindMatches() {
  if (isLoading.value || !uploadedPhoto.value) return

  cancelMatchRequest()
  const sequence = ++requestSequence
  const controller = new AbortController()
  matchRequest = controller
  isLoading.value = true
  matchError.value = ''

  try {
    const coordinates = await resolveObservationCoordinates()
    const rankedMatches = await getSmartMatches(
      {
        species: observationSpecies.value,
        breed: observationBreed.value || undefined,
        coordinates: [coordinates.lng, coordinates.lat],
        limit: 20,
      },
      controller.signal,
    )
    if (sequence !== requestSequence) return
    matches.value = rankedMatches
    state.value = 'results'
    await nextTick()
    screenRoot.value?.scrollTo({ top: 0, behavior: 'smooth' })
  } catch (error) {
    if (sequence !== requestSequence) return
    matches.value = []
    matchError.value = translateApiError(error, 'smartMatch.calculateError')
  } finally {
    if (sequence === requestSequence) {
      if (matchRequest === controller) matchRequest = null
      isLoading.value = false
    }
  }
}

async function resolveObservationCoordinates(): Promise<Coordinates> {
  if (selectedDistrict.value) {
    resolvedLocationMode.value = 'district'
    return DISTRICT_CENTERS[selectedDistrict.value]
  }

  if (props.userLocation) {
    resolvedLocationMode.value = 'gps'
    return props.userLocation
  }

  try {
    const coordinates = await getCurrentLocation()
    resolvedLocationMode.value = 'gps'
    return coordinates
  } catch {
    resolvedLocationMode.value = 'fallback'
    return { lat: 22.3193, lng: 114.1694 }
  }
}

function reset() {
  cancelMatchRequest()
  state.value = 'idle'
  isLoading.value = false
  uploadedPhoto.value = ''
  uploadedPhotoFailed.value = false
  failedMatchImages.value = new Set()
  matchError.value = ''
  if (fileInput.value) fileInput.value.value = ''
}

function cancelMatchRequest() {
  requestSequence += 1
  matchRequest?.abort()
  matchRequest = null
}

onUnmounted(cancelMatchRequest)

function matchReason(match: MatchResult): string {
  const breedText = observationBreed.value
    ? t('smartMatch.breedScore', { score: match.breakdown.breed })
    : t('smartMatch.noBreed')
  const ageText = match.breakdown.daysAgo === null
    ? t('smartMatch.unknownAge')
    : t('smartMatch.daysSince', { count: match.breakdown.daysAgo })
  return t('smartMatch.reason', {
    breed: breedText,
    distance: match.breakdown.distance,
    age: ageText,
  })
}

/* ── Confidence tiering (drives badge + meter colour) ── */
function confidenceTier(score: number): 'high' | 'mid' | 'low' {
  if (score >= 85) return 'high'
  if (score >= 60) return 'mid'
  return 'low'
}
</script>

<style scoped>
/* ═══════════════════════════════════════════
   Screen shell — matches every other overlay
═══════════════════════════════════════════ */
.smart-match {
  position: fixed;
  inset: 0;
  z-index: 50;
  background: var(--bg);
  overflow-y: auto;
  overscroll-behavior: contain;
  max-width: 480px;
  margin: 0 auto;
  padding-bottom: calc(var(--safe-bottom) + 40px);
}

/* ── Sticky header (identical to Settings/History) ── */
.top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: calc(var(--safe-top) + 14px) 18px 14px;
  position: sticky;
  top: 0;
  background: rgba(252, 249, 242, 0.92);
  backdrop-filter: blur(10px);
  z-index: 10;
  border-bottom: 1px solid var(--line);
}

.back-btn {
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--surface);
  box-shadow: var(--shadow-card);
  color: var(--ink);
}

h1 { font-size: 17px; font-weight: 800; }
.spacer { width: 40px; }

/* ── Intro ── */
.intro { padding: 22px 20px 4px; }
.intro h2 { font-size: 20px; font-weight: 800; margin-bottom: 6px; }
.intro p {
  font-size: 14px;
  color: var(--ink-muted);
  font-weight: 600;
  line-height: 1.6;
  text-wrap: pretty;
}

/* ═══════════════════════════════════════════
   STATE 1 — Upload dropzone
═══════════════════════════════════════════ */
.upload-zone-wrap { padding: 20px; display: flex; flex-direction: column; gap: 14px; }

.criteria-card {
  display: grid;
  grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr);
  gap: 12px;
  padding: 14px;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--surface);
  box-shadow: var(--shadow-card);
}

.criteria-field {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 6px;
}

.criteria-field > span {
  font-size: 12px;
  font-weight: 800;
  color: var(--ink);
}

.criteria-field small {
  font-size: 10.5px;
  font-weight: 650;
  color: var(--ink-muted);
}

.criteria-field select,
.criteria-field input {
  width: 100%;
  min-height: 44px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  padding: 0 11px;
  background: var(--bg);
  color: var(--ink);
  font: inherit;
  font-size: 14px;
  font-weight: 650;
  outline: none;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.criteria-field select:focus,
.criteria-field input:focus {
  border-color: var(--color-border-accent);
  box-shadow: 0 0 0 3px rgba(29, 99, 96, 0.12);
}

.location-context {
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr) minmax(112px, 0.8fr);
  align-items: center;
  gap: 10px;
  padding: 11px 12px;
  border: 1px solid rgba(29, 99, 96, 0.14);
  border-radius: 12px;
  background: rgba(29, 99, 96, 0.08);
  color: var(--color-text-accent);
}

.location-context-icon {
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--color-surface-elevated);
  box-shadow: 0 3px 10px rgba(29, 99, 96, 0.12);
}

.location-context label {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.location-context strong {
  overflow: hidden;
  font-size: 12.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.location-context label span {
  font-size: 10.5px;
  color: var(--ink-muted);
}

.location-context select {
  width: 100%;
  min-height: 38px;
  border: 1px solid rgba(29, 99, 96, 0.18);
  border-radius: 10px;
  padding: 0 8px;
  background: var(--input-bg);
  color: var(--color-icon-primary);
  font: inherit;
  font-size: 11px;
  font-weight: 750;
  outline: none;
}

.upload-zone {
  position: relative;
  width: 100%;
  aspect-ratio: 4 / 3;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: var(--surface);
  border: 2px dashed var(--line);
  border-radius: var(--radius-lg);
  overflow: hidden;
  transition: border-color 0.18s ease, background 0.18s ease, transform 0.15s ease;
}

.upload-zone:active { transform: scale(0.985); }

.upload-zone.dragging,
.upload-zone:not(:disabled):hover {
  border-color: var(--color-border-accent);
  background: var(--color-surface-selected);
}

.upload-zone.has-photo { border-style: solid; border-color: rgba(29, 99, 96, 0.2); }
.upload-zone:disabled { cursor: wait; }

.selected-upload-photo {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.change-photo {
  position: absolute;
  right: 12px;
  bottom: 12px;
  display: inline-flex;
  min-height: 36px;
  align-items: center;
  gap: 6px;
  padding: 0 12px;
  border-radius: 999px;
  background: rgba(29, 99, 96, 0.9);
  color: #fff;
  box-shadow: 0 5px 16px rgba(29, 99, 96, 0.24);
  font-size: 12px;
  font-weight: 800;
  backdrop-filter: blur(6px);
}

.upload-icon {
  width: 66px;
  height: 66px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--teal-soft);
  color: var(--color-text-accent);
  margin-bottom: 4px;
}

.upload-title { font-size: 15.5px; font-weight: 800; color: var(--ink); }
.upload-sub { font-size: 12.5px; font-weight: 600; color: var(--ink-muted); }

.demo-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 14px 0;
  border-radius: var(--radius-md);
  background: var(--teal-soft);
  color: var(--color-text-accent);
  font-size: 14.5px;
  font-weight: 800;
  transition: background 0.15s ease;
}

.demo-btn:active { background: #c2e7e1; }
.demo-btn:disabled { border-color: var(--color-disabled-border); background: var(--color-disabled-surface); color: var(--color-disabled-text); cursor: wait; }

.btn-primary {
  display: flex;
  width: 100%;
  min-height: 50px;
  align-items: center;
  justify-content: center;
  gap: 9px;
  border-radius: 12px;
  background: #1d6360;
  color: #fff;
  box-shadow:
    0 8px 18px rgba(29, 99, 96, 0.22),
    inset 0 1px 0 rgba(255, 255, 255, 0.16);
  font-size: 15px;
  font-weight: 800;
  transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s ease;
}

.btn-primary:not(:disabled):active { transform: scale(0.98); }
.btn-primary:disabled { border: 1px solid var(--color-disabled-border); background: var(--color-disabled-surface); color: var(--color-disabled-text); cursor: not-allowed; box-shadow: none; }

.button-spinner {
  width: 18px;
  height: 18px;
  border: 2px solid rgba(255, 255, 255, 0.42);
  border-top-color: #fff;
  border-radius: 50%;
  animation: button-spin 0.7s linear infinite;
}

.form-error {
  margin: -2px 4px 0;
  color: var(--color-text-urgent);
  font-size: 12.5px;
  font-weight: 700;
  line-height: 1.45;
  text-align: center;
}

@keyframes button-spin {
  to { transform: rotate(360deg); }
}

/* ═══════════════════════════════════════════
   STATE 2 — Scanning stage
═══════════════════════════════════════════ */
.scan-stage { padding: 20px; display: flex; flex-direction: column; gap: 20px; }

.scan-frame {
  position: relative;
  width: 100%;
  aspect-ratio: 4 / 3;
  border-radius: var(--radius-lg);
  overflow: hidden;
  box-shadow: var(--shadow-float);
  background: #0f2f2e;
}

.scan-photo { width: 100%; height: 100%; object-fit: cover; }

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

/* Subtle teal veil so the glow pops */
.scan-veil {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(29, 99, 96, 0.28), rgba(15, 47, 46, 0.42));
}

/* ★★★ THE GLOWING TEAL SCANNING LINE ★★★
   A 3px core line with a soft gradient halo above and below,
   sweeping from the top of the frame to the bottom and back. */
.scan-line {
  position: absolute;
  left: 0;
  right: 0;
  height: 3px;
  background: #4fd1c5;
  box-shadow:
    0 0 10px 2px rgba(79, 209, 197, 0.9),
    0 0 26px 8px rgba(79, 209, 197, 0.55),
    0 0 52px 18px rgba(29, 99, 96, 0.35);
  animation: scan-sweep 1.6s cubic-bezier(0.45, 0, 0.55, 1) infinite;
  will-change: transform;
}

/* Gradient halo trailing the line */
.scan-line::before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: 100%;
  height: 90px;
  background: linear-gradient(to top, rgba(79, 209, 197, 0.4), transparent);
}

.scan-line::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 100%;
  height: 46px;
  background: linear-gradient(to bottom, rgba(79, 209, 197, 0.22), transparent);
}

@keyframes scan-sweep {
  0%   { transform: translateY(0); opacity: 0; }
  8%   { opacity: 1; }
  92%  { opacity: 1; }
  100% { transform: translateY(calc(100% * 133)); opacity: 0; }
}

/* Because the element is 3px tall, translateY in % is relative to itself.
   Use a viewport-independent sweep instead: */
.scan-frame { --sweep-distance: 100%; }

.scan-line {
  animation-name: scan-sweep-px;
}

@keyframes scan-sweep-px {
  0%   { top: -2%;  opacity: 0; }
  8%   { opacity: 1; }
  92%  { opacity: 1; }
  100% { top: 100%; opacity: 0; }
}

/* Viewfinder corner brackets */
.bracket {
  position: absolute;
  width: 26px;
  height: 26px;
  border: 3px solid rgba(255, 255, 255, 0.85);
  border-radius: 4px;
}

.bracket.tl { top: 14px; left: 14px; border-right: none; border-bottom: none; }
.bracket.tr { top: 14px; right: 14px; border-left: none; border-bottom: none; }
.bracket.bl { bottom: 14px; left: 14px; border-right: none; border-top: none; }
.bracket.br { bottom: 14px; right: 14px; border-left: none; border-top: none; }

/* Pulsing radar badge in the centre */
.scan-pulse {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: grid;
  place-items: center;
}

.pulse-ring {
  position: absolute;
  width: 54px;
  height: 54px;
  border-radius: 50%;
  background: rgba(79, 209, 197, 0.5);
  animation: pulse-ring 1.8s ease-out infinite;
}

.pulse-core {
  width: 54px;
  height: 54px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.94);
  color: var(--color-text-accent);
  box-shadow: var(--shadow-float);
}

/* Status readout */
.scan-status { display: flex; flex-direction: column; gap: 9px; align-items: center; }

.scan-label {
  font-size: 15px;
  font-weight: 800;
  color: var(--ink);
  text-align: center;
}

.scan-bar {
  width: 100%;
  height: 8px;
  border-radius: 999px;
  background: var(--line);
  overflow: hidden;
}

.scan-bar-fill {
  height: 100%;
  border-radius: 999px;
  background: var(--teal);
  transition: width 0.12s linear;
}

.scan-pct { font-size: 12.5px; font-weight: 700; color: var(--ink-muted); }

/* ═══════════════════════════════════════════
   STATE 3 — Results
═══════════════════════════════════════════ */
.scanned-summary {
  display: flex;
  align-items: center;
  gap: 13px;
  margin: 18px 20px 0;
  padding: 12px 14px;
  background: var(--surface);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-card);
}

.scanned-thumb {
  position: relative;
  width: 52px;
  height: 52px;
  border-radius: var(--radius-sm);
  overflow: hidden;
  background: var(--color-surface-subtle);
  flex-shrink: 0;
}

.scanned-thumb img { width: 100%; height: 100%; object-fit: cover; }

.scanned-info { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.scanned-title { font-size: 15px; font-weight: 800; }
.scanned-sub { font-size: 12.5px; font-weight: 600; color: var(--ink-muted); }

.rescan-btn {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--bg);
  color: var(--ink-muted);
  flex-shrink: 0;
}

.section-title { font-size: 16px; font-weight: 800; padding: 22px 20px 10px; }

.match-feed { display: flex; flex-direction: column; gap: 16px; padding: 0 20px; }

/* Staggered entrance for match cards */
.match-enter-active { transition: all 0.4s cubic-bezier(0.3, 0.8, 0.4, 1); }
.match-enter-from { opacity: 0; transform: translateY(18px); }

/* ── Card: identical to PetCard.vue ── */
.card {
  background: var(--surface);
  border-radius: var(--radius-lg);
  overflow: hidden;
  box-shadow: var(--shadow-card);
  transition: transform 0.15s ease;
  cursor: pointer;
}

.card:active { transform: scale(0.98); }

.photo-wrap {
  position: relative;
  aspect-ratio: 4 / 3;
  overflow: hidden;
  background: var(--color-surface-subtle);
}
.photo-wrap img { width: 100%; height: 100%; object-fit: cover; }

.badge {
  position: absolute;
  top: 14px;
  left: 14px;
  padding: 4px 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.06em;
  color: #fff;
}

.badge.lost { background: var(--coral); }
.badge.lost { color: var(--color-text-on-coral); }
.badge.sighted { background: var(--teal); }

/* ★★★ CONFIDENCE SCORE BADGE ★★★
   Prominent coral pill in the top-right of the photo. */
.confidence-badge {
  position: absolute;
  top: 12px;
  right: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0;
  min-width: 62px;
  padding: 7px 12px 6px;
  border-radius: var(--radius-sm);
  background: var(--coral);
  color: var(--color-text-on-coral);
  box-shadow: 0 4px 14px rgba(239, 99, 81, 0.5);
  line-height: 1;
}

/* Tier variations keep coral as the hero for strong matches */
.confidence-badge.high { background: var(--coral); }
.confidence-badge.mid  { background: #f0836f; }
.confidence-badge.low  { background: rgba(239, 99, 81, 0.82); }

.conf-pct {
  font-size: 19px;
  font-weight: 800;
  letter-spacing: -0.02em;
}

.conf-label {
  font-size: 9.5px;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  opacity: 0.92;
  margin-top: 1px;
}

.distance {
  position: absolute;
  bottom: 12px;
  right: 12px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(61, 56, 53, 0.72);
  color: #fff;
  font-size: 12.5px;
  font-weight: 700;
  backdrop-filter: blur(4px);
}

.body { padding: 14px 16px 16px; }

.row { display: flex; align-items: baseline; justify-content: space-between; }
h3 { font-size: 19px; font-weight: 800; }
.posted { font-size: 12.5px; color: var(--ink-muted); font-weight: 600; }
.meta { font-size: 14px; color: var(--ink-muted); margin-top: 2px; }

/* Confidence meter */
.conf-meter {
  width: 100%;
  height: 6px;
  border-radius: 999px;
  background: var(--line);
  overflow: hidden;
  margin-top: 12px;
}

.conf-meter-fill {
  height: 100%;
  border-radius: 999px;
  transition: width 0.7s cubic-bezier(0.3, 0.8, 0.4, 1);
}

.conf-meter-fill.high { background: var(--coral); }
.conf-meter-fill.mid  { background: #f0836f; }
.conf-meter-fill.low  { background: #f3a99c; }

.conf-reason {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--ink-muted);
  margin-top: 8px;
  line-height: 1.45;
}

.conf-reason svg { color: var(--color-icon-primary); flex-shrink: 0; margin-top: 2px; }

.score-breakdown {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 7px;
  margin-top: 11px;
}

.score-breakdown div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 7px 9px;
  border-radius: 10px;
  background: var(--teal-soft);
  color: var(--color-text-accent);
  font-size: 11.5px;
  font-weight: 750;
}

.score-breakdown dd { margin: 0; font-weight: 850; }

.sighting-count {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 7px;
  color: var(--color-text-accent);
  font-size: 12.5px;
  font-weight: 800;
}

.sighting-count svg {
  flex-shrink: 0;
}

.actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 14px;
}

.found-btn {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 9px 16px;
  border-radius: 999px;
  background: var(--teal-soft);
  color: var(--color-text-accent);
  font-size: 14px;
  font-weight: 800;
  transition: background 0.15s ease;
}

.found-btn:active { background: #c2e7e1; }

.reward { font-size: 13.5px; font-weight: 800; color: var(--color-text-urgent); }

/* No-match footer */
.no-match {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 30px 20px 0;
}

.no-match p { font-size: 13.5px; font-weight: 600; color: var(--ink-muted); }
.no-match .match-error { color: var(--color-text-urgent); text-align: center; }

.no-match-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 13px 24px;
  border-radius: 999px;
  background: var(--teal);
  color: #fff;
  font-size: 14.5px;
  font-weight: 800;
  box-shadow: var(--shadow-float);
  transition: transform 0.15s ease;
}

.no-match-btn:active { transform: scale(0.97); }

/* Respect reduced-motion preferences */
@media (prefers-reduced-motion: reduce) {
  .scan-line { animation: none; top: 50%; }
  .pulse-ring { animation: none; }
  .match-enter-active { transition: none; }
  .button-spinner { animation-duration: 1.4s; }
}

@media (max-width: 360px) {
  .criteria-card { grid-template-columns: 1fr; }
  .location-context { grid-template-columns: 38px minmax(0, 1fr); }
  .location-context select { grid-column: 1 / -1; }
}
</style>
