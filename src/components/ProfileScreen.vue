<template>
  <div class="profile">
    <header class="profile-topbar">
      <strong>{{ userHandle }}</strong>
      <button
        class="menu-button"
        type="button"
        aria-label="Open settings"
        @click="router.push('/settings')"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>
    </header>

    <section class="head">
      <img
        class="avatar"
        :src="user?.avatar || '/avatar.svg'"
        :alt="user ? `Profile photo of ${user.name}` : 'Guest profile'"
      />
      <h1>{{ user ? user.name : 'Guest' }}</h1>
      <p class="area">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="m3 7 9 6 9-6" />
        </svg>
        {{ user ? user.email : 'Sign in to sync your alerts across devices' }}
      </p>
      <p v-if="user?.phone" class="area phone">{{ user.phone }}</p>
      <button v-if="!user" class="auth-btn primary" @click="emit('login')">
        Sign in / Create account
      </button>
    </section>

    <div class="stats">
      <div class="stat">
        <span class="num">{{ sightingCount }}</span>
        <span class="lbl">Sightings reported</span>
      </div>
      <div class="stat highlight">
        <span class="num">{{ reunitedCount }}</span>
        <span class="lbl">Pet reunited</span>
      </div>
      <div class="stat">
        <span class="num">{{ activePostCount }}</span>
        <span class="lbl">Active reports</span>
      </div>
    </div>

    <h2>My pets</h2>
    <div class="my-pets">
      <p v-if="!user" class="my-pets-state">Sign in to see your posts.</p>
      <p v-else-if="loading" class="my-pets-state" role="status">Loading your posts...</p>
      <div v-else-if="error" class="my-pets-state error" role="alert">
        <p>{{ error }}</p>
        <button type="button" @click="loadMyPets">Try again</button>
      </div>
      <p v-else-if="myPets.length === 0" class="my-pets-state">
        You haven't reported any pets yet.
      </p>
      <div v-else class="my-pets-list">
        <article v-for="pet in myPets" :key="pet.id" class="my-pet">
          <img :src="pet.photo" :alt="`Photo of ${pet.name}`" />
          <div class="my-pet-info">
            <span class="my-pet-name">{{ pet.name }}</span>
            <span class="my-pet-status">{{ pet.breed || pet.species }}</span>
          </div>
          <span class="status-badge" :class="pet.status">{{ pet.status.toUpperCase() }}</span>
        </article>
      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import AppIcon from './AppIcon.vue'
import { getMyPets, getMySightings } from '../services/api'
import type { Pet } from '../types/pet'
import type { User } from '../types/user'

const props = defineProps<{ user: User | null }>()
const emit = defineEmits<{
  login: []
}>()

const router = useRouter()
const myPets = ref<Pet[]>([])
const sightingCount = ref(0)
const reunitedCount = computed(() => myPets.value.filter((pet) => pet.status === 'reunited').length)
const activePostCount = computed(() => myPets.value.filter((pet) => pet.status !== 'reunited').length)
const userHandle = computed(() => {
  const emailHandle = props.user?.email?.split('@')[0]?.replace(/[^a-zA-Z0-9._]/g, '')
  if (emailHandle) return `@${emailHandle}`

  const nameHandle = props.user?.name?.trim().toLowerCase().replace(/\s+/g, '.')
  return nameHandle ? `@${nameHandle}` : '@guest'
})
const loading = ref(false)
const error = ref('')
let requestId = 0

async function loadMyPets() {
  const currentRequest = ++requestId
  myPets.value = []
  sightingCount.value = 0
  error.value = ''

  if (!props.user) {
    loading.value = false
    return
  }

  loading.value = true
  try {
    const [petsResult, sightingsResult] = await Promise.allSettled([
      getMyPets(),
      getMySightings(),
    ])
    if (petsResult.status === 'rejected') throw petsResult.reason
    if (currentRequest === requestId) {
      myPets.value = petsResult.value
      sightingCount.value = sightingsResult.status === 'fulfilled' ? sightingsResult.value.length : 0
    }
  } catch (e) {
    if (currentRequest === requestId) {
      error.value = e instanceof Error ? e.message : 'Failed to load your posts.'
    }
  } finally {
    if (currentRequest === requestId) loading.value = false
  }
}

watch(() => props.user?.id, loadMyPets, { immediate: true })
</script>

<style scoped>
.profile {
  padding: 0 20px 120px;
  max-width: 480px;
  margin: 0 auto;
}

.profile-topbar {
  position: sticky;
  top: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 0 -4px;
  padding: calc(var(--safe-top) + 10px) 4px 10px;
  background: rgba(252, 249, 242, 0.94);
  backdrop-filter: blur(16px);
}

.profile-topbar strong {
  min-width: 0;
  overflow: hidden;
  color: var(--ink);
  font-size: 17px;
  font-weight: 850;
  letter-spacing: -0.01em;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.menu-button {
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  border-radius: 50%;
  background: transparent;
  color: #1d6360;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.menu-button:active {
  transform: scale(0.96);
  background: rgba(29, 99, 96, 0.09);
}

.head {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-top: 18px;
  margin-bottom: 22px;
}

.avatar {
  width: 96px;
  height: 96px;
  border-radius: 50%;
  object-fit: cover;
  border: 4px solid var(--surface);
  box-shadow: var(--shadow-card);
  margin-bottom: 12px;
}

h1 {
  font-size: 22px;
  font-weight: 800;
}

.area {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--ink-muted);
  font-size: 13.5px;
  font-weight: 700;
}

.area svg {
  color: var(--teal);
}

.area.phone {
  margin-top: 2px;
  font-size: 12.5px;
}

.auth-btn {
  margin-top: 14px;
  padding: 10px 24px;
  border-radius: 999px;
  font-size: 14px;
  font-weight: 800;
}

.auth-btn.primary {
  background: var(--teal);
  color: #fff;
  box-shadow: var(--shadow-float);
}

.stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin-bottom: 26px;
}

.stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  background: var(--surface);
  border-radius: var(--radius-md);
  padding: 16px 8px;
  box-shadow: var(--shadow-card);
  text-align: center;
}

.stat.highlight {
  background: var(--teal);
}

.stat.highlight .num,
.stat.highlight .lbl {
  color: #fff;
}

.num {
  font-size: 22px;
  font-weight: 800;
}

.lbl {
  font-size: 11.5px;
  font-weight: 700;
  color: var(--ink-muted);
}

h2 {
  font-size: 16px;
  font-weight: 800;
  margin-bottom: 10px;
}

.my-pets {
  margin-bottom: 26px;
}

.my-pets-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.my-pets-state {
  padding: 20px 16px;
  border-radius: var(--radius-md);
  background: var(--surface);
  color: var(--ink-muted);
  box-shadow: var(--shadow-card);
  font-size: 13.5px;
  font-weight: 700;
  text-align: center;
}

.my-pets-state.error {
  color: var(--coral);
}

.my-pets-state.error button {
  margin-top: 10px;
  padding: 8px 16px;
  border-radius: 999px;
  background: var(--teal);
  color: #fff;
  font-weight: 800;
}

.my-pet {
  display: flex;
  align-items: center;
  gap: 13px;
  background: var(--surface);
  border-radius: var(--radius-md);
  padding: 12px 14px;
  box-shadow: var(--shadow-card);
}

.my-pet img {
  width: 54px;
  height: 54px;
  border-radius: var(--radius-sm);
  object-fit: cover;
}

.my-pet-info {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.my-pet-name {
  font-weight: 800;
  font-size: 15.5px;
}

.my-pet-status {
  font-size: 12.5px;
  color: var(--ink-muted);
  font-weight: 600;
}

.status-badge {
  padding: 4px 11px;
  border-radius: 999px;
  background: var(--coral);
  color: #fff;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.06em;
}

.status-badge.sighted,
.status-badge.reunited {
  background: var(--teal);
}

@media (prefers-reduced-motion: reduce) {
  .menu-button {
    transition: none;
  }
}
</style>
