<template>
  <div class="app">
    <!-- Proximity notification toast -->
    <Transition name="toast">
      <button v-if="toastPet" class="toast" aria-live="polite" @click="openFromToast">
        <ManagedImage :src="toastPet.photo" alt="" />
        <span class="toast-text">
          <strong>{{ toastPet.name }} · {{ t('common.kilometres', { count: toastPet.distanceKm }) }}</strong>
          <span>{{ t('pets.lastSeenAt', { location: toastPet.location }) }}</span>
        </span>
        <AppIcon name="chevron" :size="18" />
      </button>
    </Transition>

    <main :key="authViewKey">
      <RadarScreen
        v-show="tab === 'radar'"
        :pets="pets"
        :loading="loading"
        :error="error"
        :radius-km="radarRadiusKm"
        :species="species"
        :breed="breed"
        :district="district"
        :unread-count="unreadCount"
        :user-location="userLocation"
        @open="openPet"
        @found="openSighting"
        @retry="loadPets"
        @radius-change="onRadarRadiusChange"
        @species-change="onSpeciesChange"
        @breed-change="onBreedChange"
        @district-change="onDistrictChange"
        @smart-match="showSmartMatch = true"
        @notifications="showNotifications = true"
      />
      <StrayRescueScreen
        v-if="rescueVisited"
        v-show="tab === 'strays'"
        :active="tab === 'strays'"
        :user="currentUser"
        :radius-km="radiusKm"
        :user-location="userLocation"
        :report-request="rescueReportRequest"
        @auth-needed="openLogin"
      />
      <PostPetScreen v-if="tab === 'post'" :user="currentUser" @done="onPosted" />
      <MapScreen v-if="mapVisited" v-show="tab === 'map'" :active="tab === 'map' && route.name === 'map'"
        @open-pet="id => router.push({ name: 'pet-detail', params: { id }, query: { from: 'map' } })" />
      <ChatInboxScreen
        v-show="tab === 'messages'"
        :user="currentUser"
        @auth-needed="openLogin"
        @explore-radar="goTab('radar')"
        @open-chat="openChatFromInbox"
        @unread-change="messageUnreadCount = $event"
      />
      <ProfileScreen
        v-if="tab === 'profile'"
        :user="currentUser"
        @login="openLogin"
        @add-pet="goTab('post')"
        @create-rescue="openRescueReport"
        @explore-rescue="goTab('strays')"
      />
    </main>

    <RouterView :key="authViewKey" v-slot="{ Component, route: currentRoute }">
      <Transition name="page">
        <component
          :is="Component"
          v-if="currentRoute.name === 'settings'"
          :user="currentUser"
          :alerts-enabled="alertsEnabled"
          :radius-km="radiusKm"
          @auth-needed="openLogin"
          @logout="logout"
          @updated="handleUserUpdated"
          @open-boost="openBoost"
          @toggle-alerts="handleAlertsToggle"
          @radius-change="onRadiusChange"
        />
        <component
          :is="Component"
          v-else-if="currentRoute.name === 'blocked-users'"
          :user="currentUser"
          @auth-needed="openLogin"
        />
        <component
          :is="Component"
          v-else-if="currentRoute.name === 'moderation'"
          :user="currentUser"
          @auth-needed="openLogin"
        />
        <component
          :is="Component"
          v-else-if="currentRoute.name === 'saved'"
          :user="currentUser"
          @open-pet="openPet"
          @found="openSighting"
          @open-stray="openStrayById"
        />
        <component
          :is="Component"
          v-else-if="currentRoute.name === 'my-reports'"
          @close="router.back()"
          @message-pet="openChatByPetId"
        />
        <component
          :is="Component"
          v-else-if="currentRoute.name === 'stray-detail'"
          :user="currentUser"
          @auth-needed="openLogin"
        />
      </Transition>
    </RouterView>

    <Transition name="page">
      <section
        v-if="route.name === 'pet-detail' && !selectedPet && (deepLinkLoading || deepLinkError)"
        class="deep-link-state"
        aria-live="polite"
      >
        <span v-if="deepLinkLoading" class="deep-link-spinner" aria-hidden="true" />
        <template v-else>
          <span class="deep-link-icon" aria-hidden="true">
            <AppIcon name="paw" :size="30" />
          </span>
          <h1>{{ t('pets.reportUnavailable') }}</h1>
          <p>{{ deepLinkError }}</p>
          <div class="deep-link-actions">
            <button type="button" @click="retryDeepLinkedPet">{{ t('common.retry') }}</button>
            <button type="button" class="secondary" @click="closePetDetail">{{ t('pets.exploreRadar') }}</button>
          </div>
        </template>
      </section>
    </Transition>

    <!-- Pet detail overlay -->
    <Transition name="page">
      <PetDetail
        v-if="selectedPet"
        :pet="selectedPet"
        :user="currentUser"
        :focus-sighting-id="selectedSightingId"
        @close="closePetDetail"
        @found="openSighting(selectedPet)"
        @poster="posterPet = selectedPet"
        @chat="openChat(selectedPet)"
        @chat-reporter="openReporterChat"
        @auth-needed="openLogin"
        @status-updated="handlePetStatusUpdated"
      />
    </Transition>

    <!-- Smart Match overlay -->
    <Transition name="page">
      <SmartMatchScreen
        v-if="showSmartMatch"
        :pets="pets"
        :user-location="userLocation"
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
        :key="`${currentUser?.id}:${chatPet.id}:${chatPet.participantId || ''}`"
        :pet="chatPet"
        :user="currentUser"
        @close="chatPet = null"
      />
    </Transition>

    <!-- Notifications overlay -->
    <Transition name="page">
      <NotificationsPanel
        v-if="showNotifications"
        :notifications="notifications"
        :target-error="notificationTargetError"
        @close="showNotifications = false"
        @open-pet="openPetById"
        @open-stray="openStrayFromNotification"
        @open-chat="openChatFromNotification"
        @mark-read="handleMarkNotificationRead"
        @mark-all="handleMarkAllNotificationsRead"
      />
    </Transition>

    <!-- 'Found it?' sighting sheet -->
    <Transition name="fade">
      <div v-if="sightingPet" class="scrim" @click.self="closeSighting">
        <div
          class="sheet"
          role="dialog"
          aria-modal="true"
          :aria-label="`${t('sightings.report')}: ${sightingPet.name}`"
        >
          <div class="grab" />
          <template v-if="!sightingSent">
            <div class="sheet-head">
              <ManagedImage :src="sightingPet.photo" alt="" />
              <div>
                <h2>{{ t('sightings.foundQuestion', { name: sightingPet.name }) }}</h2>
                <p>{{ t('sightings.locationShared') }}</p>
              </div>
            </div>
            <label class="sheet-field">
              <span>{{ t('sightings.whatSeen') }}</span>
              <textarea
                v-model="sightingNote"
                rows="3"
                :placeholder="t('sightings.notePlaceholder')"
              />
            </label>
            <SightingLocationPicker
              v-model="sightingCoordinates"
              :initial-center="sightingPet.coordinates ?? null"
            />
            <label class="sheet-field">
              <span>{{ t('sightings.locationName') }}</span>
              <input
                v-model.trim="sightingLocationName"
                type="text"
                maxlength="200"
                autocomplete="off"
                :placeholder="t('sightings.locationPlaceholder')"
              />
              <small>{{ t('sightings.locationHelp') }}</small>
            </label>
            <button class="sheet-photo" type="button" :disabled="sightingSubmitting" @click="attachSightingPhoto">
              <AppIcon name="camera" :size="19" />
              {{ sightingPhoto ? t('sightings.changePhoto') : t('sightings.attachPhoto') }}
            </button>
            <ManagedImage
              v-if="sightingPhoto"
              class="sighting-photo-preview"
              :src="sightingPhoto"
              :alt="t('sightings.photoPreviewAlt')"
            />
            <p v-if="sightingError" class="sheet-error">{{ sightingError }}</p>
            <ImageUploadStatus :upload="sightingUpload" />
            <input ref="sightingPhotoInput" type="file" accept="image/jpeg,image/png,image/webp" hidden @change="selectSightingFile" />
            <button v-if="sightingPhoto" type="button" :disabled="sightingSubmitting" @click="sightingUpload.reset(); sightingPhoto = ''">{{ t('media.remove') }}</button>
            <button
              class="sheet-send"
              type="button"
              :disabled="sightingSubmitting || !sightingCoordinates || !sightingLocationName"
              @click="sendSighting"
            >
              <AppIcon name="pin" :size="19" />
              {{ sightingSubmitting ? t('sightings.sending') : t('sightings.send') }}
            </button>
          </template>
          <div v-else class="sheet-success" role="status">
            <span class="check">
              <AppIcon name="check" :size="26" />
            </span>
            <h2>{{ t('sightings.sent') }}</h2>
            <p>{{ t('sightings.sentHelp', { owner: sightingPet.owner }) }}</p>
            <button class="sheet-send" @click="closeSighting">{{ t('common.done') }}</button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Auth screen overlay -->
    <Transition name="page">
      <AuthScreen
        v-if="authOpen"
        :session-error="sessionRestoreError"
        @close="cancelAuthentication"
        @guest="cancelAuthentication"
        @failed="clearPendingAuthAction"
        @authenticated="handleAuth"
        @retry-session="retrySession"
      />
    </Transition>

    <!-- Alert boost overlay -->
    <Transition name="page">
      <BoostScreen
        v-if="showBoost"
        :radius-km="radiusKm"
        @back="showBoost = false"
        @activate="onRadiusChange"
      />
    </Transition>

    <!-- Bottom tab bar -->
    <nav class="tabbar feed-theme" :aria-label="t('navigation.main')">
      <button
        type="button"
        class="nav-item"
        :class="{ active: tab === 'radar' }"
        :aria-current="tab === 'radar' ? 'page' : undefined"
        @click="goTab('radar')"
      >
        <AppIcon name="radar" :size="24" />
        <span>{{ t('navigation.radar') }}</span>
      </button>

      <button
        type="button"
        class="nav-item"
        :class="{ active: tab === 'strays' }"
        :aria-current="tab === 'strays' ? 'page' : undefined"
        @click="goTab('strays')"
      >
        <AppIcon name="paw" :size="24" />
        <span>{{ t('navigation.rescue') }}</span>
      </button>

      <button
        type="button"
        class="report-item"
        :class="{ active: tab === 'post' }"
        :aria-current="tab === 'post' ? 'page' : undefined"
        :aria-label="t('pets.reportLostPet')"
        @click="goTab('post')"
      >
        <span class="report-icon">
          <AppIcon name="plus" :size="24" />
        </span>
        <span class="report-label">{{ t('navigation.report') }}</span>
      </button>

      <button
        type="button"
        class="nav-item"
        :class="{ active: tab === 'messages' }"
        :aria-current="tab === 'messages' ? 'page' : undefined"
        :aria-label="messageUnreadCount ? t('navigation.unreadMessages', { count: messageUnreadCount }) : t('navigation.messages')"
        @click="goTab('messages')"
      >
        <span class="nav-icon-wrap">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            width="24"
            height="24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="nav-icon"
            aria-hidden="true"
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <span
            v-if="messageUnreadCount > 0"
            class="nav-unread"
            aria-hidden="true"
          >
            {{ messageUnreadCount > 9 ? '9+' : messageUnreadCount }}
          </span>
        </span>
        <span>{{ t('navigation.messages') }}</span>
      </button>

      <button type="button" class="nav-item" :class="{ active: tab === 'map' }" :aria-current="tab === 'map' ? 'page' : undefined" @click="goTab('map')">
        <AppIcon name="map" :size="24" /><span>{{ t('discoveryMap.title') }}</span>
      </button>

      <button
        type="button"
        class="nav-item"
        :class="{ active: tab === 'profile' }"
        :aria-current="tab === 'profile' ? 'page' : undefined"
        @click="goTab('profile')"
      >
        <AppIcon name="user" :size="24" />
        <span>{{ t('navigation.profile') }}</span>
      </button>
    </nav>
  </div>
</template>

<script setup lang="ts">
import ManagedImage from "./components/ManagedImage.vue"
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'
import { Camera, CameraResultType } from '@capacitor/camera'
import { useImageUpload } from './composables/useImageUpload'
import ImageUploadStatus from './components/ImageUploadStatus.vue'
import type { Pet } from './types/pet'
import type { AppNotification } from './types/notification'
import type { User } from './types/user'
import type { ChatPet } from './services/api'
import {
  getNearbyPets,
  getNotifications,
  getChatInbox,
  getPet,
  getProfile,
  markAllNotificationsRead,
  markNotificationRead,
  reportSighting,
  updateNotificationPreferences,
} from './services/api'
import { getCurrentLocation } from './services/geolocation'
import { captureAuthContext, isAuthContextCurrent, invalidateAuthContext, setSessionToken, storedSessionToken } from './services/authSession'
import { activateSavedPetsAccount } from './composables/useSavedPets'
import { buildSightingPayload } from './utils/sightingSubmission'
import AppIcon from './components/AppIcon.vue'
import RadarScreen from './components/RadarScreen.vue'
import PostPetScreen from './components/PostPetScreen.vue'
import ProfileScreen from './components/ProfileScreen.vue'
import PetDetail from './components/PetDetail.vue'
import AuthScreen from './components/AuthScreen.vue'
import SmartMatchScreen from './components/SmartMatchScreen.vue'
import PosterModal from './components/PosterModal.vue'
import Chatscreen from './components/Chatscreen.vue'
import ChatInboxScreen from './components/ChatInboxScreen.vue'
import NotificationsPanel from './components/NotificationsPanel.vue'
import BoostScreen from './components/BoostScreen.vue'
import StrayRescueScreen from './components/StrayRescueScreen.vue'
import MapScreen from './views/MapScreen.vue'
import SightingLocationPicker from './components/SightingLocationPicker.vue'
import { applyAccountPreferences } from './composables/usePreferences'
import { translateApiError, useAppI18n } from './i18n'

type Tab = 'radar' | 'strays' | 'post' | 'messages' | 'map' | 'profile'
type PendingAuthAction =
  | { type: 'post-pet' }
  | { type: 'sighting'; petId: string }

const router = useRouter()
const route = useRoute()
const { t } = useAppI18n()

// Hong Kong centre — fallback when geolocation is unavailable/denied.
const DEFAULT_CENTER = { lat: 22.2825, lng: 114.1897 }

type SpeciesFilter = 'All' | 'Dogs' | 'Cats' | 'Other'

const tab = ref<Tab>(route.name === 'profile' ? 'profile' : route.name === 'map' ? 'map' : 'radar')
const mapVisited = ref(route.name === 'map')
const rescueVisited = ref(false)
const pets = ref<Pet[]>([])
const loading = ref(true)
const error = ref('')
const radiusKm = ref(3)
// Radar search radius is not an account notification/rescue preference.
const radarRadiusKm = ref(3)
const species = ref<SpeciesFilter>('All')
const breed = ref('')
const district = ref('')
const userLocation = ref<{ lat: number; lng: number } | null>(null)
const hasPreciseLocation = ref(false)
const currentUser = ref<User | null>(null)
const alertsEnabled = ref(true)
const authOpen = ref(false)
const authViewKey = ref(0)
const sessionRestoreError = ref('')
const pendingAuthAction = ref<PendingAuthAction | null>(null)
const showSmartMatch = ref(false)
const showNotifications = ref(false)
const showBoost = ref(false)
const notifications = ref<AppNotification[]>([])
const notificationTargetError = ref('')
const selectedPet = ref<Pet | null>(null)
const selectedSightingId = ref<string | undefined>()
const deepLinkLoading = ref(false)
const deepLinkError = ref('')
const posterPet = ref<Pet | null>(null)
const chatPet = ref<ChatPet | null>(null)
const messageUnreadCount = ref(0)
const rescueReportRequest = ref(0)
const sightingPet = ref<Pet | null>(null)
const sightingNote = ref('')
const sightingPhoto = ref('')
const sightingUpload = useImageUpload('sighting')
const sightingPhotoInput = ref<HTMLInputElement | null>(null)
const sightingCoordinates = ref<[number, number] | null>(null)
const sightingLocationName = ref('')
const sightingSent = ref(false)
const sightingError = ref('')
const sightingSubmitting = ref(false)
const sightingSubmissionId = ref('')
const toastPet = ref<Pet | null>(null)
const unreadCount = computed(
  () => notifications.value.filter((notification) => !notification.read).length,
)
let deepLinkRequestSequence = 0

watch(
  () => ({ name: route.name, petId: route.params.id }),
  ({ name: routeName, petId }, previousRoute) => {
    if (routeName === 'profile') tab.value = 'profile'
    if (routeName === 'map') { mapVisited.value = true; tab.value = 'map' }
    if (routeName === 'home' && previousRoute?.name === 'map') tab.value = 'radar'
    if (routeName === 'login') authOpen.value = true
    if (routeName === 'pet-detail') {
      authOpen.value = false
      const id = Array.isArray(petId) ? petId[0] : petId
      if (typeof id === 'string' && id.trim()) void openDeepLinkedPet(id)
      else deepLinkError.value = t('errors.invalidPetLink')
    } else {
      deepLinkRequestSequence += 1
      if (previousRoute?.name === 'pet-detail') selectedPet.value = null
      deepLinkLoading.value = false
      deepLinkError.value = ''
    }
  },
  { immediate: true },
)

const PET_RELOAD_DEBOUNCE_MS = 300
const TOAST_DELAY_MS = 2200
const TOAST_DURATION_MS = 7000
const NOTIFICATION_POLL_MS = 30_000

let petsRequestSequence = 0
let petsAbortController: AbortController | null = null
let petsReloadTimer: ReturnType<typeof setTimeout> | null = null
let toastShowTimer: ReturnType<typeof setTimeout> | null = null
let toastHideTimer: ReturnType<typeof setTimeout> | null = null
let notificationPollTimer: ReturnType<typeof setInterval> | null = null

async function getUserLocation(): Promise<{ lat: number; lng: number }> {
  try {
    const location = await getCurrentLocation()
    hasPreciseLocation.value = true
    return location
  } catch {
    hasPreciseLocation.value = false
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

  const requestedRadiusKm = radarRadiusKm.value
  const requestedSpecies = species.value
  const requestedBreed = breed.value.trim()
  const requestedDistrict = district.value
  loading.value = true
  error.value = ''

  try {
    const { lat, lng } = await getUserLocation()
    if (requestSequence !== petsRequestSequence) return

    userLocation.value = hasPreciseLocation.value ? { lat, lng } : null
    const speciesParam =
      requestedSpecies === 'All'
        ? undefined
        : requestedSpecies === 'Dogs'
          ? 'Dog'
          : requestedSpecies === 'Cats'
            ? 'Cat'
            : 'Other'

    const nextPets = await getNearbyPets(
      {
        lat,
        lng,
        radiusKm: requestedRadiusKm,
        species: speciesParam,
        breed: requestedBreed || undefined,
        district: requestedDistrict || undefined,
      },
      controller.signal,
    )
    if (requestSequence !== petsRequestSequence) return

    pets.value = nextPets
  } catch (e) {
    if (requestSequence !== petsRequestSequence) return
    error.value = translateApiError(e, 'errors.loadPets')
  } finally {
    if (requestSequence === petsRequestSequence) {
      loading.value = false
      if (petsAbortController === controller) petsAbortController = null
    }
  }
}

function onRadarRadiusChange(value: number) {
  radarRadiusKm.value = value
  schedulePetsReload()
}

function onRadiusChange(value: number) {
  radiusKm.value = value
  if (currentUser.value) void syncNotificationPreferences().catch(() => undefined)
}

function onSpeciesChange(value: SpeciesFilter) {
  species.value = value
  schedulePetsReload()
}

function onBreedChange(value: string) {
  breed.value = value
  schedulePetsReload()
}

function onDistrictChange(value: string) {
  district.value = value
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
  const context = captureAuthContext()
  const token = context.token
  if (!token) {
    if (route.name !== 'pet-detail') authOpen.value = true
    return
  }
  try {
    const user = await getProfile()
    if (!isAuthContextCurrent(context)) return
    currentUser.value = user
    activateSavedPetsAccount(user.id, context)
    applyAccountPreferences(user.preferences)
    alertsEnabled.value = user.alertsEnabled !== false
    radiusKm.value = user.alertRadiusKm || radiusKm.value
    sessionRestoreError.value = ''
    authOpen.value = false
  } catch (cause) {
    if (!isAuthContextCurrent(context)) return
    const status = (cause as { status?: number }).status
    if (status === 401 || status === 404) {
      setSessionToken(null)
      clearAuthorizationScopedState()
      currentUser.value = null
    } else {
      sessionRestoreError.value = translateApiError(cause, 'errors.authenticationUnavailable')
    }
    if (route.name !== 'pet-detail') authOpen.value = true
  }
}

async function retrySession() {
  const context = captureAuthContext()
  sessionRestoreError.value = ''
  await restoreSession()
  if (!isAuthContextCurrent(context)) return
  await loadPets()
  if (currentUser.value && isAuthContextCurrent(context)) await activateNotifications()
}

function handleAuth(user: User) {
  const pendingAction = currentUser.value ? null : pendingAuthAction.value
  clearAuthorizationScopedState()
  currentUser.value = user
  const context = captureAuthContext()
  activateSavedPetsAccount(user.id, context)
  applyAccountPreferences(user.preferences)
  alertsEnabled.value = user.alertsEnabled !== false
  radiusKm.value = user.alertRadiusKm || radiusKm.value
  authOpen.value = false
  const loginNavigation = route.name === 'login' || pendingAction
    ? router.replace('/')
    : Promise.resolve()
  void (async () => {
    await loginNavigation
    if (!isAuthContextCurrent(context)) return
    await loadPets()
    if (!isAuthContextCurrent(context)) return
    if (route.name === 'pet-detail') {
      const routeId = Array.isArray(route.params.id) ? route.params.id[0] : route.params.id
      if (typeof routeId === 'string' && routeId.trim()) await openDeepLinkedPet(routeId)
    }
    if (isAuthContextCurrent(context) && currentUser.value?.id === user.id && pendingAction) {
      await resumePendingAuthAction(pendingAction, user.id)
    }
    if (isAuthContextCurrent(context) && currentUser.value?.id === user.id) await activateNotifications()
  })()
}

function logout() {
  setSessionToken(null)
  clearAuthorizationScopedState()
  currentUser.value = null
  tab.value = 'radar'
  authOpen.value = true
  void router.replace('/login')
  void loadPets()
}

function clearAuthorizationScopedState() {
  invalidateAuthContext()
  authViewKey.value += 1
  sessionRestoreError.value = ''
  sightingUpload.reset(false)
  deepLinkRequestSequence += 1
  petsRequestSequence += 1
  petsAbortController?.abort()
  petsAbortController = null
  clearToastTimers()
  stopNotificationPolling()
  pets.value = []
  selectedPet.value = null
  selectedSightingId.value = undefined
  posterPet.value = null
  toastPet.value = null
  chatPet.value = null
  notifications.value = []
  notificationTargetError.value = ''
  messageUnreadCount.value = 0
  sightingPet.value = null
  sightingNote.value = ''
  sightingPhoto.value = ''
  sightingCoordinates.value = null
  sightingLocationName.value = ''
  sightingSent.value = false
  sightingError.value = ''
  sightingSubmitting.value = false
  sightingSubmissionId.value = ''
  showSmartMatch.value = false
  showNotifications.value = false
  showBoost.value = false
  userLocation.value = null
  hasPreciseLocation.value = false
  pendingAuthAction.value = null
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
  if (t === 'post' && !currentUser.value) {
    openLogin({ type: 'post-pet' })
    return
  }
  tab.value = t
  if (t === 'strays') rescueVisited.value = true
  if (t === 'map') mapVisited.value = true
  selectedPet.value = null
  if (t === 'map') {
    if (route.name !== 'map') void router.push('/map')
  } else if (t === 'profile') {
    if (route.name !== 'profile') void router.push('/profile')
  } else if (route.name === 'profile' || route.name === 'map') {
    void router.push('/')
  }
  if (t === 'messages' && !currentUser.value) openLogin()
}

function openRescueReport() {
  rescueVisited.value = true
  tab.value = 'strays'
  rescueReportRequest.value += 1
  if (route.name === 'profile') void router.push('/')
}

function openLogin(action: PendingAuthAction | null = null) {
  pendingAuthAction.value = action
  if (route.name !== 'login') void router.push('/login')
  authOpen.value = true
}

function clearPendingAuthAction() {
  pendingAuthAction.value = null
}

function cancelAuthentication() {
  invalidateAuthContext()
  clearPendingAuthAction()
  authOpen.value = false
  if (route.name === 'login') void router.replace('/')
}

async function resumePendingAuthAction(action: PendingAuthAction, userId: string) {
  const context = captureAuthContext()
  // Consume before any asynchronous work so one authentication event can open
  // at most one form and never submit it.
  pendingAuthAction.value = null
  if (currentUser.value?.id !== userId) return

  if (action.type === 'post-pet') {
    selectedPet.value = null
    tab.value = 'post'
    return
  }

  let pet = pets.value.find((candidate) => String(candidate.id) === action.petId)
  if (!pet) {
    try {
      pet = await getPet(action.petId)
    } catch {
      return
    }
  }
  if (!isAuthContextCurrent(context) || currentUser.value?.id !== userId || pet.status === 'reunited') return
  openSighting(pet)
}

function openPet(petOrId: Pet | string | number) {
  const pet =
    typeof petOrId === 'object'
      ? petOrId
      : pets.value.find((item) => String(item.id) === String(petOrId))
  if (!pet) return
  selectedSightingId.value = undefined
  selectedPet.value = pet
  showSmartMatch.value = false
  showNotifications.value = false
}

async function openDeepLinkedPet(petId: string) {
  const sequence = ++deepLinkRequestSequence
  const normalizedId = petId.trim()
  selectedPet.value = null
  selectedSightingId.value = undefined
  deepLinkLoading.value = true
  deepLinkError.value = ''

  try {
    const pet = await getPet(normalizedId)
    if (sequence !== deepLinkRequestSequence || route.name !== 'pet-detail') return
    selectedPet.value = pet
  } catch (cause) {
    if (sequence !== deepLinkRequestSequence || route.name !== 'pet-detail') return
    deepLinkError.value = translateApiError(cause, 'errors.petUnavailable')
  } finally {
    if (sequence === deepLinkRequestSequence) deepLinkLoading.value = false
  }
}

function retryDeepLinkedPet() {
  const id = Array.isArray(route.params.id) ? route.params.id[0] : route.params.id
  if (typeof id === 'string' && id.trim()) void openDeepLinkedPet(id)
}

function closePetDetail() {
  deepLinkRequestSequence += 1
  selectedPet.value = null
  selectedSightingId.value = undefined
  deepLinkLoading.value = false
  deepLinkError.value = ''
  if (route.name === 'pet-detail') {
    const returnTab = Array.isArray(route.query.tab) ? route.query.tab[0] : route.query.tab
    if (route.query.from === 'profile') {
      void router.push({ name: 'profile', query: { tab: returnTab || 'pets' } })
    } else if (route.query.from === 'map') {
      void router.push('/map')
    } else {
      void router.push('/')
    }
  }
}

function handlePetStatusUpdated(updatedPet: Pet) {
  pets.value = pets.value.map((pet) =>
    String(pet.id) === String(updatedPet.id) ? { ...pet, ...updatedPet } : pet,
  )

  if (selectedPet.value && String(selectedPet.value.id) === String(updatedPet.id)) {
    selectedPet.value = { ...selectedPet.value, ...updatedPet }
  }
  if (sightingPet.value && String(sightingPet.value.id) === String(updatedPet.id)) {
    sightingPet.value = null
  }
  if (toastPet.value && String(toastPet.value.id) === String(updatedPet.id)) {
    toastPet.value = { ...toastPet.value, ...updatedPet }
  }
}

function openChat(pet: ChatPet | null) {
  if (!pet) return
  if (!currentUser.value) {
    openLogin()
    return
  }
  if (pet.reportedBy === currentUser.value.id && !pet.participantId) {
    tab.value = 'messages'
    return
  }
  chatPet.value = pet
}

function openBoost() {
  if (!currentUser.value) {
    openLogin()
    return
  }
  showBoost.value = true
}

function handleUserUpdated(user: User) {
  currentUser.value = user
  applyAccountPreferences(user.preferences)
  chatPet.value = null
  posterPet.value = null
  void loadPets()
  if (selectedPet.value) {
    const selectedId = selectedPet.value.id
    void getPet(selectedId).then((pet) => {
      if (selectedPet.value?.id === selectedId) selectedPet.value = pet
    }).catch(() => undefined)
  }
}

async function openChatByPetId(petId: string) {
  if (!currentUser.value) {
    openLogin()
    return
  }
  try {
    const pet = await getPet(petId)
    openChat(pet)
  } catch {
    // Keep the activity sheet open when the pet can no longer be loaded.
  }
}

function openReporterChat(participantId: string, participantName?: string) {
  if (!selectedPet.value || !currentUser.value) {
    openLogin()
    return
  }
  if (participantId === currentUser.value.id) return
  chatPet.value = {
    ...selectedPet.value,
    participantId,
    participantName: participantName || t('messages.finder'),
  }
}

function openChatFromInbox(pet: ChatPet) {
  openChat(pet)
}

let notificationOpenSequence = 0
watch(showNotifications, () => { notificationOpenSequence++; notificationTargetError.value = '' })
async function openChatFromNotification(notification: AppNotification) {
  const sequence = ++notificationOpenSequence
  const context = captureAuthContext()
  notificationTargetError.value = ''
  if (!currentUser.value || !notification.conversation) {
    notificationTargetError.value = t('messageRepair.unavailable')
    return
  }
  const target = notification.conversation
  try {
    const conversations = await getChatInbox()
    if (sequence !== notificationOpenSequence || !isAuthContextCurrent(context) || !currentUser.value || !showNotifications.value) return
    const conversation = conversations.find((item) => item.pet.id === target.petId && item.pet.participantId === target.participantId)
    if (!conversation) { notificationTargetError.value = t('messageRepair.unavailable'); return }
    openChat(conversation.pet)
    showNotifications.value = false
  } catch (error) {
    if (sequence === notificationOpenSequence && isAuthContextCurrent(context) && showNotifications.value) notificationTargetError.value = translateApiError(error, 'messageRepair.unavailable')
  }
}

function confirmSmartMatch(pet: Pet) {
  showSmartMatch.value = false
  openSighting(pet)
}

function postFromSmartMatch() {
  showSmartMatch.value = false
  goTab('post')
}

async function openPetById(petId: string, sightingId?: string) {
  selectedSightingId.value = sightingId
  const cachedPet = pets.value.find((pet) => pet.id === petId)
  if (cachedPet) {
    selectedPet.value = cachedPet
    showNotifications.value = false
    return
  }

  try {
    selectedPet.value = await getPet(petId)
    showNotifications.value = false
  } catch {
    // Leave the notification panel open if the referenced pet is unavailable.
  }
}

function openStrayById(strayId: string) {
  void router.push(`/strays/${strayId}`)
}

function openStrayFromNotification(strayId: string) {
  showNotifications.value = false
  openStrayById(strayId)
}

async function loadNotifications(showNewAlert = false) {
  const context = captureAuthContext()
  if (!currentUser.value) {
    notifications.value = []
    return
  }
  const knownIds = new Set(notifications.value.map((notification) => notification.id))
  try {
    const nextNotifications = await getNotifications()
    if (!isAuthContextCurrent(context)) return
    notifications.value = nextNotifications
    if (showNewAlert) {
      const fresh = nextNotifications.find(
        (notification) => !notification.read && !knownIds.has(notification.id),
      )
      const alertPet = fresh?.petId
        ? pets.value.find((pet) => pet.id === fresh.petId) ?? null
        : null
      if (alertPet) scheduleToast(alertPet)
    }
  } catch {
    // Preserve the last successful inbox during a transient network failure.
  }
}

async function syncNotificationPreferences() {
  if (!currentUser.value) return
  const location = userLocation.value
  await updateNotificationPreferences({
    enabled: alertsEnabled.value,
    radiusKm: radiusKm.value,
    coordinates:
      location && hasPreciseLocation.value ? [location.lng, location.lat] : undefined,
  })
}

function refreshChatNotifications() { void loadNotifications() }
function startNotificationPolling() {
  stopNotificationPolling()
  notificationPollTimer = setInterval(() => {
    void loadNotifications(true)
  }, NOTIFICATION_POLL_MS)
}

function stopNotificationPolling() {
  if (notificationPollTimer) clearInterval(notificationPollTimer)
  notificationPollTimer = null
}

async function activateNotifications() {
  const context = captureAuthContext()
  try {
    await syncNotificationPreferences()
    if (!isAuthContextCurrent(context) || !currentUser.value) return
    await loadNotifications()
    if (!isAuthContextCurrent(context) || !currentUser.value) return
    startNotificationPolling()
  } catch {
    if (isAuthContextCurrent(context)) stopNotificationPolling()
  }
}

async function handleAlertsToggle(enabled: boolean) {
  const context = captureAuthContext()
  const previous = alertsEnabled.value
  alertsEnabled.value = enabled
  try {
    await syncNotificationPreferences()
    if (isAuthContextCurrent(context)) startNotificationPolling()
  } catch {
    if (isAuthContextCurrent(context)) alertsEnabled.value = previous
  }
}

async function handleMarkNotificationRead(notificationId: string) {
  const context = captureAuthContext()
  const notification = notifications.value.find((item) => item.id === notificationId)
  if (!notification || notification.read) return
  notification.read = true
  try {
    await markNotificationRead(notificationId)
  } catch {
    if (isAuthContextCurrent(context)) notification.read = false
  }
}

async function handleMarkAllNotificationsRead() {
  const context = captureAuthContext()
  const unreadIds = new Set(
    notifications.value.filter((item) => !item.read).map((item) => item.id),
  )
  notifications.value.forEach((item) => (item.read = true))
  try {
    await markAllNotificationsRead()
  } catch {
    if (!isAuthContextCurrent(context)) return
    notifications.value.forEach((item) => {
      if (unreadIds.has(item.id)) item.read = false
    })
  }
}

function openSighting(pet: Pet | null) {
  if (!pet) return
  if (!currentUser.value) {
    openLogin({ type: 'sighting', petId: String(pet.id) })
    return
  }
  sightingUpload.reset()
  sightingPet.value = pet
  sightingSent.value = false
  sightingNote.value = ''
  sightingPhoto.value = ''
  sightingCoordinates.value = null
  sightingLocationName.value = ''
  sightingError.value = ''
  sightingSubmitting.value = false
  sightingSubmissionId.value = createSightingSubmissionId()
}

function closeSighting() {
  sightingUpload.reset()
  if (sightingSent.value && sightingPet.value) {
    const p = pets.value.find((x) => x.id === sightingPet.value?.id)
    if (p) p.status = 'sighted'
    selectedPet.value = null
  }
  sightingPet.value = null
  sightingPhoto.value = ''
  sightingCoordinates.value = null
  sightingLocationName.value = ''
  sightingSubmitting.value = false
  sightingSubmissionId.value = ''
}

function createSightingSubmissionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `sighting_${crypto.randomUUID()}`
  }
  return `sighting_${Date.now()}_${Math.random().toString(36).slice(2, 14)}`
}

async function attachSightingPhoto() {
  sightingError.value = ''
  try {
    const { dataUrl } = await Camera.getPhoto({
      resultType: CameraResultType.DataUrl,
      quality: 85,
    })
    sightingPhoto.value = dataUrl ?? ''
    if (dataUrl) sightingUpload.select(dataUrl)
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (!message.toLowerCase().includes('cancel')) {
      sightingPhotoInput.value?.click()
    }
  }
}

function selectSightingFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (file) { sightingUpload.select(file); sightingPhoto.value = sightingUpload.preview }
}

async function sendSighting() {
  const pet = sightingPet.value
  if (!pet || sightingSubmitting.value) return
  if (!sightingCoordinates.value) {
    sightingError.value = t('validation.sightingLocation')
    return
  }
  if (!sightingLocationName.value.trim()) {
    sightingError.value = t('validation.locationName')
    return
  }
  sightingSubmitting.value = true
  sightingError.value = ''
  const submissionId = sightingSubmissionId.value || createSightingSubmissionId()
  sightingSubmissionId.value = submissionId
  const userId = currentUser.value?.id
  const active = () => sightingSubmissionId.value === submissionId && sightingPet.value?.id === pet.id && currentUser.value?.id === userId
  const details = { coordinates: sightingCoordinates.value, note: sightingNote.value, locationName: sightingLocationName.value.trim(), submissionId }
  try {
    const imageIds = await sightingUpload.ensure()
    if (!active()) return
    await reportSighting(pet.id, buildSightingPayload({ ...details, imageIds }))
    if (!active()) return
    sightingSent.value = true
    sightingUpload.finish()
    const p = pets.value.find((x) => x.id === pet.id)
    if (p) p.status = 'sighted'
  } catch (e) {
    if (active()) sightingError.value = translateApiError(e, 'errors.sendSighting')
  } finally {
    if (active()) sightingSubmitting.value = false
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
  clearAuthorizationScopedState()
  currentUser.value = null
  tab.value = 'radar'
  authOpen.value = true
  void router.replace('/login')
  void loadPets()
}

function handleExternalSessionChange() {
  clearAuthorizationScopedState()
  currentUser.value = null
  tab.value = 'radar'
  authOpen.value = !storedSessionToken()
  const context = captureAuthContext()
  void (async () => {
    await router.replace(context.token ? '/' : '/login')
    if (!isAuthContextCurrent(context)) return
    await retrySession()
  })()
}

onMounted(() => {
  window.addEventListener('chat:read', refreshChatNotifications)
  window.addEventListener('auth:external-change', handleExternalSessionChange)
  void (async () => {
    const context = captureAuthContext()
    await restoreSession()
    if (!isAuthContextCurrent(context)) return
    await loadPets()
    if (currentUser.value && isAuthContextCurrent(context)) await activateNotifications()
  })()
  window.addEventListener('auth:unauthorized', handleUnauthorized)
})

onBeforeUnmount(() => {
  window.removeEventListener('chat:read', refreshChatNotifications)
  deepLinkRequestSequence += 1
  petsRequestSequence += 1
  petsAbortController?.abort()
  petsAbortController = null
  if (petsReloadTimer) {
    clearTimeout(petsReloadTimer)
    petsReloadTimer = null
  }
  clearToastTimers()
  stopNotificationPolling()
  window.removeEventListener('auth:unauthorized', handleUnauthorized)
  window.removeEventListener('auth:external-change', handleExternalSessionChange)
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

.deep-link-state {
  position: fixed;
  inset: 0;
  z-index: 44;
  display: flex;
  width: 100%;
  max-width: 480px;
  min-height: 100dvh;
  margin: 0 auto;
  padding: 32px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: var(--page-bg);
  color: var(--ink-muted);
  text-align: center;
}

.deep-link-state h1 {
  margin-top: 14px;
  color: var(--ink);
  font-size: 21px;
}

.deep-link-state p {
  max-width: 310px;
  margin-top: 7px;
  font-size: 13.5px;
  line-height: 1.5;
}

.deep-link-icon {
  width: 68px;
  height: 68px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: rgba(29, 99, 96, 0.1);
  color: var(--color-icon-primary);
}

.deep-link-spinner {
  width: 34px;
  height: 34px;
  border: 3px solid rgba(29, 99, 96, 0.14);
  border-top-color: var(--color-icon-primary);
  border-radius: 50%;
  animation: deep-link-spin 0.75s linear infinite;
}

.deep-link-actions {
  display: flex;
  gap: 10px;
  margin-top: 20px;
}

.deep-link-actions button {
  min-height: 44px;
  padding: 0 18px;
  border-radius: 14px;
  background: #1d6360;
  color: #fff;
  font-weight: 800;
}

.deep-link-actions button.secondary {
  background: var(--color-surface-selected);
  color: var(--color-text-accent);
}

@keyframes deep-link-spin {
  to { transform: rotate(360deg); }
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
  max-height: min(94dvh, 880px);
  overflow-y: auto;
  overscroll-behavior: contain;
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

.sheet-field textarea,
.sheet-field input {
  width: 100%;
  padding: 13px 15px;
  border-radius: var(--radius-md);
  border: 1.5px solid var(--line);
  background: var(--surface);
  outline: none;
  resize: none;
}

.sheet-field textarea:focus,
.sheet-field input:focus {
  border-color: var(--color-border-accent);
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
  color: var(--color-text-accent);
  font-weight: 800;
  font-size: 14.5px;
  margin-bottom: 12px;
}

.sheet-field small {
  color: var(--ink-muted);
  font-size: 11px;
  font-weight: 600;
  line-height: 1.4;
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
  color: var(--color-text-urgent);
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

.sheet-send:disabled {
  cursor: wait;
  border: 1px solid var(--color-disabled-border);
  background: var(--color-disabled-surface);
  color: var(--color-disabled-text);
  box-shadow: none;
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
  color: var(--color-icon-primary);
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
  --nav-active: var(--color-nav-active);
  --nav-inactive: var(--color-nav-inactive);
  --nav-accent: var(--coral);
  --nav-surface: var(--color-surface);
  --nav-ease: cubic-bezier(0.4, 0, 0.2, 1);

  position: fixed;
  z-index: 40;
  right: auto;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);

  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  align-items: stretch;
  gap: 2px;

  box-sizing: border-box;
  width: 100%;
  max-width: 480px;
  padding: 6px 4px calc(6px + env(safe-area-inset-bottom, 0px));

  border: 0;
  border-top: 1px solid var(--color-border);
  border-radius: 0;
  background: var(--nav-surface);
  box-shadow: none;
  font-family: var(--font-feed);
}
.tabbar.feed-theme { background: var(--nav-surface) !important; }

.tabbar button {
  position: relative;
  appearance: none;
  display: grid;
  grid-template-rows: 38px auto;
  align-items: center;
  justify-items: center;
  gap: 4px;

  min-width: 44px;
  min-height: 60px;
  margin: 0;
  padding: 2px;
  border: 0;
  border-radius: 0;
  background: transparent;

  color: var(--nav-inactive);
  font: inherit;
  font-size: 11px;
  font-weight: 500;
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

.nav-item.active,.report-item.active {
  border: 0;
  background: transparent;
  color: var(--nav-active);
  box-shadow: none;
  font-weight: 700;
}
.tabbar button[aria-current='page']::after { content: ''; position: absolute; left: 50%; bottom: 0; width: 20px; height: 2px; background: currentColor; transform: translateX(-50%); }

.nav-icon-wrap {
  position: relative;
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
}

.nav-unread {
  position: absolute;
  z-index: 2;
  top: -7px;
  right: -10px;
  min-width: 19px;
  height: 19px;
  display: grid;
  place-items: center;
  padding: 0 4px;
  border: 2.5px solid var(--nav-surface);
  border-radius: 999px;
  background: var(--nav-accent);
  color: var(--color-text-on-coral);
  box-shadow: none;
  font-size: 9.5px;
  font-weight: 900;
  line-height: 1;
}

.tabbar .report-item {
  gap: 4px;
  margin: 0;
  padding: 2px;
  color: var(--nav-inactive);
}
.tabbar .report-item.active { color: var(--nav-active); }

.report-icon {
  display: grid;
  place-items: center;
  box-sizing: border-box;
  width: 38px;
  height: 38px;
  border: 0;
  border-radius: 10px;
  background: var(--nav-accent);
  color: var(--color-text-on-accent);
  box-shadow: none;

  transition:
    transform 0.2s var(--nav-ease),
    box-shadow 0.2s var(--nav-ease);
}

.report-label {
  padding: 0;
  border-radius: 0;
  transition: background-color 0.2s var(--nav-ease);
}

.report-item.active .report-label {
  outline: none;
  background: transparent;
}

.tabbar button:active {
  transform: scale(0.98);
}

.report-item:active .report-icon {
  box-shadow: none;
}

.tabbar button:focus-visible {
  outline: 2px solid var(--color-border-accent);
  outline-offset: -5px;
  border-radius: 8px;
}

@media (hover: hover) and (pointer: fine) {
  .nav-item:hover {
    background: color-mix(in srgb, var(--color-surface-selected) 62%, var(--nav-surface));
    color: var(--nav-active);
  }

  .nav-item.active:hover {
    background: transparent;
  }

  .report-item:hover .report-icon {
    transform: none;
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
