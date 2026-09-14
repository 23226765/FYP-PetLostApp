<template>
  <div class="settings-screen">
    <header class="top">
      <button class="icon-button" aria-label="Go back" @click="emit('close')">
        <AppIcon name="back" :size="22" />
      </button>
      <h1>Account &amp; Settings</h1>
      <span class="spacer" aria-hidden="true" />
    </header>

    <section class="profile-card">
      <img :src="user?.avatar || '/avatar.svg'" :alt="user ? `Profile photo of ${user.name}` : 'Guest profile'" />
      <div>
        <strong>{{ user?.name || 'Guest' }}</strong>
        <span>{{ user?.email || 'Not signed in' }}</span>
      </div>
      <button class="edit-button" type="button" :disabled="!user" @click="editingProfile = !editingProfile">
        {{ editingProfile ? 'Cancel' : 'Edit' }}
      </button>
    </section>

    <Transition name="expand">
      <form v-if="editingProfile" class="edit-form" @submit.prevent="saveProfile">
        <label><span>Display name</span><input v-model="form.name" required maxlength="100" autocomplete="name" /></label>
        <label><span>Email</span><input v-model="form.email" required type="email" autocomplete="email" /></label>
        <label><span>Phone number</span><input v-model="form.phone" type="tel" maxlength="30" autocomplete="tel" /></label>
        <p v-if="profileError" class="message error" role="alert">{{ profileError }}</p>
        <p v-if="profileSaved" class="message" role="status">Profile updated.</p>
        <button class="save-button" type="submit" :disabled="savingProfile">
          <AppIcon name="check" :size="18" />{{ savingProfile ? 'Saving...' : 'Save changes' }}
        </button>
      </form>
    </Transition>

    <h2>Notifications</h2>
    <ul class="settings-list">
      <li>
        <div class="setting-label"><AppIcon name="bell" :size="19" /><div><strong>Proximity alerts</strong><span>Lost pets reported inside your radius</span></div></div>
        <button class="switch" :class="{ on: alertsEnabled }" role="switch" :aria-checked="alertsEnabled" @click="emit('toggle-alerts', !alertsEnabled)"><span /></button>
      </li>
    </ul>

    <h2>Radar</h2>
    <section class="radius-card">
      <div class="setting-label"><AppIcon name="pin" :size="19" /><div><strong>Search and alert radius</strong><span>Used by both Radar and notifications</span></div></div>
      <div class="radius-options" role="group" aria-label="Search radius">
        <button v-for="option in radiusOptions" :key="option" type="button" :class="{ active: radiusKm === option }" :aria-pressed="radiusKm === option" @click="emit('radius-change', option)">{{ option }} km</button>
      </div>
    </section>

    <h2>Account</h2>
    <button class="sign-out" type="button" @click="emit('logout')"><AppIcon name="close" :size="19" />Sign out</button>
    <p class="version">PawRadar web v1.0.0</p>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import { updateProfile } from '../services/api'
import type { User } from '../types/user'

const props = defineProps<{
  user: User | null
  alertsEnabled: boolean
  radiusKm: number
}>()
const emit = defineEmits<{
  close: []
  logout: []
  updated: [user: User]
  'toggle-alerts': [enabled: boolean]
  'radius-change': [radiusKm: number]
}>()

const radiusOptions = [1, 3, 5, 10, 15] as const
const editingProfile = ref(false)
const savingProfile = ref(false)
const profileError = ref('')
const profileSaved = ref(false)
const form = reactive({ name: '', email: '', phone: '' })

watch(
  () => props.user,
  (user) => {
    form.name = user?.name || ''
    form.email = user?.email || ''
    form.phone = user?.phone || ''
    profileError.value = ''
    profileSaved.value = false
  },
  { immediate: true },
)

async function saveProfile() {
  if (!props.user || savingProfile.value) return
  savingProfile.value = true
  profileError.value = ''
  profileSaved.value = false
  try {
    const user = await updateProfile({ ...form })
    emit('updated', user)
    profileSaved.value = true
    editingProfile.value = false
  } catch (caught) {
    profileError.value = caught instanceof Error ? caught.message : 'Unable to update your profile.'
  } finally {
    savingProfile.value = false
  }
}
</script>

<style scoped>
.settings-screen { position: fixed; inset: 0; z-index: 50; max-width: 480px; margin: 0 auto; padding: 0 18px calc(var(--safe-bottom) + 40px); overflow-y: auto; background: var(--bg); }
.top { position: sticky; top: 0; z-index: 5; display: flex; align-items: center; justify-content: space-between; padding: calc(var(--safe-top) + 14px) 0 14px; border-bottom: 1px solid var(--line); background: rgba(252,249,242,.94); backdrop-filter: blur(12px); }
.top h1 { font-size: 17px; font-weight: 850; }
.icon-button, .spacer { width: 42px; height: 42px; }
.icon-button { display: grid; place-items: center; border-radius: 50%; background: var(--surface); color: var(--ink); box-shadow: var(--shadow-card); }
.profile-card { display: grid; grid-template-columns: 64px 1fr auto; align-items: center; gap: 13px; margin: 20px 0; padding: 15px; border-radius: var(--radius-lg); background: var(--surface); box-shadow: var(--shadow-card); }
.profile-card img { width: 64px; height: 64px; border-radius: 50%; object-fit: cover; }
.profile-card div { min-width: 0; display: flex; flex-direction: column; }
.profile-card strong { font-size: 16px; }
.profile-card span { overflow: hidden; color: var(--ink-muted); font-size: 12.5px; text-overflow: ellipsis; }
.edit-button { min-height: 42px; padding: 0 14px; border-radius: 999px; background: var(--teal-soft); color: var(--teal); font-size: 12.5px; font-weight: 800; }
.edit-button:disabled { opacity: .5; }
.edit-form { display: flex; flex-direction: column; gap: 12px; margin: -8px 0 22px; padding: 16px; border: 1px solid var(--line); border-radius: var(--radius-lg); background: var(--surface); }
label { display: flex; flex-direction: column; gap: 6px; font-size: 12.5px; font-weight: 800; }
input { min-height: 46px; padding: 0 13px; border: 1.5px solid var(--line); border-radius: var(--radius-md); background: var(--bg); outline: none; }
input:focus { border-color: var(--teal); }
.message { color: var(--teal); font-size: 12.5px; font-weight: 750; }
.message.error { color: var(--coral); }
.save-button { min-height: 46px; display: flex; align-items: center; justify-content: center; gap: 8px; border-radius: var(--radius-md); background: var(--teal); color: #fff; font-weight: 800; box-shadow: var(--shadow-card); }
.save-button:disabled { opacity: .65; }
h2 { margin: 22px 2px 9px; font-size: 15px; font-weight: 850; }
.settings-list { overflow: hidden; border-radius: var(--radius-lg); background: var(--surface); box-shadow: var(--shadow-card); list-style: none; }
.settings-list li, .radius-card { padding: 15px; }
.settings-list li { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.setting-label { display: flex; align-items: center; gap: 11px; min-width: 0; }
.setting-label > svg { flex-shrink: 0; color: var(--teal); }
.setting-label div { display: flex; flex-direction: column; }
.setting-label strong { font-size: 13.5px; }
.setting-label span { color: var(--ink-muted); font-size: 11.5px; line-height: 1.35; }
.switch { position: relative; flex-shrink: 0; width: 50px; height: 30px; border-radius: 999px; background: var(--line); transition: background .2s ease; }
.switch span { position: absolute; top: 3px; left: 3px; width: 24px; height: 24px; border-radius: 50%; background: #fff; box-shadow: var(--shadow-card); transition: transform .2s ease; }
.switch.on { background: var(--teal); }
.switch.on span { transform: translateX(20px); }
.radius-card { border-radius: var(--radius-lg); background: var(--surface); box-shadow: var(--shadow-card); }
.radius-options { display: grid; grid-template-columns: repeat(5, 1fr); gap: 5px; margin-top: 14px; }
.radius-options button { min-height: 42px; padding: 0 3px; border-radius: 12px; background: var(--bg); color: var(--ink-muted); font-size: 11.5px; font-weight: 800; }
.radius-options button.active { background: var(--teal); color: #fff; }
.sign-out { width: 100%; min-height: 48px; display: flex; align-items: center; justify-content: center; gap: 8px; border: 1px solid rgba(239,99,81,.2); border-radius: var(--radius-md); background: rgba(239,99,81,.08); color: var(--coral); font-weight: 800; }
.version { margin-top: 22px; color: var(--ink-muted); font-size: 11.5px; text-align: center; }
.expand-enter-active, .expand-leave-active { transition: all .2s ease; overflow: hidden; }
.expand-enter-from, .expand-leave-to { opacity: 0; transform: translateY(-8px); }
button:active { transform: scale(.98); }
</style>
