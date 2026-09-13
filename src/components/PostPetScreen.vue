<template>
  <div class="post">
    <header class="top">
      <h1>Post a lost pet</h1>
      <p>Your report appears on the nearby community radar immediately.</p>
    </header>

    <form v-if="!submitted" @submit.prevent="submit">
      <button
        type="button"
        class="photo-drop"
        aria-label="Add photos of your pet"
        @click="addPhoto"
      >
        <img v-if="photo" class="photo-preview" :src="photo" alt="Selected pet" />
        <template v-else>
          <AppIcon name="camera" :size="26" />
          <span>Add photos</span>
          <span class="hint">A clear face photo helps the most</span>
        </template>
      </button>

      <label class="field">
        <span>Pet name</span>
        <input v-model="form.name" type="text" placeholder="e.g. Buddy" required />
      </label>

      <div class="field">
        <span>Species</span>
        <div class="seg" role="group" aria-label="Species">
          <button
            v-for="s in species"
            :key="s"
            type="button"
            :class="{ active: form.species === s }"
            @click="form.species = s"
          >
            {{ s }}
          </button>
        </div>
      </div>

      <label class="field">
        <span>Breed / description</span>
        <input v-model="form.breed" type="text" placeholder="e.g. Golden Retriever, blue collar" />
      </label>

      <label class="field">
        <span>Last seen location</span>
        <div class="input-icon">
          <AppIcon name="pin" :size="17" />
          <input v-model="form.location" type="text" placeholder="Tap to use current location" required />
        </div>
      </label>

      <label class="field">
        <span>Details for the community</span>
        <textarea
          v-model="form.details"
          rows="3"
          placeholder="Temperament, microchip, how to approach&hellip;"
        />
      </label>

      <label class="field">
        <span>Reward (optional)</span>
        <input v-model="form.reward" type="text" inputmode="numeric" placeholder="$" />
      </label>

      <label class="field">
        <span>Contact name</span>
        <input v-model="form.ownerName" type="text" autocomplete="name" required />
      </label>

      <label class="field">
        <span>Contact phone</span>
        <input
          v-model="form.ownerPhone"
          type="tel"
          inputmode="tel"
          autocomplete="tel"
          placeholder="e.g. 9123 4567"
          required
        />
      </label>

      <p v-if="error" class="error-msg">{{ error }}</p>
      <button type="submit" class="submit" :disabled="submitting">
        <AppIcon name="radar" :size="20" />
        {{ submitting ? 'POSTING…' : 'POST LOST PET' }}
      </button>
      <p class="note">Nearby community members can discover the report through Radar.</p>
    </form>

    <div v-else class="success" role="status">
      <span class="success-icon">
        <AppIcon name="check" :size="30" />
      </span>
      <h2>{{ form.name || 'Your pet' }} is on the radar</h2>
      <p>Your report is live on Radar. Check back for sightings and community messages.</p>
      <button class="back-btn" @click="emit('done')">Back to radar</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { Camera, CameraResultType } from '@capacitor/camera'
import AppIcon from './AppIcon.vue'
import { reportLostPet } from '../services/api'
import { getCurrentLocation } from '../services/geolocation'
import type { User } from '../types/user'

const props = defineProps<{ user?: User | null }>()
const emit = defineEmits<{ done: [] }>()

const species = ['Dog', 'Cat', 'Other'] as const
const submitted = ref(false)
const submitting = ref(false)
const error = ref('')
const photo = ref('')
const form = reactive({
  name: '',
  species: 'Dog' as (typeof species)[number],
  breed: '',
  location: '',
  details: '',
  reward: '',
  ownerName: props.user?.name || '',
  ownerPhone: props.user?.phone || '',
})

async function addPhoto() {
  error.value = ''
  try {
    const image = await Camera.getPhoto({
      resultType: CameraResultType.DataUrl,
      quality: 85,
      allowEditing: false,
    })
    photo.value = image.dataUrl ?? ''
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Unable to open the camera.'
  }
}

async function currentCoordinates(): Promise<[number, number]> {
  try {
    const { lat, lng } = await getCurrentLocation()
    return [lng, lat]
  } catch {
    return [114.1694, 22.3193]
  }
}

async function submit() {
  if (submitting.value) return
  submitting.value = true
  error.value = ''
  try {
    const coordinates = await currentCoordinates()
    await reportLostPet({
      name: form.name,
      species: form.species,
      breed: form.breed,
      photo: photo.value,
      description: form.details,
      details: form.details,
      reward: form.reward,
      ownerName: form.ownerName,
      ownerPhone: form.ownerPhone,
      locationName: form.location || 'Current location',
      coordinates,
    })
    submitted.value = true
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to post pet'
  } finally {
    submitting.value = false
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
  color: var(--teal);
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
textarea:focus {
  border-color: var(--teal);
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
  color: var(--teal);
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
  color: var(--teal);
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
  color: #fff;
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
  opacity: 0.7;
}

.error-msg {
  color: var(--coral);
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
  color: var(--teal);
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
