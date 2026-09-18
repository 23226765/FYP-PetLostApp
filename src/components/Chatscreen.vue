<template>
  <div class="chat">
    <!-- Deep teal header -->
    <header class="chat-header">
      <button class="back-btn" aria-label="Back to pet details" @click="emit('close')">
        <AppIcon name="back" :size="22" />
      </button>
      <img class="pet-avatar" :src="pet.photo" :alt="`Photo of ${pet.name}`" />
      <div class="chat-title">
        <h1>
          {{
            currentSender === 'owner'
              ? `Chatting with ${pet.participantName || 'finder'}`
              : `Chatting with ${pet.owner || 'pet owner'}`
          }}
        </h1>
        <p>Context: {{ pet.name }}</p>
      </div>
      <div v-if="ownerContactActions" class="header-contact">
        <a
          class="contact-btn"
          :href="ownerContactActions.callHref"
          :aria-label="`Call ${pet.owner || 'the pet owner'}`"
        >
          <AppIcon name="phone" :size="17" />
        </a>
        <a
          class="contact-btn whatsapp"
          :href="ownerContactActions.whatsappHref"
          target="_blank"
          rel="noopener noreferrer"
          :aria-label="`Message ${pet.owner || 'the pet owner'} on WhatsApp`"
        >
          WA
        </a>
      </div>
      <span
        v-else-if="currentSender === 'finder'"
        class="contact-missing"
        aria-label="Owner accepts contact through PawRadar messages"
      >
        Message only
      </span>
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
            <button v-if="msg.sharedStray" class="shared-post" type="button" @click="openSharedPost(msg.sharedStray.id)">
              <img v-if="msg.sharedStray.photo" :src="imageUrl(msg.sharedStray.photo)" alt="" />
              <span><strong>{{ msg.sharedStray.species }} rescue post</strong><small>{{ msg.sharedStray.location }}, {{ msg.sharedStray.district }}</small><span>{{ msg.sharedStray.description }}</span></span>
            </button>
            <div v-else-if="msg.sharedStrayUnavailable" class="shared-unavailable">This post is no longer available.</div>
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
      <div v-if="pendingPhoto" class="attachment-preview">
        <img :src="pendingPhoto" alt="Photo ready to send" />
        <button type="button" aria-label="Remove attached photo" @click="pendingPhoto = ''">
          <AppIcon name="close" :size="14" />
        </button>
      </div>
      <input
        ref="attachmentInput"
        class="attachment-input"
        type="file"
        accept="image/*"
        @change="onAttachmentSelected"
      />
      <button class="attach-btn" type="button" aria-label="Attach a photo" @click="attachPhoto">
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
      <button
        class="send-btn"
        aria-label="Send message"
        :disabled="sending || loading"
        @click="send"
      >
        <AppIcon name="send" :size="19" />
      </button>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Camera, CameraResultType } from '@capacitor/camera'
import AppIcon from './AppIcon.vue'
import {
  getMessages,
  sendMessage,
  type ChatMessage,
  type ChatPet,
} from '../services/api'
import type { User } from '../types/user'
import { createContactActions } from '../utils/contact'

const props = defineProps<{ pet: ChatPet; user?: User | null }>()
const emit = defineEmits<{ close: [] }>()
const router = useRouter()

const messages = ref<ChatMessage[]>([])
const draft = ref('')
const pendingPhoto = ref('')
const attachmentInput = ref<HTMLInputElement | null>(null)
const feedEl = ref<HTMLElement | null>(null)
const loading = ref(true)
const sending = ref(false)
const error = ref('')
const currentSender = ref<ChatMessage['sender'] | null>(null)
const ownerContactActions = computed(() => {
  if (currentSender.value !== 'finder') return null
  if (!props.pet.canViewContact) return null
  const message = `Hi, I'm contacting you through PawRadar about ${props.pet.name}.`
  return createContactActions(props.pet.ownerPhone, message)
})

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
    const thread = await getMessages(props.pet.id, props.pet.participantId)
    currentSender.value = thread.viewerRole
    mergeMessages(thread.messages)
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

function setPendingPhoto(dataUrl: string) {
  if (dataUrl.length > 1_500_000) {
    error.value = 'Photo is too large. Choose a smaller image.'
    return
  }
  pendingPhoto.value = dataUrl
  error.value = ''
}

async function attachPhoto() {
  try {
    const image = await Camera.getPhoto({
      resultType: CameraResultType.DataUrl,
      quality: 70,
      allowEditing: false,
    })
    if (image.dataUrl) setPendingPhoto(image.dataUrl)
  } catch {
    attachmentInput.value?.click()
  }
}

function onAttachmentSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  if (!file.type.startsWith('image/')) {
    error.value = 'Choose a valid image file.'
    input.value = ''
    return
  }

  const reader = new FileReader()
  reader.onload = () => {
    if (typeof reader.result === 'string') setPendingPhoto(reader.result)
    input.value = ''
  }
  reader.onerror = () => {
    error.value = 'Unable to read the selected image.'
    input.value = ''
  }
  reader.readAsDataURL(file)
}

async function send() {
  const text = draft.value.trim()
  const photo = pendingPhoto.value
  if ((!text && !photo) || sending.value) return

  sending.value = true
  error.value = ''
  try {
    const message = await sendMessage(props.pet.id, {
      text,
      photo: photo || undefined,
      participantId: props.pet.participantId,
    })
    currentSender.value = message.sender
    mergeMessages([message])
    draft.value = ''
    pendingPhoto.value = ''
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

function imageUrl(value: string) {
  try { const api = new URL(import.meta.env.VITE_API_BASE_URL || '/api', window.location.origin); return new URL(value, `${api.origin}/`).href } catch { return '' }
}

function openSharedPost(id: string) {
  emit('close')
  void router.push(`/strays/${id}`)
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
  flex: 1;
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

.header-contact {
  display: flex;
  align-items: center;
  gap: 7px;
  flex-shrink: 0;
}

.contact-btn {
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  border: 1px solid rgba(255, 255, 255, 0.24);
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.12);
  color: #ffffff;
  font-size: 10.5px;
  font-weight: 900;
  letter-spacing: -0.02em;
  text-decoration: none;
  transition: transform 0.18s ease, background-color 0.18s ease;
}

.contact-btn.whatsapp {
  background: rgba(252, 249, 242, 0.18);
}

.contact-btn:active {
  transform: scale(0.92);
  background: rgba(255, 255, 255, 0.22);
}

.contact-missing {
  max-width: 42px;
  color: rgba(255, 255, 255, 0.72);
  font-size: 9.5px;
  font-weight: 800;
  line-height: 1.15;
  text-align: center;
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
  flex-wrap: wrap;
}

.shared-post { width: min(250px, 66vw); overflow: hidden; border-radius: 12px; background: rgba(252,249,242,.96); color: #3d3835; text-align: left; }
.shared-post > img { width: 100%; aspect-ratio: 16/9; object-fit: cover; }
.shared-post > span { display: grid; gap: 3px; padding: 10px; }
.shared-post strong { color: #1d6360; font-size: 12px; }
.shared-post small,.shared-post span span { overflow: hidden; font-size: 10.5px; text-overflow: ellipsis; white-space: nowrap; }
.shared-unavailable { padding: 10px; border-radius: 10px; background: rgba(239,99,81,.1); color: #ef6351; font-size: 12px; font-weight: 750; }

.attachment-input {
  display: none;
}

.attachment-preview {
  position: relative;
  width: 100%;
  height: 84px;
  overflow: hidden;
  border-radius: 14px;
  background: #fcf9f2;
}

.attachment-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.attachment-preview button {
  position: absolute;
  top: 7px;
  right: 7px;
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: rgba(29, 99, 96, 0.9);
  color: #fff;
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
