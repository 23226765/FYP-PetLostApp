<template>
  <div class="app">
    <!-- Proximity notification toast -->
    <Transition name="toast">
      <button v-if="toastPet" class="toast" aria-live="polite" @click="openFromToast">
        <img :src="toastPet.photo" alt="" />
        <span class="toast-text">
          <strong>{{ toastPet.name }} is {{ toastPet.distanceKm }} km away!</strong>
          <span>Last seen {{ toastPet.location }} · Tap to view</span>
        </span>
        <AppIcon name="chevron" :size="18" />
      </button>
    </Transition>

    <main>
      <RadarScreen
        v-show="tab === 'radar'"
        :pets="pets"
        :loading="loading"
        :error="error"
        :radius-km="radiusKm"
        :species="species"
        :user-location="userLocation"
        @open="openPet"
        @found="openSighting"
        @retry="loadPets"
        @radius-change="onRadiusChange"
        @species-change="onSpeciesChange"
      />
      <PostPetScreen v-if="tab === 'post'" @done="onPosted" />
      <ProfileScreen v-if="tab === 'profile'" />
    </main>

    <!-- Pet detail overlay -->
    <Transition name="page">
      <PetDetail
        v-if="selectedPet"
        :pet="selectedPet"
        @close="selectedPet = null"
        @found="openSighting(selectedPet)"
      />
    </Transition>

    <!-- 'Found it?' sighting sheet -->
    <Transition name="fade">
      <div v-if="sightingPet" class="scrim" @click.self="closeSighting">
        <div
          class="sheet"
          role="dialog"
          aria-modal="true"
          :aria-label="`Report a sighting of ${sightingPet.name}`"
        >
          <div class="grab" />
          <template v-if="!sightingSent">
            <div class="sheet-head">
              <img :src="sightingPet.photo" alt="" />
              <div>
                <h2>You found {{ sightingPet.name }}?</h2>
                <p>Your location will be shared with the owner.</p>
              </div>
            </div>
            <label class="sheet-field">
              <span>What did you see?</span>
              <textarea
                v-model="sightingNote"
                rows="3"
                :placeholder="`e.g. Spotted near the bakery on Elm Street, heading north\u2026`"
              />
            </label>
            <button class="sheet-photo" type="button">
              <AppIcon name="camera" :size="19" />
              Attach a photo
            </button>
            <p v-if="sightingError" class="sheet-error">{{ sightingError }}</p>
            <button class="sheet-send" @click="sendSighting">
              <AppIcon name="pin" :size="19" />
              Send sighting to owner
            </button>
          </template>
          <div v-else class="sheet-success" role="status">
            <span class="check">
              <AppIcon name="check" :size="26" />
            </span>
            <h2>Sighting sent!</h2>
            <p>
              {{ sightingPet.owner }} has been notified with your location. Thank you for
              helping!
            </p>
            <button class="sheet-send" @click="closeSighting">Done</button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Bottom tab bar -->
    <nav class="tabbar" aria-label="Main navigation">
      <button
        :class="{ active: tab === 'radar' }"
        :aria-current="tab === 'radar' ? 'page' : undefined"
        @click="goTab('radar')"
      >
        <AppIcon name="radar" :size="23" />
        <span>Radar</span>
      </button>
      <button class="post-btn" aria-label="Post a lost pet" @click="goTab('post')">
        <AppIcon name="plus" :size="26" />
      </button>
      <button
        :class="{ active: tab === 'profile' }"
        :aria-current="tab === 'profile' ? 'page' : undefined"
        @click="goTab('profile')"
      >
        <AppIcon name="user" :size="23" />
        <span>Profile</span>
      </button>
    </nav>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { Pet } from './types/pet'
import { getNearbyPets, reportSighting } from './services/api'
import AppIcon from './components/AppIcon.vue'
import RadarScreen from './components/RadarScreen.vue'
import PostPetScreen from './components/PostPetScreen.vue'
import ProfileScreen from './components/ProfileScreen.vue'
import PetDetail from './components/PetDetail.vue'

type Tab = 'radar' | 'post' | 'profile'

// Hong Kong centre — fallback when geolocation is unavailable/denied.
const DEFAULT_CENTER = { lat: 22.2825, lng: 114.1897 }

type SpeciesFilter = 'All' | 'Dogs' | 'Cats' | 'Other'

const tab = ref<Tab>('radar')
const pets = ref<Pet[]>([])
const loading = ref(true)
const error = ref('')
const radiusKm = ref(3)
const species = ref<SpeciesFilter>('All')
const userLocation = ref<{ lat: number; lng: number } | null>(null)
const selectedPet = ref<Pet | null>(null)
const sightingPet = ref<Pet | null>(null)
const sightingNote = ref('')
const sightingSent = ref(false)
const sightingError = ref('')
const toastPet = ref<Pet | null>(null)

function getUserLocation(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(DEFAULT_CENTER)
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(DEFAULT_CENTER),
      { timeout: 5000 },
    )
  })
}

async function loadPets() {
  loading.value = true
  error.value = ''
  try {
    const { lat, lng } = await getUserLocation()
    userLocation.value = { lat, lng }
    const speciesParam =
      species.value === 'All'
        ? undefined
        : species.value === 'Dogs'
          ? 'Dog'
          : species.value === 'Cats'
            ? 'Cat'
            : 'Other'
    pets.value = await getNearbyPets({ lat, lng, radiusKm: radiusKm.value, species: speciesParam })
    scheduleToast()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load nearby pets'
  } finally {
    loading.value = false
  }
}

function onRadiusChange(value: number) {
  radiusKm.value = value
  loadPets()
}

function onSpeciesChange(value: SpeciesFilter) {
  species.value = value
  loadPets()
}

function scheduleToast() {
  if (!pets.value.length) return
  setTimeout(() => {
    toastPet.value = pets.value[0] ?? null
    setTimeout(() => {
      if (toastPet.value?.id === pets.value[0]?.id) toastPet.value = null
    }, 7000)
  }, 2200)
}

function goTab(t: Tab) {
  tab.value = t
  selectedPet.value = null
}

function openPet(pet: Pet) {
  selectedPet.value = pet
}

function openSighting(pet: Pet | null) {
  if (!pet) return
  sightingPet.value = pet
  sightingSent.value = false
  sightingNote.value = ''
  sightingError.value = ''
}

function closeSighting() {
  if (sightingSent.value && sightingPet.value) {
    const p = pets.value.find((x) => x.id === sightingPet.value?.id)
    if (p) p.status = 'sighted'
    selectedPet.value = null
  }
  sightingPet.value = null
}

async function sendSighting() {
  const pet = sightingPet.value
  if (!pet) return
  sightingError.value = ''
  try {
    const { lat, lng } = await getUserLocation()
    await reportSighting(pet.id, {
      coordinates: [lng, lat],
      note: sightingNote.value,
      locationName: pet.location,
    })
    sightingSent.value = true
    const p = pets.value.find((x) => x.id === pet.id)
    if (p) p.status = 'sighted'
  } catch (e) {
    sightingError.value = e instanceof Error ? e.message : 'Failed to send sighting'
  }
}

function onPosted() {
  tab.value = 'radar'
  loadPets()
}

function openFromToast() {
  if (toastPet.value) {
    selectedPet.value = toastPet.value
    toastPet.value = null
    tab.value = 'radar'
  }
}

onMounted(loadPets)
</script>

<style scoped>
.app {
  min-height: 100dvh;
  background: var(--bg);
}

main {
  min-height: 100dvh;
}

/* Proximity toast */
.toast {
  position: fixed;
  top: calc(var(--safe-top) + 12px);
  left: 50%;
  transform: translateX(-50%);
  width: min(92%, 440px);
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: var(--surface);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-float);
  z-index: 60;
  text-align: left;
}

.toast.toast-enter-from,
.toast.toast-leave-to {
  transform: translate(-50%, -140%);
}

.toast-enter-active,
.toast-leave-active {
  transition: transform 0.3s cubic-bezier(0.3, 0.8, 0.4, 1);
}

.toast img {
  width: 46px;
  height: 46px;
  border-radius: 50%;
  object-fit: cover;
  border: 2.5px solid var(--coral);
  flex-shrink: 0;
}

.toast-text {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.toast-text strong {
  font-size: 14.5px;
  font-weight: 800;
  color: var(--ink);
}

.toast-text span {
  font-size: 12.5px;
  color: var(--ink-muted);
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.toast > svg {
  color: var(--ink-muted);
  flex-shrink: 0;
}

/* Detail page transition */
.page-enter-active,
.page-leave-active {
  transition: all 0.28s cubic-bezier(0.3, 0.8, 0.4, 1);
}

.page-enter-from,
.page-leave-to {
  transform: translateY(24px);
  opacity: 0;
}

/* Sighting sheet */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.22s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.scrim {
  position: fixed;
  inset: 0;
  z-index: 70;
  background: rgba(61, 56, 53, 0.45);
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.sheet {
  width: 100%;
  max-width: 480px;
  background: var(--bg);
  border-radius: 26px 26px 0 0;
  padding: 10px 20px calc(var(--safe-bottom) + 24px);
  animation: sheet-up 0.3s cubic-bezier(0.3, 0.8, 0.4, 1);
}

.grab {
  width: 42px;
  height: 5px;
  border-radius: 999px;
  background: var(--line);
  margin: 0 auto 18px;
}

.sheet-head {
  display: flex;
  gap: 14px;
  align-items: center;
  margin-bottom: 16px;
}

.sheet-head img {
  width: 58px;
  height: 58px;
  border-radius: var(--radius-md);
  object-fit: cover;
}

.sheet-head h2 {
  font-size: 18px;
  font-weight: 800;
}

.sheet-head p {
  font-size: 13px;
  color: var(--ink-muted);
  font-weight: 600;
}

.sheet-field {
  display: flex;
  flex-direction: column;
  gap: 7px;
  margin-bottom: 12px;
}

.sheet-field span {
  font-size: 13.5px;
  font-weight: 800;
}

.sheet-field textarea {
  width: 100%;
  padding: 13px 15px;
  border-radius: var(--radius-md);
  border: 1.5px solid var(--line);
  background: var(--surface);
  outline: none;
  resize: none;
}

.sheet-field textarea:focus {
  border-color: var(--teal);
}

.sheet-photo {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 13px 0;
  border-radius: var(--radius-md);
  background: var(--teal-soft);
  color: var(--teal);
  font-weight: 800;
  font-size: 14.5px;
  margin-bottom: 12px;
}

.sheet-error {
  color: var(--coral);
  font-size: 13px;
  font-weight: 700;
  margin: -4px 0 12px;
}

.sheet-send {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  width: 100%;
  padding: 16px 0;
  border-radius: var(--radius-md);
  background: var(--teal);
  color: #fff;
  font-size: 15.5px;
  font-weight: 800;
  box-shadow: var(--shadow-float);
}

.sheet-success {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 6px;
  padding: 8px 0 4px;
}

.sheet-success .check {
  width: 58px;
  height: 58px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--teal-soft);
  color: var(--teal);
  margin-bottom: 4px;
}

.sheet-success h2 {
  font-size: 19px;
  font-weight: 800;
}

.sheet-success p {
  font-size: 14px;
  color: var(--ink-muted);
  max-width: 290px;
  margin-bottom: 12px;
  text-wrap: pretty;
}

/* Bottom tab bar */
.tabbar {
  position: fixed;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 100%;
  max-width: 480px;
  display: flex;
  align-items: flex-end;
  justify-content: space-around;
  padding: 8px 6px calc(var(--safe-bottom) + 10px);
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(12px);
  border-top: 1px solid var(--line);
  z-index: 40;
}

.tabbar > button {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  font-size: 10.5px;
  font-weight: 800;
  color: var(--ink-muted);
  width: 62px;
  padding: 4px 0;
  transition: color 0.15s ease;
}

.tabbar > button.active {
  color: var(--teal);
}

.post-btn {
  width: 56px;
  height: 56px;
  margin-top: -26px;
  border-radius: 50%;
  background: var(--coral);
  color: #fff !important;
  display: grid;
  place-items: center;
  box-shadow: 0 6px 18px rgba(239, 99, 81, 0.45);
  transition: transform 0.15s ease;
}

.post-btn:active {
  transform: scale(0.92);
}
</style>
