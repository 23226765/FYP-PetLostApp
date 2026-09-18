<template>
  <div
    class="poster-overlay"
    role="dialog"
    aria-modal="true"
    :aria-label="`Lost pet flyer for ${pet.name}`"
  >
    <header class="poster-toolbar no-print">
      <button class="tool-button" type="button" aria-label="Close flyer" @click="emit('close')">
        <AppIcon name="close" :size="21" />
      </button>
      <strong>Lost Pet Flyer</strong>
      <button class="tool-button" type="button" aria-label="Share pet link" @click="sharePoster">
        <AppIcon name="share" :size="19" />
      </button>
    </header>

    <main class="poster-scroll">
      <article class="poster-sheet">
        <header class="alert-banner">
          <span>LOST PET</span>
          <span lang="zh-Hant">走失協尋</span>
        </header>

        <section class="identity-block">
          <p>Please help us find</p>
          <h1>{{ pet.name }}</h1>
          <span class="species-tag">{{ speciesBreed }}</span>
        </section>

        <div class="poster-photo-frame">
          <img
            v-if="petPhoto && !photoFailed"
            :src="petPhoto"
            :alt="`Photo of ${pet.name}, a missing ${pet.breed || pet.species}`"
            class="poster-photo"
            crossorigin="anonymous"
            referrerpolicy="no-referrer"
            @error="photoFailed = true"
          />
          <div
            v-else
            class="photo-placeholder"
            role="img"
            :aria-label="`Photo unavailable for ${pet.name}`"
          >
            <AppIcon name="paw" :size="64" />
          </div>
        </div>

        <p v-if="rewardLabel" class="reward-badge">{{ rewardLabel }}</p>

        <dl class="detail-grid">
          <div>
            <dt>Last seen</dt>
            <dd>{{ pet.lastSeen || 'Not provided' }}</dd>
          </div>
          <div>
            <dt>District / Location</dt>
            <dd>{{ districtLocation }}</dd>
          </div>
        </dl>

        <section class="description-block">
          <h2>Identifying details</h2>
          <p>{{ pet.details || pet.description || 'No additional details provided.' }}</p>
        </section>

        <section class="recovery-block">
          <div class="contact-block">
            <p class="contact-heading">If you see {{ pet.name }}</p>
            <strong>{{ pet.canViewContact && pet.ownerPhone ? pet.ownerPhone : 'Report through PawRadar' }}</strong>
            <span>{{ pet.owner ? `Contact ${pet.owner}` : 'Please submit a sighting immediately' }}</span>
            <small>Please do not chase. Note the location and direction of travel.</small>
          </div>

          <div class="qr-block">
            <div
              v-if="qrSvg"
              class="qr-code"
              role="img"
              :aria-label="`Scannable QR code linking to ${deepLink}`"
              v-html="qrSvg"
            />
            <div v-else class="qr-loading" role="status">
              {{ qrError || 'Generating QR code…' }}
            </div>
            <p>Scan to report sighting on PawRadar</p>
          </div>
        </section>

        <footer class="poster-footer">
          <span><AppIcon name="paw" :size="16" /> PawRadar</span>
          <span>Live report: {{ shortDeepLink }}</span>
        </footer>
      </article>
    </main>

    <footer class="poster-actions no-print">
      <Transition name="feedback">
        <p v-if="feedback" class="feedback" role="status">{{ feedback }}</p>
      </Transition>
      <button class="share-button" type="button" @click="sharePoster">
        <AppIcon name="share" :size="18" />
        Share Link
      </button>
      <button class="print-button" type="button" :disabled="!qrSvg" @click="printPoster">
        <AppIcon name="list" :size="18" />
        Print / Save PDF
      </button>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import QRCode from 'qrcode'
import AppIcon from './AppIcon.vue'
import type { Pet } from '../types/pet'

const props = defineProps<{ pet: Pet }>()
const emit = defineEmits<{ close: [] }>()

const qrSvg = ref('')
const qrError = ref('')
const photoFailed = ref(false)
const feedback = ref('')
let qrRequestSequence = 0
let feedbackTimer: ReturnType<typeof setTimeout> | null = null

const petIdentifier = computed(() => {
  const legacyId = (props.pet as Pet & { _id?: unknown })._id
  return String(props.pet.id || legacyId || '').trim()
})

const deepLink = computed(() => {
  const path = `/pets/${encodeURIComponent(petIdentifier.value)}`
  return new URL(path, window.location.origin).toString()
})

const shortDeepLink = computed(() => {
  try {
    const url = new URL(deepLink.value)
    return `${url.host}${url.pathname}`
  } catch {
    return deepLink.value
  }
})

const petPhoto = computed(() =>
  normalizeImageUrl(props.pet.photo || props.pet.photos?.[0] || ''),
)

const speciesBreed = computed(() =>
  [props.pet.species, props.pet.breed].filter((value) => value?.trim()).join(' · '),
)

const districtLocation = computed(() => {
  const parts = [props.pet.district, props.pet.location].filter(
    (value): value is string => Boolean(value?.trim()),
  )
  return [...new Set(parts)].join(' · ') || 'Location not provided'
})

const rewardLabel = computed(() => {
  const reward = props.pet.reward?.trim()
  if (!reward) return ''
  return /reward/i.test(reward) ? reward : `${reward} Reward`
})

watch(petPhoto, () => {
  photoFailed.value = false
})

watch(
  deepLink,
  async (targetUrl) => {
    const sequence = ++qrRequestSequence
    qrSvg.value = ''
    qrError.value = ''

    if (!petIdentifier.value) {
      qrError.value = 'Pet link unavailable'
      return
    }

    try {
      const svg = await QRCode.toString(targetUrl, {
        type: 'svg',
        width: 140,
        margin: 4,
        errorCorrectionLevel: 'M',
        color: { dark: '#1a1a1a', light: '#ffffff' },
      })
      if (sequence === qrRequestSequence) qrSvg.value = svg
    } catch {
      if (sequence === qrRequestSequence) qrError.value = 'Unable to generate QR code'
    }
  },
  { immediate: true },
)

function normalizeImageUrl(value: string): string {
  const photo = value.trim()
  if (!photo) return ''

  try {
    const apiUrl = new URL(import.meta.env.VITE_API_BASE_URL || '/api', window.location.origin)
    const resolved = new URL(photo, `${apiUrl.origin}/`)
    return ['http:', 'https:', 'data:', 'blob:'].includes(resolved.protocol) ? resolved.href : ''
  } catch {
    return ''
  }
}

function printPoster() {
  if (!qrSvg.value) {
    showFeedback('Please wait for the QR code to finish generating.')
    return
  }
  window.print()
}

async function sharePoster() {
  const shareData = {
    title: `Missing: ${props.pet.name}`,
    text: `${props.pet.name} is missing. Open the live PawRadar report to view details or submit a sighting.`,
    url: deepLink.value,
  }

  try {
    if (navigator.share) {
      await navigator.share(shareData)
      showFeedback('Pet report shared.')
      return
    }
    await navigator.clipboard.writeText(deepLink.value)
    showFeedback('Pet report link copied.')
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return
    showFeedback('Unable to share. Copy the link from the flyer instead.')
  }
}

function showFeedback(message: string) {
  if (feedbackTimer) clearTimeout(feedbackTimer)
  feedback.value = message
  feedbackTimer = setTimeout(() => {
    feedback.value = ''
    feedbackTimer = null
  }, 2600)
}

onBeforeUnmount(() => {
  qrRequestSequence += 1
  if (feedbackTimer) clearTimeout(feedbackTimer)
})
</script>

<style scoped>
.poster-overlay {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: flex;
  width: 100%;
  max-width: 480px;
  margin: 0 auto;
  flex-direction: column;
  background: #252321;
}

.poster-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  padding: calc(var(--safe-top) + 10px) 16px 10px;
  background: rgba(37, 35, 33, 0.97);
  color: #fff;
}

.poster-toolbar strong { font-size: 15px; letter-spacing: 0.01em; }

.tool-button {
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.13);
  color: #fff;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.tool-button:active { transform: scale(0.96); background: rgba(255, 255, 255, 0.22); }

.poster-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 16px 12px 20px;
  -webkit-overflow-scrolling: touch;
}

.poster-sheet {
  width: 100%;
  max-width: 452px;
  margin: 0 auto;
  overflow: hidden;
  border-radius: 14px;
  background: #fff;
  color: #1a1a1a;
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.38);
}

.alert-banner {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 16px 18px;
  background: #d9362b;
  color: #fff;
  font-size: clamp(23px, 8vw, 34px);
  font-weight: 950;
  letter-spacing: -0.03em;
  line-height: 1;
}

.alert-banner span:last-child {
  padding-left: 12px;
  border-left: 2px solid rgba(255, 255, 255, 0.55);
  font-size: 0.72em;
  letter-spacing: 0.04em;
}

.identity-block { padding: 18px 22px 14px; text-align: center; }

.identity-block > p {
  color: #5e5a56;
  font-size: 11px;
  font-weight: 850;
  letter-spacing: 0.15em;
  text-transform: uppercase;
}

.identity-block h1 {
  margin: 2px 0 8px;
  font-size: clamp(42px, 15vw, 64px);
  font-weight: 950;
  letter-spacing: -0.055em;
  line-height: 1;
}

.species-tag {
  display: inline-flex;
  padding: 6px 13px;
  border-radius: 999px;
  background: rgba(29, 99, 96, 0.1);
  color: #1d6360;
  font-size: 12px;
  font-weight: 850;
}

.poster-photo-frame {
  position: relative;
  width: calc(100% - 36px);
  aspect-ratio: 4 / 3;
  margin: 0 18px;
  overflow: hidden;
  border: 5px solid #ef6351;
  border-radius: 14px;
  background: #fcf9f2;
}

.poster-photo,
.photo-placeholder { width: 100%; height: 100%; }
.poster-photo { display: block; object-fit: cover; }

.photo-placeholder {
  display: grid;
  place-items: center;
  background: radial-gradient(circle, rgba(29, 99, 96, 0.14), transparent 46%), #fcf9f2;
  color: rgba(29, 99, 96, 0.58);
}

.reward-badge {
  width: fit-content;
  margin: 12px auto 0;
  padding: 8px 18px;
  border-radius: 999px;
  background: #ef6351;
  color: #fff;
  font-size: 18px;
  font-weight: 900;
  box-shadow: 0 5px 14px rgba(239, 99, 81, 0.25);
}

.detail-grid {
  display: grid;
  grid-template-columns: 0.8fr 1.2fr;
  gap: 1px;
  margin: 16px 18px 0;
  overflow: hidden;
  border: 1px solid #dedbd4;
  border-radius: 12px;
  background: #dedbd4;
}

.detail-grid div { padding: 11px 12px; background: #fcf9f2; }

.detail-grid dt,
.description-block h2 {
  margin-bottom: 3px;
  color: #68625d;
  font-size: 9.5px;
  font-weight: 900;
  letter-spacing: 0.11em;
  text-transform: uppercase;
}

.detail-grid dd { font-size: 13px; font-weight: 850; line-height: 1.35; }
.description-block { margin: 15px 20px 0; }
.description-block p { font-size: 12.5px; font-weight: 650; line-height: 1.48; }

.recovery-block {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 166px;
  gap: 16px;
  align-items: center;
  margin-top: 16px;
  padding: 17px 18px;
  border-top: 2px dashed #d6d1c8;
  border-bottom: 2px dashed #d6d1c8;
}

.contact-block { min-width: 0; }
.contact-heading { color: #d9362b; font-size: 13px; font-weight: 900; }
.contact-block strong, .contact-block span, .contact-block small { display: block; }

.contact-block strong {
  margin: 4px 0;
  overflow-wrap: anywhere;
  color: #1a1a1a;
  font-size: clamp(20px, 6vw, 28px);
  font-weight: 950;
  line-height: 1.1;
}

.contact-block span { color: #1d6360; font-size: 12px; font-weight: 850; }

.contact-block small {
  margin-top: 8px;
  color: #68625d;
  font-size: 9.5px;
  font-weight: 700;
  line-height: 1.4;
}

.qr-block { display: flex; flex-direction: column; align-items: center; text-align: center; }

.qr-code,
.qr-loading {
  width: 148px;
  height: 148px;
  padding: 4px;
  border: 1px solid #dedbd4;
  border-radius: 8px;
  background: #fff;
}

.qr-code :deep(svg) { display: block; width: 140px; height: 140px; }

.qr-loading {
  display: grid;
  place-items: center;
  color: #68625d;
  font-size: 10px;
  font-weight: 750;
}

.qr-block p {
  max-width: 155px;
  margin-top: 6px;
  color: #1d6360;
  font-size: 10px;
  font-weight: 900;
  line-height: 1.3;
}

.poster-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 18px 15px;
  color: #68625d;
  font-size: 8.5px;
  font-weight: 750;
}

.poster-footer span:first-child {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: #1d6360;
  font-size: 11px;
  font-weight: 900;
}

.poster-footer span:last-child { overflow-wrap: anywhere; text-align: right; }

.poster-actions {
  position: relative;
  display: grid;
  grid-template-columns: 0.85fr 1.15fr;
  gap: 10px;
  flex-shrink: 0;
  padding: 12px 16px calc(var(--safe-bottom) + 14px);
  background: rgba(37, 35, 33, 0.97);
}

.poster-actions button {
  min-height: 48px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: 14px;
  color: #fff;
  font-size: 13.5px;
  font-weight: 850;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.share-button { background: rgba(255, 255, 255, 0.14); }
.print-button { background: #ef6351; box-shadow: 0 6px 18px rgba(239, 99, 81, 0.34); }
.poster-actions button:active:not(:disabled) { transform: scale(0.98); }
.poster-actions button:disabled { opacity: 0.55; }

.feedback {
  position: absolute;
  right: 18px;
  bottom: calc(100% + 8px);
  left: 18px;
  padding: 9px 12px;
  border-radius: 999px;
  background: #1d6360;
  color: #fff;
  font-size: 12px;
  font-weight: 800;
  text-align: center;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.25);
}

.feedback-enter-active, .feedback-leave-active { transition: all 0.2s ease; }
.feedback-enter-from, .feedback-leave-to { opacity: 0; transform: translateY(6px); }

@media (max-width: 380px) {
  .recovery-block { grid-template-columns: 1fr; }
  .contact-block { text-align: center; }
}

@media print {
  :global(html),
  :global(body),
  :global(#app) {
    width: 210mm !important;
    min-height: 297mm !important;
    margin: 0 !important;
    padding: 0 !important;
    background: #fff !important;
  }

  :global(.app > :not(.poster-overlay)),
  .no-print { display: none !important; }

  .poster-overlay,
  .poster-scroll {
    position: static;
    width: 210mm;
    max-width: none;
    min-height: 297mm;
    margin: 0;
    padding: 0;
    overflow: visible;
    background: #fff;
  }

  .poster-sheet {
    box-sizing: border-box;
    width: 210mm;
    max-width: none;
    min-height: 297mm;
    border-radius: 0;
    box-shadow: none;
    break-inside: avoid;
    page-break-inside: avoid;
  }

  .alert-banner,
  .reward-badge,
  .qr-code,
  .qr-code :deep(svg) {
    print-color-adjust: exact;
    -webkit-print-color-adjust: exact;
  }

  .poster-photo-frame { height: 102mm; aspect-ratio: auto; }

  @page { size: A4 portrait; margin: 0; }
}
</style>
