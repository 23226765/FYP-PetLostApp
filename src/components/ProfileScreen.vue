<template>
  <div class="profile">
    <header class="profile-topbar">
      <strong>{{ userHandle }}</strong>
      <button
        class="menu-button"
        type="button"
        :aria-label="t('profile.openSettings')"
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
        :alt="user ? t('settings.profilePhotoAlt', { name: user.name }) : t('profile.guest')"
      />
      <h1>{{ user ? user.name : t('profile.guest') }}</h1>
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
        {{ user ? user.email : t('profile.guestHelp') }}
      </p>
      <p v-if="user?.phone" class="area phone">{{ user.phone }}</p>
      <button v-if="!user" class="auth-btn primary" @click="emit('login')">
        {{ t('profile.signInCreate') }}
      </button>
    </section>

    <div class="stats">
      <div class="stat">
        <span class="num">{{ sightingCount }}</span>
        <span class="lbl">{{ t('profile.sightingsReported') }}</span>
      </div>
      <div class="stat highlight">
        <span class="num">{{ reunitedCount }}</span>
        <span class="lbl">{{ t('profile.petsReunited') }}</span>
      </div>
      <div class="stat">
        <span class="num">{{ activePostCount }}</span>
        <span class="lbl">{{ t('profile.activeReports') }}</span>
      </div>
    </div>

    <ProfileContentTabs :model-value="activeTab" @update:model-value="selectTab" />

    <div v-if="!user" class="profile-auth-state">
      <AppIcon name="user" :size="30" />
      <p>{{ t('profile.signInPosts') }}</p>
      <button type="button" @click="emit('login')">{{ t('profile.signInCreate') }}</button>
    </div>
    <template v-else>
      <MyPetsTab
        v-show="activeTab === 'pets'"
        :user-id="user.id"
        :active="profileVisible && activeTab === 'pets'"
        :refresh-key="refreshKey"
        @stats="petStats = $event"
        @open-pet="openPet"
        @add-pet="emit('add-pet')"
      />
      <MyRescuePostsTab
        v-if="loadedTabs.has('rescue')"
        v-show="activeTab === 'rescue'"
        :user-id="user.id"
        :active="profileVisible && activeTab === 'rescue'"
        :refresh-key="refreshKey"
        @open-stray="openStray"
        @create-rescue="emit('create-rescue')"
      />
      <SavedRescuePostsTab
        v-if="loadedTabs.has('saved')"
        v-show="activeTab === 'saved'"
        :user-id="user.id"
        :active="profileVisible && activeTab === 'saved'"
        :refresh-key="refreshKey"
        @open-stray="openStray"
        @explore-rescue="emit('explore-rescue')"
      />
    </template>

  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppIcon from './AppIcon.vue'
import ProfileContentTabs from './profile/ProfileContentTabs.vue'
import type { ProfileTab } from './profile/ProfileContentTabs.vue'
import MyPetsTab from './profile/MyPetsTab.vue'
import MyRescuePostsTab from './profile/MyRescuePostsTab.vue'
import SavedRescuePostsTab from './profile/SavedRescuePostsTab.vue'
import { getMySightings } from '../services/api'
import type { User } from '../types/user'
import { useAppI18n } from '../i18n'

const props = defineProps<{ user: User | null }>()
const emit = defineEmits<{
  login: []
  'add-pet': []
  'create-rescue': []
  'explore-rescue': []
}>()

const router = useRouter()
const route = useRoute()
const { t } = useAppI18n()
const sightingCount = ref(0)
const petStats = ref({ total: 0, reunited: 0, active: 0 })
const reunitedCount = computed(() => petStats.value.reunited)
const activePostCount = computed(() => petStats.value.active)
const validTabs = new Set<ProfileTab>(['pets', 'rescue', 'saved'])
const activeTab = computed<ProfileTab>(() => {
  const value = Array.isArray(route.query.tab) ? route.query.tab[0] : route.query.tab
  return validTabs.has(value as ProfileTab) ? value as ProfileTab : 'pets'
})
const loadedTabs = ref(new Set<ProfileTab>(['pets']))
const refreshKey = ref(0)
const profileVisible = computed(() => route.name === 'profile')
const userHandle = computed(() => {
  const emailHandle = props.user?.email?.split('@')[0]?.replace(/[^a-zA-Z0-9._]/g, '')
  if (emailHandle) return `@${emailHandle}`

  const nameHandle = props.user?.name?.trim().toLowerCase().replace(/\s+/g, '.')
  return nameHandle ? `@${nameHandle}` : '@guest'
})
let sightingsRequest = 0
async function loadSightingCount() {
  const current = ++sightingsRequest
  if (!props.user) { sightingCount.value = 0; return }
  try { const sightings = await getMySightings(); if (current === sightingsRequest) sightingCount.value = sightings.length }
  catch { if (current === sightingsRequest) sightingCount.value = 0 }
}

function selectTab(tab: ProfileTab) {
  loadedTabs.value = new Set([...loadedTabs.value, tab])
  void router.push({ name: 'profile', query: { ...route.query, tab } })
}
function openPet(id: string) { void router.push({ name: 'pet-detail', params: { id }, query: { from: 'profile', tab: 'pets' } }) }
function openStray(id: string) { void router.push({ name: 'stray-detail', params: { id }, query: { from: 'profile', tab: activeTab.value } }) }

watch(() => props.user?.id, () => { petStats.value = { total: 0, reunited: 0, active: 0 }; void loadSightingCount() }, { immediate: true })
watch(activeTab, (tab) => { loadedTabs.value = new Set([...loadedTabs.value, tab]) }, { immediate: true })
watch(() => route.name, (name, previous) => { if (name === 'profile' && previous && previous !== 'profile') refreshKey.value += 1 })
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
  color: var(--color-icon-primary);
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
  color: var(--color-text-accent);
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

.profile-auth-state {
  min-height: 230px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 24px;
  border: 1px solid var(--color-border);
  border-radius: 16px;
  background: var(--color-surface);
  color: var(--color-text-muted);
  text-align: center;
}

.profile-auth-state > svg { color: var(--color-icon-primary); }
.profile-auth-state button { min-height: 44px; padding: 0 18px; border-radius: 12px; background: var(--teal); color: var(--color-text-on-accent); font-weight: 850; }

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
  color: var(--color-text-urgent);
}

.my-pets-state.error button {
  margin-top: 10px;
  padding: 8px 16px;
  border-radius: 999px;
  background: var(--teal);
  color: var(--color-text-on-accent);
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
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.my-pet:hover {
  transform: translateY(-1px);
  box-shadow: var(--shadow-float);
}

.my-pet:active {
  transform: scale(0.98);
}

.my-pet:focus-visible {
  outline: 3px solid var(--color-focus);
  outline-offset: 3px;
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
  color: var(--color-text-on-coral);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.06em;
}

.status-badge.sighted,
.status-badge.reunited {
  background: var(--teal);
  color: var(--color-text-on-accent);
}

@media (prefers-reduced-motion: reduce) {
  .menu-button {
    transition: none;
  }
}
</style>
