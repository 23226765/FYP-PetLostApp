<template>
  <section class="inbox" aria-labelledby="messages-title">
    <header class="inbox-header">
      <div>
        <p class="eyebrow">{{ t('messages.direct') }}</p>
        <h1 id="messages-title">{{ t('messages.title') }}</h1>
        <p>{{ t('messages.subtitle') }}</p>
      </div>
      <button
        class="refresh-button"
        type="button"
        :disabled="refreshing"
        :aria-label="t('messages.refresh')"
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
      <div v-if="isAuthenticated" class="conversation-search" role="search">
        <label class="sr-only" for="conversation-search">{{ t('messagingUpdates.searchLabel') }}</label>
        <input id="conversation-search" v-model="search" type="search" :placeholder="t('messagingUpdates.searchPlaceholder')" autocomplete="off" />
        <button v-if="search" type="button" :aria-label="t('messagingUpdates.clearSearch')" @click="search = ''"><AppIcon name="close" :size="18" /></button>
      </div>
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
        <h2>{{ t('messages.signInTitle') }}</h2>
        <p>{{ t('messages.accountHelp') }}</p>
        <button type="button" @click="emit('auth-needed')">{{ t('authentication.signIn') }}</button>
      </div>

      <div v-else-if="loading" class="conversation-list" role="status" :aria-label="t('messages.loading')">
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
        <h2>{{ t('messages.unavailable') }}</h2>
        <p>{{ error }}</p>
        <button type="button" @click="loadInbox(true)">{{ t('common.retry') }}</button>
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
        <h2>{{ t('messages.noMessages') }}</h2>
        <p>{{ t('messages.noMessagesHelp') }}</p>
        <button type="button" @click="emit('explore-radar')">{{ t('pets.exploreRadar') }}</button>
      </div>

      <div v-else-if="filteredConversations.length === 0" class="inbox-state empty" role="status">
        <AppIcon name="message" :size="32" />
        <h2>{{ t('messagingUpdates.noResults') }}</h2>
        <p>{{ t('messagingUpdates.searchHelp') }}</p>
        <button type="button" @click="search = ''">{{ t('messagingUpdates.clearSearch') }}</button>
      </div>
      <ul v-else class="conversation-list">
        <li v-for="conversation in filteredConversations" :key="conversation.id">
          <button
            class="conversation-card"
            :class="{ unread: isConversationUnread(conversation) }"
            type="button"
            :aria-label="conversationAriaLabel(conversation)"
            @click="openConversation(conversation)"
          >
            <span class="pet-photo">
              <ManagedImage
                v-if="normalizedImageUrl(conversation.pet.photo) && !failedPhotos.has(conversation.pet.id)"
                :src="normalizedImageUrl(conversation.pet.photo)"
                :alt="t('pets.photoAlt', { name: conversation.pet.name })"
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
                  {{ conversation.lastMessage.text || (conversation.lastMessage.sharedStray ? t('messages.sharedStray') : t('messages.sharedPhoto')) }}
                </span>
                <span
                  v-if="isConversationUnread(conversation)"
                  class="unread-badge"
                  :aria-label="t('messages.unread')"
                >{{ t('messages.new') }}</span>
              </span>
            </span>
          </button>
        </li>
      </ul>
    </div>
  </section>
</template>

<script setup lang="ts">
import ManagedImage from "./ManagedImage.vue"
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import { getChatInbox, type ChatConversation, type ChatPet } from '../services/api'
import type { User } from '../types/user'
import { translateApiError, useAppI18n } from '../i18n'
import { formatRelativeDate } from '../i18n/formatters'
import { captureAuthContext, isAuthContextCurrent } from '../services/authSession'

const props = defineProps<{ user: User | null }>()
const { t } = useAppI18n()
const emit = defineEmits<{
  'auth-needed': []
  'explore-radar': []
  'open-chat': [pet: ChatPet]
  'unread-change': [count: number]
}>()

const conversations = ref<ChatConversation[]>([])
const search = ref('')
const filteredConversations = computed(() => {
  const query = search.value.trim().normalize('NFKC').toLocaleLowerCase()
  return query ? conversations.value.filter(item => conversationName(item).normalize('NFKC').toLocaleLowerCase().includes(query)) : conversations.value
})
const loading = ref(false)
const error = ref('')
const failedPhotos = ref<Set<string>>(new Set())

const POLL_INTERVAL_MS = 30_000
let requestSequence = 0
let pollTimer: ReturnType<typeof setInterval> | null = null
const refreshing = ref(false)
const authInvalidated = ref(false)

const isAuthenticated = computed(() => {
  if (!props.user || authInvalidated.value) return false
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
    ? conversation.pet.participantName || t('messages.finder')
    : conversation.pet.ownerDisplayName || conversation.pet.owner || t('messages.petOwner')
}

function isConversationUnread(conversation: ChatConversation): boolean {
  return Boolean(props.user && conversation.unreadCount > 0)
}

const unreadCount = computed(
  () => conversations.value.reduce((total, conversation) => total + (Number.isFinite(conversation.unreadCount) ? Math.max(0, Math.trunc(conversation.unreadCount)) : 0), 0),
)

watch(unreadCount, (count) => emit('unread-change', count), { immediate: true })

function openConversation(conversation: ChatConversation) {
  emit('open-chat', conversation.pet)
}

function conversationAriaLabel(conversation: ChatConversation): string {
  const unread = isConversationUnread(conversation) ? `${t('messages.unread')}.` : ''
  return t('messages.openConversation', { unread, name: conversationName(conversation), pet: conversation.pet.name })
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

  const context = captureAuthContext()
  const sequence = ++requestSequence
  const active = () => sequence === requestSequence && isAuthContextCurrent(context)
  refreshing.value = true
  if (showLoading) loading.value = true
  error.value = ''

  try {
    const result = await getChatInbox()
    if (active()) conversations.value = result
  } catch (cause) {
    if (active()) {
      if (showLoading) conversations.value = []
      error.value = translateApiError(cause, 'errors.loadConversations')
    }
  } finally {
    if (active()) { if (showLoading) loading.value = false; refreshing.value = false }
  }
}

function refreshInbox() {
  if (!isAuthenticated.value) {
    emit('auth-needed')
    return
  }
  void loadInbox(true)
}

const relativeTime = formatRelativeDate

function clearInbox() {
  requestSequence++
  refreshing.value = false
  conversations.value = []; failedPhotos.value = new Set(); error.value = ''; loading.value = false
}
function invalidateInbox() { authInvalidated.value = true; search.value = ''; clearInbox() }
function refreshReadState() { clearInbox(); if (props.user) void loadInbox() }

watch(
  () => props.user?.id,
  () => {
    search.value = ''
    clearInbox()
    authInvalidated.value = false
    void loadInbox(true)
  },
  { immediate: true },
)

onMounted(() => {
  window.addEventListener('chat:read', refreshReadState)
  window.addEventListener('auth:changed', invalidateInbox)
  window.addEventListener('auth:unauthorized', invalidateInbox)
  pollTimer = setInterval(() => void loadInbox(false), POLL_INTERVAL_MS)
})

onBeforeUnmount(() => {
  window.removeEventListener('chat:read', refreshReadState)
  window.removeEventListener('auth:changed', invalidateInbox)
  window.removeEventListener('auth:unauthorized', invalidateInbox)
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
  background: var(--page-bg);
}
.conversation-search { position: relative; display: flex; align-items: center; margin-bottom: 14px; }
.conversation-search input { width: 100%; min-width: 0; min-height: 44px; padding: 10px 48px 10px 14px; border: 1px solid var(--color-border); border-radius: 14px; background: var(--color-surface); color: var(--color-text-primary); }
.conversation-search button { position: absolute; right: 0; width: 44px; height: 44px; display: grid; place-items: center; color: var(--color-text-accent); }
.conversation-search :focus-visible { outline: 3px solid var(--color-border-accent); outline-offset: 2px; }

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
  color: var(--color-text-urgent);
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
  color: var(--color-icon-primary);
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
  border-color: var(--color-disabled-border);
  background: var(--color-disabled-surface);
  color: var(--color-disabled-text);
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
  background: var(--color-surface-elevated);
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
  color: var(--color-text-accent);
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
  stroke: var(--color-icon-primary);
  stroke-width: 3;
}

.empty-illustration .paw,
.empty-illustration .paw-pad {
  fill: var(--color-text-urgent);
}

.inbox-state button {
  min-height: 44px;
  margin-top: 18px;
  padding: 0 22px;
  border-radius: 999px;
  background: #1d6360;
  color: var(--color-text-on-accent);
  font-weight: 800;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.inbox-state button:active {
  transform: scale(0.98);
}

.inbox-state.error .empty-icon {
  background: rgba(239, 99, 81, 0.11);
  color: var(--color-text-urgent);
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
  background: var(--color-surface);
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
  background: var(--color-surface-subtle);
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
  color: var(--color-icon-primary);
  font-weight: 850;
}

.pet-context {
  display: block;
  margin-top: 2px;
  color: var(--color-text-accent);
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
  color: var(--color-text-on-coral);
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
