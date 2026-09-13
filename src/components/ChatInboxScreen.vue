<template>
  <div class="inbox">
    <header class="inbox-header">
      <button class="back-button" type="button" aria-label="Close messages" @click="emit('close')">
        <AppIcon name="back" :size="21" />
      </button>
      <div>
        <h1>Messages</h1>
        <p>Conversations about nearby pets</p>
      </div>
    </header>

    <main class="inbox-content">
      <p v-if="loading" class="inbox-state" role="status">Loading conversations...</p>
      <div v-else-if="error" class="inbox-state error" role="alert">
        <p>{{ error }}</p>
        <button type="button" @click="loadInbox">Try again</button>
      </div>
      <div v-else-if="conversations.length === 0" class="inbox-state empty">
        <span class="empty-icon"><AppIcon name="send" :size="28" /></span>
        <h2>No conversations yet</h2>
        <p>Messages you send about a pet will appear here.</p>
      </div>
      <ul v-else class="conversation-list">
        <li v-for="conversation in conversations" :key="conversation.id">
          <button
            class="conversation-card"
            type="button"
            :aria-label="`Open conversation about ${conversation.pet.name}`"
            @click="emit('open-chat', conversation.pet)"
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
                <AppIcon name="paw" :size="27" />
              </span>
            </span>
            <span class="conversation-copy">
              <span class="conversation-title">
                <strong>
                  {{ conversation.pet.name }}
                  <template v-if="conversation.pet.participantName">
                    · {{ conversation.pet.participantName }}
                  </template>
                </strong>
                <time :datetime="conversation.updatedAt">
                  {{ relativeTime(conversation.updatedAt) }}
                </time>
              </span>
              <span class="message-preview">
                {{ conversation.lastMessage.sender === 'owner' ? 'Owner: ' : 'Finder: ' }}
                {{ conversation.lastMessage.text || 'Shared a photo' }}
              </span>
            </span>
            <AppIcon class="chevron" name="chevron" :size="17" />
          </button>
        </li>
      </ul>
    </main>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import AppIcon from './AppIcon.vue'
import { getChatInbox, type ChatConversation, type ChatPet } from '../services/api'

const emit = defineEmits<{
  close: []
  'open-chat': [pet: ChatPet]
}>()

const conversations = ref<ChatConversation[]>([])
const loading = ref(true)
const error = ref('')
const failedPhotos = ref<Set<string>>(new Set())
let requestSequence = 0

function normalizedImageUrl(value: string | null | undefined): string {
  const photo = value?.trim()
  if (!photo) return ''

  try {
    const apiUrl = new URL(
      import.meta.env.VITE_API_BASE_URL || '/api',
      window.location.origin,
    )
    const resolved = new URL(photo, `${apiUrl.origin}/`)
    return ['http:', 'https:', 'data:', 'blob:'].includes(resolved.protocol) ? resolved.href : ''
  } catch {
    return ''
  }
}

function markPhotoFailed(petId: string) {
  failedPhotos.value = new Set([...failedPhotos.value, petId])
}

async function loadInbox() {
  const sequence = ++requestSequence
  loading.value = true
  error.value = ''
  failedPhotos.value = new Set()

  try {
    const result = await getChatInbox()
    if (sequence === requestSequence) conversations.value = result
  } catch (cause) {
    if (sequence === requestSequence) {
      conversations.value = []
      error.value = cause instanceof Error ? cause.message : 'Failed to load conversations.'
    }
  } finally {
    if (sequence === requestSequence) loading.value = false
  }
}

function relativeTime(value: string) {
  const elapsed = Math.max(0, Date.now() - new Date(value).getTime())
  const minutes = Math.floor(elapsed / 60000)
  if (minutes < 1) return 'Now'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`
  return new Date(value).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

onMounted(loadInbox)
onBeforeUnmount(() => {
  requestSequence += 1
})
</script>

<style scoped>
.inbox {
  position: fixed;
  inset: 0;
  z-index: 49;
  width: 100%;
  max-width: 480px;
  margin: 0 auto;
  overflow-y: auto;
  background: #fcf9f2;
}

.inbox-header {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: calc(var(--safe-top) + 18px) 20px 18px;
  border-radius: 0 0 24px 24px;
  background: #1d6360;
  color: #fff;
  box-shadow: 0 8px 24px rgba(29, 99, 96, 0.18);
}

.back-button {
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.back-button:active {
  transform: scale(0.98);
  background: rgba(255, 255, 255, 0.2);
}

h1 {
  font-size: 22px;
  font-weight: 800;
}

.inbox-header p {
  margin-top: 1px;
  color: rgba(255, 255, 255, 0.72);
  font-size: 12.5px;
  font-weight: 650;
}

.inbox-content {
  padding: 20px 18px calc(var(--safe-bottom) + 30px);
}

.inbox-state {
  padding: 24px 18px;
  border: 1px solid rgba(29, 99, 96, 0.08);
  border-radius: 18px;
  background: #fff;
  color: var(--ink-muted);
  box-shadow:
    0 2px 5px rgba(29, 99, 96, 0.04),
    0 12px 28px rgba(29, 99, 96, 0.07);
  font-size: 13.5px;
  font-weight: 700;
  text-align: center;
}

.inbox-state.error {
  color: #ef6351;
}

.inbox-state.error button {
  min-height: 44px;
  margin-top: 12px;
  padding: 0 18px;
  border-radius: 999px;
  background: #1d6360;
  color: #fff;
  font-weight: 800;
}

.inbox-state.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.empty-icon {
  width: 58px;
  height: 58px;
  display: grid;
  place-items: center;
  margin-bottom: 12px;
  border-radius: 20px;
  background: rgba(29, 99, 96, 0.1);
  color: #1d6360;
}

.empty h2 {
  color: var(--ink);
  font-size: 17px;
}

.empty p {
  max-width: 260px;
  margin-top: 5px;
  font-weight: 600;
}

.conversation-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  list-style: none;
}

.conversation-card {
  width: 100%;
  min-height: 82px;
  display: flex;
  align-items: center;
  gap: 13px;
  padding: 12px 14px;
  border: 1px solid rgba(29, 99, 96, 0.08);
  border-radius: 18px;
  background: #fff;
  color: var(--ink);
  text-align: left;
  box-shadow:
    0 2px 5px rgba(29, 99, 96, 0.04),
    0 10px 24px rgba(29, 99, 96, 0.065);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.conversation-card:active {
  transform: scale(0.98);
  box-shadow: 0 3px 10px rgba(29, 99, 96, 0.08);
}

.pet-photo {
  position: relative;
  width: 58px;
  height: 58px;
  flex-shrink: 0;
  overflow: hidden;
  border-radius: 16px;
  background: #fcf9f2;
}

.pet-photo img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.photo-placeholder {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: #fcf9f2;
  color: rgba(29, 99, 96, 0.55);
}

.conversation-copy {
  flex: 1;
  min-width: 0;
}

.conversation-title {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.conversation-title strong {
  overflow: hidden;
  font-size: 15px;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.conversation-title time {
  flex-shrink: 0;
  color: var(--ink-muted);
  font-size: 11px;
  font-weight: 700;
}

.message-preview {
  display: block;
  margin-top: 5px;
  overflow: hidden;
  color: var(--ink-muted);
  font-size: 12.5px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chevron {
  flex-shrink: 0;
  color: #1d6360;
}
</style>
