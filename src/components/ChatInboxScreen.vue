<template>
  <section class="inbox" aria-labelledby="messages-title">
    <header class="inbox-header">
      <div>
        <p class="eyebrow">PawRadar Direct</p>
        <h1 id="messages-title">Messages</h1>
        <p>Conversations about active pet reports</p>
      </div>
      <button
        class="refresh-button"
        type="button"
        :disabled="refreshing"
        aria-label="Refresh conversations"
        @click="refreshInbox"
      >
        <svg
          :class="{ spinning: refreshing }"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M20 11a8 8 0 0 0-14.9-3.8L3 10" />
          <path d="M3 4v6h6" />
          <path d="M4 13a8 8 0 0 0 14.9 3.8L21 14" />
          <path d="M21 20v-6h-6" />
        </svg>
      </button>
    </header>

    <div class="inbox-content">
      <div v-if="!isAuthenticated" class="inbox-state empty">
        <span class="empty-illustration" aria-hidden="true">
          <svg viewBox="0 0 88 88" fill="none">
            <path class="bubble" d="M15 19h58a8 8 0 0 1 8 8v31a8 8 0 0 1-8 8H42L25 78l3-12H15a8 8 0 0 1-8-8V27a8 8 0 0 1 8-8Z" />
            <circle class="paw" cx="33" cy="39" r="4" />
            <circle class="paw" cx="44" cy="34" r="4" />
            <circle class="paw" cx="55" cy="39" r="4" />
            <path class="paw-pad" d="M44 42c-8 0-13 6-13 12 0 4 4 6 8 4 3-2 7-2 10 0 4 2 8 0 8-4 0-6-5-12-13-12Z" />
          </svg>
        </span>
        <h2>Sign in to view your conversations</h2>
        <p>Your conversations stay connected to your PawRadar account.</p>
        <button type="button" @click="emit('auth-needed')">Sign in</button>
      </div>

      <div v-else-if="loading" class="conversation-list" role="status" aria-label="Loading conversations">
        <div v-for="index in 4" :key="index" class="conversation-card skeleton" aria-hidden="true">
          <span class="skeleton-avatar" />
          <span class="skeleton-copy">
            <span />
            <span />
          </span>
        </div>
      </div>

      <div v-else-if="error" class="inbox-state error" role="alert">
        <span class="empty-icon"><AppIcon name="send" :size="28" /></span>
        <h2>Messages are unavailable</h2>
        <p>{{ error }}</p>
        <button type="button" @click="loadInbox(true)">Try again</button>
      </div>

      <div v-else-if="conversations.length === 0" class="inbox-state empty">
        <span class="empty-illustration" aria-hidden="true">
          <svg viewBox="0 0 88 88" fill="none">
            <path class="bubble" d="M15 19h58a8 8 0 0 1 8 8v31a8 8 0 0 1-8 8H42L25 78l3-12H15a8 8 0 0 1-8-8V27a8 8 0 0 1 8-8Z" />
            <circle class="paw" cx="33" cy="39" r="4" />
            <circle class="paw" cx="44" cy="34" r="4" />
            <circle class="paw" cx="55" cy="39" r="4" />
            <path class="paw-pad" d="M44 42c-8 0-13 6-13 12 0 4 4 6 8 4 3-2 7-2 10 0 4 2 8 0 8-4 0-6-5-12-13-12Z" />
          </svg>
        </span>
        <h2>No messages yet</h2>
        <p>Messages start when you reach out to an owner or reporter from a pet listing.</p>
        <button type="button" @click="emit('explore-radar')">Explore Radar</button>
      </div>

      <ul v-else class="conversation-list">
        <li v-for="conversation in conversations" :key="conversation.id">
          <button
            class="conversation-card"
            :class="{ unread: isConversationUnread(conversation) }"
            type="button"
            :aria-label="conversationAriaLabel(conversation)"
            @click="openConversation(conversation)"
          >
            <span class="pet-photo">
              <img
                v-if="normalizedImageUrl(conversation.pet.photo) && !failedPhotos.has(conversation.pet.id)"
                :src="normalizedImageUrl(conversation.pet.photo)"
                :alt="`Photo of ${conversation.pet.name}`"
                loading="lazy"
                @error="markPhotoFailed(conversation.pet.id)"
              />
              <span v-else class="photo-placeholder" aria-hidden="true">
                <AppIcon name="paw" :size="25" />
              </span>
            </span>

            <span class="conversation-copy">
              <span class="conversation-title">
                <strong>{{ conversationName(conversation) }}</strong>
                <time :datetime="conversation.updatedAt">
                  {{ relativeTime(conversation.updatedAt) }}
                </time>
              </span>
              <span class="pet-context">{{ conversation.pet.name }}</span>
              <span class="message-row">
                <span class="message-preview">
                  {{ conversation.lastMessage.text || (conversation.lastMessage.sharedStray ? 'Shared a stray post' : 'Shared a photo') }}
                </span>
                <span
                  v-if="isConversationUnread(conversation)"
                  class="unread-badge"
                  aria-label="Unread conversation"
                >New</span>
              </span>
            </span>
          </button>
        </li>
      </ul>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import { getChatInbox, type ChatConversation, type ChatPet } from '../services/api'
import type { User } from '../types/user'

const props = defineProps<{ user: User | null }>()
const emit = defineEmits<{
  'auth-needed': []
  'explore-radar': []
  'open-chat': [pet: ChatPet]
  'unread-change': [count: number]
}>()

const conversations = ref<ChatConversation[]>([])
const loading = ref(false)
const error = ref('')
const failedPhotos = ref<Set<string>>(new Set())
const readStateVersion = ref(0)

const POLL_INTERVAL_MS = 30_000
let requestSequence = 0
let pollTimer: ReturnType<typeof setInterval> | null = null
const refreshing = ref(false)

const isAuthenticated = computed(() => {
  if (!props.user) return false
  try {
    return Boolean(localStorage.getItem('token'))
  } catch {
    return false
  }
})

function normalizedImageUrl(value: string | null | undefined): string {
  const photo = value?.trim()
  if (!photo) return ''

  try {
    const apiUrl = new URL(import.meta.env.VITE_API_BASE_URL || '/api', window.location.origin)
    const resolved = new URL(photo, `${apiUrl.origin}/`)
    return ['http:', 'https:', 'data:', 'blob:'].includes(resolved.protocol) ? resolved.href : ''
  } catch {
    return ''
  }
}

function markPhotoFailed(petId: string) {
  failedPhotos.value = new Set([...failedPhotos.value, petId])
}

function viewerRole(conversation: ChatConversation): 'owner' | 'finder' {
  return conversation.pet.reportedBy === props.user?.id ? 'owner' : 'finder'
}

function conversationName(conversation: ChatConversation): string {
  return viewerRole(conversation) === 'owner'
    ? conversation.pet.participantName || 'Finder'
    : conversation.pet.owner || 'Pet owner'
}

function readStateKey(conversationId: string): string {
  return `pawradar:chat-read:${props.user?.id || 'guest'}:${conversationId}`
}

function readAt(conversationId: string): number {
  try {
    const stored = Number(localStorage.getItem(readStateKey(conversationId)))
    return Number.isFinite(stored) ? stored : 0
  } catch {
    return 0
  }
}

function isConversationUnread(conversation: ChatConversation): boolean {
  void readStateVersion.value
  if (!props.user) return false
  const updatedAt = new Date(conversation.updatedAt).getTime()
  return Number.isFinite(updatedAt) && updatedAt > readAt(conversation.id)
}

const unreadCount = computed(
  () => conversations.value.filter((conversation) => isConversationUnread(conversation)).length,
)

watch(unreadCount, (count) => emit('unread-change', count), { immediate: true })

function markConversationRead(conversation: ChatConversation) {
  const updatedAt = new Date(conversation.updatedAt).getTime()
  try {
    localStorage.setItem(
      readStateKey(conversation.id),
      String(Number.isFinite(updatedAt) ? updatedAt : Date.now()),
    )
  } catch {
    // The thread still opens when browser storage is unavailable.
  }
  readStateVersion.value += 1
}

function openConversation(conversation: ChatConversation) {
  markConversationRead(conversation)
  emit('open-chat', conversation.pet)
}

function conversationAriaLabel(conversation: ChatConversation): string {
  const unread = isConversationUnread(conversation) ? 'Unread conversation. ' : ''
  return `${unread}Open messages with ${conversationName(conversation)} about ${conversation.pet.name}`
}

async function loadInbox(showLoading = false) {
  if (!isAuthenticated.value) {
    requestSequence += 1
    conversations.value = []
    loading.value = false
    error.value = ''
    return
  }
  if (refreshing.value) return

  const sequence = ++requestSequence
  refreshing.value = true
  if (showLoading) loading.value = true
  error.value = ''

  try {
    const result = await getChatInbox()
    if (sequence === requestSequence) conversations.value = result
  } catch (cause) {
    if (sequence === requestSequence) {
      if (showLoading) conversations.value = []
      error.value = cause instanceof Error ? cause.message : 'Failed to load conversations.'
    }
  } finally {
    if (sequence === requestSequence && showLoading) loading.value = false
    refreshing.value = false
  }
}

function refreshInbox() {
  if (!isAuthenticated.value) {
    emit('auth-needed')
    return
  }
  void loadInbox(true)
}

function relativeTime(value: string): string {
  const timestamp = new Date(value).getTime()
  if (!Number.isFinite(timestamp)) return ''

  const elapsed = Math.max(0, Date.now() - timestamp)
  const minutes = Math.floor(elapsed / 60_000)
  if (minutes < 1) return 'Now'
  if (minutes < 60) return `${minutes}m ago`

  const date = new Date(timestamp)
  const today = new Date()
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  const startOfMessageDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  const dayDifference = Math.round((startOfToday - startOfMessageDay) / 86_400_000)
  if (dayDifference === 0) return `${Math.floor(minutes / 60)}h ago`
  if (dayDifference === 1) return 'Yesterday'
  if (dayDifference < 7) return date.toLocaleDateString([], { weekday: 'short' })
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

watch(
  () => props.user?.id,
  () => void loadInbox(true),
  { immediate: true },
)

onMounted(() => {
  pollTimer = setInterval(() => void loadInbox(false), POLL_INTERVAL_MS)
})

onBeforeUnmount(() => {
  requestSequence += 1
  if (pollTimer) clearInterval(pollTimer)
})
</script>

<style scoped>
.inbox {
  min-height: 100dvh;
  width: 100%;
  max-width: 480px;
  margin: 0 auto;
  padding-bottom: calc(106px + var(--safe-bottom));
  background: #fcf9f2;
}

.inbox-header {
  position: sticky;
  top: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: calc(var(--safe-top) + 22px) 20px 18px;
  border-bottom: 1px solid rgba(29, 99, 96, 0.08);
  background: rgba(252, 249, 242, 0.94);
  backdrop-filter: blur(18px);
}

.eyebrow {
  margin-bottom: 2px;
  color: #ef6351;
  font-size: 10px;
  font-weight: 850;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

h1 {
  color: var(--ink);
  font-size: 28px;
  font-weight: 850;
  letter-spacing: -0.035em;
  line-height: 1.05;
}

.inbox-header p:last-child {
  margin-top: 5px;
  color: var(--ink-muted);
  font-size: 12.5px;
  font-weight: 650;
}

.refresh-button {
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  border-radius: 14px;
  background: rgba(29, 99, 96, 0.1);
  color: #1d6360;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.8);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.refresh-button svg {
  width: 21px;
  height: 21px;
}

.refresh-button:active:not(:disabled) {
  transform: scale(0.96) rotate(-12deg);
  background: rgba(29, 99, 96, 0.16);
}

.refresh-button:disabled {
  cursor: wait;
  opacity: 0.7;
}

.refresh-button svg.spinning {
  animation: spin 0.8s linear infinite;
}

.inbox-content {
  padding: 18px 16px 24px;
}

.inbox-state {
  min-height: 260px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 28px 22px;
  border: 1px solid rgba(29, 99, 96, 0.08);
  border-radius: 14px;
  background: #fff;
  color: var(--ink-muted);
  box-shadow: 0 12px 30px rgba(29, 99, 96, 0.07);
  text-align: center;
}

.inbox-state h2 {
  color: var(--ink);
  font-size: 18px;
  font-weight: 800;
}

.inbox-state p {
  max-width: 285px;
  margin-top: 6px;
  font-size: 13.5px;
  font-weight: 600;
  line-height: 1.55;
}

.empty-icon {
  width: 64px;
  height: 64px;
  display: grid;
  place-items: center;
  margin-bottom: 14px;
  border-radius: 22px;
  background: rgba(29, 99, 96, 0.1);
  color: #1d6360;
}

.empty-illustration {
  width: 88px;
  height: 88px;
  display: grid;
  place-items: center;
  margin-bottom: 16px;
  filter: drop-shadow(0 10px 16px rgba(29, 99, 96, 0.12));
}

.empty-illustration svg {
  width: 88px;
  height: 88px;
}

.empty-illustration .bubble {
  fill: rgba(29, 99, 96, 0.1);
  stroke: #1d6360;
  stroke-width: 3;
}

.empty-illustration .paw,
.empty-illustration .paw-pad {
  fill: #ef6351;
}

.inbox-state button {
  min-height: 44px;
  margin-top: 18px;
  padding: 0 22px;
  border-radius: 999px;
  background: #1d6360;
  color: #fff;
  font-weight: 800;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.inbox-state button:active {
  transform: scale(0.98);
}

.inbox-state.error .empty-icon {
  background: rgba(239, 99, 81, 0.11);
  color: #ef6351;
}

.conversation-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  list-style: none;
}

.conversation-card {
  width: 100%;
  min-height: 76px;
  display: flex;
  align-items: center;
  gap: 13px;
  padding: 12px;
  border: 1px solid transparent;
  border-radius: 14px;
  background: transparent;
  color: var(--ink);
  text-align: left;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.conversation-card:hover,
.conversation-card:focus-visible {
  border-color: rgba(29, 99, 96, 0.08);
  background: #fff;
  box-shadow: 0 8px 24px rgba(29, 99, 96, 0.065);
}

.conversation-card:focus-visible {
  outline: 2px solid #1d6360;
  outline-offset: 2px;
}

.conversation-card:active {
  transform: scale(0.98);
}

.conversation-card.unread {
  background: rgba(29, 99, 96, 0.055);
}

.pet-photo {
  position: relative;
  width: 48px;
  height: 48px;
  flex-shrink: 0;
  overflow: visible;
  border-radius: 50%;
  background: #fcf9f2;
}

.pet-photo img,
.photo-placeholder {
  width: 100%;
  height: 100%;
  border-radius: 50%;
}

.pet-photo img {
  display: block;
  object-fit: cover;
}

.photo-placeholder {
  display: grid;
  place-items: center;
  background: rgba(29, 99, 96, 0.1);
  color: rgba(29, 99, 96, 0.68);
}

.conversation-copy {
  flex: 1;
  min-width: 0;
}

.conversation-title,
.message-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.conversation-title {
  justify-content: space-between;
}

.conversation-title strong {
  overflow: hidden;
  font-size: 14.5px;
  font-weight: 780;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.conversation-title time {
  flex-shrink: 0;
  color: var(--ink-muted);
  font-size: 10.5px;
  font-weight: 650;
}

.conversation-card.unread .conversation-title strong,
.conversation-card.unread .conversation-title time {
  color: #1d6360;
  font-weight: 850;
}

.pet-context {
  display: block;
  margin-top: 2px;
  color: #1d6360;
  font-size: 11px;
  font-weight: 750;
}

.message-row {
  margin-top: 3px;
}

.message-preview {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: var(--ink-muted);
  font-size: 12.5px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.conversation-card.unread .message-preview {
  color: var(--ink);
  font-weight: 720;
}

.unread-badge {
  min-width: 32px;
  height: 19px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  padding: 0 7px;
  border-radius: 999px;
  background: #ef6351;
  color: #fff;
  font-size: 9.5px;
  font-weight: 850;
}

.skeleton {
  pointer-events: none;
}

.skeleton-avatar,
.skeleton-copy span {
  display: block;
  background: linear-gradient(90deg, #eeeae2 25%, #f8f5ee 50%, #eeeae2 75%);
  background-size: 200% 100%;
  animation: shimmer 1.3s linear infinite;
}

.skeleton-avatar {
  width: 48px;
  height: 48px;
  flex-shrink: 0;
  border-radius: 50%;
}

.skeleton-copy {
  flex: 1;
}

.skeleton-copy span {
  width: 54%;
  height: 11px;
  border-radius: 999px;
}

.skeleton-copy span:last-child {
  width: 82%;
  margin-top: 10px;
}

@keyframes shimmer {
  to { background-position: -200% 0; }
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
  .conversation-card,
  .inbox-state button {
    transition: none;
  }

  .skeleton-avatar,
  .skeleton-copy span,
  .refresh-button svg.spinning {
    animation: none;
  }
}
</style>
