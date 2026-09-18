<template>
  <div class="settings-page">
    <header class="settings-header">
      <button class="back-button" type="button" aria-label="Back to profile" @click="router.back()">
        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="m15 18-6-6 6-6" />
        </svg>
      </button>
      <h1>Settings and activity</h1>
      <span class="header-spacer" aria-hidden="true" />
    </header>

    <main class="settings-content">
      <template v-if="user">
        <section class="settings-group" aria-labelledby="account-heading">
          <h2 id="account-heading">Your account</h2>
          <div class="settings-card account-card">
            <div class="profile-summary">
              <button
                class="avatar-picker"
                type="button"
                :disabled="pickingAvatar || savingAvatar"
                :aria-label="pickingAvatar ? 'Opening photo picker' : 'Change profile photo'"
                @click="pickAvatar"
              >
                <img
                  :src="form.avatar || user.avatar || '/avatar.svg'"
                  :alt="`Profile photo of ${user.name}`"
                  @error="handleAvatarError"
                />
                <span class="camera-badge" aria-hidden="true"><AppIcon name="camera" :size="14" /></span>
              </button>
              <input
                ref="avatarInput"
                class="file-input"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                tabindex="-1"
                aria-hidden="true"
                @change="handleAvatarFile"
              />
              <button class="account-copy" type="button" @click="toggleProfileEditor">
                <strong>Account &amp; privacy</strong>
                <span>Profile, contact info, and security</span>
              </button>
              <button class="edit-button" type="button" :aria-expanded="editingProfile" @click="toggleProfileEditor">
                {{ editingProfile ? 'Cancel' : 'Edit' }}
              </button>
            </div>

            <p v-if="savingAvatar" class="form-message" role="status">Saving profile photo...</p>
            <p v-else-if="profileError" class="form-message error" role="alert">{{ profileError }}</p>
            <p v-else-if="profileMessage" class="form-message" role="status">{{ profileMessage }}</p>

            <Transition name="expand">
              <form v-if="editingProfile" class="profile-form" @submit.prevent="saveProfile">
                <label>
                  <span>Display name</span>
                  <input v-model="form.name" required maxlength="100" autocomplete="name" />
                </label>
                <label>
                  <span>Real name (Private)</span>
                  <input v-model="form.realName" maxlength="100" placeholder="e.g. Chan Tai Man" autocomplete="off" />
                  <small>🔒 Kept strictly private. Used solely for anti-bot identity verification.</small>
                </label>
                <label>
                  <span>Email</span>
                  <input v-model="form.email" required type="email" autocomplete="email" />
                </label>
                <label>
                  <span>Phone number</span>
                  <input v-model="form.phone" type="tel" maxlength="30" autocomplete="tel" />
                </label>
                <button class="save-profile-button" type="submit" :disabled="savingProfile">
                  <AppIcon name="check" :size="18" />
                  {{ savingProfile ? 'Saving...' : 'Save profile' }}
                </button>
              </form>
            </Transition>
          </div>
        </section>

        <section class="settings-group" aria-labelledby="activity-heading">
          <h2 id="activity-heading">Your activity</h2>
          <div class="settings-card">
            <button class="setting-row" type="button" @click="router.push('/saved')">
              <span class="setting-icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z" />
                </svg>
              </span>
              <span class="setting-copy"><strong>Saved</strong><span>Saved pets and sighting reports</span></span>
              <AppIcon class="chevron" name="chevron" :size="16" />
            </button>
            <button class="setting-row" type="button" @click="router.push('/my-reports')">
              <span class="setting-icon"><AppIcon name="list" :size="20" /></span>
              <span class="setting-copy"><strong>Activity</strong><span>My reports and sightings</span></span>
              <AppIcon class="chevron" name="chevron" :size="16" />
            </button>
            <button class="setting-row" type="button" @click="emit('open-boost')">
              <span class="setting-icon coral"><AppIcon name="zap" :size="20" /></span>
              <span class="setting-copy"><strong>Boost alert</strong><span>Expand your radar coverage</span></span>
              <AppIcon class="chevron" name="chevron" :size="16" />
            </button>
          </div>
        </section>

        <section class="settings-group" aria-labelledby="preferences-heading">
          <h2 id="preferences-heading">Preferences</h2>
          <div class="settings-card preferences-card">
            <div class="setting-row radius-row">
              <span class="setting-icon"><AppIcon name="radar" :size="20" /></span>
              <span class="setting-copy"><strong>Radar radius</strong><span>Search and notification coverage</span></span>
              <span class="setting-value">{{ radiusKm }} km</span>
            </div>
            <div class="radius-options" role="group" aria-label="Radar radius">
              <button
                v-for="option in radiusOptions"
                :key="option"
                type="button"
                :class="{ active: radiusKm === option }"
                :aria-pressed="radiusKm === option"
                @click="emit('radius-change', option)"
              >
                {{ option }} km
              </button>
            </div>
            <div class="setting-row">
              <span class="setting-icon"><AppIcon name="bell" :size="20" /></span>
              <span class="setting-copy"><strong>Proximity alerts</strong><span>Notify me about nearby reports</span></span>
              <button
                class="switch"
                :class="{ on: alertsEnabled }"
                type="button"
                role="switch"
                :aria-checked="alertsEnabled"
                aria-label="Toggle proximity alerts"
                @click="emit('toggle-alerts', !alertsEnabled)"
              >
                <span />
              </button>
            </div>
          </div>
        </section>

        <section class="settings-group danger-group" aria-labelledby="danger-heading">
          <h2 id="danger-heading">Danger zone</h2>
          <button class="logout-button" type="button" @click="emit('logout')">Log out</button>
        </section>
      </template>

      <section v-else class="auth-card">
        <span class="auth-icon"><AppIcon name="user" :size="28" /></span>
        <h2>Sign in to manage settings</h2>
        <p>Your alert radius and account preferences are linked to your PawRadar profile.</p>
        <button type="button" @click="emit('auth-needed')">Sign in</button>
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'
import { Capacitor } from '@capacitor/core'
import { useRouter } from 'vue-router'
import AppIcon from '../components/AppIcon.vue'
import { updateProfile } from '../services/api'
import type { User } from '../types/user'

const props = defineProps<{ user: User | null; alertsEnabled: boolean; radiusKm: number }>()
const emit = defineEmits<{
  logout: []
  'auth-needed': []
  updated: [user: User]
  'open-boost': []
  'toggle-alerts': [enabled: boolean]
  'radius-change': [radiusKm: number]
}>()

const router = useRouter()
const radiusOptions = [1, 3, 5, 10, 15] as const
const editingProfile = ref(false)
const savingProfile = ref(false)
const savingAvatar = ref(false)
const pickingAvatar = ref(false)
const profileError = ref('')
const profileMessage = ref('')
const avatarInput = ref<HTMLInputElement | null>(null)
const form = reactive({ name: '', realName: '', email: '', phone: '', avatar: '' })
const MAX_SOURCE_FILE_BYTES = 8 * 1024 * 1024
const MAX_AVATAR_DATA_URL_LENGTH = 8_000_000

function resetForm(user: User | null) {
  form.name = user?.name || ''
  form.realName = user?.realName || ''
  form.email = user?.email || ''
  form.phone = user?.phone || ''
  form.avatar = user?.avatar || ''
}

watch(
  () => props.user?.id,
  () => {
    resetForm(props.user)
    editingProfile.value = false
    profileError.value = ''
    profileMessage.value = ''
  },
  { immediate: true },
)

function toggleProfileEditor() {
  if (editingProfile.value) resetForm(props.user)
  editingProfile.value = !editingProfile.value
  profileError.value = ''
  profileMessage.value = ''
}

async function pickAvatar() {
  if (!props.user || pickingAvatar.value || savingAvatar.value) return
  profileError.value = ''
  profileMessage.value = ''
  if (!Capacitor.isNativePlatform()) {
    avatarInput.value?.click()
    return
  }

  pickingAvatar.value = true
  try {
    const photo = await Camera.getPhoto({
      source: CameraSource.Prompt,
      resultType: CameraResultType.DataUrl,
      quality: 80,
      allowEditing: true,
      width: 512,
      height: 512,
    })
    if (!photo.dataUrl) throw new Error('The selected photo could not be read.')
    await persistAvatar(await prepareAvatar(photo.dataUrl))
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : ''
    if (!/cancel(?:led|ed)|no image/i.test(message)) {
      profileError.value = message || 'Unable to open the photo picker.'
    }
  } finally {
    pickingAvatar.value = false
  }
}

async function handleAvatarFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return

  profileError.value = ''
  profileMessage.value = ''
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    profileError.value = 'Choose a JPEG, PNG, or WebP image.'
    return
  }
  if (file.size > MAX_SOURCE_FILE_BYTES) {
    profileError.value = 'Choose an image smaller than 8 MB.'
    return
  }

  pickingAvatar.value = true
  try {
    await persistAvatar(await prepareAvatar(await readFileAsDataUrl(file)))
  } catch (caught) {
    profileError.value = caught instanceof Error ? caught.message : 'Unable to read that image.'
  } finally {
    pickingAvatar.value = false
  }
}

async function persistAvatar(avatar: string) {
  const previousAvatar = form.avatar
  form.avatar = avatar
  savingAvatar.value = true
  try {
    const updatedUser = await updateProfile({ avatar })
    form.avatar = updatedUser.avatar || avatar
    emit('updated', updatedUser)
    profileError.value = ''
    profileMessage.value = 'Profile photo updated.'
  } catch (caught) {
    form.avatar = previousAvatar
    throw caught
  } finally {
    savingAvatar.value = false
  }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Unable to read that image.'))
    reader.onerror = () => reject(new Error('Unable to read that image.'))
    reader.readAsDataURL(file)
  })
}

function prepareAvatar(dataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      const largestSide = Math.max(image.naturalWidth, image.naturalHeight)
      const scale = largestSide > 512 ? 512 / largestSide : 1
      const width = Math.max(1, Math.round(image.naturalWidth * scale))
      const height = Math.max(1, Math.round(image.naturalHeight * scale))
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d')
      if (!context) return reject(new Error('Unable to process that image.'))

      context.fillStyle = '#fcf9f2'
      context.fillRect(0, 0, width, height)
      context.drawImage(image, 0, 0, width, height)
      const prepared = canvas.toDataURL('image/jpeg', 0.8)
      if (prepared.length > MAX_AVATAR_DATA_URL_LENGTH) {
        reject(new Error('The processed avatar is too large. Choose a smaller image.'))
        return
      }
      resolve(prepared)
    }
    image.onerror = () => reject(new Error('The selected image format could not be processed.'))
    image.src = dataUrl
  })
}

function handleAvatarError(event: Event) {
  const image = event.target as HTMLImageElement
  if (!image.src.endsWith('/avatar.svg')) image.src = '/avatar.svg'
}

async function saveProfile() {
  if (!props.user || savingProfile.value) return
  savingProfile.value = true
  profileError.value = ''
  profileMessage.value = ''
  try {
    const updatedUser = await updateProfile({
      name: form.name,
      displayName: form.name,
      realName: form.realName,
      email: form.email,
      phone: form.phone,
      avatar: form.avatar,
    })
    resetForm(updatedUser)
    emit('updated', updatedUser)
    profileError.value = ''
    profileMessage.value = 'Profile updated.'
    editingProfile.value = false
  } catch (caught) {
    profileError.value = caught instanceof Error ? caught.message : 'Unable to update your profile.'
  } finally {
    savingProfile.value = false
  }
}
</script>

<style scoped>
.settings-page { position: fixed; inset: 0; z-index: 45; width: 100%; max-width: 480px; margin: 0 auto; overflow-y: auto; background: #fcf9f2; color: var(--ink); -webkit-overflow-scrolling: touch; }
.settings-header { position: sticky; top: 0; z-index: 5; display: grid; grid-template-columns: 44px 1fr 44px; align-items: center; gap: 10px; padding: calc(var(--safe-top) + 12px) 16px 12px; border-bottom: 1px solid rgba(29,99,96,.09); background: rgba(252,249,242,.95); backdrop-filter: blur(16px); }
.settings-header h1 { font-size: 17px; font-weight: 850; text-align: center; }
.back-button, .header-spacer { width: 44px; height: 44px; }
.back-button { display: grid; place-items: center; border-radius: 50%; background: #fff; color: #1d6360; box-shadow: 0 4px 14px rgba(29,99,96,.1); transition: all .2s cubic-bezier(.4,0,.2,1); }
.back-button:active, .avatar-picker:active, .edit-button:active, .save-profile-button:active, .logout-button:active { transform: scale(.97); }
.settings-content { padding: 10px 16px calc(var(--safe-bottom) + 42px); }
.settings-group { margin-top: 22px; }
.settings-group h2 { margin: 0 4px 9px; color: var(--ink-muted); font-size: 12px; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; }
.settings-card { overflow: hidden; border: 1px solid rgba(29,99,96,.08); border-radius: 14px; background: #fff; box-shadow: 0 8px 24px rgba(29,99,96,.065); }
.profile-summary { display: grid; grid-template-columns: 64px minmax(0,1fr) auto; align-items: center; gap: 13px; padding: 15px; }
.avatar-picker { position: relative; width: 64px; height: 64px; padding: 0; border-radius: 50%; background: #fcf9f2; box-shadow: 0 5px 15px rgba(29,99,96,.14); transition: transform .2s ease; }
.avatar-picker img { width: 64px; height: 64px; border-radius: 50%; object-fit: cover; }
.avatar-picker:disabled { cursor: wait; opacity: .7; }
.camera-badge { position: absolute; right: -3px; bottom: -2px; width: 27px; height: 27px; display: grid; place-items: center; border: 2px solid #fff; border-radius: 50%; background: #1d6360; color: #fff; box-shadow: 0 3px 9px rgba(29,99,96,.24); }
.file-input { display: none; }
.account-copy { min-width: 0; display: flex; flex-direction: column; padding: 0; background: transparent; color: var(--ink); text-align: left; }
.account-copy strong { font-size: 14px; font-weight: 800; }
.account-copy span { overflow: hidden; color: var(--ink-muted); font-size: 11.5px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.edit-button { min-height: 42px; padding: 0 14px; border-radius: 999px; background: rgba(29,99,96,.1); color: #1d6360; font-size: 12.5px; font-weight: 800; transition: transform .2s ease; }
.form-message { margin: 0 15px 13px; color: #1d6360; font-size: 12px; font-weight: 750; }
.form-message.error { color: #ef6351; }
.profile-form { display: flex; flex-direction: column; gap: 12px; padding: 15px; border-top: 1px solid rgba(29,99,96,.08); background: rgba(252,249,242,.55); }
.profile-form label { display: flex; flex-direction: column; gap: 6px; font-size: 12.5px; font-weight: 800; }
.profile-form input { min-height: 46px; padding: 0 13px; border: 1.5px solid var(--line); border-radius: 14px; background: #fff; color: var(--ink); outline: none; }
.profile-form input:focus { border-color: #1d6360; }
.profile-form small { color: var(--ink-muted); font-size: 11.5px; font-weight: 600; line-height: 1.45; }
.save-profile-button { min-height: 46px; display: flex; align-items: center; justify-content: center; gap: 8px; border-radius: 14px; background: #1d6360; color: #fff; font-weight: 800; box-shadow: 0 5px 15px rgba(29,99,96,.18); transition: transform .2s ease; }
.save-profile-button:disabled { opacity: .65; }
.setting-row { width: 100%; min-height: 70px; display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-bottom: 1px solid rgba(29,99,96,.075); background: transparent; color: var(--ink); text-align: left; transition: background .18s ease, transform .18s ease; }
button.setting-row:active { transform: scale(.99); background: rgba(29,99,96,.055); }
.setting-icon { width: 38px; height: 38px; display: grid; place-items: center; flex-shrink: 0; border-radius: 12px; background: rgba(29,99,96,.09); color: #1d6360; }
.setting-icon.coral { background: rgba(239,99,81,.1); color: #ef6351; }
.setting-copy { min-width: 0; display: flex; flex: 1; flex-direction: column; gap: 2px; }
.setting-copy strong { font-size: 14px; font-weight: 780; }
.setting-copy span { color: var(--ink-muted); font-size: 11.5px; font-weight: 600; }
.setting-value, .chevron { flex-shrink: 0; color: var(--ink-muted); }
.setting-value { font-size: 12.5px; font-weight: 750; }
.radius-row { border-bottom: 0; }
.radius-options { display: grid; grid-template-columns: repeat(5,1fr); gap: 5px; padding: 0 14px 14px; border-bottom: 1px solid rgba(29,99,96,.075); }
.radius-options button { min-height: 42px; padding: 0 3px; border-radius: 12px; background: #fcf9f2; color: var(--ink-muted); font-size: 11.5px; font-weight: 800; }
.radius-options button.active { background: #1d6360; color: #fff; }
.switch { position: relative; width: 50px; height: 30px; flex-shrink: 0; border-radius: 999px; background: var(--line); transition: background .2s ease; }
.switch span { position: absolute; top: 3px; left: 3px; width: 24px; height: 24px; border-radius: 50%; background: #fff; box-shadow: 0 2px 7px rgba(29,99,96,.18); transition: transform .2s cubic-bezier(.4,0,.2,1); }
.switch.on { background: #1d6360; }
.switch.on span { transform: translateX(20px); }
.danger-group { margin-top: 28px; }
.logout-button { width: 100%; min-height: 52px; border: 1px solid rgba(239,99,81,.2); border-radius: 14px; background: rgba(239,99,81,.08); color: #ef6351; font-size: 14px; font-weight: 850; transition: all .2s cubic-bezier(.4,0,.2,1); }
.auth-card { min-height: 280px; display: flex; flex-direction: column; align-items: center; justify-content: center; margin-top: 24px; padding: 28px; border-radius: 14px; background: #fff; box-shadow: 0 10px 28px rgba(29,99,96,.07); text-align: center; }
.auth-icon { width: 62px; height: 62px; display: grid; place-items: center; margin-bottom: 14px; border-radius: 50%; background: rgba(29,99,96,.1); color: #1d6360; }
.auth-card h2 { font-size: 18px; }
.auth-card p { max-width: 290px; margin-top: 7px; color: var(--ink-muted); font-size: 13px; line-height: 1.5; }
.auth-card button { min-height: 46px; margin-top: 18px; padding: 0 24px; border-radius: 999px; background: #1d6360; color: #fff; font-weight: 800; }
.expand-enter-active, .expand-leave-active { overflow: hidden; transition: all .2s ease; }
.expand-enter-from, .expand-leave-to { opacity: 0; transform: translateY(-8px); }
@media (prefers-reduced-motion: reduce) { .back-button, .avatar-picker, .edit-button, .save-profile-button, .setting-row, .switch, .switch span, .logout-button, .expand-enter-active, .expand-leave-active { transition: none; } }
</style>
