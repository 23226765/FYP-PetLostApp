<template>
  <!--
    ════════════════════════════════════════════════════════════════
    SmartMatchScreen.vue
    ════════════════════════════════════════════════════════════════
    Photo-assisted manual comparison screen. Three visual states:

      1. IDLE      → dashed upload dropzone with paw icon
      2. SCANNING  → uploaded photo with a glowing teal scan line
                     sweeping top→bottom, plus a progress readout
      3. RESULTS   → "Potential Matches" list reusing the exact
                     PetCard visual language, with an added coral
                     review-priority badge on every card

    Design tokens used (all from style.css — no new colors):
      --teal, --teal-soft, --coral, --surface, --bg, --ink,
      --ink-muted, --line, --radius-lg/md/sm, --shadow-card/float
    ════════════════════════════════════════════════════════════════
  -->
  <div class="smart-match">

    <!-- ─────────── Sticky header ─────────── -->
    <header class="top">
      <button class="back-btn" aria-label="Go back" @click="emit('close')">
        <AppIcon name="back" :size="22" />
      </button>
      <h1>Photo Compare</h1>
      <span class="spacer" aria-hidden="true" />
    </header>

    <!-- ─────────── Intro copy ─────────── -->
    <section v-if="state === 'idle'" class="intro">
      <h2>Found a pet? Let's identify them.</h2>
      <p>
        Keep your photo beside active nearby reports and compare markings manually.
        Candidates are ranked using real distance and sighting activity.
      </p>
    </section>

    <!-- ═══════════════════════════════════════════
         STATE 1 — IDLE: upload dropzone
    ═══════════════════════════════════════════ -->
    <div v-if="state === 'idle'" class="upload-zone-wrap">
      <button
        class="upload-zone"
        :class="{ dragging: isDragging }"
        aria-label="Upload a photo to find matches"
        @click="triggerFilePicker"
        @dragover.prevent="isDragging = true"
        @dragleave.prevent="isDragging = false"
        @drop.prevent="onDrop"
      >
        <span class="upload-icon">
          <AppIcon name="camera" :size="30" />
        </span>
        <span class="upload-title">Tap to upload a photo</span>
        <span class="upload-sub">or drag &amp; drop · JPG, PNG up to 10 MB</span>
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
      <button class="demo-btn" @click="startScan(demoPhoto)">
        <AppIcon name="paw" :size="17" />
        Use a sample photo instead
      </button>
    </div>

    <!-- ═══════════════════════════════════════════
         STATE 2 — SCANNING: photo + glowing scan line
    ═══════════════════════════════════════════ -->
    <div v-else-if="state === 'scanning'" class="scan-stage">
      <div class="scan-frame">
        <img
          v-if="normalizedImageUrl(uploadedPhoto) && !uploadedPhotoFailed"
          :src="normalizedImageUrl(uploadedPhoto)"
          alt=""
          aria-hidden="true"
          class="scan-photo"
          @error="uploadedPhotoFailed = true"
        />
        <div v-else class="photo-placeholder" aria-hidden="true">
          <AppIcon name="paw" :size="52" />
        </div>
        <span class="sr-only">Photo being prepared for comparison</span>

        <!-- Dimming veil so the glow reads clearly -->
        <div class="scan-veil" />

        <!-- ★ The glowing teal scanning line ★ -->
        <div class="scan-line" />

        <!-- Corner brackets for a viewfinder feel -->
        <span class="bracket tl" />
        <span class="bracket tr" />
        <span class="bracket bl" />
        <span class="bracket br" />

        <!-- Pulsing ring badge (reuses pulse-ring keyframe from style.css) -->
        <div class="scan-pulse">
          <span class="pulse-ring" />
          <span class="pulse-core">
            <AppIcon name="radar" :size="22" />
          </span>
        </div>
      </div>

      <!-- Live status readout -->
      <div class="scan-status" role="status" aria-live="polite">
        <p class="scan-label">{{ scanStage }}</p>
        <div class="scan-bar">
          <div class="scan-bar-fill" :style="{ width: scanProgress + '%' }" />
        </div>
        <p class="scan-pct">{{ scanProgress }}% ready</p>
      </div>
    </div>

    <!-- ═══════════════════════════════════════════
         STATE 3 — RESULTS: Potential Matches list
    ═══════════════════════════════════════════ -->
    <template v-else>

      <!-- Thumbnail of what was scanned -->
      <div class="scanned-summary">
        <div class="scanned-thumb" role="img" aria-label="The photo you uploaded">
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
          <span class="scanned-title">Comparison ready</span>
          <span class="scanned-sub">
            {{ matches.length }} nearby {{ matches.length === 1 ? 'report' : 'reports' }} found
            nearby
          </span>
        </div>
        <button class="rescan-btn" aria-label="Scan a different photo" @click="reset">
          <AppIcon name="close" :size="16" />
        </button>
      </div>

      <h2 class="section-title">Nearby reports to review</h2>

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
            <span class="sr-only">Photo of {{ m.name }}, a missing {{ m.breed }}</span>

            <!-- Original status badge (unchanged pattern) -->
            <span class="badge" :class="m.status">
              {{ m.status === 'lost' ? 'LOST' : 'SIGHTED' }}
            </span>

            <!-- ★ NEW: prominent coral Confidence Score badge ★ -->
            <span class="confidence-badge" :class="confidenceTier(m.confidence)">
              <span class="conf-pct">{{ m.confidence }}%</span>
              <span class="conf-label">priority</span>
            </span>

            <span class="distance">
              <AppIcon name="pin" :size="14" />
              {{ m.distanceKm }} km
            </span>
          </div>

          <div class="body">
            <div class="row">
              <h3>{{ m.name }}</h3>
              <span class="posted">{{ m.postedAgo }}</span>
            </div>
            <p class="meta">{{ m.breed }} · Last seen {{ m.lastSeen }}</p>

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
              {{ m.reason }}
            </p>
            <p class="sighting-count">
              <AppIcon name="eye" :size="13" />
              {{ m.sightingCount }} sightings logged
            </p>

            <div class="actions">
              <button class="found-btn" @click.stop="emit('confirm-match', m)">
                <AppIcon name="eye" :size="17" />
                This is them
              </button>
              <span v-if="m.reward" class="reward">{{ m.reward }} reward</span>
            </div>
          </div>
        </article>
      </TransitionGroup>

      <!-- No-match footer -->
      <div class="no-match">
        <p>None of these look right?</p>
        <button class="no-match-btn" @click="emit('post-instead')">
          <AppIcon name="plus" :size="17" />
          Post as a new sighting
        </button>
      </div>
    </template>

  </div>
</template>

<script setup lang="ts">
import { onUnmounted, ref } from 'vue'
import { Camera, CameraResultType } from '@capacitor/camera'
import type { Pet } from '../types/pet'
import { getNearbyPets, getPetSightings } from '../services/api'
import AppIcon from './AppIcon.vue'

const props = defineProps<{ pets?: Pet[] }>()

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
type MatchResult = Pet & {
  /** Review-priority score derived from distance and sighting activity, 0–100 */
  confidence: number
  /** Human-readable explanation of the match */
  reason: string
  /** Number of sightings submitted for this pet */
  sightingCount: number
}

type ScreenState = 'idle' | 'scanning' | 'results'

/* ── State ─────────────────────────────────────────── */
const state = ref<ScreenState>('idle')
const uploadedPhoto = ref<string>('')
const uploadedPhotoFailed = ref(false)
const isDragging = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const failedMatchImages = ref<Set<string>>(new Set())

const scanProgress = ref(0)
const scanStage = ref('Initializing…')

let progressTimer: ReturnType<typeof setInterval> | null = null
let finishTimer: ReturnType<typeof setTimeout> | null = null

/* Sample photo so the flow is demoable without a real upload */
const demoPhoto =
  'https://images.unsplash.com/photo-1552053831-71594a27632d?w=800&q=80'

/* Nearby reports ordered by real distance and sighting activity. */
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

    if (image.dataUrl) startScan(image.dataUrl)
  } catch {
    // Preserve the browser file picker when the Camera plugin is unavailable.
    fileInput.value?.click()
  }
}

function onFileSelected(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) readAndScan(file)
}

function onDrop(e: DragEvent) {
  isDragging.value = false
  const file = e.dataTransfer?.files?.[0]
  if (file && file.type.startsWith('image/')) readAndScan(file)
}

function readAndScan(file: File) {
  const reader = new FileReader()
  reader.onload = () => startScan(reader.result as string)
  reader.readAsDataURL(file)
}

/* Brief preparation sequence while nearby report details are loaded. */
function startScan(photoSrc: string) {
  uploadedPhoto.value = photoSrc
  uploadedPhotoFailed.value = false
  failedMatchImages.value = new Set()
  state.value = 'scanning'
  scanProgress.value = 0
  scanStage.value = 'Loading active reports…'

  // Progress ticks every 40 ms → reaches 100 in ~2000 ms
  progressTimer = setInterval(() => {
    scanProgress.value = Math.min(100, scanProgress.value + 2)

    if (scanProgress.value > 25 && scanProgress.value <= 55) {
      scanStage.value = 'Loading sighting histories…'
    } else if (scanProgress.value > 55 && scanProgress.value <= 85) {
      scanStage.value = 'Ordering reports by distance…'
    } else if (scanProgress.value > 85) {
      scanStage.value = 'Preparing side-by-side review…'
    }
  }, 40)

  // Reveal results after exactly 2 seconds
  finishTimer = setTimeout(async () => {
    clearTimers()
    scanProgress.value = 100
    try {
      const lostPets = props.pets
        ? props.pets.filter((pet) => pet.status === 'lost')
        : await getNearbyPets({
            lat: 22.3193,
            lng: 114.1694,
            radiusKm: 20,
            status: 'lost',
          })

      const rankedMatches = await Promise.all(
        lostPets.map(async (pet) => {
          let sightingCount = 0
          try {
            sightingCount = (await getPetSightings(pet.id)).length
          } catch {
            // Keep the match visible if its supporting history cannot be loaded.
          }

          const distance = Number.isFinite(pet.distanceKm) ? pet.distanceKm || 0 : 20
          const reviewPriority = Math.max(35, Math.min(95, Math.round(95 - distance * 3 + Math.min(sightingCount, 5))))
          return {
            ...pet,
            confidence: reviewPriority,
            reason: `Prioritized by ${distance.toFixed(1)} km distance and ${sightingCount} recorded sightings. Compare coat and markings manually.`,
            sightingCount,
          }
        }),
      )

      matches.value = rankedMatches.sort((a, b) => b.confidence - a.confidence)
    } catch {
      matches.value = []
    } finally {
      state.value = 'results'
    }
  }, 2000)
}

function reset() {
  clearTimers()
  state.value = 'idle'
  uploadedPhoto.value = ''
  uploadedPhotoFailed.value = false
  failedMatchImages.value = new Set()
  scanProgress.value = 0
  if (fileInput.value) fileInput.value.value = ''
}

function clearTimers() {
  if (progressTimer) { clearInterval(progressTimer); progressTimer = null }
  if (finishTimer) { clearTimeout(finishTimer); finishTimer = null }
}

onUnmounted(clearTimers)

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

.upload-zone {
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
  transition: border-color 0.18s ease, background 0.18s ease, transform 0.15s ease;
}

.upload-zone:active { transform: scale(0.985); }

.upload-zone.dragging,
.upload-zone:hover {
  border-color: var(--teal);
  background: #f7fcfb;
}

.upload-icon {
  width: 66px;
  height: 66px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--teal-soft);
  color: var(--teal);
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
  color: var(--teal);
  font-size: 14.5px;
  font-weight: 800;
  transition: background 0.15s ease;
}

.demo-btn:active { background: #c2e7e1; }

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
  color: var(--teal);
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
  background: #fcf9f2;
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
  background: #fcf9f2;
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
  color: #fff;
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

.conf-reason svg { color: var(--teal); flex-shrink: 0; margin-top: 2px; }

.sighting-count {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 7px;
  color: var(--teal);
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
  color: var(--teal);
  font-size: 14px;
  font-weight: 800;
  transition: background 0.15s ease;
}

.found-btn:active { background: #c2e7e1; }

.reward { font-size: 13.5px; font-weight: 800; color: var(--coral); }

/* No-match footer */
.no-match {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 30px 20px 0;
}

.no-match p { font-size: 13.5px; font-weight: 600; color: var(--ink-muted); }

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
}
</style>
