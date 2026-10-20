<template>
  <div class="saved-page">
    <header class="saved-header">
      <button class="back-button" type="button" :aria-label="t('settings.savedBack')" @click="router.back()">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="m15 18-6-6 6-6" />
        </svg>
      </button>
      <h1>{{ t('settings.saved') }}</h1>
      <span class="header-spacer" aria-hidden="true" />
    </header>

    <main class="saved-content">
      <p v-if="savedContext.storageIssue" class="unavailable" role="status">{{ t('savedRepair.storageIssue') }}</p>
      <div v-if="loading" class="loading-state" role="status" aria-live="polite">
        <span class="spinner" aria-hidden="true" />
        <span>{{ t('settings.loadingSaved') }}</span>
      </div>

      <div v-else-if="hasFailures && !hasContent && !unavailableCount && !morePets && !moreStrays" class="error-state" role="alert">
        <span class="state-icon error-icon" aria-hidden="true">!</span>
        <h2>{{ t('settings.savedUnavailable') }}</h2>
        <p>{{ error }}</p>
        <button type="button" :disabled="petLoading || strayLoading" @click="retryFailures">{{ t('common.retry') }}</button>
      </div>

      <section v-else-if="hasAnySaved" class="saved-list" :aria-label="t('settings.savedPosts')">
        <p v-if="petTotal">{{ t('settings.lostPetPosts') }}</p>
        <PetCard
          v-for="pet in savedPets"
          :key="pet.id"
          :pet="pet"
          @open="emit('open-pet', pet)"
          @found="emit('found', pet)"
        />
        <p v-if="petTotal" class="pet-count">{{ t('savedRepair.petCount', { shown: savedPets.length, total: petTotal }) }}</p>
        <button v-if="morePets" class="load-more pets-more" type="button" :disabled="petLoading" @click="loadMorePets">{{ petLoading ? t('profile.loadingMore') : t('profile.loadMore') }}</button>
        <p v-if="savedStrays.length || strayPagination?.total">{{ t('settings.strayPosts') }}</p>
        <button v-for="stray in savedStrays" :key="stray.id" class="saved-stray" type="button" @click="emit('open-stray', stray.id)">
          <ManagedImage v-if="stray.photo" :src="imageUrl(stray.photo)" :alt="t('strays.reportedAlt', { species: strayAnimalLabel(stray.species, stray.animalType) })" />
          <span class="saved-stray-copy"><strong>{{ strayAnimalLabel(stray.species, stray.animalType) }} · {{ districtLabel(stray.district) }}</strong><span>{{ stray.description }}</span><small>{{ stray.author.name }} · {{ formatRelativeDate(stray.createdAt) }}</small></span>
        </button>
        <p v-if="strayPagination?.total" class="stray-count">{{ t('savedRepair.strayCount', { shown: savedStrays.length, total: strayPagination.total }) }}</p>
        <button v-if="moreStrays" class="load-more strays-more" type="button" :disabled="strayLoading" @click="loadMoreStrays">{{ strayLoading ? t('profile.loadingMore') : t('profile.loadMore') }}</button>
        <p v-if="unavailableCount" class="unavailable">{{ t('settings.unavailableSaved', { count: unavailableCount }, unavailableCount) }}</p>
        <div v-if="hasFailures" class="error-state partial-error" role="alert"><p>{{ error }}</p><button type="button" :disabled="petLoading || strayLoading" @click="retryFailures">{{ t('common.retry') }}</button></div>
      </section>

      <div v-else class="empty-state" role="status">
        <span class="state-icon" aria-hidden="true">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="34"
            height="34"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z" />
          </svg>
        </span>
        <h2>{{ t('settings.noSaved') }}</h2>
        <p>{{ t('settings.noSavedHelp') }}</p>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import ManagedImage from '../components/ManagedImage.vue'
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useRouter } from 'vue-router'
import PetCard from '../components/PetCard.vue'
import { useSavedPets } from '../composables/useSavedPets'
import { getPet, getSavedStraysPage } from '../services/api'
import type { Pagination } from '../services/api'
import { captureAuthContext, isAuthContextCurrent } from '../services/authSession'
import type { Pet } from '../types/pet'
import type { StrayReport } from '../types/stray'
import type { User } from '../types/user'
import { translateApiError, useAppI18n } from '../i18n'
import { districtLabel, formatRelativeDate, strayAnimalLabel } from '../i18n/formatters'

const props = defineProps<{ user?: User | null }>()
const emit = defineEmits<{ 'open-pet': [pet: Pet]; found: [pet: Pet]; 'open-stray': [strayId: string] }>()
const router = useRouter()
const { t } = useAppI18n()
const { savedContext } = useSavedPets()
const PAGE_SIZE = 20
const savedPets = ref<Pet[]>([])
const savedStrays = ref<StrayReport[]>([])
const petFailures = shallowRef(new Set<string>())
const petUnavailable = shallowRef(new Set<string>())
const processedPets = ref(0)
const petLoading = ref(false)
const strayLoading = ref(false)
const strayError = shallowRef<unknown>(null)
type StrayPage = { strays: StrayReport[]; unavailableCount: number; pagination: Pagination }
const strayPages = shallowRef(new Map<number, StrayPage>())
const strayPagination = ref<Pagination | null>(null)
const strayFailedPage = ref<number | null>(null)
let petSequence = 0, straySequence = 0, disposed = false
let petController: AbortController | null = null, strayController: AbortController | null = null

const ready = computed(() => savedContext.value.ready && (savedContext.value.accountId ? props.user?.id === savedContext.value.accountId : !props.user))
const petTotal = computed(() => savedContext.value.ids.length)
const hasContent = computed(() => Boolean(savedPets.value.length || savedStrays.value.length))
const hasFailures = computed(() => Boolean(petFailures.value.size || strayError.value))
const loading = computed(() => !ready.value || (!hasContent.value && (petLoading.value || strayLoading.value)))
const error = computed(() => petFailures.value.size ? t('savedRepair.fetchFailed') : strayError.value ? translateApiError(strayError.value, 'errors.loadSaved') : '')
const unavailableCount = computed(() => petUnavailable.value.size + [...strayPages.value.values()].reduce((sum, page) => sum + page.unavailableCount, 0))
const hasAnySaved = computed(() => Boolean(petTotal.value || strayPagination.value?.total || hasContent.value || hasFailures.value || unavailableCount.value || savedContext.value.storageIssue))
const morePets = computed(() => processedPets.value < petTotal.value)
const moreStrays = computed(() => Boolean(strayPagination.value?.hasMore))

function requestGuard() {
  const snapshot = savedContext.value
  const auth = captureAuthContext()
  return () => !disposed && ready.value && savedContext.value === snapshot && isAuthContextCurrent(auth)
}
async function loadPetIds(ids: string[], advance: boolean) {
  if (!ready.value || petLoading.value || !ids.length) return
  const current = ++petSequence, active = requestGuard()
  petController?.abort(); petController = new AbortController()
  const signal = petController.signal
  petLoading.value = true
  const outcomes: Array<{ id: string; pet?: Pet; unavailable?: boolean }> = []
  let cursor = 0
  async function worker() {
    while (active() && cursor < ids.length) {
      const id = ids[cursor++]!
      try {
        const pet = await getPet(id, signal)
        if (!pet || pet.id !== id) throw new Error('Unexpected saved-post response')
        outcomes.push({ id, pet })
      } catch (cause) {
        const status = (cause as { status?: number } | null)?.status
        outcomes.push({ id, unavailable: status === 404 || status === 410 })
      }
    }
  }
  try {
    await Promise.all(Array.from({ length: Math.min(4, ids.length) }, worker))
    if (current !== petSequence || !active()) return
    const pets = new Map(savedPets.value.map(pet => [pet.id, pet]))
    const failures = new Set(petFailures.value), unavailable = new Set(petUnavailable.value)
    for (const result of outcomes) {
      failures.delete(result.id); unavailable.delete(result.id)
      if (result.pet) pets.set(result.id, result.pet)
      else {
        pets.delete(result.id)
        if (result.unavailable) unavailable.add(result.id)
        else failures.add(result.id)
      }
    }
    savedPets.value = savedContext.value.ids.flatMap(id => pets.has(id) ? [pets.get(id)!] : [])
    petFailures.value = failures; petUnavailable.value = unavailable
    if (advance) processedPets.value += ids.length
  } finally { if (current === petSequence && active()) petLoading.value = false }
}
async function loadStrayPage(page: number) {
  if (!ready.value || !savedContext.value.accountId || strayLoading.value) return
  const current = ++straySequence, active = requestGuard()
  strayController?.abort(); strayController = new AbortController()
  strayLoading.value = true; strayError.value = null
  try {
    const result = await getSavedStraysPage({ page, limit: PAGE_SIZE }, strayController.signal)
    if (current !== straySequence || !active()) return
    if (result.pagination.page !== page) throw new Error('Unexpected saved-page response')
    const pages = page === 1 ? new Map<number, StrayPage>() : new Map(strayPages.value)
    pages.set(page, result)
    strayPages.value = pages
    savedStrays.value = [...new Map([...pages.entries()].sort(([left], [right]) => left - right).flatMap(([, value]) => value.strays).map(stray => [stray.id, stray])).values()]
    strayPagination.value = result.pagination // Saved-record total includes unavailable records.
    strayFailedPage.value = null
  } catch (cause) {
    if (current === straySequence && active()) { strayError.value = cause; strayFailedPage.value = page }
  } finally { if (current === straySequence && active()) strayLoading.value = false }
}
function loadMorePets() { void loadPetIds(savedContext.value.ids.slice(processedPets.value, processedPets.value + PAGE_SIZE), true) }
function loadMoreStrays() { void loadStrayPage(strayFailedPage.value || (strayPagination.value?.page || 0) + 1) }
function retryFailures() {
  if (petFailures.value.size) void loadPetIds([...petFailures.value], false)
  if (strayFailedPage.value) void loadStrayPage(strayFailedPage.value)
}
function resetAndLoad() {
  petSequence++; straySequence++; petController?.abort(); strayController?.abort()
  savedPets.value = []; savedStrays.value = []; petFailures.value = new Set(); petUnavailable.value = new Set()
  strayPages.value = new Map(); strayPagination.value = null; strayError.value = null; strayFailedPage.value = null
  processedPets.value = 0; petLoading.value = false; strayLoading.value = false
  if (!ready.value) return
  loadMorePets()
  if (savedContext.value.accountId) void loadStrayPage(1)
}
watch([savedContext, () => props.user?.id], resetAndLoad, { immediate: true, flush: 'sync' })
onBeforeUnmount(() => { disposed = true; petSequence++; straySequence++; petController?.abort(); strayController?.abort(); savedPets.value = []; savedStrays.value = [] })

function imageUrl(value: string) {
  try { const api = new URL(import.meta.env.VITE_API_BASE_URL || '/api', window.location.origin); return new URL(value, `${api.origin}/`).href } catch { return '' }
}
</script>

<style scoped>
.saved-page {
  position: fixed;
  inset: 0;
  z-index: 45;
  width: 100%;
  max-width: 480px;
  margin: 0 auto;
  overflow-y: auto;
  background: var(--page-bg);
  color: var(--ink);
  -webkit-overflow-scrolling: touch;
}

.saved-header {
  position: sticky;
  top: 0;
  z-index: 5;
  display: grid;
  grid-template-columns: 44px 1fr 44px;
  align-items: center;
  gap: 10px;
  padding: calc(var(--safe-top) + 12px) 16px 12px;
  border-bottom: 1px solid rgba(29, 99, 96, 0.09);
  background: rgba(252, 249, 242, 0.95);
  backdrop-filter: blur(16px);
}

.saved-header h1 {
  font-size: 18px;
  font-weight: 850;
  text-align: center;
}

.back-button,
.header-spacer {
  width: 44px;
  height: 44px;
}

.back-button {
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--color-surface-elevated);
  color: var(--color-icon-primary);
  box-shadow: 0 4px 14px rgba(29, 99, 96, 0.1);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.back-button:active {
  transform: scale(0.96);
  background: rgba(29, 99, 96, 0.09);
}

.saved-content {
  padding: 20px 16px calc(var(--safe-bottom) + 40px);
}

.saved-list {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 16px;
}

.saved-list > p {
  margin: 0 2px -4px;
  color: var(--ink-muted);
  font-size: 12.5px;
  font-weight: 750;
}
.saved-stray { width: 100%; min-height: 108px; display: grid; grid-template-columns: 108px 1fr; overflow: hidden; border-radius: 14px; background: var(--color-surface); box-shadow: var(--shadow-card); color: var(--color-text-primary); text-align: left; }
.saved-stray img { width: 108px; height: 108px; object-fit: cover; }
.saved-stray-copy { min-width: 0; display: flex; flex-direction: column; justify-content: center; gap: 5px; padding: 12px; }
.saved-stray-copy > span { overflow: hidden; color: var(--ink-muted); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.saved-stray-copy small,.unavailable { color: var(--ink-muted); font-size: 10.5px; }

.loading-state,
.empty-state,
.error-state {
  min-height: 360px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px 24px;
  border: 1px solid rgba(29, 99, 96, 0.08);
  border-radius: 14px;
  background: var(--color-surface-elevated);
  box-shadow: 0 8px 24px rgba(29, 99, 96, 0.065);
  text-align: center;
}

.loading-state {
  gap: 12px;
  color: var(--ink-muted);
  font-size: 13px;
  font-weight: 750;
}

.spinner {
  width: 30px;
  height: 30px;
  border: 3px solid rgba(29, 99, 96, 0.15);
  border-top-color: var(--color-icon-primary);
  border-radius: 50%;
  animation: spin 0.75s linear infinite;
}

.state-icon {
  width: 70px;
  height: 70px;
  display: grid;
  place-items: center;
  margin-bottom: 16px;
  border-radius: 50%;
  background: rgba(29, 99, 96, 0.1);
  color: var(--color-text-accent);
}

.error-icon {
  background: rgba(239, 99, 81, 0.1);
  color: var(--color-text-urgent);
  font-size: 28px;
  font-weight: 850;
}

.empty-state h2,
.error-state h2 {
  font-size: 19px;
  font-weight: 850;
}

.empty-state p,
.error-state p {
  max-width: 300px;
  margin-top: 7px;
  color: var(--ink-muted);
  font-size: 13px;
  line-height: 1.5;
}

.error-state button {
  min-height: 44px;
  margin-top: 18px;
  padding: 0 22px;
  border-radius: 999px;
  background: #1d6360;
  color: #fff;
  font-weight: 800;
}

.partial-error { min-height: 0; padding: 16px; }
.load-more { min-height: 44px; padding: 10px 18px; border-radius: 14px; background: var(--teal); color: var(--color-text-on-accent); font-weight: 800; }
button:disabled { opacity: 0.6; cursor: wait; }

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .back-button {
    transition: none;
  }

  .spinner {
    animation-duration: 1.5s;
  }
}
</style>
