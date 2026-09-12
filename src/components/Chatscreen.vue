<template>
  <div class="chat">
    <!-- Deep teal header -->
    <header class="chat-header">
      <button class="back-btn" aria-label="Back to pet details" @click="emit('close')">
        <AppIcon name="back" :size="22" />
      </button>
      <img class="pet-avatar" :src="pet.photo" :alt="`Photo of ${pet.name}`" />
      <div class="chat-title">
        <h1>Chatting with {{ pet.owner || 'pet owner' }}</h1>
        <p>Context: {{ pet.name }}</p>
      </div>
    </header>

    <!-- Chat feed -->
    <main ref="feedEl" class="chat-feed" aria-label="Chat messages">
      <p class="day-divider">Today</p>

      <p v-if="loading" class="chat-state" role="status">Loading messages...</p>
      <p v-else-if="error" class="chat-state error" role="alert">{{ error }}</p>
      <p v-else-if="messages.length === 0" class="chat-state">No messages yet.</p>

      <template v-for="msg in messages" :key="msg.id">
        <div class="bubble-row" :class="msg.sender === currentSender ? 'out' : 'in'">
          <img
            v-if="msg.sender !== currentSender"
            class="bubble-avatar"
            :src="pet.photo"
            alt=""
          />
          <div class="bubble" :class="msg.sender === currentSender ? 'out' : 'in'">
            <img
              v-if="msg.photo"
              class="bubble-photo"
              :src="msg.photo"
              :alt="`Photo shared in the chat about ${pet.name}`"
            />
            <p v-if="msg.text">{{ msg.text }}</p>
            <span class="time">{{ formatTime(msg.createdAt) }}</span>
          </div>
        </div>
      </template>
    </main>

    <!-- Input footer -->
    <footer class="chat-footer">
      <button class="attach-btn" aria-label="Attach a photo">
        <AppIcon name="camera" :size="22" />
      </button>
      <input
        v-model="draft"
        class="chat-input"
        type="text"
        placeholder="Type a message&hellip;"
        aria-label="Type a message"
        @keydown.enter="onEnter"
      />
      <button class="send-btn" aria-label="Send message" :disabled="sending" @click="send">
        <AppIcon name="send" :size="19" />
      </button>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import AppIcon from './AppIcon.vue'
import { getMessages, sendMessage, type ChatMessage } from '../services/api'
import type { Pet } from '../types/pet'
import type { User } from '../types/user'

const props = defineProps<{ pet: Pet; user?: User | null }>()
const emit = defineEmits<{ close: [] }>()

const messages = ref<ChatMessage[]>([])
const draft = ref('')
const feedEl = ref<HTMLElement | null>(null)
const loading = ref(true)
const sending = ref(false)
const error = ref('')
const currentSender = computed<ChatMessage['sender']>(() =>
  props.user?.name === props.pet.owner ? 'owner' : 'finder',
)

let pollTimer: ReturnType<typeof setInterval> | null = null
let refreshing = false

function mergeMessages(incoming: ChatMessage[]) {
  const byId = new Map(messages.value.map((message) => [message.id, message]))
  incoming.forEach((message) => byId.set(message.id, message))
  messages.value = [...byId.values()].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  )
}

async function scrollToBottom(behavior: ScrollBehavior = 'auto') {
  await nextTick()
  feedEl.value?.scrollTo({ top: feedEl.value.scrollHeight, behavior })
}

async function loadMessages(showLoading = false) {
  if (refreshing) return
  refreshing = true
  if (showLoading) loading.value = true

  try {
    const previousCount = messages.value.length
    mergeMessages(await getMessages(props.pet.id))
    error.value = ''
    if (showLoading || messages.value.length > previousCount) await scrollToBottom()
  } catch (e) {
    if (showLoading) {
      error.value = e instanceof Error ? e.message : 'Failed to load messages.'
    }
  } finally {
    refreshing = false
    if (showLoading) loading.value = false
  }
}

function onEnter(e: KeyboardEvent) {
  if (e.isComposing || e.keyCode === 229) return
  void send()
}

async function send() {
  const text = draft.value.trim()
  if (!text || sending.value) return

  sending.value = true
  error.value = ''
  try {
    const message = await sendMessage(props.pet.id, {
      sender: currentSender.value,
      text,
    })
    mergeMessages([message])
    draft.value = ''
    await scrollToBottom('smooth')
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to send message.'
  } finally {
    sending.value = false
  }
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

onMounted(async () => {
  await loadMessages(true)
  pollTimer = setInterval(() => void loadMessages(), 5000)
})

onBeforeUnmount(() => {
  if (pollTimer) clearInterval(pollTimer)
})
</script>

<style scoped>
.chat {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  flex-direction: column;
  background: #fcf9f2;
  max-width: 480px;
  margin: 0 auto;
}

/* Header */
.chat-header {
  display: flex;
  align-items: center;
  gap: 12px;
  background: #1d6360;
  padding: calc(var(--safe-top) + 14px) 16px 14px;
  border-radius: 0 0 24px 24px;
  flex-shrink: 0;
}

.back-btn {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border-radius: 50%;
  color: #ffffff;
  flex-shrink: 0;
  transition: background 0.15s ease;
}

.back-btn:active {
  background: rgba(255, 255, 255, 0.15);
}

.pet-avatar {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid rgba(255, 255, 255, 0.6);
  flex-shrink: 0;
}

.chat-title {
  min-width: 0;
}

.chat-title h1 {
  color: #ffffff;
  font-size: 16px;
  font-weight: 800;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chat-title p {
  color: rgba(255, 255, 255, 0.75);
  font-size: 12px;
  font-weight: 700;
}

/* Feed */
.chat-feed {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 18px 16px 12px;
  -webkit-overflow-scrolling: touch;
}

.day-divider {
  align-self: center;
  font-size: 11.5px;
  font-weight: 800;
  color: #8b827a;
  background: rgba(61, 56, 53, 0.06);
  border-radius: 999px;
  padding: 4px 14px;
  margin-bottom: 2px;
}

.chat-state {
  align-self: center;
  padding: 12px 16px;
  color: #8b827a;
  font-size: 13px;
  font-weight: 700;
  text-align: center;
}

.chat-state.error {
  color: #ef6351;
}

.bubble-row {
  display: flex;
  align-items: flex-end;
  gap: 8px;
}

.bubble-row.in {
  justify-content: flex-start;
}

.bubble-row.out {
  justify-content: flex-end;
}

.bubble-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}

.bubble {
  max-width: 76%;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 11px 14px;
  font-size: 14.5px;
  line-height: 1.45;
  box-shadow: 0 1px 6px rgba(61, 56, 53, 0.07);
}

.bubble.in {
  background: #ffffff;
  color: #3d3835;
  border-radius: 18px 18px 18px 4px;
}

.bubble.out {
  background: #1d6360;
  color: #ffffff;
  border-radius: 18px 18px 4px 18px;
}

.bubble-photo {
  width: 100%;
  border-radius: 12px;
  object-fit: cover;
  aspect-ratio: 4 / 3;
}

.bubble .time {
  font-size: 10.5px;
  font-weight: 700;
  align-self: flex-end;
}

.bubble.in .time {
  color: #8b827a;
}

.bubble.out .time {
  color: rgba(255, 255, 255, 0.65);
}

/* Footer */
.chat-footer {
  display: flex;
  align-items: center;
  gap: 10px;
  background: #ffffff;
  padding: 12px 14px calc(var(--safe-bottom) + 14px);
  border-top: 1px solid rgba(61, 56, 53, 0.08);
  flex-shrink: 0;
}

.attach-btn {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border-radius: 50%;
  color: #1d6360;
  flex-shrink: 0;
  transition: background 0.15s ease;
}

.attach-btn:active {
  background: rgba(29, 99, 96, 0.1);
}

.chat-input {
  flex: 1;
  min-width: 0;
  border: 1.5px solid rgba(61, 56, 53, 0.1);
  background: #fcf9f2;
  border-radius: 999px;
  padding: 12px 18px;
  font-size: 14.5px;
  color: #3d3835;
  outline: none;
}

.chat-input:focus {
  border-color: #1d6360;
}

.chat-input::placeholder {
  color: #8b827a;
}

.send-btn {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: #1d6360;
  color: #ffffff;
  flex-shrink: 0;
  box-shadow: 0 4px 12px rgba(29, 99, 96, 0.35);
  transition: transform 0.15s ease;
}

.send-btn:active {
  transform: scale(0.9);
}

.send-btn:disabled {
  opacity: 0.65;
}
</style>
