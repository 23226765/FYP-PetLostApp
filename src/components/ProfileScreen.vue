<template>
  <div class="profile">
    <header class="profile-topbar">
      <section class="head">
        <UserAvatar
          class="avatar"
          :src="user?.avatar"
          :name="user?.name"
          :alt="user ? t('settings.profilePhotoAlt', { name: user.name }) : t('profile.guest')"
        />
        <h1>{{ user ? user.name : t('profile.guest') }}</h1>
        <p class="handle">{{ userHandle }}</p>
        <p class="area">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="m3 7 9 6 9-6" />
          </svg>
          {{ user ? user.email : t('profile.guestHelp') }}
        </p>
        <p v-if="user?.phone" class="area phone">{{ user.phone }}</p>
        <button v-if="!user" class="auth-btn primary" @click="emit('login')">{{ t('profile.signInCreate') }}</button>
      </section>
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

    <p v-if="user && sightingCount !== null" class="sighting-summary">
      {{ t('profile.sightingsSummary', { count: sightingCount }, sightingCount) }}
    </p>

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
import UserAvatar from './UserAvatar.vue'
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
const sightingCount = ref<number | null>(null)
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
  const userId = props.user?.id
  sightingCount.value = null
  if (!userId) return
  try {
    const sightings = await getMySightings()
    if (current === sightingsRequest && userId === props.user?.id && Array.isArray(sightings)) sightingCount.value = sightings.length
  } catch { /* Unavailable counts remain unknown rather than implying zero. */ }
}

function selectTab(tab: ProfileTab) {
  loadedTabs.value = new Set([...loadedTabs.value, tab])
  void router.push({ name: 'profile', query: { ...route.query, tab } })
}
function openPet(id: string) { void router.push({ name: 'pet-detail', params: { id }, query: { from: 'profile', tab: 'pets' } }) }
function openStray(id: string) { void router.push({ name: 'stray-detail', params: { id }, query: { from: 'profile', tab: activeTab.value } }) }

watch(() => props.user?.id, () => { void loadSightingCount() }, { immediate: true })
watch(activeTab, (tab) => { loadedTabs.value = new Set([...loadedTabs.value, tab]) }, { immediate: true })
watch(() => route.name, (name, previous) => { if (name === 'profile' && previous && previous !== 'profile') refreshKey.value += 1 })
</script>

<style scoped>
.profile { padding: 0 var(--page-padding) calc(92px + var(--safe-bottom)); max-width: 480px; margin: 0 auto; }
.profile-topbar { display: flex; align-items: flex-start; gap: 12px; padding: calc(var(--safe-top) + 16px) 0 20px; background: var(--page-bg); }
.menu-button { width: 44px; height: 44px; display: grid; place-items: center; flex-shrink: 0; border-radius: 8px; color: var(--color-icon-primary); }
.menu-button:active { background: var(--color-surface-selected); }
.menu-button:focus-visible { outline: 3px solid var(--color-focus); outline-offset: 2px; }
.head { flex: 1; min-width: 0; display: grid; grid-template-columns: 64px minmax(0, 1fr); column-gap: 12px; row-gap: 3px; align-items: center; }
.avatar { grid-column: 1; grid-row: 1 / span 5; width: 64px; height: 64px; border-radius: 50%; object-fit: cover; border: 1px solid var(--color-border); }
h1 { grid-column: 2; font-size: var(--page-title-size); font-weight: var(--page-title-weight); line-height: 1.3; overflow-wrap: anywhere; }
.handle { grid-column: 2; min-width: 0; color: var(--color-text-secondary); font-size: 13px; line-height: 1.4; overflow-wrap: anywhere; }
.area { grid-column: 2; min-width: 0; display: flex; align-items: center; gap: 5px; color: var(--ink-muted); font-size: 12px; line-height: 1.4; overflow-wrap: anywhere; }
.area svg { color: var(--color-text-accent); flex-shrink: 0; }
.auth-btn { grid-column: 2; margin-top: 10px; min-height: 44px; padding: 10px 14px; border-radius: var(--radius-sm); font-size: 14px; font-weight: 600; }
.auth-btn.primary { background: var(--teal); color: var(--color-text-on-accent); }
.sighting-summary { margin: -4px 0 16px; color: var(--color-text-secondary); font-size: 13px; line-height: 1.5; overflow-wrap: anywhere; }
.profile-auth-state { min-height: 230px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding: 24px; color: var(--color-text-muted); text-align: center; }
.profile-auth-state > svg { color: var(--color-icon-primary); }
.profile-auth-state button { min-height: 44px; padding: 0 18px; border-radius: var(--radius-sm); background: var(--teal); color: var(--color-text-on-accent); font-weight: 600; }
</style>
