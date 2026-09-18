import { readonly, ref } from 'vue'

const STORAGE_KEY = 'pawradar_saved_pets'
const savedPetIdsState = ref<string[]>([])
let initialized = false

function parseSavedPetIds(value: string | null): string[] {
  if (!value) return []

  try {
    const parsed: unknown = JSON.parse(value)
    if (!Array.isArray(parsed)) return []

    return [...new Set(parsed.filter((id): id is string => typeof id === 'string' && id.trim() !== ''))]
  } catch {
    return []
  }
}

function hydrateSavedPetIds() {
  if (initialized || typeof window === 'undefined') return
  initialized = true
  try {
    savedPetIdsState.value = parseSavedPetIds(localStorage.getItem(STORAGE_KEY))
  } catch {
    savedPetIdsState.value = []
  }

  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY) {
      savedPetIdsState.value = parseSavedPetIds(event.newValue)
    }
  })
}

function persistSavedPetIds() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(savedPetIdsState.value))
  } catch {
    // Keep the in-memory state usable when storage is blocked or full.
  }
}

function isSaved(petId: string): boolean {
  return savedPetIdsState.value.includes(String(petId))
}

function toggleSave(petId: string): boolean {
  const normalizedId = String(petId).trim()
  if (!normalizedId) return false

  if (isSaved(normalizedId)) {
    savedPetIdsState.value = savedPetIdsState.value.filter((id) => id !== normalizedId)
  } else {
    savedPetIdsState.value = [...savedPetIdsState.value, normalizedId]
  }

  persistSavedPetIds()
  return isSaved(normalizedId)
}

export function useSavedPets() {
  hydrateSavedPetIds()

  return {
    savedPetIds: readonly(savedPetIdsState),
    isSaved,
    toggleSave,
  }
}
