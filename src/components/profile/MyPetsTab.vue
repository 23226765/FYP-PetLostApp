<template>
  <section
    id="profile-panel-pets"
    class="tab-panel"
    role="tabpanel"
    aria-labelledby="profile-tab-pets"
  >
    <div class="panel-heading">
      <h2>{{ t('profile.myPets') }}</h2>
      <button type="button" @click="emit('add-pet')"><AppIcon name="plus" :size="17" />{{ t('profile.addPet') }}</button>
    </div>
    <div v-if="loading && !pets.length" class="panel-state" role="status">
      <span class="spinner" aria-hidden="true" />{{ t('profile.loadingPets') }}
    </div>
    <div v-else-if="error && !pets.length" class="panel-state error" role="alert">
      <p>{{ error }}</p><button type="button" @click="loadPage(1)">{{ t('common.retry') }}</button>
    </div>
    <div v-else-if="!pets.length" class="panel-state">
      <span class="state-icon"><AppIcon name="paw" :size="30" /></span>
      <h2>{{ t('profile.noPetsTitle') }}</h2>
      <p>{{ t('profile.noReportedPets') }}</p>
    </div>
    <template v-else>
      <div class="my-pets-list profile-post-grid">
        <ProfilePhotoCard
          v-for="pet in pets"
          :key="pet.id"
          class="my-pet"
          :title="pet.name"
          :subtitle="pet.breed || speciesLabel(pet.species)"
          :status="petStatusLabel(pet.status)"
          :status-class="pet.status"
          :accessible-label="t('profile.openPet', { name: pet.name })"
          :photo-alt="t('pets.photoAlt', { name: pet.name })"
          :photo="pet.photo"
          :photos="pet.photos"
          @open="emit('open-pet', pet.id)"
        />
      </div>
      <p v-if="error" class="inline-error" role="alert">{{ error }}</p>
      <button v-if="hasMore" class="load-more" type="button" :disabled="loadingMore" @click="loadPage(page + 1)">
        {{ loadingMore ? t('profile.loadingMore') : t('profile.loadMore') }}
      </button>
    </template>
  </section>
</template>

<script setup lang="ts">
import ProfilePhotoCard from './ProfilePhotoCard.vue'
import { onBeforeUnmount, ref, watch } from 'vue'
import AppIcon from '../AppIcon.vue'
import { getMyPetsPage } from '../../services/api'
import type { Pet } from '../../types/pet'
import { translateApiError, useAppI18n } from '../../i18n'
import { petStatusLabel, speciesLabel } from '../../i18n/formatters'

const props = defineProps<{ userId: string; active: boolean; refreshKey: number }>()
const emit = defineEmits<{
  'open-pet': [id: string]
  'add-pet': []
  stats: [value: { total: number; reunited: number; active: number }]
}>()
const { t } = useAppI18n()
const pets = ref<Pet[]>([])
const loading = ref(false)
const loadingMore = ref(false)
const error = ref('')
const page = ref(1)
const hasMore = ref(false)
let sequence = 0
let controller: AbortController | null = null

function mergeUnique(current: Pet[], incoming: Pet[]) {
  const byId = new Map(current.map((pet) => [pet.id, pet]))
  incoming.forEach((pet) => byId.set(pet.id, pet))
  return [...byId.values()]
}

async function loadPage(nextPage: number) {
  const currentSequence = ++sequence
  controller?.abort()
  controller = new AbortController()
  error.value = ''
  loading.value = nextPage === 1
  loadingMore.value = nextPage > 1
  try {
    const result = await getMyPetsPage({ page: nextPage, limit: 20 }, controller.signal)
    if (currentSequence !== sequence) return
    pets.value = nextPage === 1 ? result.pets : mergeUnique(pets.value, result.pets)
    page.value = result.pagination.page
    hasMore.value = result.pagination.hasMore
    emit('stats', result.summary)
  } catch (cause) {
    if (currentSequence === sequence) error.value = translateApiError(cause, 'errors.loadPosts')
  } finally {
    if (currentSequence === sequence) { loading.value = false; loadingMore.value = false }
  }
}

watch(() => props.userId, () => { pets.value = []; void loadPage(1) }, { immediate: true })
watch(() => props.refreshKey, (value, previous) => { if (value !== previous && props.active) void loadPage(1) })
onBeforeUnmount(() => { sequence += 1; controller?.abort() })
</script>

<style scoped src="./profileGrid.css"></style>
<style scoped>
.tab-panel { min-height: 230px; }
.panel-state { min-height: 220px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 9px; padding: 24px; border: 1px solid var(--color-border); border-radius: 16px; background: var(--color-surface); color: var(--color-text-muted); text-align: center; }
.panel-state h2 { color: var(--color-text-primary); font-size: 17px; }
.panel-state p { font-size: 13px; }
.panel-state button, .load-more { min-height: 44px; padding: 0 18px; border-radius: 12px; background: var(--teal); color: var(--color-text-on-accent); font-weight: 850; }
.state-icon { width: 62px; height: 62px; display: grid; place-items: center; border-radius: 50%; background: var(--color-surface-selected); color: var(--color-icon-primary); }
.spinner { width: 26px; height: 26px; border: 3px solid var(--color-surface-selected); border-top-color: var(--color-icon-primary); border-radius: 50%; animation: spin .7s linear infinite; }
.load-more { width: 100%; margin-top: 12px; }
.load-more:disabled { background: var(--color-disabled-surface); color: var(--color-disabled-text); }
.inline-error, .panel-state.error { color: var(--color-text-urgent); }
.inline-error { margin-top: 10px; font-size: 12px; text-align: center; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .spinner { animation-duration: 1.4s; } }
</style>
