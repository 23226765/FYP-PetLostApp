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
        @smart-match="showSmartMatch = true"
        @notifications="showNotifications = true"
      />
      <PostPetScreen v-if="tab === 'post'" :user="currentUser" @done="onPosted" />
      <ProfileScreen
        v-if="tab === 'profile'"
        :user="currentUser"
        @login="authOpen = true"
        @logout="logout"
        @open-settings="showSettings = true"
        @open-activity="showActivity = true"
        @open-inbox="openInbox"
        @open-boost="showBoost = true"
      />
    </main>

    <!-- Pet detail overlay -->
    <Transition name="page">
      <PetDetail
        v-if="selectedPet"
        :pet="selectedPet"
        :user="currentUser"
        @close="selectedPet = null"
        @found="openSighting(selectedPet)"
        @poster="posterPet = selectedPet"
        @chat="openChat(selectedPet)"
        @auth-needed="authOpen = true"
      />
    </Transition>

    <!-- Smart Match overlay -->
    <Transition name="page">
      <SmartMatchScreen
        v-if="showSmartMatch"
        :pets="pets"
        @close="showSmartMatch = false"
        @open-match="openPet"
        @confirm-match="confirmSmartMatch"
        @post-instead="postFromSmartMatch"
      />
    </Transition>

    <!-- Missing poster overlay -->
    <Transition name="page">
      <PosterModal v-if="posterPet" :pet="posterPet" @close="posterPet = null" />
    </Transition>

    <!-- Direct chat overlay -->
    <Transition name="page">
      <Chatscreen
        v-if="chatPet"
        :pet="chatPet"
        :user="currentUser"
        @close="chatPet = null"
      />
    </Transition>

    <!-- Conversation inbox overlay -->
    <Transition name="page">
      <ChatInboxScreen
        v-if="showInbox"
        @close="showInbox = false"
        @open-chat="openChatFromInbox"
      />
    </Transition>

    <!-- Notifications overlay -->
    <Transition name="page">
      <NotificationsPanel
        v-if="showNotifications"
        :notifications="notifications"
        @close="showNotifications = false"
        @open-pet="openPetById"
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
            <button class="sheet-photo" type="button" @click="attachSightingPhoto">
              <AppIcon name="camera" :size="19" />
              {{ sightingPhoto ? 'Change photo' : 'Attach a photo' }}
            </button>
            <img
              v-if="sightingPhoto"
              class="sighting-photo-preview"
              :src="sightingPhoto"
              alt="Sighting photo preview"
            />
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

    <!-- Auth screen overlay -->
    <Transition name="page">
      <AuthScreen
        v-if="authOpen"
        @close="authOpen = false"
        @guest="authOpen = false"
        @authenticated="handleAuth"
      />
    </Transition>

    <!-- Settings overlay -->
    <Transition name="page">
      <UserSettingsScreen
        v-if="showSettings"
        :user="currentUser"
        @close="showSettings = false"
        @logout="logout"
      />
    </Transition>

    <!-- Activity history overlay -->
    <Transition name="page">
      <AdoptionHistoryScreen v-if="showActivity" @close="showActivity = false" />
    </Transition>

    <!-- Alert boost overlay -->
    <Transition name="page">
      <BoostScreen v-if="showBoost" @back="showBoost = false" />
    </Transition>

    <!-- Bottom tab bar -->
    <nav class="tabbar" aria-label="Main navigation">
      <button
        type="button"
        class="nav-item"
        :class="{ active: tab === 'radar' }"
        :aria-current="tab === 'radar' ? 'page' : undefined"
        @click="goTab('radar')"
      >
        <AppIcon name="radar" :size="23" />
        <span>Radar</span>
      </button>

      <button
        type="button"
        class="report-item"
        :class="{ active: tab === 'post' }"
        :aria-current="tab === 'post' ? 'page' : undefined"
        aria-label="Report a lost pet"
        @click="goTab('post')"
      >
        <span class="report-icon">
          <AppIcon name="plus" :size="26" />
        </span>
        <span class="report-label">Report</span>
      </button>

      <button
        type="button"
        class="nav-item"
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
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { Camera, CameraResultType } from '@capacitor/camera'
import type { Pet } from './types/pet'
import type { AppNotification } from './types/notification'
import type { User } from './types/user'
import type { ChatPet } from './services/api'
import {
  getNearbyPets,
  getNotifications,
  getPet,
  getProfile,
  reportSighting,
} from './services/api'
import { getCurrentLocation } from './services/geolocation'
import AppIcon from './components/AppIcon.vue'
import RadarScreen from './components/RadarScreen.vue'
import PostPetScreen from './components/PostPetScreen.vue'
import ProfileScreen from './components/ProfileScreen.vue'
import PetDetail from './components/PetDetail.vue'
import AuthScreen from './components/AuthScreen.vue'
import UserSettingsScreen from './components/UserSettingsScreen.vue'
import SmartMatchScreen from './components/SmartMatchScreen.vue'
import PosterModal from './components/PosterModal.vue'
import Chatscreen from './components/Chatscreen.vue'
import ChatInboxScreen from './components/ChatInboxScreen.vue'
import NotificationsPanel from './components/NotificationsPanel.vue'
import AdoptionHistoryScreen from './components/AdoptionHistoryScreen.vue'
import BoostScreen from './components/BoostScreen.vue'

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
const currentUser = ref<User | null>(null)
const authOpen = ref(false)
const showSettings = ref(false)
const showSmartMatch = ref(false)
const showNotifications = ref(false)
const showActivity = ref(false)
const showInbox = ref(false)
const showBoost = ref(false)
const notifications = ref<AppNotification[]>([])
const selectedPet = ref<Pet | null>(null)
const posterPet = ref<Pet | null>(null)
const chatPet = ref<ChatPet | null>(null)
const sightingPet = ref<Pet | null>(null)
const sightingNote = ref('')
const sightingPhoto = ref('')
const sightingSent = ref(false)
const sightingError = ref('')
const toastPet = ref<Pet | null>(null)

const PET_RELOAD_DEBOUNCE_MS = 300
const TOAST_DELAY_MS = 2200
const TOAST_DURATION_MS = 7000

let petsRequestSequence = 0
let petsAbortController: AbortController | null = null
let petsReloadTimer: ReturnType<typeof setTimeout> | null = null
let toastShowTimer: ReturnType<typeof setTimeout> | null = null
let toastHideTimer: ReturnType<typeof setTimeout> | null = null

async function getUserLocation(): Promise<{ lat: number; lng: number }> {
  try {
    return await getCurrentLocation()
  } catch {
    return DEFAULT_CENTER
  }
}

async function loadPets() {
  if (petsReloadTimer) {
    clearTimeout(petsReloadTimer)
    petsReloadTimer = null
  }

  const requestSequence = ++petsRequestSequence
  petsAbortController?.abort()
  const controller = new AbortController()
  petsAbortController = controller

  const requestedRadiusKm = radiusKm.value
  const requestedSpecies = species.value
  loading.value = true
  error.value = ''

  try {
    const { lat, lng } = await getUserLocation()
    if (requestSequence !== petsRequestSequence) return

    userLocation.value = { lat, lng }
    const speciesParam =
      requestedSpecies === 'All'
        ? undefined
        : requestedSpecies === 'Dogs'
          ? 'Dog'
          : requestedSpecies === 'Cats'
            ? 'Cat'
            : 'Other'

    const nextPets = await getNearbyPets(
      { lat, lng, radiusKm: requestedRadiusKm, species: speciesParam },
      controller.signal,
    )
    if (requestSequence !== petsRequestSequence) return

    const resultsChanged = petResultKey(pets.value) !== petResultKey(nextPets)
    pets.value = nextPets
    if (resultsChanged) scheduleToast(nextPets[0] ?? null)
  } catch (e) {
    if (requestSequence !== petsRequestSequence) return
    error.value = e instanceof Error ? e.message : 'Failed to load nearby pets'
  } finally {
    if (requestSequence === petsRequestSequence) {
      loading.value = false
      if (petsAbortController === controller) petsAbortController = null
    }
  }
}

function onRadiusChange(value: number) {
  radiusKm.value = value
  schedulePetsReload()
}

function onSpeciesChange(value: SpeciesFilter) {
  species.value = value
  schedulePetsReload()
}

function schedulePetsReload() {
  if (petsReloadTimer) clearTimeout(petsReloadTimer)

  // Invalidate in-flight work immediately while batching rapid filter changes.
  petsRequestSequence += 1
  petsAbortController?.abort()
  petsAbortController = null
  loading.value = true
  error.value = ''

  petsReloadTimer = setTimeout(() => {
    petsReloadTimer = null
    void loadPets()
  }, PET_RELOAD_DEBOUNCE_MS)
}

async function restoreSession() {
  const token = localStorage.getItem('token')
  if (!token) {
    authOpen.value = true
    return
  }
  try {
    currentUser.value = await getProfile()
  } catch {
    localStorage.removeItem('token')
    authOpen.value = true
  }
}

function handleAuth(user: User) {
  currentUser.value = user
  authOpen.value = false
}

function logout() {
  localStorage.removeItem('token')
  currentUser.value = null
  chatPet.value = null
  showInbox.value = false
  authOpen.value = true
}

function petResultKey(results: Pet[]): string {
  return results.map((pet) => String(pet.id)).join('|')
}

function clearToastTimers() {
  if (toastShowTimer) clearTimeout(toastShowTimer)
  if (toastHideTimer) clearTimeout(toastHideTimer)
  toastShowTimer = null
  toastHideTimer = null
}

function scheduleToast(pet: Pet | null) {
  clearToastTimers()
  toastPet.value = null
  if (!pet) return

  toastShowTimer = setTimeout(() => {
    toastShowTimer = null
    toastPet.value = pet
    toastHideTimer = setTimeout(() => {
      toastHideTimer = null
      if (toastPet.value?.id === pet.id) toastPet.value = null
    }, TOAST_DURATION_MS)
  }, TOAST_DELAY_MS)
}

function goTab(t: Tab) {
  tab.value = t
  selectedPet.value = null
}

function openPet(petOrId: Pet | string | number) {
  const pet =
    typeof petOrId === 'object'
      ? petOrId
      : pets.value.find((item) => String(item.id) === String(petOrId))
  if (!pet) return
  selectedPet.value = pet
  showSmartMatch.value = false
  showNotifications.value = false
}

function openChat(pet: ChatPet | null) {
  if (!pet) return
  if (!currentUser.value) {
    authOpen.value = true
    return
  }
  if (pet.reportedBy === currentUser.value.id && !pet.participantId) {
    showInbox.value = true
    return
  }
  chatPet.value = pet
}

function openInbox() {
  if (!currentUser.value) {
    authOpen.value = true
    return
  }
  showInbox.value = true
}

function openChatFromInbox(pet: ChatPet) {
  showInbox.value = false
  openChat(pet)
}

function confirmSmartMatch(pet: Pet) {
  showSmartMatch.value = false
  openSighting(pet)
}

function postFromSmartMatch() {
  showSmartMatch.value = false
  tab.value = 'post'
}

async function openPetById(petId: string) {
  const cachedPet = pets.value.find((pet) => pet.id === petId)
  if (cachedPet) {
    openPet(cachedPet)
    return
  }

  try {
    openPet(await getPet(petId))
  } catch {
    // Leave the notification panel open if the referenced pet is unavailable.
  }
}

async function loadNotifications() {
  try {
    notifications.value = await getNotifications()
  } catch {
    notifications.value = []
  }
}

function openSighting(pet: Pet | null) {
  if (!pet) return
  sightingPet.value = pet
  sightingSent.value = false
  sightingNote.value = ''
  sightingPhoto.value = ''
  sightingError.value = ''
}

function closeSighting() {
  if (sightingSent.value && sightingPet.value) {
    const p = pets.value.find((x) => x.id === sightingPet.value?.id)
    if (p) p.status = 'sighted'
    selectedPet.value = null
  }
  sightingPet.value = null
  sightingPhoto.value = ''
}

async function attachSightingPhoto() {
  sightingError.value = ''
  try {
    const { dataUrl } = await Camera.getPhoto({
      resultType: CameraResultType.DataUrl,
      quality: 85,
    })
    sightingPhoto.value = dataUrl ?? ''
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (!message.toLowerCase().includes('cancel')) {
      sightingError.value = message || 'Unable to attach a photo.'
    }
  }
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
      photo: sightingPhoto.value || undefined,
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
  void loadPets()
}

function openFromToast() {
  if (toastPet.value) {
    clearToastTimers()
    selectedPet.value = toastPet.value
    toastPet.value = null
    tab.value = 'radar'
  }
}

function handleUnauthorized() {
  currentUser.value = null
  chatPet.value = null
  showInbox.value = false
  authOpen.value = true
}

onMounted(() => {
  void loadPets()
  void loadNotifications()
  void restoreSession()
  window.addEventListener('auth:unauthorized', handleUnauthorized)
})

onBeforeUnmount(() => {
  petsRequestSequence += 1
  petsAbortController?.abort()
  petsAbortController = null
  if (petsReloadTimer) {
    clearTimeout(petsReloadTimer)
    petsReloadTimer = null
  }
  clearToastTimers()
  window.removeEventListener('auth:unauthorized', handleUnauthorized)
})
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

.sighting-photo-preview {
  display: block;
  width: 100%;
  max-height: 220px;
  margin: 0 0 12px;
  border-radius: var(--radius-md);
  object-fit: cover;
  box-shadow: var(--shadow-card);
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
  --nav-teal: #1d6360;
  --nav-coral: #ef6351;
  --nav-base: #fcf9f2;
  --nav-muted: #626b68;
  --nav-ease: cubic-bezier(0.4, 0, 0.2, 1);

  position: fixed;
  z-index: 40;
  right: auto;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);

  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  align-items: end;
  gap: 8px;

  box-sizing: border-box;
  width: 100%;
  max-width: 480px;
  padding: 10px 20px calc(10px + env(safe-area-inset-bottom, 0px));

  border: 1px solid rgba(29, 99, 96, 0.09);
  border-bottom: 0;
  border-radius: 24px 24px 0 0;
  background: var(--nav-base);
  box-shadow:
    0 -2px 8px rgba(26, 47, 43, 0.025),
    0 -12px 36px rgba(26, 47, 43, 0.07);

  font-family:
    ui-rounded, "SF Pro Rounded", system-ui, -apple-system,
    BlinkMacSystemFont, "Segoe UI", sans-serif;
}

.tabbar button {
  appearance: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;

  min-width: 44px;
  min-height: 52px;
  margin: 0;
  padding: 7px 10px;
  border: 0;
  border-radius: 16px;
  background: transparent;

  color: var(--nav-muted);
  font: inherit;
  font-size: 12px;
  font-weight: 650;
  line-height: 1.25;
  cursor: pointer;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;

  transition:
    transform 0.2s var(--nav-ease),
    color 0.2s var(--nav-ease),
    background-color 0.2s var(--nav-ease),
    box-shadow 0.2s var(--nav-ease);
}

.nav-item.active {
  background: rgba(29, 99, 96, 0.09);
  color: var(--nav-teal);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.75);
  font-weight: 750;
}

.tabbar .report-item {
  gap: 6px;
  margin-top: -22px;
  padding: 0 8px 3px;
  color: var(--nav-teal);
  font-weight: 750;
}

.report-icon {
  display: grid;
  place-items: center;
  box-sizing: border-box;
  width: 58px;
  height: 58px;
  border: 4px solid var(--nav-base);
  border-radius: 20px;

  background:
    linear-gradient(
      155deg,
      rgba(255, 255, 255, 0.15),
      rgba(255, 255, 255, 0)
    ),
    var(--nav-coral);
  color: #fff;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.25),
    0 3px 7px rgba(93, 45, 35, 0.09),
    0 8px 18px rgba(239, 99, 81, 0.22);

  transition:
    transform 0.2s var(--nav-ease),
    box-shadow 0.2s var(--nav-ease);
}

.report-label {
  padding: 2px 8px;
  border-radius: 999px;
  transition: background-color 0.2s var(--nav-ease);
}

.report-item.active .report-label {
  background: rgba(29, 99, 96, 0.09);
}

.tabbar button:active {
  transform: scale(0.98);
}

.report-item:active .report-icon {
  box-shadow:
    inset 0 1px 3px rgba(93, 45, 35, 0.12),
    0 3px 8px rgba(239, 99, 81, 0.16);
}

.tabbar button:focus-visible {
  outline: 3px solid var(--nav-teal);
  outline-offset: 3px;
}

@media (hover: hover) and (pointer: fine) {
  .nav-item:hover {
    background: rgba(29, 99, 96, 0.07);
    color: var(--nav-teal);
  }

  .nav-item.active:hover {
    background: rgba(29, 99, 96, 0.13);
  }

  .report-item:hover .report-icon {
    transform: translateY(-2px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .tabbar button,
  .report-icon,
  .report-label {
    transition: none;
  }

  .tabbar button:active,
  .report-item:hover .report-icon {
    transform: none;
  }
}
</style>
