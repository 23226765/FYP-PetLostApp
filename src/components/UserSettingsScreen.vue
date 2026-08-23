<template>
  <!--
    UserSettingsScreen.vue
    ──────────────────────
    Full-screen settings overlay that slides in from the bottom, matching the
    same page-transition pattern used by PetDetail.vue.

    Props:
      (none – opened/closed by App.vue via v-if + <Transition name="page">)

    Emits:
      close  – user tapped the back arrow; parent sets showSettings = false
  -->
  <div class="settings-screen">

    <!-- ── Header ── -->
    <header class="top">
      <button class="back-btn" aria-label="Go back" @click="emit('close')">
        <AppIcon name="back" :size="22" />
      </button>
      <h1>Account &amp; Settings</h1>
      <!-- Spacer keeps the title visually centred -->
      <span class="spacer" aria-hidden="true" />
    </header>

    <!-- ── Avatar + name ── -->
    <div class="profile-row">
      <div class="avatar-wrap">
        <img
          :src="user?.avatar || '/avatar.svg'"
          :alt="user ? `Profile photo of ${user.name}` : 'Guest profile'"
          class="avatar"
        />
        <!-- Teal camera badge overlaid on avatar -->
        <button class="avatar-edit" aria-label="Change profile photo">
          <AppIcon name="camera" :size="14" />
        </button>
      </div>
      <div class="profile-info">
        <span class="profile-name">{{ user ? user.name : 'Guest' }}</span>
        <span class="profile-email">{{ user ? user.email : 'Not signed in' }}</span>
      </div>
      <button class="edit-btn" aria-label="Edit profile" @click="editingProfile = !editingProfile">
        <AppIcon name="chevron" :size="16" />
      </button>
    </div>

    <!-- ── Inline profile edit form (collapsed by default) ── -->
    <Transition name="expand">
      <form v-if="editingProfile" class="edit-form" @submit.prevent="saveProfile">
        <label class="field">
          <span>Display name</span>
          <input v-model="form.name" type="text" placeholder="Your name" />
        </label>
        <label class="field">
          <span>Email</span>
          <input v-model="form.email" type="email" placeholder="you@example.com" />
        </label>
        <label class="field">
          <span>Phone number</span>
          <div class="input-icon">
            <AppIcon name="phone" :size="17" />
            <input v-model="form.phone" type="tel" placeholder="+1 555 000 0000" />
          </div>
        </label>
        <button type="submit" class="save-btn">
          <AppIcon name="check" :size="18" />
          Save changes
        </button>
      </form>
    </Transition>

    <!-- ── Section: Notifications ── -->
    <h2 class="section-title">Notifications</h2>
    <ul class="settings-list">
      <li>
        <div class="setting-label">
          <AppIcon name="bell" :size="19" />
          <span>Proximity alerts</span>
        </div>
        <button
          class="switch"
          :class="{ on: prefs.proximityAlerts }"
          role="switch"
          :aria-checked="prefs.proximityAlerts"
          aria-label="Toggle proximity alerts"
          @click="prefs.proximityAlerts = !prefs.proximityAlerts"
        >
          <span class="knob" />
        </button>
      </li>
      <li>
        <div class="setting-label">
          <AppIcon name="radar" :size="19" />
          <span>New pets in my area</span>
        </div>
        <button
          class="switch"
          :class="{ on: prefs.newPetsAlert }"
          role="switch"
          :aria-checked="prefs.newPetsAlert"
          aria-label="Toggle new pets in area alerts"
          @click="prefs.newPetsAlert = !prefs.newPetsAlert"
        >
          <span class="knob" />
        </button>
      </li>
      <li>
        <div class="setting-label">
          <AppIcon name="eye" :size="19" />
          <span>Sighting updates on my posts</span>
        </div>
        <button
          class="switch"
          :class="{ on: prefs.sightingUpdates }"
          role="switch"
          :aria-checked="prefs.sightingUpdates"
          aria-label="Toggle sighting update notifications"
          @click="prefs.sightingUpdates = !prefs.sightingUpdates"
        >
          <span class="knob" />
        </button>
      </li>
    </ul>

    <!-- ── Section: Radar ── -->
    <h2 class="section-title">Radar</h2>
    <ul class="settings-list">
      <li>
        <div class="setting-label">
          <AppIcon name="pin" :size="19" />
          <span>Search radius</span>
        </div>
        <!-- Pill segmented control matching RadarScreen / PostPetScreen pattern -->
        <div class="radius-seg" role="group" aria-label="Search radius">
          <button
            v-for="r in radiusOptions"
            :key="r"
            :class="{ active: prefs.radius === r }"
            :aria-pressed="prefs.radius === r"
            @click="prefs.radius = r"
          >
            {{ r }}
          </button>
        </div>
      </li>
      <li>
        <div class="setting-label">
          <AppIcon name="map" :size="19" />
          <span>Default view</span>
        </div>
        <div class="radius-seg" role="group" aria-label="Default radar view">
          <button
            v-for="v in viewOptions"
            :key="v"
            :class="{ active: prefs.defaultView === v }"
            :aria-pressed="prefs.defaultView === v"
            @click="prefs.defaultView = v"
          >
            {{ v }}
          </button>
        </div>
      </li>
    </ul>

    <!-- ── Section: Privacy ── -->
    <h2 class="section-title">Privacy</h2>
    <ul class="settings-list">
      <li>
        <div class="setting-label">
          <AppIcon name="user" :size="19" />
          <span>Show my name on sightings</span>
        </div>
        <button
          class="switch"
          :class="{ on: prefs.showName }"
          role="switch"
          :aria-checked="prefs.showName"
          aria-label="Toggle name visibility on sightings"
          @click="prefs.showName = !prefs.showName"
        >
          <span class="knob" />
        </button>
      </li>
      <li>
        <div class="setting-label">
          <AppIcon name="pin" :size="19" />
          <span>Share precise location</span>
        </div>
        <button
          class="switch"
          :class="{ on: prefs.preciseLocation }"
          role="switch"
          :aria-checked="prefs.preciseLocation"
          aria-label="Toggle precise location sharing"
          @click="prefs.preciseLocation = !prefs.preciseLocation"
        >
          <span class="knob" />
        </button>
      </li>
    </ul>

    <!-- ── Section: Account ── -->
    <h2 class="section-title">Account</h2>
    <ul class="settings-list">
      <li class="row-link">
        <div class="setting-label">
          <AppIcon name="share" :size="19" />
          <span>Invite a neighbour</span>
        </div>
        <span class="row-arrow"><AppIcon name="chevron" :size="15" /></span>
      </li>
      <li class="row-link">
        <div class="setting-label">
          <AppIcon name="list" :size="19" />
          <span>Terms &amp; Privacy Policy</span>
        </div>
        <span class="row-arrow"><AppIcon name="chevron" :size="15" /></span>
      </li>
      <li class="row-link row-danger" @click="confirmSignOut">
        <div class="setting-label">
          <AppIcon name="close" :size="19" />
          <span>Sign out</span>
        </div>
        <span class="row-arrow"><AppIcon name="chevron" :size="15" /></span>
      </li>
    </ul>

    <!-- ── App version footer ── -->
    <p class="version">PawRadar v1.0.0 · Made with ♥ for lost pets</p>

  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import AppIcon from './AppIcon.vue'
import type { User } from '../types/user'

/* ── Props & Emits ── */
defineProps<{ user: User | null }>()
const emit = defineEmits<{ close: []; logout: [] }>()

/* ── Local state: profile edit form ── */
const editingProfile = ref(false)
const form = reactive({
  name: '',
  email: '',
  phone: '',
})

function saveProfile() {
  // TODO: persist to backend / local storage
  editingProfile.value = false
}

/* ── Local state: user preferences ── */
const radiusOptions = ['1 km', '3 km', '5 km', '10 km'] as const
const viewOptions = ['List', 'Map'] as const

const prefs = reactive({
  proximityAlerts: true,
  newPetsAlert: true,
  sightingUpdates: true,
  radius: '3 km' as (typeof radiusOptions)[number],
  defaultView: 'List' as (typeof viewOptions)[number],
  showName: true,
  preciseLocation: false,
})

/* ── Sign out ── */
function confirmSignOut() {
  emit('logout')
}
</script>

<style scoped>
/* ─────────────────────────────────────────────
   Screen shell — mirrors ProfileScreen / RadarScreen
───────────────────────────────────────────── */
.settings-screen {
  position: fixed;
  inset: 0;
  z-index: 50;
  background: var(--bg);
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 0 0 calc(var(--safe-bottom) + 40px);
  max-width: 480px;
  margin: 0 auto;
}

/* ── Header ── */
.top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: calc(var(--safe-top) + 14px) 18px 14px;
  position: sticky;
  top: 0;
  background: rgba(252, 249, 242, 0.92);
  backdrop-filter: blur(10px);
  z-index: 10;
  border-bottom: 1px solid var(--line);
}

.back-btn {
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--surface);
  box-shadow: var(--shadow-card);
  color: var(--ink);
  flex-shrink: 0;
}

h1 {
  font-size: 17px;
  font-weight: 800;
  color: var(--ink);
}

.spacer {
  width: 40px; /* mirrors back-btn width to centre the title */
}

/* ── Avatar / profile row ── */
.profile-row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 20px 18px 16px;
}

.avatar-wrap {
  position: relative;
  flex-shrink: 0;
}

.avatar {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  object-fit: cover;
  border: 3px solid var(--surface);
  box-shadow: var(--shadow-card);
}

.avatar-edit {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--teal);
  color: #fff;
  display: grid;
  place-items: center;
  box-shadow: var(--shadow-card);
}

.profile-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.profile-name {
  font-size: 16px;
  font-weight: 800;
  color: var(--ink);
}

.profile-email {
  font-size: 13px;
  font-weight: 600;
  color: var(--ink-muted);
}

.edit-btn {
  color: var(--ink-muted);
}

/* ── Inline edit form ── */
.edit-form {
  padding: 0 18px 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* expand/collapse transition */
.expand-enter-active,
.expand-leave-active {
  transition: all 0.25s cubic-bezier(0.3, 0.8, 0.4, 1);
  overflow: hidden;
}

.expand-enter-from,
.expand-leave-to {
  max-height: 0;
  opacity: 0;
}

.expand-enter-to,
.expand-leave-from {
  max-height: 400px;
  opacity: 1;
}

/* Field — matches PostPetScreen .field */
.field {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.field > span {
  font-size: 13.5px;
  font-weight: 800;
  color: var(--ink);
}

input {
  width: 100%;
  padding: 14px 16px;
  border-radius: var(--radius-md);
  border: 1.5px solid var(--line);
  background: var(--surface);
  outline: none;
  transition: border-color 0.15s ease;
}

input:focus {
  border-color: var(--teal);
}

input::placeholder {
  color: #b6ada4;
}

.input-icon {
  position: relative;
  display: flex;
  align-items: center;
}

.input-icon svg {
  position: absolute;
  left: 15px;
  color: var(--teal);
  pointer-events: none;
}

.input-icon input {
  padding-left: 42px;
}

.save-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 14px 0;
  border-radius: var(--radius-md);
  background: var(--teal);
  color: #fff;
  font-size: 15px;
  font-weight: 800;
  box-shadow: var(--shadow-float);
  transition: transform 0.15s ease;
}

.save-btn:active {
  transform: scale(0.98);
}

/* ── Section titles ── */
.section-title {
  font-size: 12px;
  font-weight: 800;
  color: var(--ink-muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  padding: 18px 18px 8px;
}

/* ── Settings list — mirrors ProfileScreen .settings ── */
.settings-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 1px;
  background: var(--line);
  border-radius: var(--radius-md);
  overflow: hidden;
  margin: 0 18px;
}

.settings-list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--surface);
  padding: 15px 16px;
  gap: 12px;
}

.setting-label {
  display: flex;
  align-items: center;
  gap: 12px;
  font-weight: 700;
  font-size: 14.5px;
  flex: 1;
  min-width: 0;
}

.setting-label svg {
  color: var(--teal);
  flex-shrink: 0;
}

/* ── Toggle switch — identical to ProfileScreen ── */
.switch {
  width: 50px;
  height: 30px;
  border-radius: 999px;
  background: var(--line);
  position: relative;
  transition: background 0.2s ease;
  flex-shrink: 0;
}

.switch.on {
  background: var(--teal);
}

.knob {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #fff;
  box-shadow: var(--shadow-card);
  transition: transform 0.2s ease;
}

.switch.on .knob {
  transform: translateX(20px);
}

/* ── Radius / view segmented control ── */
.radius-seg {
  display: flex;
  background: var(--line);
  border-radius: 999px;
  padding: 3px;
  gap: 0;
  flex-shrink: 0;
}

.radius-seg button {
  padding: 6px 10px;
  border-radius: 999px;
  font-size: 12.5px;
  font-weight: 800;
  color: var(--ink-muted);
  transition: all 0.18s ease;
  white-space: nowrap;
}

.radius-seg button.active {
  background: var(--surface);
  color: var(--teal);
  box-shadow: var(--shadow-card);
}

/* ── Tappable row links ── */
.row-link {
  cursor: pointer;
  transition: background 0.12s ease;
}

.row-link:active {
  background: var(--teal-soft) !important;
}

.row-arrow {
  color: var(--ink-muted);
  display: inline-flex;
  align-items: center;
}

/* Danger row (sign out) */
.row-danger .setting-label {
  color: var(--coral);
}

.row-danger .setting-label svg {
  color: var(--coral);
}

/* ── Version footer ── */
.version {
  text-align: center;
  font-size: 12px;
  font-weight: 600;
  color: var(--ink-muted);
  padding: 28px 18px 0;
}
</style>
