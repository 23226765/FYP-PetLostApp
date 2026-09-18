<template>
  <div class="saved-page">
    <header class="saved-header">
      <button class="back-button" type="button" aria-label="Back to settings" @click="router.back()">
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
      <h1>Saved</h1>
      <span class="header-spacer" aria-hidden="true" />
    </header>

    <main class="saved-content">
      <div v-if="loading" class="loading-state" role="status" aria-live="polite">
        <span class="spinner" aria-hidden="true" />
        <span>Loading saved posts...</span>
      </div>

      <div v-else-if="error" class="error-state" role="alert">
        <span class="state-icon error-icon" aria-hidden="true">!</span>
        <h2>Saved posts are unavailable</h2>
        <p>{{ error }}</p>
        <button type="button" @click="loadSavedPets">Try again</button>
      </div>

      <section v-else-if="savedPets.length" class="saved-list" aria-label="Saved pet posts">
        <p>{{ savedPets.length }} {{ savedPets.length === 1 ? 'saved post' : 'saved posts' }}</p>
        <PetCard
          v-for="pet in savedPets"
          :key="pet.id"
          :pet="pet"
          @open="emit('open-pet', pet)"
          @found="emit('found', pet)"
        />
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
        <h2>No saved posts yet</h2>
        <p>Tap the bookmark icon on any pet card to save it here.</p>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import PetCard from '../components/PetCard.vue'
import { useSavedPets } from '../composables/useSavedPets'
import { getPet } from '../services/api'
import type { Pet } from '../types/pet'

const emit = defineEmits<{
  'open-pet': [pet: Pet]
  found: [pet: Pet]
}>()

const router = useRouter()
const { savedPetIds } = useSavedPets()
const savedPets = ref<Pet[]>([])
const loading = ref(false)
const error = ref('')
let requestSequence = 0

async function loadSavedPets() {
  const sequence = ++requestSequence
  const ids = [...savedPetIds.value]
  error.value = ''

  if (!ids.length) {
    savedPets.value = []
    loading.value = false
    return
  }

  loading.value = true
  try {
    const results = await Promise.allSettled(ids.map((id) => getPet(id)))
    if (sequence !== requestSequence) return

    const petsById = new Map<string, Pet>()
    results.forEach((result) => {
      if (result.status === 'fulfilled') petsById.set(result.value.id, result.value)
    })
    savedPets.value = ids.flatMap((id) => {
      const pet = petsById.get(id)
      return pet ? [pet] : []
    })

    if (!savedPets.value.length) {
      throw new Error('The saved posts could not be loaded. They may no longer be available.')
    }
  } catch (caught) {
    if (sequence !== requestSequence) return
    savedPets.value = []
    error.value = caught instanceof Error ? caught.message : 'Unable to load saved posts.'
  } finally {
    if (sequence === requestSequence) loading.value = false
  }
}

watch(savedPetIds, loadSavedPets, { immediate: true })
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
  background: #fcf9f2;
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
  background: #fff;
  color: #1d6360;
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
  background: #fff;
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
  border-top-color: #1d6360;
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
  color: #1d6360;
}

.error-icon {
  background: rgba(239, 99, 81, 0.1);
  color: #ef6351;
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
