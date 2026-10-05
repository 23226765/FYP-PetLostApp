<template>
  <div class="rescue-screen">
    <header class="top">
      <div>
        <p class="eyebrow">{{ t('strays.title') }}</p>
        <h1>{{ t('strays.mapTitle') }}</h1>
      </div>
      <button class="report-button" type="button" @click="openReportForm">
        <AppIcon name="plus" :size="18" />
        {{ t('navigation.report') }}
      </button>
    </header>

    <div class="view-toggle theme-segmented-control" role="tablist" :aria-label="t('strays.view')">
      <button class="theme-segmented-option" :class="{ active: view === 'list' }" role="tab" :aria-selected="view === 'list'" @click="view = 'list'">
        <AppIcon name="list" :size="17" /> {{ t('radar.list') }}
      </button>
      <button class="theme-segmented-option" :class="{ active: view === 'map' }" role="tab" :aria-selected="view === 'map'" @click="view = 'map'">
        <AppIcon name="map" :size="17" /> {{ t('radar.map') }}
      </button>
    </div>

    <div class="filters">
      <label>
        <span>{{ t('strays.animal') }}</span>
        <select v-model="speciesFilter">
          <option value="">{{ t('strays.allAnimals') }}</option>
          <option value="Dog">{{ speciesLabel('Dog') }}</option>
          <option value="Cat">{{ speciesLabel('Cat') }}</option>
          <option value="Other">{{ speciesLabel('Other') }}</option>
        </select>
      </label>
      <label>
        <span>{{ t('strays.rescueStatus') }}</span>
        <select v-model="statusFilter">
          <option value="">{{ t('strays.allStatuses') }}</option>
          <option value="reported">{{ t('strays.needsHelpStatus') }}</option>
          <option value="rescue_dispatched">{{ t('strays.helpDispatched') }}</option>
          <option value="rescued">{{ t('strays.rescued') }}</option>
        </select>
      </label>
      <label class="district-filter">
        <span>{{ t('radar.district') }}</span>
        <select v-model="districtFilter">
          <option value="">{{ t('radar.allDistricts') }}</option>
          <option v-for="district in HK_DISTRICTS" :key="district" :value="district">{{ districtLabel(district) }}</option>
        </select>
      </label>
    </div>

    <div class="result-head">
      <strong>{{ t('strays.nearbyReports', { count: strays.length }) }}</strong>
      <span>{{ t('radar.locationRadius', { location: '', radius: radiusKm }).replace(/^\s*[,，]\s*/, '') }}</span>
    </div>

    <div v-if="loading" class="state" role="status"><span class="spinner" />{{ t('strays.loadingReports') }}</div>
    <div v-else-if="error" class="state error" role="alert">
      <p>{{ error }}</p>
      <button type="button" @click="loadStrays">{{ t('common.retry') }}</button>
    </div>
    <div v-else-if="strays.length === 0" class="state">
      <span class="state-icon"><AppIcon name="paw" :size="30" /></span>
      <strong>{{ t('strays.noMatching') }}</strong>
      <p>{{ t('strays.changeFilters') }}</p>
    </div>
    <div v-else-if="view === 'list'" class="report-list">
      <article v-for="stray in strays" :key="stray.id" class="stray-card" tabindex="0" role="link" :aria-label="t('strays.openPost', { species: animalLabel(stray), author: stray.author.name })" @click="openStray(stray)" @keydown.enter="openStray(stray)">
        <div class="post-author">
          <span class="author-avatar"><ManagedImage v-if="stray.author.avatar" :src="normalizedImageUrl(stray.author.avatar)" alt="" /><AppIcon v-else name="user" :size="17" /></span>
          <span><strong>{{ stray.author.name }}</strong><small>{{ formatRelativeDate(stray.createdAt) }} · {{ districtLabel(stray.district) }}</small></span>
          <span class="rescue-status" :class="stray.rescueStatus">{{ statusLabel(stray.rescueStatus) }}</span>
        </div>
        <div class="photo-wrap">
          <ManagedImage v-if="imageUrl(stray) && !failedImages.has(stray.id)" :src="imageUrl(stray)" :alt="t('strays.reportedAlt', { species: animalLabel(stray) })" @error="markImageFailed(stray.id)" />
          <span v-else class="photo-placeholder"><AppIcon name="paw" :size="34" /></span>
          <span class="condition" :class="stray.condition">{{ conditionLabel(stray.condition) }}</span>
        </div>
        <div class="card-body">
          <div class="card-title"><strong>{{ animalLabel(stray) }}</strong><span v-if="stray.distanceKm !== undefined">{{ t('common.kilometres', { count: stray.distanceKm }) }}</span></div>
          <p>{{ stray.location }}</p>
          <p class="description">{{ stray.description }}</p>
          <p v-if="stray.commentPreview" class="comment-preview">💬 {{ stray.commentPreview }}</p>
          <div class="card-foot"><span>{{ t('strays.commentsCount', { count: stray.commentCount }) }}</span><span>{{ conditionLabel(stray.condition) }}</span></div>
        </div>
        <div class="card-actions">
          <button type="button" @click.stop="openStray(stray)"><AppIcon name="message" :size="18" />{{ t('strays.comment') }}</button>
          <button type="button" :class="{ active: stray.isSaved }" @click.stop="toggleSave(stray)"><span aria-hidden="true">🔖</span>{{ stray.isSaved ? t('strays.unsave') : t('strays.save') }}</button>
          <button type="button" @click.stop="openStray(stray)"><AppIcon name="send" :size="18" />{{ t('strays.share') }}</button>
        </div>
      </article>
    </div>
    <MapView
      v-else
      :pets="[]"
      :strays="strays"
      :center="userLocation"
      :radius-km="radiusKm"
      @open-stray="openStray"
    />

    <Transition name="fade">
      <div v-if="showReportForm" class="scrim" @click.self="showReportForm = false">
        <form class="report-sheet" @submit.prevent="submitReport">
          <div class="grab" />
          <div class="detail-heading">
            <div><p class="eyebrow">{{ t('strays.newReport') }}</p><h2>{{ t('strays.animalDetails') }}</h2></div>
            <button type="button" :aria-label="t('strays.closeForm')" @click="showReportForm = false"><AppIcon name="close" :size="20" /></button>
          </div>
          <input ref="photoInput" class="sr-only" type="file" accept="image/jpeg,image/png,image/webp" @change="onPhotoSelected" />
          <button class="photo-button" type="button" :disabled="submitting" @click="addPhoto">
            <ManagedImage v-if="form.photo" :src="form.photo" :alt="t('strays.selectedAlt')" />
            <template v-else><AppIcon name="camera" :size="25" /><span>{{ t('strays.addPhoto') }}</span></template>
          </button>
          <button v-if="form.photo" class="remove-photo" type="button" :disabled="submitting" @click="imageUpload.reset(); form.photo = ''">{{ t('strays.removePhoto') }}</button>
          <ImageUploadStatus :upload="imageUpload" />
          <div class="form-grid">
            <label><span>{{ t('strays.animal') }}</span><select v-model="form.species" required><option value="Dog">{{ speciesLabel('Dog') }}</option><option value="Cat">{{ speciesLabel('Cat') }}</option><option value="Other">{{ speciesLabel('Other') }}</option></select></label>
            <label><span>{{ t('strays.condition') }}</span><select v-model="form.condition" required><option value="unknown">{{ t('strays.unknownCondition') }}</option><option value="healthy">{{ t('strays.appearsHealthy') }}</option><option value="injured">{{ t('strays.injured') }}</option><option value="critical">{{ t('strays.critical') }}</option></select></label>
          </div>
          <label v-if="form.species === 'Other'"><span>{{ t('strayAnimal.typeLabel') }}</span><input v-model.trim="form.animalType" required maxlength="80" autocomplete="off" :placeholder="t('strayAnimal.typePlaceholder')" /></label>
          <label><span>{{ t('radar.district') }}</span><select v-model="form.district" required><option value="" disabled>{{ t('strays.selectDistrict') }}</option><option v-for="district in HK_DISTRICTS" :key="district" :value="district">{{ districtLabel(district) }}</option></select></label>
          <label><span>{{ t('strays.locationDescription') }}</span><input v-model="form.locationName" required :placeholder="t('strays.locationDescriptionPlaceholder')" /></label>
          <label><span>{{ t('strays.observation') }}</span><textarea v-model="form.description" rows="3" required :placeholder="t('strays.observationPlaceholder')" /></label>
          <label><span>{{ t('strays.observedAt') }}</span><input v-model="form.observedAt" required type="datetime-local" :max="maxObservedAt" /></label>
          <SightingLocationPicker v-model="form.coordinates" :initial-center="initialPickerCenter" :title="t('strays.whereAnimal')" />
          <p v-if="reportError" class="form-error" role="alert">{{ reportError }}</p>
          <button class="submit-button" type="submit" :disabled="submitting">
            <AppIcon name="radar" :size="19" />{{ submitLabel }}
          </button>
        </form>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import ManagedImage from "./ManagedImage.vue"
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Camera, CameraResultType } from '@capacitor/camera'
import AppIcon from './AppIcon.vue'
import MapView from './MapView.vue'
import SightingLocationPicker from './SightingLocationPicker.vue'
import { getNearbyStrays, reportStray, setStraySaved } from '../services/api'
import { useImageUpload } from '../composables/useImageUpload'
import ImageUploadStatus from './ImageUploadStatus.vue'
import { HK_DISTRICTS } from '../types/pet'
import type { User } from '../types/user'
import type { RescueStatus, StrayCondition, StrayReport } from '../types/stray'
import { translateApiError, useAppI18n } from '../i18n'
import { districtLabel, formatRelativeDate, rescueStatusLabel, speciesLabel, strayAnimalLabel, strayConditionLabel } from '../i18n/formatters'

const props = defineProps<{
  user: User | null
  radiusKm: number
  userLocation: { lat: number; lng: number } | null
  reportRequest?: number
}>()
const emit = defineEmits<{ 'auth-needed': [] }>()
const router = useRouter()
const { t } = useAppI18n()

const HK_CENTER = { lat: 22.3193, lng: 114.1694 }
const view = ref<'list' | 'map'>('list')
const strays = ref<StrayReport[]>([])
const loading = ref(false)
const error = ref('')
const speciesFilter = ref('')
const statusFilter = ref('')
const districtFilter = ref('')
const failedImages = ref(new Set<string>())
const showReportForm = ref(false)
const submitting = ref(false)
const reportError = ref('')
const uploadStage = ref<'idle' | 'uploading' | 'posting'>('idle')
const photoInput = ref<HTMLInputElement | null>(null)
const imageUpload = useImageUpload('stray')
watch(showReportForm, (open) => { if (!open && imageUpload.uploading) imageUpload.cancel() })
let requestSequence = 0
let abortController: AbortController | null = null

const form = reactive({
  species: 'Dog' as StrayReport['species'],
  animalType: '',
  condition: 'unknown' as StrayCondition,
  district: '',
  locationName: '',
  description: '',
  photo: '',
  coordinates: null as [number, number] | null,
  observedAt: new Date().toISOString().slice(0, 16),
  submissionId: '',
})
const maxObservedAt = computed(() => new Date().toISOString().slice(0, 16))
const initialPickerCenter = computed<[number, number] | null>(() => props.userLocation ? [props.userLocation.lng, props.userLocation.lat] : null)
const submitLabel = computed(() => uploadStage.value === 'uploading' ? t('strays.uploadingPhoto') : uploadStage.value === 'posting' ? t('strays.publishing') : t('strays.publish'))
const uniqueId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`

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
  return strayConditionLabel(value)
}
function statusLabel(value: RescueStatus) {
  return rescueStatusLabel(value)
}
function animalLabel(stray: StrayReport) {
  return strayAnimalLabel(stray.species, stray.animalType)
}

async function loadStrays() {
  const sequence = ++requestSequence
  abortController?.abort()
  const controller = new AbortController()
  abortController = controller
  loading.value = true
  error.value = ''
  strays.value = []
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
    if (sequence === requestSequence) error.value = translateApiError(caught, 'errors.loadStrays')
  } finally {
    if (sequence === requestSequence) loading.value = false
  }
}

function openReportForm() {
  if (!props.user) { emit('auth-needed'); return }
  reportError.value = ''
  if (!form.submissionId) form.submissionId = uniqueId()
  showReportForm.value = true
}

function openStray(stray: StrayReport) { void router.push(`/strays/${stray.id}`) }

async function toggleSave(stray: StrayReport) {
  if (!props.user) { emit('auth-needed'); return }
  const target = !stray.isSaved
  try { stray.isSaved = await setStraySaved(stray.id, target) }
  catch (cause) { reportError.value = translateApiError(cause, 'errors.updateSaved') }
}

async function addPhoto() {
  reportError.value = ''
  try {
    const image = await Camera.getPhoto({ resultType: CameraResultType.DataUrl, quality: 82, allowEditing: false })
    if (image.dataUrl) { imageUpload.select(image.dataUrl); form.photo = imageUpload.preview }
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : ''
    if (message.toLowerCase().includes('cancel')) return
    photoInput.value?.click()
  }
}

function onPhotoSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
    reportError.value = t('validation.rescueImage'); input.value = ''; return
  }
  imageUpload.select(file); form.photo = imageUpload.preview; input.value = ''
}

async function submitReport() {
  if (submitting.value) return
  submitting.value = true
  reportError.value = ''
  try {
    if (!props.user) { emit('auth-needed'); return }
    if (!form.photo) throw new Error(t('validation.rescuePhotoRequired'))
    if (!form.coordinates) throw new Error(t('validation.rescueLocationRequired'))
    if (form.species === 'Other' && !form.animalType.trim()) throw new Error(t('strayAnimal.typeRequired'))
    uploadStage.value = 'uploading'
    const imageIds = await imageUpload.ensure()
    uploadStage.value = 'posting'
    const created = await reportStray({
      species: form.species,
      animalType: form.species === 'Other' ? form.animalType.trim() : undefined,
      condition: form.condition,
      district: form.district,
      locationName: form.locationName,
      description: form.description,
      imageIds,
      coordinates: form.coordinates,
      observedAt: new Date(form.observedAt).toISOString(),
      rescueStatus: 'reported',
      submissionId: form.submissionId,
    })
    strays.value = [created, ...strays.value.filter((item) => item.id !== created.id)]
    showReportForm.value = false
    form.locationName = ''
    form.animalType = ''
    form.description = ''
    form.photo = ''
    imageUpload.finish()
    form.coordinates = null
    form.observedAt = new Date().toISOString().slice(0, 16)
    form.submissionId = ''
    await router.push(`/strays/${created.id}`)
  } catch (caught) {
    reportError.value = translateApiError(caught, 'errors.submitStray')
  } finally { submitting.value = false; uploadStage.value = 'idle' }
}

watch(
  [() => props.radiusKm, () => props.userLocation, () => props.user?.id, speciesFilter, statusFilter, districtFilter],
  loadStrays,
  { immediate: true, deep: true },
)
watch(() => props.reportRequest, (value, previous) => {
  if (value && value !== previous) openReportForm()
}, { immediate: true })
onBeforeUnmount(() => { requestSequence += 1; abortController?.abort() })
</script>

<style scoped>
.rescue-screen { max-width: 480px; min-height: 100dvh; margin: 0 auto; padding: calc(var(--safe-top) + 18px) 18px 120px; }
.top, .detail-heading, .result-head, .card-title, .card-foot, .detail-meta { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.top { margin-bottom: 16px; }
.eyebrow { color: var(--color-text-urgent); font-size: 11.5px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
h1 { font-size: 22px; font-weight: 850; }
.report-button, .submit-button { min-height: 44px; display: inline-flex; align-items: center; justify-content: center; gap: 7px; border-radius: 999px; background: var(--coral); color: var(--color-text-on-coral); font-weight: 800; box-shadow: var(--shadow-card); }
.report-button { padding: 0 14px; }
.view-toggle { margin-bottom: 14px; }
.filters, .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.filters { margin-bottom: 14px; }
.district-filter { grid-column: 1 / -1; }
label { display: flex; flex-direction: column; gap: 6px; color: var(--ink); font-size: 12.5px; font-weight: 800; }
select, input, textarea { width: 100%; min-height: 44px; padding: 10px 12px; border: 1.5px solid var(--line); border-radius: var(--radius-md); background: var(--surface); color: var(--ink); outline: none; resize: none; }
select:focus, input:focus, textarea:focus { border-color: var(--color-border-accent); }
.result-head { margin: 4px 2px 12px; color: var(--ink-muted); font-size: 12.5px; }
.result-head strong { color: var(--ink); font-size: 13.5px; }
.report-list { display: flex; flex-direction: column; gap: 14px; }
.stray-card { width: 100%; display: grid; grid-template-columns: 112px 1fr; overflow: hidden; border-radius: var(--radius-lg); background: var(--surface); box-shadow: var(--shadow-card); text-align: left; transition: transform .2s cubic-bezier(.4,0,.2,1); }
.stray-card:focus-visible { outline: 3px solid var(--color-focus); outline-offset: 2px; }
.stray-card:active { transform: scale(.98); }
.post-author { grid-column: 1 / -1; display: flex; align-items: center; gap: 9px; padding: 11px 12px; }
.post-author > span:nth-child(2) { min-width: 0; flex: 1; }
.post-author strong, .post-author small { display: block; }
.post-author small { margin-top: 2px; color: var(--ink-muted); font-size: 10.5px; }
.author-avatar { width: 34px; height: 34px; display: grid; place-items: center; overflow: hidden; border-radius: 50%; background: var(--teal-soft); color: var(--color-icon-primary); }
.author-avatar img { width: 100%; height: 100%; object-fit: cover; }
.photo-wrap { position: relative; min-height: 150px; overflow: hidden; background: var(--color-surface-subtle); }
.photo-wrap img, .photo-button img { width: 100%; height: 100%; object-fit: cover; }
.photo-placeholder { position: absolute; inset: 0; display: grid; place-items: center; color: var(--color-icon-primary); background: radial-gradient(circle, color-mix(in srgb, var(--color-icon-primary) 13%, transparent), transparent 45%), var(--color-surface-subtle); }
.condition { position: absolute; left: 9px; bottom: 9px; padding: 4px 8px; border-radius: 999px; background: var(--teal); color: #fff; font-size: 9.5px; font-weight: 800; }
.condition.injured, .condition.critical { background: var(--coral); }
.card-body { min-width: 0; padding: 13px; }
.card-title strong { font-size: 17px; }
.card-title span, .card-foot > span:last-child { color: var(--ink-muted); font-size: 11.5px; font-weight: 700; }
.card-body > p { margin-top: 3px; color: var(--ink-muted); font-size: 12.5px; font-weight: 650; }
.card-body .description { display: -webkit-box; margin-top: 8px; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-height: 1.4; }
.card-body .comment-preview { display: -webkit-box; margin-top: 7px; overflow: hidden; color: var(--ink); -webkit-box-orient: vertical; -webkit-line-clamp: 1; }
.card-foot { align-items: flex-end; margin-top: 11px; }
.card-actions { grid-column: 1 / -1; display: grid; grid-template-columns: repeat(3, 1fr); border-top: 1px solid var(--line); }
.card-actions button { min-height: 46px; display: flex; align-items: center; justify-content: center; gap: 5px; color: var(--color-text-accent); font-size: 11.5px; font-weight: 800; }
.card-actions button.active { background: var(--teal-soft); }
.rescue-status { display: inline-flex; padding: 4px 9px; border-radius: 999px; background: rgba(239,99,81,.12); color: var(--color-text-urgent); font-size: 10.5px; font-weight: 800; }
.rescue-status.rescue_dispatched { background: rgba(29,99,96,.1); color: var(--color-text-accent); }
.rescue-status.rescued { background: var(--teal); color: #fff; }
.state { min-height: 250px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding: 30px; color: var(--ink-muted); text-align: center; font-size: 13.5px; }
.state.error { color: var(--color-text-urgent); }
.state button { min-height: 42px; padding: 0 18px; border-radius: 999px; background: var(--teal); color: #fff; font-weight: 800; }
.state-icon { width: 66px; height: 66px; display: grid; place-items: center; border-radius: 50%; background: var(--teal-soft); color: var(--color-icon-primary); }
.spinner { width: 28px; height: 28px; border: 3px solid var(--teal-soft); border-top-color: var(--teal); border-radius: 50%; animation: spin .7s linear infinite; }
.scrim { position: fixed; inset: 0; z-index: 70; display: flex; align-items: flex-end; justify-content: center; background: rgba(61,56,53,.48); }
.detail-sheet, .report-sheet { width: 100%; max-width: 480px; max-height: 88dvh; overflow-y: auto; padding: 10px 20px calc(var(--safe-bottom) + 24px); border-radius: 26px 26px 0 0; background: var(--bg); }
.grab { width: 42px; height: 5px; margin: 0 auto 18px; border-radius: 999px; background: var(--line); }
.detail-heading { align-items: flex-start; margin-bottom: 14px; }
.detail-heading h2 { margin-top: 6px; font-size: 20px; }
.detail-heading > button { width: 42px; height: 42px; display: grid; place-items: center; border-radius: 50%; background: var(--surface); box-shadow: var(--shadow-card); }
.detail-location { display: flex; align-items: center; gap: 6px; color: var(--color-text-accent); font-size: 13px; font-weight: 800; }
.detail-copy { margin: 14px 0; color: var(--ink-muted); font-size: 14px; line-height: 1.55; }
.detail-meta { padding: 11px 0; border-top: 1px solid var(--line); font-size: 13px; }
.detail-meta span { color: var(--ink-muted); }
.contact-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 15px; }
.contact-actions a { min-height: 46px; display: flex; align-items: center; justify-content: center; gap: 7px; border-radius: 999px; background: var(--teal); color: #fff; font-size: 13px; font-weight: 800; text-decoration: none; }
.contact-actions a:last-child { background: var(--teal-soft); color: var(--color-text-accent); }
.contact-private { margin-top: 14px; padding: 12px 14px; border-radius: 14px; background: var(--color-surface-selected); color: var(--color-text-accent); font-size: 12.5px; font-weight: 700; line-height: 1.45; }
.status-actions { margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--line); }
.status-actions p { margin-bottom: 9px; font-size: 13px; font-weight: 800; }
.status-actions button { min-height: 42px; margin: 0 6px 6px 0; padding: 0 12px; border: 1px solid var(--line); border-radius: 999px; background: var(--surface); color: var(--ink-muted); font-size: 12px; font-weight: 800; }
.status-actions button.active { border-color: var(--teal); background: var(--teal); color: #fff; }
.report-sheet { display: flex; flex-direction: column; gap: 13px; }
.photo-button { position: relative; min-height: 150px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 7px; overflow: hidden; border: 2px dashed var(--color-border-accent); border-radius: var(--radius-lg); background: var(--teal-soft); color: var(--color-text-accent); font-weight: 800; }
.photo-button img { position: absolute; inset: 0; }
.remove-photo { align-self: flex-end; min-height: 36px; padding: 0 12px; border-radius: 999px; background: rgba(239,99,81,.1); color: var(--color-text-urgent); font-size: 12px; font-weight: 800; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
.location-note { display: flex; align-items: center; gap: 5px; color: var(--ink-muted); font-size: 11.5px; font-weight: 650; }
.form-error { color: var(--color-text-urgent); font-size: 12.5px; font-weight: 750; }
.submit-button { width: 100%; border-radius: var(--radius-md); }
.submit-button:disabled { border: 1px solid var(--color-disabled-border); background: var(--color-disabled-surface); color: var(--color-disabled-text); cursor: not-allowed; box-shadow: none; }
.fade-enter-active, .fade-leave-active { transition: opacity .2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
