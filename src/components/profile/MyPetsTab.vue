<template>
  <section
    id="profile-panel-pets"
    class="tab-panel"
    role="tabpanel"
    aria-labelledby="profile-tab-pets"
  >
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
      <button type="button" @click="emit('add-pet')">{{ t('profile.addPet') }}</button>
    </div>
    <template v-else>
      <div class="panel-heading">
        <h2>{{ t('profile.myPets') }}</h2>
        <button type="button" @click="emit('add-pet')"><AppIcon name="plus" :size="17" />{{ t('profile.addPet') }}</button>
      </div>
      <div class="my-pets-list">
        <article
          v-for="pet in pets"
          :key="pet.id"
          class="my-pet"
          role="link"
          tabindex="0"
          :aria-label="t('profile.openPet', { name: pet.name })"
          @click="openPet(pet, $event)"
          @keydown.enter.prevent="openPet(pet, $event)"
          @keydown.space.prevent="openPet(pet, $event)"
        >
          <span class="pet-photo">
            <ManagedImage v-if="pet.photo && !failedImages.has(pet.id)" :src="pet.photo" :alt="t('pets.photoAlt', { name: pet.name })" @error="markImageFailed(pet.id)" />
            <AppIcon v-else name="paw" :size="26" />
          </span>
          <div class="my-pet-info"><strong>{{ pet.name }}</strong><span>{{ pet.breed || pet.species }}</span></div>
          <span class="status-badge" :class="pet.status">{{ petStatusLabel(pet.status) }}</span>
        </article>
      </div>
      <p v-if="error" class="inline-error" role="alert">{{ error }}</p>
      <button v-if="hasMore" class="load-more" type="button" :disabled="loadingMore" @click="loadPage(page + 1)">
        {{ loadingMore ? t('profile.loadingMore') : t('profile.loadMore') }}
      </button>
    </template>
  </section>
</template>

<script setup lang="ts">
import ManagedImage from "../ManagedImage.vue"
import { onBeforeUnmount, ref, watch } from 'vue'
import AppIcon from '../AppIcon.vue'
import { getMyPetsPage } from '../../services/api'
import type { Pet } from '../../types/pet'
import { translateApiError, useAppI18n } from '../../i18n'
import { petStatusLabel } from '../../i18n/formatters'

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
const failedImages = ref(new Set<string>())
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

function openPet(pet: Pet, event: MouseEvent | KeyboardEvent) {
  const target = event.target
  if (target instanceof Element && target.closest('button, a, input, select, textarea')) return
  emit('open-pet', pet.id)
}

function markImageFailed(id: string) { failedImages.value = new Set([...failedImages.value, id]) }

watch(() => props.userId, () => { pets.value = []; void loadPage(1) }, { immediate: true })
watch(() => props.refreshKey, (value, previous) => { if (value !== previous && props.active) void loadPage(1) })
onBeforeUnmount(() => { sequence += 1; controller?.abort() })
</script>

<style scoped>
.tab-panel { min-height: 230px; }
.panel-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 11px; }
.panel-heading h2 { font-size: 16px; }
.panel-heading button { min-height: 40px; display: inline-flex; align-items: center; gap: 5px; padding: 0 12px; border-radius: 999px; background: var(--color-surface-selected); color: var(--color-text-accent); font-size: 11.5px; font-weight: 850; }
.my-pets-list { display: flex; flex-direction: column; gap: 10px; }
.my-pet { display: flex; align-items: center; gap: 13px; padding: 12px 14px; border: 1px solid var(--color-border); border-radius: 16px; background: var(--color-surface); box-shadow: var(--shadow-card); cursor: pointer; transition: transform .2s ease, box-shadow .2s ease; }
.my-pet:hover { transform: translateY(-1px); box-shadow: var(--shadow-float); }
.my-pet:active { transform: scale(.985); }
.my-pet:focus-visible { outline: 3px solid var(--color-focus); outline-offset: 3px; }
.pet-photo { width: 56px; height: 56px; display: grid; place-items: center; flex: none; overflow: hidden; border-radius: 13px; background: var(--color-surface-selected); color: var(--color-icon-primary); }
.pet-photo img { width: 100%; height: 100%; object-fit: cover; }
.my-pet-info { min-width: 0; display: flex; flex: 1; flex-direction: column; }
.my-pet-info strong, .my-pet-info span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.my-pet-info strong { font-size: 15px; }
.my-pet-info span { color: var(--color-text-muted); font-size: 12px; }
.status-badge { padding: 4px 9px; border-radius: 999px; background: var(--status-coral-bg); color: var(--color-text-urgent); font-size: 10px; font-weight: 850; }
.status-badge.sighted { background: var(--color-surface-selected); color: var(--color-text-accent); }
.status-badge.reunited { background: var(--teal); color: var(--color-text-on-accent); }
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
@media (prefers-reduced-motion: reduce) { .my-pet { transition: none; } .spinner { animation-duration: 1.4s; } }
</style>
