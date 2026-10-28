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
      <ManagedImage
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
import ManagedImage from "./ManagedImage.vue"
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
.profile { padding: 0 var(--page-padding) calc(92px + var(--safe-bottom)); max-width: 480px; margin: 0 auto; }
.profile-topbar { position: sticky; top: 0; z-index: 5; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: calc(var(--safe-top) + 8px) 0 8px; background: var(--page-bg); }
.profile-topbar strong { min-width: 0; overflow: hidden; color: var(--ink); font-size: 17px; font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
.menu-button { width: 44px; height: 44px; display: grid; place-items: center; flex-shrink: 0; border-radius: 8px; color: var(--color-icon-primary); }
.menu-button:active { background: var(--color-surface-selected); }
.head { display: grid; grid-template-columns: 72px minmax(0, 1fr); column-gap: 16px; align-items: center; margin: 12px 0 20px; }
.avatar { grid-column: 1; grid-row: 1 / span 4; width: 72px; height: 72px; border-radius: 50%; object-fit: cover; border: 1px solid var(--color-border); }
h1 { grid-column: 2; font-size: var(--page-title-size); font-weight: var(--page-title-weight); line-height: 1.3; overflow-wrap: anywhere; }
.area { grid-column: 2; display: flex; align-items: center; gap: 5px; color: var(--ink-muted); font-size: 13px; overflow-wrap: anywhere; }
.area svg { color: var(--color-text-accent); flex-shrink: 0; }
.auth-btn { grid-column: 2; margin-top: 10px; min-height: 44px; padding: 10px 14px; border-radius: var(--radius-sm); font-size: 14px; font-weight: 600; }
.auth-btn.primary { background: var(--teal); color: var(--color-text-on-accent); }
.stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); padding: 12px 0; margin-bottom: 12px; border-block: 1px solid var(--color-border); }
.stat { display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 0 6px; text-align: center; }
.stat + .stat { border-left: 1px solid var(--color-border); }
.num { font-size: 20px; font-weight: 650; color: var(--color-text-primary); }
.stat.highlight .num { color: var(--color-text-accent); }
.lbl { font-size: 12px; color: var(--ink-muted); line-height: 1.4; }
.profile-auth-state { min-height: 230px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding: 24px; color: var(--color-text-muted); text-align: center; }
.profile-auth-state > svg { color: var(--color-icon-primary); }
.profile-auth-state button { min-height: 44px; padding: 0 18px; border-radius: var(--radius-sm); background: var(--teal); color: var(--color-text-on-accent); font-weight: 600; }
</style>
