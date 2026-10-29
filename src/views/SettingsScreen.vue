<template>
  <div class="settings-page">
    <header class="settings-header">
      <button class="back-button" type="button" :aria-label="t('settings.backLabel')" @click="router.back()">
        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="m15 18-6-6 6-6" />
        </svg>
      </button>
      <h1>{{ t('settings.title') }}</h1>
      <span class="header-spacer" aria-hidden="true" />
    </header>

    <main class="settings-content">
      <section class="settings-group" aria-labelledby="language-appearance-heading">
        <h2 id="language-appearance-heading">{{ t('settings.languageAppearance') }}</h2>
        <div class="settings-card preference-selector-card" :aria-busy="preferenceSaving">
          <p class="preference-help">{{ t('settings.languageAppearanceHelp') }}</p>
          <fieldset class="preference-fieldset" :disabled="preferenceSaving || !privacyContextReady">
            <legend>{{ t('settings.language') }}</legend>
            <div class="segmented-control language-control">
              <label
                v-for="option in languageOptions"
                :key="option.value"
                class="option-card"
                :class="{ active: language === option.value }"
              >
                <input
                  type="radio"
                  name="app-language"
                  :value="option.value"
                  :checked="language === option.value"
                  @change="changeLanguage(option.value)"
                />
                <span class="radio-indicator" aria-hidden="true" />
                <span>{{ t(option.labelKey) }}</span>
              </label>
            </div>
          </fieldset>
          <fieldset class="preference-fieldset" :disabled="preferenceSaving || !privacyContextReady">
            <legend>{{ t('settings.appearance') }}</legend>
            <div class="segmented-control">
              <label class="option-card" :class="{ active: theme === 'light' }">
                <input type="radio" name="app-theme" value="light" :checked="theme === 'light'" @change="changeTheme('light')" />
                <span class="radio-indicator" aria-hidden="true" />
                <span aria-hidden="true">☀</span><span>{{ t('settings.light') }}</span>
              </label>
              <label class="option-card" :class="{ active: theme === 'dark' }">
                <input type="radio" name="app-theme" value="dark" :checked="theme === 'dark'" @change="changeTheme('dark')" />
                <span class="radio-indicator" aria-hidden="true" />
                <span aria-hidden="true">☾</span><span>{{ t('settings.dark') }}</span>
              </label>
            </div>
          </fieldset>
          <p class="preference-account-help">
            {{ user ? t('settings.accountPreferenceHelp') : t('settings.guestPreferenceHelp') }}
          </p>
          <p v-if="preferenceSaving" class="preference-message" role="status">{{ t('settings.savingPreferences') }}</p>
          <p v-else-if="preferenceError" class="preference-message error" role="alert">{{ preferenceError }}</p>
          <p v-else-if="preferenceMessage" class="preference-message" role="status">{{ preferenceMessage }}</p>
        </div>
      </section>

      <template v-if="user">
        <section class="settings-group" aria-labelledby="account-heading">
          <h2 id="account-heading">{{ t('settings.yourAccount') }}</h2>
          <div class="settings-card account-card">
            <div class="profile-summary">
              <button
                class="avatar-picker"
                type="button"
                :disabled="pickingAvatar || savingAvatar"
                :aria-label="pickingAvatar ? t('settings.openingPicker') : t('settings.changePhoto')"
                @click="pickAvatar"
              >
                <ManagedImage
                  :src="form.avatar || user.avatar || '/avatar.svg'"
                  :alt="t('settings.profilePhotoAlt', { name: user.name })"
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
                <strong>{{ t('settings.accountPrivacy') }}</strong>
                <span>{{ t('settings.accountPrivacySubtitle') }}</span>
              </button>
              <button class="edit-button" type="button" :aria-expanded="editingProfile" @click="toggleProfileEditor">
                {{ editingProfile ? t('common.cancel') : t('common.edit') }}
              </button>
            </div>

            <p v-if="savingAvatar" class="form-message" role="status">{{ t('settings.savingPhoto') }}</p>
            <p v-else-if="profileError" class="form-message error" role="alert">{{ profileError }}</p>
            <p v-else-if="profileMessage" class="form-message" role="status">{{ profileMessage }}</p>
            <ImageUploadStatus :upload="avatarUpload" />
            <button v-if="profileError && avatarUpload.preview" type="button" class="edit-button" :disabled="savingAvatar" @click="persistAvatar()">{{ t('media.retrySave') }}</button>
            <button v-if="user.avatar" type="button" class="edit-button" :disabled="savingAvatar" @click="removeAvatar">{{ t('media.remove') }}</button>

            <Transition name="expand">
              <form v-if="editingProfile" class="profile-form" @submit.prevent="saveProfile">
                <label>
                  <span>{{ t('settings.displayName') }}</span>
                  <input v-model="form.name" required maxlength="100" autocomplete="name" />
                </label>
                <label>
                  <span>{{ t('settings.realName') }}</span>
                  <input v-model="form.realName" maxlength="100" :placeholder="t('settings.realNamePlaceholder')" autocomplete="off" />
                  <small>🔒 {{ t('settings.realNameHelp') }}</small>
                </label>
                <label>
                  <span>{{ t('authentication.email') }}</span>
                  <input v-model="form.email" required type="email" autocomplete="email" />
                </label>
                <label>
                  <span>{{ t('authentication.phone') }}</span>
                  <input v-model="form.phone" type="tel" maxlength="30" autocomplete="tel" />
                </label>
                <button class="save-profile-button" type="submit" :disabled="savingProfile">
                  <AppIcon name="check" :size="18" />
                  {{ savingProfile ? t('common.saving') : t('settings.saveProfile') }}
                </button>
              </form>
            </Transition>
          </div>
        </section>

        <section class="settings-group" aria-labelledby="safety-heading">
          <h2 id="safety-heading">{{ t('safety.safetyPrivacy') }}</h2>
          <div class="settings-card">
            <button class="setting-row" type="button" @click="router.push('/settings/blocked')">
              <span class="setting-icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M12 3 5 6v5c0 4.7 2.9 8 7 10 4.1-2 7-5.3 7-10V6l-7-3Z" /><path d="m8 8 8 8" />
                </svg>
              </span>
              <span class="setting-copy"><strong>{{ t('safety.blockedAccounts') }}</strong><span>{{ t('safety.blockedAccountsHelp') }}</span></span>
              <AppIcon class="chevron" name="chevron" :size="16" />
            </button>
            <button
              v-if="user.role === 'shelter_admin'"
              class="setting-row"
              type="button"
              @click="router.push('/moderation')"
            >
              <span class="setting-icon coral">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /><path d="m9 12 2 2 4-4" />
                </svg>
              </span>
              <span class="setting-copy"><strong>{{ t('moderation.settingsLabel') }}</strong><span>{{ t('moderation.settingsHelp') }}</span></span>
              <AppIcon class="chevron" name="chevron" :size="16" />
            </button>
          </div>
        </section>

        <section class="settings-group" aria-labelledby="activity-heading">
          <h2 id="activity-heading">{{ t('settings.yourActivity') }}</h2>
          <div class="settings-card">
            <button class="setting-row" type="button" @click="router.push('/saved')">
              <span class="setting-icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z" />
                </svg>
              </span>
              <span class="setting-copy"><strong>{{ t('settings.saved') }}</strong><span>{{ t('settings.savedSubtitle') }}</span></span>
              <AppIcon class="chevron" name="chevron" :size="16" />
            </button>
            <button class="setting-row" type="button" @click="router.push('/my-reports')">
              <span class="setting-icon"><AppIcon name="list" :size="20" /></span>
              <span class="setting-copy"><strong>{{ t('settings.activity') }}</strong><span>{{ t('settings.activitySubtitle') }}</span></span>
              <AppIcon class="chevron" name="chevron" :size="16" />
            </button>
            <button class="setting-row" type="button" @click="emit('open-boost')">
              <span class="setting-icon coral"><AppIcon name="zap" :size="20" /></span>
              <span class="setting-copy"><strong>{{ t('settings.boost') }}</strong><span>{{ t('settings.boostSubtitle') }}</span></span>
              <AppIcon class="chevron" name="chevron" :size="16" />
            </button>
          </div>
        </section>

        <section class="settings-group" aria-labelledby="preferences-heading">
          <h2 id="preferences-heading">{{ t('settings.preferences') }}</h2>
          <div class="settings-card preferences-card">
            <div class="setting-row radius-row">
              <span class="setting-icon"><AppIcon name="radar" :size="20" /></span>
              <span class="setting-copy"><strong>{{ t('settings.radarRadius') }}</strong><span>{{ t('settings.radarRadiusSubtitle') }}</span></span>
              <span class="setting-value">{{ t('common.kilometres', { count: radiusKm }) }}</span>
            </div>
            <div class="radius-options" role="group" :aria-label="t('settings.radarRadius')">
              <button
                v-for="option in radiusOptions"
                :key="option"
                type="button"
                :class="{ active: radiusKm === option }"
                :aria-pressed="radiusKm === option"
                @click="emit('radius-change', option)"
              >
                {{ t('common.kilometres', { count: option }) }}
              </button>
            </div>
            <div class="setting-row">
              <span class="setting-icon"><AppIcon name="bell" :size="20" /></span>
              <span class="setting-copy"><strong>{{ t('settings.proximityAlerts') }}</strong><span>{{ t('settings.proximityAlertsSubtitle') }}</span></span>
              <button
                class="switch"
                :class="{ on: alertsEnabled }"
                type="button"
                role="switch"
                :aria-checked="alertsEnabled"
                :aria-label="t('settings.toggleAlerts')"
                @click="emit('toggle-alerts', !alertsEnabled)"
              >
                <span />
              </button>
            </div>
            <fieldset class="contact-privacy" :disabled="privacyLoading || privacySaving || !privacyContextReady">
              <legend>{{ t('settings.contactPrivacy') }}</legend>
              <p class="privacy-intro">
                {{ t('settings.contactPrivacyIntro') }}
              </p>
              <label
                class="option-card privacy-option"
                :class="{ selected: contactVisibility === 'private' }"
              >
                <input v-model="contactVisibility" type="radio" value="private" />
                <span class="radio-indicator" aria-hidden="true" />
                <span>
                  <strong>{{ t('settings.private') }}</strong>
                  <small>{{ t('settings.privateHelp') }}</small>
                </span>
              </label>
              <label
                class="option-card privacy-option"
                :class="{ selected: contactVisibility === 'authenticated' }"
              >
                <input v-model="contactVisibility" type="radio" value="authenticated" />
                <span class="radio-indicator" aria-hidden="true" />
                <span>
                  <strong>{{ t('settings.authenticated') }}</strong>
                  <small>{{ t('settings.authenticatedHelp') }}</small>
                </span>
              </label>
              <button
                class="save-privacy-button"
                type="button"
                :disabled="privacyLoading || privacySaving || !privacyContextReady || !privacyDirty"
                @click="saveContactPrivacy"
              >
                {{ privacySaving ? t('settings.savingPrivacy') : t('settings.savePrivacy') }}
              </button>
              <p v-if="privacyLoading" class="privacy-message" role="status">
                {{ t('settings.loadingPrivacy') }}
              </p>
              <p v-else-if="privacyError" class="privacy-message error" role="alert">
                {{ privacyError }}
              </p>
              <p v-else-if="privacyMessage" class="privacy-message" role="status">
                {{ privacyMessage }}
              </p>
            </fieldset>
          </div>
        </section>

        <section class="settings-group danger-group" aria-labelledby="danger-heading">
          <h2 id="danger-heading">{{ t('settings.dangerZone') }}</h2>
          <button class="logout-button" type="button" @click="emit('logout')">{{ t('authentication.signOut') }}</button>
        </section>
      </template>

      <section v-else class="auth-card">
        <span class="auth-icon"><AppIcon name="user" :size="28" /></span>
        <h2>{{ t('settings.signInTitle') }}</h2>
        <p>{{ t('settings.signInHelp') }}</p>
        <button type="button" @click="emit('auth-needed')">{{ t('authentication.signIn') }}</button>
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import ManagedImage from "../components/ManagedImage.vue"
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'
import { Capacitor } from '@capacitor/core'
import { useImageUpload } from '../composables/useImageUpload'
import ImageUploadStatus from '../components/ImageUploadStatus.vue'
import { useRouter } from 'vue-router'
import AppIcon from '../components/AppIcon.vue'
import { usePreferences } from '../composables/usePreferences'
import { translateApiError, useAppI18n } from '../i18n'
import {
  getContactPrivacy,
  updateContactPrivacy,
  updateProfile,
} from '../services/api'
import type { ContactPrivacy, ContactVisibility } from '../services/api'
import { captureAuthContext, isAuthContextCurrent } from '../services/authSession'
import type { AppLanguage, AppTheme, User } from '../types/user'

const props = defineProps<{ user: User | null; alertsEnabled: boolean; radiusKm: number }>()
const emit = defineEmits<{
  logout: []
  'auth-needed': []
  updated: [user: User]
  'privacy-updated': [update: { userId: string; privacy: ContactPrivacy }]
  'open-boost': []
  'toggle-alerts': [enabled: boolean]
  'radius-change': [radiusKm: number]
}>()

const router = useRouter()
const { t } = useAppI18n()
const {
  language,
  theme,
  saving: preferenceSaving,
  setPreferences,
  clearPreferenceStatus,
} = usePreferences()
const languageOptions: ReadonlyArray<{ value: AppLanguage; labelKey: string }> = [
  { value: 'en', labelKey: 'settings.english' },
  { value: 'zh-HK', labelKey: 'settings.traditionalChinese' },
  { value: 'zh-CN', labelKey: 'settings.simplifiedChinese' },
]
const preferenceError = ref('')
const preferenceMessage = ref('')
const radiusOptions = [1, 3, 5, 10, 15] as const
const editingProfile = ref(false)
const savingProfile = ref(false)
const savingAvatar = ref(false)
const pickingAvatar = ref(false)
const profileError = ref('')
const profileMessage = ref('')
const contactVisibility = ref<ContactVisibility>('private')
const savedContactVisibility = ref<ContactVisibility>('private')
const privacyLoading = ref(false)
const privacySaving = ref(false)
const privacyError = ref('')
const privacyMessage = ref('')
const privacyDirty = computed(() => contactVisibility.value !== savedContactVisibility.value)
const avatarInput = ref<HTMLInputElement | null>(null)
const avatarUpload = useImageUpload('avatar')
const form = reactive({ name: '', realName: '', email: '', phone: '', avatar: '' })
const MAX_SOURCE_FILE_BYTES = 8 * 1024 * 1024
const privacyContextReady = ref(true)
let disposed = false, accountEpoch = 0, privacySequence = 0, preferenceSequence = 0
let settingsContext = captureAuthContext()
let settingsUserId: string | undefined

function operationCurrent(kind: 'privacy' | 'preference', sequence: number) {
  const context = captureAuthContext(), epoch = accountEpoch, userId = props.user?.id
  return () => !disposed && privacyContextReady.value && epoch === accountEpoch && userId === props.user?.id &&
    sequence === (kind === 'privacy' ? privacySequence : preferenceSequence) && isAuthContextCurrent(context)
}

function invalidateSettings() {
  accountEpoch++; privacySequence++; preferenceSequence++
  privacyContextReady.value = false
  privacyLoading.value = false; privacySaving.value = false
  privacyError.value = ''; privacyMessage.value = ''
  preferenceError.value = ''; preferenceMessage.value = ''
  contactVisibility.value = 'private'; savedContactVisibility.value = 'private'
}
window.addEventListener('auth:changed', invalidateSettings)
onBeforeUnmount(() => { disposed = true; invalidateSettings(); window.removeEventListener('auth:changed', invalidateSettings) })

async function updatePreference(update: { language?: AppLanguage; theme?: AppTheme }) {
  if (!privacyContextReady.value) return
  const active = operationCurrent('preference', ++preferenceSequence)
  preferenceError.value = ''
  preferenceMessage.value = ''
  clearPreferenceStatus()
  try {
    await setPreferences(update)
    if (active()) preferenceMessage.value = t('settings.preferencesSaved')
  } catch (caught) {
    if (active()) preferenceError.value = `${t('settings.preferencesSaveFailed')} ${translateApiError(caught, 'errors.savePreferences')}`
  }
}

function changeLanguage(value: AppLanguage) {
  if (language.value !== value) void updatePreference({ language: value })
}

function changeTheme(value: AppTheme) {
  if (theme.value !== value) void updatePreference({ theme: value })
}

function resetForm(user: User | null) {
  form.name = user?.name || ''
  form.realName = user?.realName || ''
  form.email = user?.email || ''
  form.phone = user?.phone || ''
  form.avatar = user?.avatar || ''
}

watch(
  () => props.user,
  () => {
    if (privacyContextReady.value && settingsUserId === props.user?.id && isAuthContextCurrent(settingsContext)) return
    invalidateSettings()
    settingsUserId = props.user?.id; settingsContext = captureAuthContext(); privacyContextReady.value = true
    avatarUpload.reset(false)
    resetForm(props.user)
    editingProfile.value = false
    profileError.value = ''
    profileMessage.value = ''
    void loadContactPrivacy()
  },
  { immediate: true, flush: 'sync' },
)

async function loadContactPrivacy() {
  const active = operationCurrent('privacy', ++privacySequence)
  const user = props.user
  const initial = user?.privacy?.contactVisibility || 'private'
  contactVisibility.value = initial
  savedContactVisibility.value = initial
  privacyError.value = ''
  privacyMessage.value = ''
  if (!user) return

  privacyLoading.value = true
  try {
    const privacy = await getContactPrivacy()
    if (!active()) return
    contactVisibility.value = privacy.contactVisibility
    savedContactVisibility.value = privacy.contactVisibility
  } catch (caught) {
    if (active()) privacyError.value = translateApiError(caught, 'errors.loadPrivacy')
  } finally {
    if (active()) privacyLoading.value = false
  }
}

async function saveContactPrivacy() {
  if (!props.user || !privacyContextReady.value || privacyLoading.value || privacySaving.value || !privacyDirty.value) return
  const userId = props.user.id
  const active = operationCurrent('privacy', ++privacySequence)
  privacySaving.value = true
  privacyError.value = ''
  privacyMessage.value = ''
  try {
    const privacy = await updateContactPrivacy(contactVisibility.value)
    if (!active()) return
    contactVisibility.value = privacy.contactVisibility
    savedContactVisibility.value = privacy.contactVisibility
    emit('privacy-updated', { userId, privacy })
    privacyMessage.value =
      privacy.contactVisibility === 'private'
        ? t('settings.privacyPrivateSaved')
        : t('settings.privacyAuthenticatedSaved')
  } catch (caught) {
    if (active()) privacyError.value = translateApiError(caught, 'errors.savePrivacy')
  } finally {
    if (active()) privacySaving.value = false
  }
}

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
    if (!photo.dataUrl) throw new Error(t('errors.readImage'))
    await persistAvatar(photo.dataUrl)
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : ''
    if (!/cancel(?:led|ed)|no image/i.test(message)) {
      profileError.value = t('errors.photoPicker')
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
    profileError.value = t('validation.imageType')
    return
  }
  if (file.size > MAX_SOURCE_FILE_BYTES) {
    profileError.value = t('validation.imageSize')
    return
  }

  pickingAvatar.value = true
  try {
    await persistAvatar(file)
  } catch (caught) {
    profileError.value = translateApiError(caught, 'errors.readImage')
  } finally {
    pickingAvatar.value = false
  }
}

async function persistAvatar(source?: Blob | string) {
  if (!props.user || savingAvatar.value) return
  const userId = props.user?.id
  const previousAvatar = form.avatar
  if (source) avatarUpload.select(source)
  form.avatar = avatarUpload.preview
  savingAvatar.value = true
  try {
    const [avatarImageId] = await avatarUpload.ensure()
    if (!avatarImageId || props.user?.id !== userId) return
    const updatedUser = await updateProfile({ avatarImageId })
    if (props.user?.id !== userId) return
    form.avatar = updatedUser.avatar || ''
    emit('updated', updatedUser)
    avatarUpload.finish()
    profileError.value = ''
    profileMessage.value = t('settings.photoUpdated')
  } catch (caught) {
    if (props.user?.id === userId) {
      form.avatar = previousAvatar
      profileError.value = translateApiError(caught, 'errors.updateProfile')
    }
  } finally {
    savingAvatar.value = false
  }
}
async function removeAvatar() {
  if (savingAvatar.value) return
  savingAvatar.value = true
  try {
    const user = await updateProfile({ avatarImageId: null })
    form.avatar = ''; avatarUpload.finish(); emit('updated', user)
  } catch (error) { profileError.value = translateApiError(error, 'errors.updateProfile') }
  finally { savingAvatar.value = false }
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
    })
    resetForm(updatedUser)
    emit('updated', updatedUser)
    profileError.value = ''
    profileMessage.value = t('settings.profileUpdated')
    editingProfile.value = false
  } catch (caught) {
    profileError.value = translateApiError(caught, 'errors.updateProfile')
  } finally {
    savingProfile.value = false
  }
}
</script>

<style scoped>
.settings-page { position: fixed; inset: 0; z-index: 45; width: 100%; max-width: 480px; margin: 0 auto; overflow-y: auto; background: var(--page-bg); color: var(--ink); -webkit-overflow-scrolling: touch; }
.settings-header { position: sticky; top: 0; z-index: 5; display: grid; grid-template-columns: 44px 1fr 44px; align-items: center; gap: 10px; padding: calc(var(--safe-top) + 12px) 16px 12px; border-bottom: 1px solid var(--divider); background: color-mix(in srgb, var(--page-bg) 95%, transparent); backdrop-filter: blur(16px); }
.settings-header h1 { font-size: var(--page-title-size); font-weight: var(--page-title-weight); text-align: center; }
.back-button, .header-spacer { width: 44px; height: 44px; }
.back-button { display: grid; place-items: center; border-radius: 50%; background: var(--surface); color: var(--color-icon-primary); box-shadow: none; transition: all .2s cubic-bezier(.4,0,.2,1); }
.back-button:active, .avatar-picker:active, .edit-button:active, .save-profile-button:active, .logout-button:active { transform: scale(.97); }
.settings-content { padding: 10px 16px calc(var(--safe-bottom) + 42px); }
.settings-group { margin-top: 22px; }
.settings-group h2 { margin: 0 4px 9px; color: var(--ink-muted); font-size: 12px; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; }
.settings-card { overflow: hidden; border: 1px solid var(--color-border); border-radius: var(--radius-sm); background: var(--surface); box-shadow: var(--shadow-card); }
.preference-selector-card { display: flex; flex-direction: column; gap: 15px; padding: 16px; overflow: visible; }
.preference-help, .preference-account-help { margin: 0; color: var(--text-muted); font-size: 12px; font-weight: 650; line-height: 1.5; }
.preference-fieldset { min-width: 0; margin: 0; padding: 0; border: 0; }
.preference-fieldset legend { margin-bottom: 8px; color: var(--text-primary); font-size: 13px; font-weight: 850; }
.segmented-control { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; padding: 4px; border: 1px solid var(--border); border-radius: 14px; background: var(--surface-soft); }
.segmented-control.language-control { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.option-card { position: relative; border: 1.5px solid var(--option-border); border-radius: 14px; background: var(--option-surface); color: var(--option-text); cursor: pointer; transition: background-color .2s cubic-bezier(.4,0,.2,1), border-color .2s cubic-bezier(.4,0,.2,1), box-shadow .2s cubic-bezier(.4,0,.2,1), transform .2s cubic-bezier(.4,0,.2,1); }
.option-card.active, .option-card.selected { border-color: var(--option-accent-border); background: var(--option-selected-surface); box-shadow: none; }
.option-card input[type='radio'] { position: absolute; width: 1px; height: 1px; margin: 0; overflow: hidden; clip: rect(0 0 0 0); clip-path: inset(50%); appearance: none; opacity: 0; white-space: nowrap; }
.option-card input[type='radio']:focus-visible { outline: none; }
.option-card .radio-indicator { width: 18px; height: 18px; display: grid; place-items: center; flex: 0 0 18px; border: 2px solid var(--radio-border); border-radius: 50%; background: var(--option-surface); transition: border-color .2s ease, background-color .2s ease, box-shadow .2s ease; }
.option-card .radio-indicator::after { width: 8px; height: 8px; border-radius: 50%; background: var(--radio-indicator); content: ''; opacity: 0; transform: scale(.45); transition: opacity .15s ease, transform .15s ease; }
.option-card:has(input[type='radio']:checked) .radio-indicator { border-color: var(--radio-indicator); background: var(--option-selected-surface); box-shadow: 0 0 0 2px color-mix(in srgb, var(--radio-indicator) 14%, transparent); }
.option-card:has(input[type='radio']:checked) .radio-indicator::after { opacity: 1; transform: scale(1); }
.option-card:has(input[type='radio']:focus-visible) { outline: 3px solid var(--focus-ring); outline-offset: 2px; }
.option-card:has(input[type='radio']:disabled) { border-color: var(--color-disabled-border); background: var(--color-disabled-surface); color: var(--color-disabled-text); cursor: not-allowed; }
@media (hover: hover) { .option-card:not(:has(input[type='radio']:disabled)):hover { border-color: var(--option-accent-border); background: color-mix(in srgb, var(--option-selected-surface) 58%, var(--option-surface)); } }
.segmented-control .option-card { min-width: 0; min-height: 44px; display: flex; align-items: center; justify-content: center; gap: 6px; padding: 7px 8px; border-radius: 10px; font-size: 12px; font-weight: 800; line-height: 1.2; text-align: center; }
.preference-fieldset:disabled .option-card { border-color: var(--color-disabled-border); background: var(--color-disabled-surface); color: var(--color-disabled-text); cursor: not-allowed; }
.preference-message { margin: -3px 0 0; color: var(--success); font-size: 12px; font-weight: 750; line-height: 1.45; }
.preference-message.error { color: var(--error); }
@media (max-width: 370px) { .segmented-control.language-control { grid-template-columns: 1fr; } }
.profile-summary { display: grid; grid-template-columns: 64px minmax(0,1fr) auto; align-items: center; gap: 13px; padding: 15px; }
.avatar-picker { position: relative; width: 64px; height: 64px; padding: 0; border-radius: 50%; background: var(--color-surface-subtle); box-shadow: 0 5px 15px rgba(29,99,96,.14); transition: transform .2s ease; }
.avatar-picker img { width: 64px; height: 64px; border-radius: 50%; object-fit: cover; }
.avatar-picker:disabled { outline: 2px solid var(--color-disabled-border); background: var(--color-disabled-surface); cursor: wait; }
.camera-badge { position: absolute; right: -3px; bottom: -2px; width: 27px; height: 27px; display: grid; place-items: center; border: 2px solid var(--color-surface); border-radius: 50%; background: #1d6360; color: #fff; box-shadow: 0 3px 9px rgba(29,99,96,.24); }
.file-input { display: none; }
.account-copy { min-width: 0; display: flex; flex-direction: column; padding: 0; background: transparent; color: var(--ink); text-align: left; }
.account-copy strong { font-size: 14px; font-weight: 800; }
.account-copy span { overflow: hidden; color: var(--ink-muted); font-size: 11.5px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.edit-button { min-height: 42px; padding: 0 14px; border-radius: 999px; background: var(--color-surface-selected); color: var(--color-text-accent); font-size: 12.5px; font-weight: 800; transition: transform .2s ease; }
.form-message { margin: 0 15px 13px; color: var(--color-text-accent); font-size: 12px; font-weight: 750; }
.form-message.error { color: var(--color-text-urgent); }
.profile-form { display: flex; flex-direction: column; gap: 12px; padding: 15px; border-top: 1px solid var(--color-border); background: var(--color-surface-subtle); }
.profile-form label { display: flex; flex-direction: column; gap: 6px; font-size: 12.5px; font-weight: 800; }
.profile-form input { min-height: 46px; padding: 0 13px; border: 1.5px solid var(--line); border-radius: 14px; background: var(--input-bg); color: var(--color-text-primary); outline: none; }
.profile-form input:focus { border-color: var(--color-border-accent); }
.profile-form small { color: var(--ink-muted); font-size: 11.5px; font-weight: 600; line-height: 1.45; }
.profile-form input:focus-visible { outline: 2px solid var(--color-border-accent); outline-offset: 2px; }
.save-profile-button { min-height: 46px; display: flex; align-items: center; justify-content: center; gap: 8px; border-radius: 14px; background: #1d6360; color: #fff; font-weight: 800; box-shadow: none; transition: transform .2s ease; }
.save-profile-button:disabled { border: 1px solid var(--color-disabled-border); background: var(--color-disabled-surface); color: var(--color-disabled-text); cursor: not-allowed; box-shadow: none; }
.setting-row { width: 100%; min-height: 70px; display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-bottom: 1px solid var(--color-border); background: transparent; color: var(--ink); text-align: left; transition: background .18s ease, transform .18s ease; }
button.setting-row:active { transform: scale(.99); background: rgba(29,99,96,.055); }
.setting-icon { width: 38px; height: 38px; display: grid; place-items: center; flex-shrink: 0; border-radius: 12px; background: var(--color-surface-selected); color: var(--color-icon-primary); }
.setting-icon.coral { background: rgba(239,99,81,.1); color: var(--color-text-urgent); }
.setting-copy { min-width: 0; display: flex; flex: 1; flex-direction: column; gap: 2px; }
.setting-copy strong { font-size: 14px; font-weight: 780; }
.setting-copy span { color: var(--ink-muted); font-size: 11.5px; font-weight: 600; }
.setting-value, .chevron { flex-shrink: 0; color: var(--ink-muted); }
.setting-value { font-size: 12.5px; font-weight: 750; }
.radius-row { border-bottom: 0; }
.radius-options { display: grid; grid-template-columns: repeat(5,1fr); gap: 5px; padding: 0 14px 14px; border-bottom: 1px solid var(--color-border); }
.radius-options button { min-height: 42px; padding: 0 3px; border-radius: 12px; background: var(--color-surface-subtle); color: var(--color-text-muted); font-size: 11.5px; font-weight: 800; }
.radius-options button.active { background: #1d6360; color: #fff; }
.switch { position: relative; width: 50px; height: 30px; flex-shrink: 0; border-radius: 999px; background: var(--line); transition: background .2s ease; }
.switch span { position: absolute; top: 3px; left: 3px; width: 24px; height: 24px; border-radius: 50%; background: #fff; box-shadow: 0 2px 7px rgba(29,99,96,.18); transition: transform .2s cubic-bezier(.4,0,.2,1); }
.switch.on { background: #1d6360; }
.switch.on span { transform: translateX(20px); }
.contact-privacy { display: flex; flex-direction: column; gap: 10px; margin: 0; padding: 15px 14px; border: 0; }
.contact-privacy legend { padding: 0; color: var(--ink); font-size: 14px; font-weight: 800; }
.privacy-intro { margin: 0 0 2px; color: var(--ink-muted); font-size: 11.5px; font-weight: 600; line-height: 1.5; }
.privacy-option { display: grid; grid-template-columns: 18px 1fr; align-items: flex-start; gap: 10px; padding: 12px; }
.privacy-option > .radio-indicator { margin-top: 1px; }
.privacy-option > span:last-child { display: flex; min-width: 0; flex-direction: column; gap: 3px; }
.privacy-option strong { color: var(--option-text); font-size: 13px; font-weight: 800; }
.privacy-option small { color: var(--option-secondary-text); font-size: 11.5px; font-weight: 600; line-height: 1.4; }
.save-privacy-button { min-height: 46px; border-radius: 14px; background: #1d6360; color: #fff; font-size: 13px; font-weight: 800; box-shadow: none; transition: transform .2s ease, opacity .2s ease; }
.save-privacy-button:not(:disabled):active { transform: scale(.98); }
.save-privacy-button:disabled { border: 1px solid var(--color-disabled-border); background: var(--color-disabled-surface); color: var(--color-disabled-text); cursor: not-allowed; box-shadow: none; }
.privacy-message { margin: 0 2px; color: var(--color-text-accent); font-size: 11.5px; font-weight: 700; line-height: 1.45; }
.privacy-message.error { color: var(--color-text-urgent); }
.danger-group { margin-top: 28px; }
.logout-button { width: 100%; min-height: 52px; border: 1px solid color-mix(in srgb, var(--color-text-urgent) 38%, transparent); border-radius: 14px; background: rgba(239,99,81,.08); color: var(--color-text-urgent); font-size: 14px; font-weight: 850; transition: all .2s cubic-bezier(.4,0,.2,1); }
.auth-card { min-height: 280px; display: flex; flex-direction: column; align-items: center; justify-content: center; margin-top: 24px; padding: 28px; border-radius: 14px; background: var(--color-surface); box-shadow: var(--shadow-card); text-align: center; }
.auth-icon { width: 62px; height: 62px; display: grid; place-items: center; margin-bottom: 14px; border-radius: 50%; background: var(--color-surface-selected); color: var(--color-icon-primary); }
.auth-card h2 { font-size: 18px; }
.auth-card p { max-width: 290px; margin-top: 7px; color: var(--ink-muted); font-size: 13px; line-height: 1.5; }
.auth-card button { min-height: 46px; margin-top: 18px; padding: 0 24px; border-radius: 999px; background: #1d6360; color: #fff; font-weight: 800; }
.expand-enter-active, .expand-leave-active { overflow: hidden; transition: all .2s ease; }
.expand-enter-from, .expand-leave-to { opacity: 0; transform: translateY(-8px); }
@media (prefers-reduced-motion: reduce) { .back-button, .avatar-picker, .edit-button, .save-profile-button, .setting-row, .switch, .switch span, .logout-button, .expand-enter-active, .expand-leave-active { transition: none; } }
</style>
