<template>
  <div class="post">
    <header class="top">
      <h1>{{ t('pets.postTitle') }}</h1>
      <p>{{ t('pets.postSubtitle') }}</p>
    </header>

    <form v-if="!submitted" @submit.prevent="submit">
      <button
        type="button"
        class="photo-drop"
        :disabled="submitting"
        :aria-label="t('pets.addPhotosA11y')"
        @click="addPhoto"
      >
        <ManagedImage v-if="photo" class="photo-preview" :src="photo" :alt="t('pets.selectedPhotoAlt')" />
        <template v-else>
          <AppIcon name="camera" :size="26" />
          <span>{{ t('pets.addPhotos') }}</span>
          <span class="hint">{{ t('pets.photoHint') }}</span>
        </template>
      </button>

      <input ref="photoInput" type="file" accept="image/jpeg,image/png,image/webp" hidden @change="selectFile" />
      <ImageUploadStatus :upload="imageUpload" />
      <button v-if="photo" type="button" :disabled="submitting" @click="imageUpload.reset()">{{ t('media.remove') }}</button>

      <label class="field">
        <span>{{ t('pets.nameLabel') }}</span>
        <input v-model="form.name" type="text" :placeholder="t('pets.namePlaceholder')" required />
      </label>

      <div class="field">
        <span>{{ t('pets.speciesLabel') }}</span>
        <div class="seg" role="group" :aria-label="t('pets.speciesLabel')">
          <button
            v-for="s in species"
            :key="s"
            type="button"
            :class="{ active: form.species === s }"
            @click="form.species = s"
          >
            {{ speciesLabel(s) }}
          </button>
        </div>
      </div>

      <label class="field">
        <span>{{ t('pets.breedDescription') }}</span>
        <input v-model="form.breed" type="text" :placeholder="t('pets.breedPlaceholder')" />
      </label>

      <label class="field">
        <span>{{ t('pets.districtLabel') }}</span>
        <select v-model="form.district" required>
          <option value="" disabled>{{ t('pets.selectDistrict') }}</option>
          <option v-for="district in HK_DISTRICTS" :key="district" :value="district">
            {{ districtLabel(district) }}
          </option>
        </select>
      </label>

      <label class="field">
        <span>{{ t('pets.lastSeenLocation') }}</span>
        <div class="input-icon">
          <AppIcon name="pin" :size="17" />
          <input v-model="form.location" type="text" :placeholder="t('pets.locationPlaceholder')" required />
        </div>
      </label>

      <SightingLocationPicker
        :key="locationGeneration"
        v-model="confirmedCoordinates"
        :title="t('pets.lastSeenLocation')"
        :guidance="t('reportLocation.guidance')"
        :disabled="submitting"
      />

      <label class="field">
        <span>{{ t('pets.communityDetails') }}</span>
        <textarea
          v-model="form.details"
          rows="3"
          :placeholder="t('pets.detailsPlaceholder')"
        />
      </label>

      <label class="field">
        <span>{{ t('pets.rewardOptional') }}</span>
        <input v-model="form.reward" type="text" inputmode="numeric" placeholder="$" />
      </label>

      <label class="field">
        <span>{{ t('pets.contactName') }}</span>
        <input v-model="form.ownerName" type="text" autocomplete="name" required />
      </label>

      <label class="field">
        <span>{{ t('pets.contactPhone') }}</span>
        <input
          v-model="form.ownerPhone"
          type="tel"
          inputmode="tel"
          autocomplete="tel"
          placeholder="e.g. 9123 4567"
          required
        />
      </label>

      <p v-if="error" class="error-msg" role="alert">{{ error }}</p>
      <button type="submit" class="submit" :disabled="submitting">
        <AppIcon name="radar" :size="20" />
        {{ submitting ? t('pets.posting') : t('pets.postAction') }}
      </button>
      <p class="note">{{ t('pets.postDiscoveryHelp') }}</p>
    </form>

    <div v-else class="success" role="status">
      <span class="success-icon">
        <AppIcon name="check" :size="30" />
      </span>
      <h2>{{ t('pets.onRadar', { name: form.name || t('pets.yourPet') }) }}</h2>
      <p>{{ t('pets.postSuccess') }}</p>
      <button class="back-btn" @click="emit('done')">{{ t('pets.backToRadar') }}</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import ManagedImage from "./ManagedImage.vue"
import { computed, onBeforeUnmount, reactive, ref } from 'vue'
import { useImageUpload, createImageRequestId } from '../composables/useImageUpload'
import ImageUploadStatus from './ImageUploadStatus.vue'
import { Camera, CameraResultType } from '@capacitor/camera'
import AppIcon from './AppIcon.vue'
import SightingLocationPicker from './SightingLocationPicker.vue'
import { reportLostPet } from '../services/api'
import { isValidSightingCoordinates } from '../utils/sightingSubmission'
import { captureAuthContext, isAuthContextCurrent } from '../services/authSession'
import type { User } from '../types/user'
import { HK_DISTRICTS } from '../types/pet'
import { translateApiError, useAppI18n } from '../i18n'
import { districtLabel, speciesLabel } from '../i18n/formatters'

const props = defineProps<{ user?: User | null }>()
const emit = defineEmits<{ done: [] }>()
const { t } = useAppI18n()

const species = ['Dog', 'Cat', 'Other'] as const
const submitted = ref(false)
const submitting = ref(false)
const error = ref('')
const imageUpload = useImageUpload('pet')
const photo = computed(() => imageUpload.preview)
const photoInput = ref<HTMLInputElement | null>(null)
let submissionId = ''
const confirmedCoordinates = ref<[number, number] | null>(null)
const locationGeneration = ref(0)
let disposed = false
onBeforeUnmount(() => {
  disposed = true
  window.removeEventListener('auth:changed', clearSessionForm)
  window.removeEventListener('auth:unauthorized', clearSessionForm)
  window.removeEventListener('storage', clearSessionForm)
})
const form = reactive({
  name: '',
  species: 'Dog' as (typeof species)[number],
  breed: '',
  district: '',
  location: '',
  details: '',
  reward: '',
  ownerName: props.user?.name || '',
  ownerPhone: props.user?.phone || '',
})

function clearSessionForm(event: Event) {
  if (event instanceof StorageEvent && event.key !== null && event.key !== 'token') return
  submissionId = ''
  confirmedCoordinates.value = null
  locationGeneration.value++
  submitted.value = false
  submitting.value = false
  error.value = ''
  Object.assign(form, { name: '', species: 'Dog', breed: '', district: '', location: '', details: '', reward: '', ownerName: '', ownerPhone: '' })
}
window.addEventListener('auth:changed', clearSessionForm)
window.addEventListener('auth:unauthorized', clearSessionForm)
window.addEventListener('storage', clearSessionForm)

async function addPhoto() {
  const context = captureAuthContext()
  const active = () => !disposed && isAuthContextCurrent(context)
  error.value = ''
  try {
    const image = await Camera.getPhoto({
      resultType: CameraResultType.DataUrl,
      quality: 85,
      allowEditing: false,
    })
    if (active() && image.dataUrl) imageUpload.select(image.dataUrl)
  } catch (e) {
    if (active() && !/cancel/i.test(e instanceof Error ? e.message : '')) photoInput.value?.click()
  }
}
function selectFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (file) imageUpload.select(file)
}

async function submit() {
  if (submitting.value) return
  const context = captureAuthContext()
  const active = () => !disposed && isAuthContextCurrent(context)
  submitting.value = true
  error.value = ''
  try {
    if (!isValidSightingCoordinates(confirmedCoordinates.value)) {
      error.value = t('reportLocation.required')
      return
    }
    const coordinates: [number, number] = [...confirmedCoordinates.value]
    const values = { ...form }
    submissionId ||= createImageRequestId()
    const imageIds = await imageUpload.ensure()
    if (!active()) return
    await reportLostPet({
      name: values.name,
      species: values.species,
      breed: values.breed,
      district: values.district,
      imageIds,
      submissionId,
      description: values.details,
      details: values.details,
      reward: values.reward,
      ownerName: values.ownerName,
      ownerPhone: values.ownerPhone,
      locationName: values.location,
      coordinates,
    })
    if (!active()) return
    submitted.value = true
    imageUpload.finish()
  } catch (e) {
    if (active() && (e as { apiCode?: string } | null)?.apiCode !== 'IMAGE_CANCELLED') {
      error.value = translateApiError(e, 'errors.postPet')
    }
  } finally {
    if (active()) submitting.value = false
  }
}
</script>

<style scoped>
.post {
  padding: calc(var(--safe-top) + 22px) 20px 120px;
  max-width: 480px;
  margin: 0 auto;
}

.top {
  margin-bottom: 20px;
}

h1 {
  font-size: 24px;
  font-weight: 800;
}

.top p {
  color: var(--ink-muted);
  font-size: 14.5px;
  font-weight: 600;
  margin-top: 2px;
}

form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.photo-drop {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 28px 0;
  border-radius: var(--radius-lg);
  border: 2px dashed #bfd8d3;
  background: var(--teal-soft);
  color: var(--color-text-accent);
  font-weight: 800;
  font-size: 15px;
}

.photo-drop .hint {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--ink-muted);
}

.photo-preview {
  width: calc(100% - 24px);
  max-height: 260px;
  border-radius: var(--radius-md);
  object-fit: cover;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.field > span {
  font-size: 13.5px;
  font-weight: 800;
  color: var(--ink);
}

input,
select,
textarea {
  width: 100%;
  padding: 14px 16px;
  border-radius: var(--radius-md);
  border: 1.5px solid var(--line);
  background: var(--surface);
  outline: none;
  transition: border-color 0.15s ease;
  resize: none;
}

input:focus,
select:focus,
textarea:focus {
  border-color: var(--color-border-accent);
}

input::placeholder,
textarea::placeholder {
  color: #b6ada4;
}

.input-icon {
  position: relative;
  display: flex;
  align-items: center;
}

.input-icon svg {
  position: absolute;
  left: 15px;
  color: var(--color-text-accent);
  pointer-events: none;
}

.input-icon input {
  padding-left: 42px;
}

.seg {
  display: flex;
  background: var(--line);
  border-radius: 999px;
  padding: 4px;
}

.seg button {
  flex: 1;
  padding: 10px 0;
  border-radius: 999px;
  font-size: 14px;
  font-weight: 800;
  color: var(--ink-muted);
  transition: all 0.18s ease;
}

.seg button.active {
  background: var(--surface);
  color: var(--color-text-accent);
  box-shadow: var(--shadow-card);
}

.submit {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 17px 0;
  border-radius: var(--radius-md);
  background: var(--coral);
  color: var(--color-text-on-coral);
  font-size: 16px;
  font-weight: 800;
  letter-spacing: 0.05em;
  box-shadow: var(--shadow-float);
  transition: transform 0.15s ease;
  margin-top: 4px;
}

.submit:active {
  transform: scale(0.98);
}

.submit:disabled {
  border: 1px solid var(--color-disabled-border);
  background: var(--color-disabled-surface);
  color: var(--color-disabled-text);
  cursor: not-allowed;
  box-shadow: none;
}

.error-msg {
  color: var(--color-text-urgent);
  font-size: 13.5px;
  font-weight: 700;
  text-align: center;
}

.note {
  text-align: center;
  font-size: 13px;
  color: var(--ink-muted);
  font-weight: 600;
}

.success {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 48px 12px;
  gap: 10px;
}

.success-icon {
  width: 72px;
  height: 72px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--teal-soft);
  color: var(--color-text-accent);
  margin-bottom: 6px;
}

.success h2 {
  font-size: 22px;
  font-weight: 800;
  text-wrap: balance;
}

.success p {
  color: var(--ink-muted);
  font-size: 14.5px;
  max-width: 300px;
  text-wrap: pretty;
}

.back-btn {
  margin-top: 14px;
  padding: 14px 32px;
  border-radius: 999px;
  background: var(--teal);
  color: #fff;
  font-weight: 800;
  font-size: 15px;
}
</style>
