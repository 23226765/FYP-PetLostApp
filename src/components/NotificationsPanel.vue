<template>
  <!--
    NotificationsPanel.vue
    ──────────────────────
    Full-screen notifications list. Slides in via <Transition name="page">.
    Props:
      notifications  – AppNotification[] from App.vue
    Emits:
      close          – back button tapped
      open-pet       – user tapped a notification with a petId
  -->
  <div class="panel">
    <header class="top">
      <button class="back-btn" :aria-label="t('common.back')" @click="emit('close')">
        <AppIcon name="back" :size="22" />
      </button>
      <h1>{{ t('notifications.title') }}</h1>
      <button class="mark-all" @click="markAll">{{ t('notifications.markAllRead') }}</button>
    </header>

    <!-- Unread count pill -->
    <div v-if="unread > 0" class="unread-pill">
      {{ t('notifications.unread', { count: unread }) }}
    </div>
    <p v-if="targetError" class="notif-sub" role="alert">{{ targetError }}</p>

    <div class="list">
      <button
        v-for="n in notifications"
        :key="n.id"
        class="notif-row"
        :class="{ unread: !n.read, [n.type]: true }"
        @click="onTap(n)"
      >
        <!-- Left: photo or type icon -->
        <div class="notif-photo-wrap">
          <ManagedImage v-if="n.photo" :src="n.photo" alt="" class="notif-photo" />
          <span v-else class="notif-icon-fallback">
            <AppIcon :name="typeIcon(n.type)" :size="20" />
          </span>
          <!-- Unread dot -->
          <span v-if="!n.read" class="unread-dot" />
        </div>

        <!-- Body -->
        <div class="notif-body">
          <p class="notif-title">{{ notificationPresentation(n).title }}</p>
          <p class="notif-sub">{{ notificationPresentation(n).body }}</p>
          <span class="notif-time">{{ formatRelativeDate(n.createdAt) }}</span>
        </div>

        <!-- Type badge -->
        <span class="type-badge" :class="n.type">{{ typeBadge(n.type) }}</span>
      </button>
    </div>

    <div v-if="notifications.length === 0" class="empty">
      <span class="empty-icon"><AppIcon name="bell" :size="30" /></span>
      <h2>{{ t('notifications.allCaughtUp') }}</h2>
      <p>{{ t('notifications.emptyHelp') }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import ManagedImage from "./ManagedImage.vue"
import { computed } from 'vue'
import AppIcon from './AppIcon.vue'
import type { AppNotification } from '../types/notification'
import { useAppI18n } from '../i18n'
import { notificationPresentation } from '../i18n/notifications'
import { formatRelativeDate } from '../i18n/formatters'

const props = defineProps<{ notifications: AppNotification[]; targetError?: string }>()
const { t } = useAppI18n()
const emit = defineEmits<{
  close: []
  'open-pet': [petId: string, sightingId?: string]
  'open-stray': [strayId: string]
  'open-chat': [notification: AppNotification]
  'mark-read': [notificationId: string]
  'mark-all': []
}>()

const unread = computed(() => props.notifications.filter((n) => !n.read).length)

function typeIcon(type: AppNotification['type']): string {
  return { proximity: 'radar', sighting: 'eye', message: 'message', reunited: 'check', comment: 'message' }[type]
}

function typeBadge(type: AppNotification['type']): string {
  const key = { proximity: 'notifications.nearby', sighting: 'notifications.sighting', message: 'notifications.message', reunited: 'notifications.reunited', comment: 'notifications.comment' }[type]
  return t(key)
}

function onTap(n: AppNotification) {
  if (!n.read) emit('mark-read', n.id)
  if (n.type === 'message') emit('open-chat', n)
  else if (n.strayId) emit('open-stray', n.strayId)
  else if (n.petId) emit('open-pet', n.petId, n.sightingId)
  else emit('close')
}

function markAll() {
  if (unread.value > 0) emit('mark-all')
}
</script>

<style scoped>
.panel {
  position: fixed;
  inset: 0;
  z-index: 50;
  background: var(--bg);
  overflow-y: auto;
  overscroll-behavior: contain;
  max-width: 480px;
  margin: 0 auto;
  padding-bottom: calc(var(--safe-bottom) + 40px);
}

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
  width: 40px; height: 40px;
  display: grid; place-items: center;
  border-radius: 50%;
  background: var(--surface);
  box-shadow: var(--shadow-card);
  color: var(--ink);
}

h1 { font-size: 17px; font-weight: 800; }

.mark-all {
  font-size: 13px;
  font-weight: 800;
  color: var(--color-icon-primary);
}

.unread-pill {
  margin: 14px 18px 0;
  display: inline-block;
  padding: 4px 14px;
  border-radius: 999px;
  background: var(--coral);
  color: var(--color-text-on-coral);
  font-size: 12px;
  font-weight: 800;
}

.list { padding: 10px 0; }

.notif-row {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 14px 18px;
  width: 100%;
  text-align: left;
  border-bottom: 1px solid var(--line);
  transition: background 0.12s ease;
  background: var(--surface);
}

.notif-row.unread { background: var(--color-surface-selected); }
.notif-row:active { background: var(--teal-soft); }

.notif-photo-wrap {
  position: relative;
  flex-shrink: 0;
}

.notif-photo {
  width: 50px; height: 50px;
  border-radius: var(--radius-sm);
  object-fit: cover;
}

.notif-icon-fallback {
  width: 50px; height: 50px;
  border-radius: var(--radius-sm);
  background: var(--teal-soft);
  color: var(--color-text-accent);
  display: grid;
  place-items: center;
}

.unread-dot {
  position: absolute;
  top: -3px; right: -3px;
  width: 10px; height: 10px;
  border-radius: 50%;
  background: var(--coral);
  border: 2px solid var(--surface);
}

.notif-body { flex: 1; min-width: 0; }

.notif-title {
  font-size: 14px;
  font-weight: 800;
  color: var(--ink);
  margin-bottom: 2px;
}

.notif-sub {
  font-size: 12.5px;
  color: var(--ink-muted);
  font-weight: 600;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.notif-time {
  font-size: 11px;
  font-weight: 700;
  color: var(--ink-muted);
  margin-top: 4px;
  display: block;
}

.type-badge {
  flex-shrink: 0;
  padding: 3px 9px;
  border-radius: 999px;
  font-size: 10.5px;
  font-weight: 800;
  letter-spacing: 0.04em;
  align-self: flex-start;
  margin-top: 2px;
}

.type-badge.proximity { background: var(--teal-soft); color: var(--color-text-accent); }
.type-badge.sighting  { background: var(--teal-soft); color: var(--color-text-accent); }
.type-badge.message   { background: var(--status-coral-bg); color: var(--color-text-urgent); }
.type-badge.reunited  { background: #e8f5e9; color: #388e3c; }
.type-badge.comment   { background: var(--teal-soft); color: var(--color-text-accent); }

/* Empty state */
.empty {
  display: flex; flex-direction: column; align-items: center;
  text-align: center; padding: 56px 24px; gap: 10px;
}
.empty-icon {
  width: 72px; height: 72px;
  display: grid; place-items: center;
  border-radius: 50%;
  background: var(--teal-soft); color: var(--color-text-accent);
  margin-bottom: 6px;
}
.empty h2 { font-size: 20px; font-weight: 800; }
.empty p { font-size: 14px; color: var(--ink-muted); max-width: 280px; line-height: 1.6; }
</style>
