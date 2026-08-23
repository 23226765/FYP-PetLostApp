<template>
  <div class="profile">
    <header class="head">
      <img
        class="avatar"
        :src="user?.avatar || '/avatar.svg'"
        :alt="user ? `Profile photo of ${user.name}` : 'Guest profile'"
      />
      <h1>{{ user ? user.name : 'Guest' }}</h1>
      <p class="area">
        <AppIcon name="pin" :size="14" />
        {{ user ? user.email : 'Sign in to sync your alerts across devices' }}
      </p>
      <p v-if="user?.phone" class="area phone">{{ user.phone }}</p>
      <button v-if="!user" class="auth-btn primary" @click="emit('login')">
        Sign in / Create account
      </button>
      <button v-else class="auth-btn" @click="emit('logout')">Log out</button>
    </header>

    <div class="stats">
      <div class="stat">
        <span class="num">3</span>
        <span class="lbl">Sightings reported</span>
      </div>
      <div class="stat highlight">
        <span class="num">1</span>
        <span class="lbl">Pet reunited</span>
      </div>
      <div class="stat">
        <span class="num">212</span>
        <span class="lbl">Neighbors nearby</span>
      </div>
    </div>

    <h2>My pets</h2>
    <div class="my-pet">
      <img src="/pets/coco.svg" alt="Photo of Coco, a dachshund" />
      <div class="my-pet-info">
        <span class="my-pet-name">Coco</span>
        <span class="my-pet-status">Currently missing · 47 neighbors watching</span>
      </div>
      <span class="status-badge">LOST</span>
    </div>

    <h2>Settings</h2>
    <ul class="settings">
      <li>
        <div class="setting-label">
          <AppIcon name="radar" :size="19" />
          <span>Radar radius</span>
        </div>
        <span class="setting-value">3 km <AppIcon name="chevron" :size="15" /></span>
      </li>
      <li>
        <div class="setting-label">
          <AppIcon name="bell" :size="19" />
          <span>Proximity alerts</span>
        </div>
        <button
          class="switch"
          :class="{ on: alerts }"
          role="switch"
          :aria-checked="alerts"
          aria-label="Toggle proximity alerts"
          @click="alerts = !alerts"
        >
          <span class="knob" />
        </button>
      </li>
      <li class="row-link" @click="emit('open-settings')">
        <div class="setting-label">
          <AppIcon name="user" :size="19" />
          <span>Account &amp; privacy</span>
        </div>
        <span class="setting-value"><AppIcon name="chevron" :size="15" /></span>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import AppIcon from './AppIcon.vue'
import type { User } from '../types/user'

defineProps<{ user: User | null }>()
const emit = defineEmits<{ login: []; logout: []; 'open-settings': [] }>()

const alerts = ref(true)
</script>

<style scoped>
.profile {
  padding: calc(var(--safe-top) + 26px) 20px 120px;
  max-width: 480px;
  margin: 0 auto;
}

.head {
  display: flex;
  flex-direction: column;
  align-items: center;
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

.auth-btn:not(.primary) {
  background: var(--surface);
  color: var(--coral);
  border: 1.5px solid var(--line);
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

.my-pet {
  display: flex;
  align-items: center;
  gap: 13px;
  background: var(--surface);
  border-radius: var(--radius-md);
  padding: 12px 14px;
  box-shadow: var(--shadow-card);
  margin-bottom: 26px;
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

.settings {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 1px;
  background: var(--line);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.settings li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--surface);
  padding: 15px 16px;
}

.setting-label {
  display: flex;
  align-items: center;
  gap: 12px;
  font-weight: 700;
  font-size: 14.5px;
}

.setting-label svg {
  color: var(--teal);
}

.setting-value {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--ink-muted);
  font-weight: 700;
  font-size: 14px;
}

.row-link {
  cursor: pointer;
  transition: background 0.12s ease;
}

.row-link:active {
  background: var(--teal-soft) !important;
}

.switch {
  width: 50px;
  height: 30px;
  border-radius: 999px;
  background: var(--line);
  position: relative;
  transition: background 0.2s ease;
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
</style>
