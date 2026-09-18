<template>
  <div class="rescue-screen">
    <header class="top">
      <div>
        <p class="eyebrow">Community rescue</p>
        <h1>Stray animal map</h1>
      </div>
      <button class="report-button" type="button" @click="openReportForm">
        <AppIcon name="plus" :size="18" />
        Report
      </button>
    </header>

    <div class="view-toggle" role="tablist" aria-label="Stray reports view">
      <button :class="{ active: view === 'list' }" role="tab" :aria-selected="view === 'list'" @click="view = 'list'">
        <AppIcon name="list" :size="17" /> List
      </button>
      <button :class="{ active: view === 'map' }" role="tab" :aria-selected="view === 'map'" @click="view = 'map'">
        <AppIcon name="map" :size="17" /> Map
      </button>
    </div>

    <div class="filters">
      <label>
        <span>Animal</span>
        <select v-model="speciesFilter">
          <option value="">All animals</option>
          <option value="Dog">Dogs</option>
          <option value="Cat">Cats</option>
          <option value="Other">Other</option>
        </select>
      </label>
      <label>
        <span>Rescue status</span>
        <select v-model="statusFilter">
          <option value="">All statuses</option>
          <option value="reported">Needs help</option>
          <option value="rescue_dispatched">Help dispatched</option>
          <option value="rescued">Rescued</option>
        </select>
      </label>
      <label class="district-filter">
        <span>District</span>
        <select v-model="districtFilter">
          <option value="">All districts</option>
          <option v-for="district in HK_DISTRICTS" :key="district" :value="district">{{ district }}</option>
        </select>
      </label>
    </div>

    <div class="result-head">
      <strong>{{ strays.length }} nearby reports</strong>
      <span>{{ radiusKm }} km radius</span>
    </div>

    <div v-if="loading" class="state" role="status"><span class="spinner" />Loading rescue reports...</div>
    <div v-else-if="error" class="state error" role="alert">
      <p>{{ error }}</p>
      <button type="button" @click="loadStrays">Try again</button>
    </div>
    <div v-else-if="strays.length === 0" class="state">
      <span class="state-icon"><AppIcon name="paw" :size="30" /></span>
      <strong>No matching stray reports</strong>
      <p>Change the filters or report an animal that needs help.</p>
    </div>
    <div v-else-if="view === 'list'" class="report-list">
      <button v-for="stray in strays" :key="stray.id" class="stray-card" type="button" @click="selected = stray">
        <div class="photo-wrap">
          <img v-if="imageUrl(stray) && !failedImages.has(stray.id)" :src="imageUrl(stray)" alt="" @error="markImageFailed(stray.id)" />
          <span v-else class="photo-placeholder"><AppIcon name="paw" :size="34" /></span>
          <span class="condition" :class="stray.condition">{{ conditionLabel(stray.condition) }}</span>
        </div>
        <div class="card-body">
          <div class="card-title"><strong>{{ stray.species }}</strong><span>{{ stray.distanceKm }} km</span></div>
          <p>{{ stray.location }}</p>
          <p class="description">{{ stray.description }}</p>
          <div class="card-foot">
            <span class="rescue-status" :class="stray.rescueStatus">{{ statusLabel(stray.rescueStatus) }}</span>
            <span>{{ stray.reportedAgo }}</span>
          </div>
        </div>
      </button>
    </div>
    <MapView
      v-else
      :pets="[]"
      :strays="strays"
      :center="userLocation"
      :radius-km="radiusKm"
      @open-stray="selected = $event"
    />

    <Transition name="fade">
      <div v-if="selected" class="scrim" @click.self="selected = null">
        <section class="detail-sheet" role="dialog" aria-modal="true" :aria-label="`${selected.species} rescue report`">
          <div class="grab" />
          <div class="detail-heading">
            <div>
              <span class="rescue-status" :class="selected.rescueStatus">{{ statusLabel(selected.rescueStatus) }}</span>
              <h2>{{ selected.species }} in {{ selected.district }}</h2>
            </div>
            <button type="button" aria-label="Close report" @click="selected = null"><AppIcon name="close" :size="20" /></button>
          </div>
          <p class="detail-location"><AppIcon name="pin" :size="16" />{{ selected.location }}</p>
          <p class="detail-copy">{{ selected.description }}</p>
          <div class="detail-meta"><span>Condition</span><strong>{{ conditionLabel(selected.condition) }}</strong></div>
          <div class="detail-meta"><span>Reported</span><strong>{{ selected.reportedAgo }}</strong></div>
          <div v-if="contactActions" class="contact-actions">
            <a :href="contactActions.callHref"><AppIcon name="phone" :size="18" />Call reporter</a>
            <a :href="contactActions.whatsappHref" target="_blank" rel="noopener noreferrer">WhatsApp</a>
          </div>
          <p v-else class="contact-private">
            This reporter accepts contact through PetLostApp messages only.
          </p>
          <div v-if="canManageSelected" class="status-actions">
            <p>Update rescue progress</p>
            <button
              v-for="option in rescueOptions"
              :key="option.value"
              type="button"
              :disabled="updatingStatus || selected.rescueStatus === option.value"
              :class="{ active: selected.rescueStatus === option.value }"
              @click="changeStatus(option.value)"
            >{{ option.label }}</button>
          </div>
          <p v-if="statusError" class="form-error" role="alert">{{ statusError }}</p>
        </section>
      </div>
    </Transition>

    <Transition name="fade">
      <div v-if="showReportForm" class="scrim" @click.self="showReportForm = false">
        <form class="report-sheet" @submit.prevent="submitReport">
          <div class="grab" />
          <div class="detail-heading">
            <div><p class="eyebrow">New rescue report</p><h2>Animal details</h2></div>
            <button type="button" aria-label="Close form" @click="showReportForm = false"><AppIcon name="close" :size="20" /></button>
          </div>
          <button class="photo-button" type="button" @click="addPhoto">
            <img v-if="form.photo" :src="form.photo" alt="Selected stray animal" />
            <template v-else><AppIcon name="camera" :size="25" /><span>Add a clear photo</span></template>
          </button>
          <div class="form-grid">
            <label><span>Animal</span><select v-model="form.species" required><option value="Dog">Dog</option><option value="Cat">Cat</option><option value="Other">Other</option></select></label>
            <label><span>Condition</span><select v-model="form.condition" required><option value="unknown">Unknown</option><option value="healthy">Appears healthy</option><option value="injured">Injured</option><option value="critical">Critical</option></select></label>
          </div>
          <label><span>District</span><select v-model="form.district" required><option value="" disabled>Select district</option><option v-for="district in HK_DISTRICTS" :key="district" :value="district">{{ district }}</option></select></label>
          <label><span>Location description</span><input v-model="form.locationName" required placeholder="Street, landmark, or park" /></label>
          <label><span>What did you observe?</span><textarea v-model="form.description" rows="3" required placeholder="Appearance, behaviour, direction of travel..." /></label>
          <label><span>Contact name</span><input v-model="form.reporterName" required autocomplete="name" /></label>
          <label><span>Contact phone</span><input v-model="form.reporterPhone" required type="tel" autocomplete="tel" /></label>
          <p class="location-note"><AppIcon name="pin" :size="15" />Your current location is attached only when you submit.</p>
          <p v-if="reportError" class="form-error" role="alert">{{ reportError }}</p>
          <button class="submit-button" type="submit" :disabled="submitting">
            <AppIcon name="radar" :size="19" />{{ submitting ? 'Submitting...' : 'Submit rescue report' }}
          </button>
        </form>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { Camera, CameraResultType } from '@capacitor/camera'
import AppIcon from './AppIcon.vue'
import MapView from './MapView.vue'
import { getNearbyStrays, reportStray, updateStrayStatus } from '../services/api'
import { getCurrentLocation } from '../services/geolocation'
import { createContactActions } from '../utils/contact'
import { HK_DISTRICTS } from '../types/pet'
import type { User } from '../types/user'
import type { RescueStatus, StrayCondition, StrayReport } from '../types/stray'

const props = defineProps<{
  user: User | null
  radiusKm: number
  userLocation: { lat: number; lng: number } | null
}>()
const emit = defineEmits<{ 'auth-needed': [] }>()

const HK_CENTER = { lat: 22.3193, lng: 114.1694 }
const view = ref<'list' | 'map'>('list')
const strays = ref<StrayReport[]>([])
const loading = ref(false)
const error = ref('')
const speciesFilter = ref('')
const statusFilter = ref('')
const districtFilter = ref('')
const selected = ref<StrayReport | null>(null)
const failedImages = ref(new Set<string>())
const showReportForm = ref(false)
const submitting = ref(false)
const reportError = ref('')
const updatingStatus = ref(false)
const statusError = ref('')
let requestSequence = 0
let abortController: AbortController | null = null

const form = reactive({
  species: 'Dog' as StrayReport['species'],
  condition: 'unknown' as StrayCondition,
  district: '',
  locationName: '',
  description: '',
  reporterName: '',
  reporterPhone: '',
  photo: '',
})
const rescueOptions: Array<{ value: RescueStatus; label: string }> = [
  { value: 'reported', label: 'Needs help' },
  { value: 'rescue_dispatched', label: 'Help dispatched' },
  { value: 'rescued', label: 'Rescued' },
]

const canManageSelected = computed(() => {
  if (!props.user || !selected.value) return false
  return props.user.role === 'shelter_admin' || selected.value.reportedBy === props.user.id
})
const contactActions = computed(() => {
  if (!selected.value?.canViewContact) return null
  return createContactActions(
    selected.value.reporterPhone,
    `Hi ${selected.value.reporterName}, I'm contacting you through PawRadar about the ${selected.value.species.toLowerCase()} reported near ${selected.value.location}.`,
  )
})

function normalizedImageUrl(value: string): string {
  if (!value?.trim()) return ''
  try {
    const api = new URL(import.meta.env.VITE_API_BASE_URL || '/api', window.location.origin)
    const resolved = new URL(value, `${api.origin}/`)
    return ['http:', 'https:', 'data:', 'blob:'].includes(resolved.protocol) ? resolved.href : ''
  } catch { return '' }
}
function imageUrl(stray: StrayReport) { return normalizedImageUrl(stray.photo) }
function markImageFailed(id: string) { failedImages.value = new Set([...failedImages.value, id]) }
function conditionLabel(value: StrayCondition) {
  return { unknown: 'Condition unknown', healthy: 'Appears healthy', injured: 'Injured', critical: 'Critical' }[value]
}
function statusLabel(value: RescueStatus) {
  return { reported: 'Needs help', rescue_dispatched: 'Help dispatched', rescued: 'Rescued' }[value]
}

async function loadStrays() {
  const sequence = ++requestSequence
  abortController?.abort()
  const controller = new AbortController()
  abortController = controller
  loading.value = true
  error.value = ''
  const center = props.userLocation || HK_CENTER
  try {
    const result = await getNearbyStrays({
      lat: center.lat,
      lng: center.lng,
      radiusKm: props.radiusKm,
      species: (speciesFilter.value || undefined) as StrayReport['species'] | undefined,
      status: (statusFilter.value || undefined) as RescueStatus | undefined,
      district: districtFilter.value || undefined,
    }, controller.signal)
    if (sequence === requestSequence) strays.value = result
  } catch (caught) {
    if (sequence === requestSequence) error.value = caught instanceof Error ? caught.message : 'Unable to load rescue reports.'
  } finally {
    if (sequence === requestSequence) loading.value = false
  }
}

function openReportForm() {
  form.reporterName = props.user?.name || form.reporterName
  form.reporterPhone = props.user?.phone || form.reporterPhone
  reportError.value = ''
  showReportForm.value = true
}

async function addPhoto() {
  reportError.value = ''
  try {
    const image = await Camera.getPhoto({ resultType: CameraResultType.DataUrl, quality: 82, allowEditing: false })
    form.photo = image.dataUrl || ''
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : ''
    if (!message.toLowerCase().includes('cancel')) reportError.value = message || 'Unable to add a photo.'
  }
}

async function submitReport() {
  if (submitting.value) return
  submitting.value = true
  reportError.value = ''
  try {
    const { lat, lng } = await getCurrentLocation()
    const created = await reportStray({
      species: form.species,
      condition: form.condition,
      district: form.district,
      locationName: form.locationName,
      description: form.description,
      reporterName: form.reporterName,
      reporterPhone: form.reporterPhone,
      photo: form.photo || undefined,
      coordinates: [lng, lat],
    })
    strays.value = [created, ...strays.value]
    selected.value = created
    showReportForm.value = false
    form.locationName = ''
    form.description = ''
    form.photo = ''
  } catch (caught) {
    const locationCode = typeof caught === 'object' && caught ? (caught as { code?: number }).code : undefined
    reportError.value = locationCode === 1
      ? 'Location permission is required so rescuers receive an accurate map pin.'
      : caught instanceof Error
        ? caught.message
        : 'Unable to submit the rescue report.'
  } finally { submitting.value = false }
}

async function changeStatus(status: RescueStatus) {
  if (!selected.value || updatingStatus.value) return
  if (!props.user) { emit('auth-needed'); return }
  updatingStatus.value = true
  statusError.value = ''
  try {
    const previousDistance = selected.value.distanceKm
    const updated = await updateStrayStatus(selected.value.id, status)
    updated.distanceKm = previousDistance
    selected.value = updated
    const index = strays.value.findIndex((stray) => stray.id === updated.id)
    if (index >= 0) strays.value[index] = updated
  } catch (caught) {
    statusError.value = caught instanceof Error ? caught.message : 'Unable to update rescue status.'
  } finally { updatingStatus.value = false }
}

watch(
  [() => props.radiusKm, () => props.userLocation, speciesFilter, statusFilter, districtFilter],
  loadStrays,
  { immediate: true, deep: true },
)
onBeforeUnmount(() => { requestSequence += 1; abortController?.abort() })
</script>

<style scoped>
.rescue-screen { max-width: 480px; min-height: 100dvh; margin: 0 auto; padding: calc(var(--safe-top) + 18px) 18px 120px; }
.top, .detail-heading, .result-head, .card-title, .card-foot, .detail-meta { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.top { margin-bottom: 16px; }
.eyebrow { color: var(--coral); font-size: 11.5px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
h1 { font-size: 22px; font-weight: 850; }
.report-button, .submit-button { min-height: 44px; display: inline-flex; align-items: center; justify-content: center; gap: 7px; border-radius: 999px; background: var(--coral); color: #fff; font-weight: 800; box-shadow: var(--shadow-card); }
.report-button { padding: 0 14px; }
.view-toggle { display: flex; margin-bottom: 14px; padding: 4px; border-radius: 999px; background: var(--line); }
.view-toggle button { flex: 1; min-height: 42px; display: flex; align-items: center; justify-content: center; gap: 7px; border-radius: 999px; color: var(--ink-muted); font-weight: 800; }
.view-toggle button.active { background: var(--surface); color: var(--teal); box-shadow: var(--shadow-card); }
.filters, .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.filters { margin-bottom: 14px; }
.district-filter { grid-column: 1 / -1; }
label { display: flex; flex-direction: column; gap: 6px; color: var(--ink); font-size: 12.5px; font-weight: 800; }
select, input, textarea { width: 100%; min-height: 44px; padding: 10px 12px; border: 1.5px solid var(--line); border-radius: var(--radius-md); background: var(--surface); color: var(--ink); outline: none; resize: none; }
select:focus, input:focus, textarea:focus { border-color: var(--teal); }
.result-head { margin: 4px 2px 12px; color: var(--ink-muted); font-size: 12.5px; }
.result-head strong { color: var(--ink); font-size: 13.5px; }
.report-list { display: flex; flex-direction: column; gap: 14px; }
.stray-card { width: 100%; display: grid; grid-template-columns: 112px 1fr; overflow: hidden; border-radius: var(--radius-lg); background: var(--surface); box-shadow: var(--shadow-card); text-align: left; transition: transform .2s cubic-bezier(.4,0,.2,1); }
.stray-card:active { transform: scale(.98); }
.photo-wrap { position: relative; min-height: 150px; overflow: hidden; background: #fcf9f2; }
.photo-wrap img, .photo-button img { width: 100%; height: 100%; object-fit: cover; }
.photo-placeholder { position: absolute; inset: 0; display: grid; place-items: center; color: rgba(29,99,96,.55); background: radial-gradient(circle, rgba(29,99,96,.13), transparent 45%), #fcf9f2; }
.condition { position: absolute; left: 9px; bottom: 9px; padding: 4px 8px; border-radius: 999px; background: var(--teal); color: #fff; font-size: 9.5px; font-weight: 800; }
.condition.injured, .condition.critical { background: var(--coral); }
.card-body { min-width: 0; padding: 13px; }
.card-title strong { font-size: 17px; }
.card-title span, .card-foot > span:last-child { color: var(--ink-muted); font-size: 11.5px; font-weight: 700; }
.card-body > p { margin-top: 3px; color: var(--ink-muted); font-size: 12.5px; font-weight: 650; }
.card-body .description { display: -webkit-box; margin-top: 8px; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-height: 1.4; }
.card-foot { align-items: flex-end; margin-top: 11px; }
.rescue-status { display: inline-flex; padding: 4px 9px; border-radius: 999px; background: rgba(239,99,81,.12); color: var(--coral); font-size: 10.5px; font-weight: 800; }
.rescue-status.rescue_dispatched { background: rgba(29,99,96,.1); color: var(--teal); }
.rescue-status.rescued { background: var(--teal); color: #fff; }
.state { min-height: 250px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding: 30px; color: var(--ink-muted); text-align: center; font-size: 13.5px; }
.state.error { color: var(--coral); }
.state button { min-height: 42px; padding: 0 18px; border-radius: 999px; background: var(--teal); color: #fff; font-weight: 800; }
.state-icon { width: 66px; height: 66px; display: grid; place-items: center; border-radius: 50%; background: var(--teal-soft); color: var(--teal); }
.spinner { width: 28px; height: 28px; border: 3px solid var(--teal-soft); border-top-color: var(--teal); border-radius: 50%; animation: spin .7s linear infinite; }
.scrim { position: fixed; inset: 0; z-index: 70; display: flex; align-items: flex-end; justify-content: center; background: rgba(61,56,53,.48); }
.detail-sheet, .report-sheet { width: 100%; max-width: 480px; max-height: 88dvh; overflow-y: auto; padding: 10px 20px calc(var(--safe-bottom) + 24px); border-radius: 26px 26px 0 0; background: var(--bg); }
.grab { width: 42px; height: 5px; margin: 0 auto 18px; border-radius: 999px; background: var(--line); }
.detail-heading { align-items: flex-start; margin-bottom: 14px; }
.detail-heading h2 { margin-top: 6px; font-size: 20px; }
.detail-heading > button { width: 42px; height: 42px; display: grid; place-items: center; border-radius: 50%; background: var(--surface); box-shadow: var(--shadow-card); }
.detail-location { display: flex; align-items: center; gap: 6px; color: var(--teal); font-size: 13px; font-weight: 800; }
.detail-copy { margin: 14px 0; color: var(--ink-muted); font-size: 14px; line-height: 1.55; }
.detail-meta { padding: 11px 0; border-top: 1px solid var(--line); font-size: 13px; }
.detail-meta span { color: var(--ink-muted); }
.contact-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 15px; }
.contact-actions a { min-height: 46px; display: flex; align-items: center; justify-content: center; gap: 7px; border-radius: 999px; background: var(--teal); color: #fff; font-size: 13px; font-weight: 800; text-decoration: none; }
.contact-actions a:last-child { background: var(--teal-soft); color: var(--teal); }
.contact-private { margin-top: 14px; padding: 12px 14px; border-radius: 14px; background: rgba(29,99,96,.08); color: #1d6360; font-size: 12.5px; font-weight: 700; line-height: 1.45; }
.status-actions { margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--line); }
.status-actions p { margin-bottom: 9px; font-size: 13px; font-weight: 800; }
.status-actions button { min-height: 42px; margin: 0 6px 6px 0; padding: 0 12px; border: 1px solid var(--line); border-radius: 999px; background: var(--surface); color: var(--ink-muted); font-size: 12px; font-weight: 800; }
.status-actions button.active { border-color: var(--teal); background: var(--teal); color: #fff; }
.report-sheet { display: flex; flex-direction: column; gap: 13px; }
.photo-button { position: relative; min-height: 150px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 7px; overflow: hidden; border: 2px dashed rgba(29,99,96,.25); border-radius: var(--radius-lg); background: var(--teal-soft); color: var(--teal); font-weight: 800; }
.photo-button img { position: absolute; inset: 0; }
.location-note { display: flex; align-items: center; gap: 5px; color: var(--ink-muted); font-size: 11.5px; font-weight: 650; }
.form-error { color: var(--coral); font-size: 12.5px; font-weight: 750; }
.submit-button { width: 100%; border-radius: var(--radius-md); }
.submit-button:disabled { opacity: .65; }
.fade-enter-active, .fade-leave-active { transition: opacity .2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
