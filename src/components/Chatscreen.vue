<template>
  <div class="chat">
    <!-- Deep teal header -->
    <header class="chat-header">
      <button class="back-btn" :aria-label="t('messages.backToPet')" @click="emit('close')">
        <AppIcon name="back" :size="22" />
      </button>
      <ManagedImage class="pet-avatar" :src="pet.photo" :alt="t('pets.photoAlt', { name: pet.name })" />
      <div class="chat-title">
        <h1>
          {{
            currentSender === 'owner'
              ? t('messages.chattingWith', { name: pet.participantName || t('messages.finder') })
              : t('messages.chattingWith', { name: pet.owner || t('messages.petOwner') })
          }}
        </h1>
        <p>{{ t('messages.context', { name: pet.name }) }}</p>
      </div>
      <div v-if="ownerContactActions" class="header-contact">
        <a
          class="contact-btn"
          :href="ownerContactActions.callHref"
          :aria-label="t('pets.callOwner', { owner: pet.owner || t('messages.petOwner') })"
        >
          <AppIcon name="phone" :size="17" />
        </a>
        <a
          class="contact-btn whatsapp"
          :href="ownerContactActions.whatsappHref"
          target="_blank"
          rel="noopener noreferrer"
          :aria-label="t('pets.whatsappOwner', { owner: pet.owner || t('messages.petOwner') })"
        >
          WA
        </a>
      </div>
      <span
        v-else-if="currentSender === 'finder'"
        class="contact-missing"
        :aria-label="t('pets.messagesOnlyA11y')"
      >
        {{ t('messages.messageOnly') }}
      </span>
    </header>
    <SafetyActions
      v-if="counterpartId"
      class="chat-safety"
      target-type="user"
      :target-id="counterpartId"
      :subject-user-id="counterpartId"
      :subject-label="counterpartName"
      :user="user"
      @blocked="emit('close')"
    />

    <!-- Chat feed -->
    <main ref="feedEl" class="chat-feed" :aria-label="t('messages.chatMessages')">
      <p class="day-divider">{{ t('common.today') }}</p>

      <p v-if="loading" class="chat-state" role="status">{{ t('messages.loadingMessages') }}</p>
      <p v-else-if="error" class="chat-state error" role="alert">{{ error }}</p>
      <p v-else-if="messages.length === 0" class="chat-state">{{ t('messages.noMessages') }}</p>

      <template v-for="msg in messages" :key="msg.id">
        <div class="bubble-row" :class="msg.sender === currentSender ? 'out' : 'in'">
          <ManagedImage
            v-if="msg.sender !== currentSender"
            class="bubble-avatar"
            :src="pet.photo"
            alt=""
          />
          <div class="bubble" :class="msg.sender === currentSender ? 'out' : 'in'">
            <button v-if="msg.sharedStray" class="shared-post" type="button" @click="openSharedPost(msg.sharedStray.id)">
              <ManagedImage v-if="msg.sharedStray.photo" :src="imageUrl(msg.sharedStray.photo)" alt="" />
              <span><strong>{{ t('messages.sharedRescuePost', { species: strayAnimalLabel(msg.sharedStray.species, msg.sharedStray.animalType) }) }}</strong><small>{{ msg.sharedStray.location }}, {{ districtLabel(msg.sharedStray.district) }}</small><span>{{ msg.sharedStray.description }}</span></span>
            </button>
            <div v-else-if="msg.sharedStrayUnavailable" class="shared-unavailable">{{ t('messages.sharedUnavailable') }}</div>
            <ManagedImage
              v-if="msg.photo"
              class="bubble-photo"
              :src="msg.photo"
              :alt="t('messages.sharedChatPhotoAlt', { name: pet.name })"
            />
            <p v-if="msg.text">{{ msg.text }}</p>
            <ContentImageEditor v-if="msg.sender === currentSender && !sending" type="message" :id="msg.id" :allow-remove="Boolean(msg.text || msg.sharedStray)" @updated="images => { msg.photo = images[0]?.url || '' }" />
            <span class="time">{{ formatTime(msg.createdAt) }}</span>
            <SafetyActions
              v-if="msg.sender !== currentSender"
              compact
              report-only
              target-type="message"
              :target-id="msg.id"
              :user="user"
            />
          </div>
        </div>
      </template>
    </main>

    <!-- Input footer -->
    <footer class="chat-footer">
      <div v-if="pendingPhoto" class="attachment-preview">
        <ManagedImage :src="pendingPhoto" :alt="t('messages.readyPhotoAlt')" />
        <button type="button" :disabled="sending" :aria-label="t('messages.removePhoto')" @click="imageUpload.reset()">
          <AppIcon name="close" :size="14" />
        </button>
      </div>
      <ImageUploadStatus :upload="imageUpload" />
      <input
        ref="attachmentInput"
        class="attachment-input"
        type="file"
        accept="image/*"
        @change="onAttachmentSelected"
      />
      <button class="attach-btn" type="button" :disabled="sending" :aria-label="t('messages.attachPhoto')" @click="attachPhoto">
        <AppIcon name="camera" :size="22" />
      </button>
      <input
        v-model="draft"
        class="chat-input"
        type="text"
        :placeholder="t('messages.typeMessage')"
        :aria-label="t('messages.typeMessage')"
        @keydown.enter="onEnter"
      />
      <button
        class="send-btn"
        :aria-label="t('messages.sendMessage')"
        :disabled="sending || loading"
        @click="send"
      >
        <AppIcon name="send" :size="19" />
      </button>
    </footer>
  </div>
</template>

<script setup lang="ts">
import ManagedImage from "./ManagedImage.vue"
import ContentImageEditor from './ContentImageEditor.vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { captureAuthContext, isAuthContextCurrent } from '../services/authSession'
import { useRouter } from 'vue-router'
import { Camera, CameraResultType } from '@capacitor/camera'
import { useImageUpload, createImageRequestId } from '../composables/useImageUpload'
import ImageUploadStatus from './ImageUploadStatus.vue'
import AppIcon from './AppIcon.vue'
import SafetyActions from './SafetyActions.vue'
import {
  getMessages,
  sendMessage,
  type ChatMessage,
  type ChatPet,
} from '../services/api'
import type { User } from '../types/user'
import { createContactActions } from '../utils/contact'
import { translateApiError, useAppI18n } from '../i18n'
import { districtLabel, strayAnimalLabel } from '../i18n/formatters'

const props = defineProps<{ pet: ChatPet; user?: User | null }>()
const emit = defineEmits<{ close: [] }>()
const router = useRouter()
const { t } = useAppI18n()

const messages = ref<ChatMessage[]>([])
const draft = ref('')
const imageUpload = useImageUpload('message')
const pendingPhoto = computed(() => imageUpload.preview)
let clientRequestId = createImageRequestId()
const attachmentInput = ref<HTMLInputElement | null>(null)
const feedEl = ref<HTMLElement | null>(null)
const loading = ref(true)
const sending = ref(false)
const error = ref('')
const currentSender = ref<ChatMessage['sender'] | null>(null)
const counterpartId = computed(() => currentSender.value === 'owner' ? props.pet.participantId : props.pet.reportedBy)
const counterpartName = computed(() => currentSender.value === 'owner' ? props.pet.participantName : props.pet.owner)
const ownerContactActions = computed(() => {
  if (currentSender.value !== 'finder') return null
  if (!props.pet.canViewContact) return null
  const message = t('pets.contactMessage', { name: props.pet.name, location: '' })
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
      error.value = translateApiError(e, 'errors.loadMessages')
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
  imageUpload.select(dataUrl)
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
    error.value = t('validation.imageType')
    input.value = ''
    return
  }

  imageUpload.select(file)
  input.value = ''
}

async function send() {
  const context = captureAuthContext()
  const petId = props.pet.id, participantId = props.pet.participantId
  const active = () => !disposed && isAuthContextCurrent(context) && props.pet.id === petId && props.pet.participantId === participantId
  const text = draft.value.trim()
  const photo = pendingPhoto.value
  if ((!text && !photo) || sending.value) return

  sending.value = true
  error.value = ''
  try {
    const imageIds = await imageUpload.ensure()
    if (!active()) return
    const message = await sendMessage(petId, {
      text,
      imageIds,
      clientRequestId,
      participantId,
    })
    if (!active()) return
    currentSender.value = message.sender
    mergeMessages([message])
    draft.value = ''
    imageUpload.finish()
    clientRequestId = createImageRequestId()
    await scrollToBottom('smooth')
  } catch (e) {
    if (active()) error.value = translateApiError(e, 'errors.sendMessage')
  } finally {
    if (active()) sending.value = false
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

let disposed = false
onMounted(async () => {
  const context = captureAuthContext()
  await loadMessages(true)
  if (disposed || !isAuthContextCurrent(context)) return
  pollTimer = setInterval(() => void loadMessages(), 5000)
})

onBeforeUnmount(() => {
  disposed = true
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

.chat-safety { padding: 2px 14px; background: var(--color-surface); border-bottom: 1px solid var(--color-border); }

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
  color: var(--color-text-muted);
  background: rgba(61, 56, 53, 0.06);
  border-radius: 999px;
  padding: 4px 14px;
  margin-bottom: 2px;
}

.chat-state {
  align-self: center;
  padding: 12px 16px;
  color: var(--color-text-muted);
  font-size: 13px;
  font-weight: 700;
  text-align: center;
}

.chat-state.error {
  color: var(--color-text-urgent);
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
  background: var(--color-surface-elevated);
  color: var(--color-text-primary);
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
  color: var(--color-text-muted);
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

.shared-post { width: min(250px, 66vw); overflow: hidden; border-radius: 12px; background: var(--color-surface-subtle); color: var(--color-text-primary); text-align: left; }
.shared-post > img { width: 100%; aspect-ratio: 16/9; object-fit: cover; }
.shared-post > span { display: grid; gap: 3px; padding: 10px; }
.shared-post strong { color: var(--color-text-accent); font-size: 12px; }
.shared-post small,.shared-post span span { overflow: hidden; font-size: 10.5px; text-overflow: ellipsis; white-space: nowrap; }
.shared-unavailable { padding: 10px; border-radius: 10px; background: rgba(239,99,81,.1); color: var(--color-text-urgent); font-size: 12px; font-weight: 750; }

.attachment-input {
  display: none;
}

.attachment-preview {
  position: relative;
  width: 100%;
  height: 84px;
  overflow: hidden;
  border-radius: 14px;
  background: var(--page-bg);
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
  color: var(--color-icon-primary);
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
  border-color: var(--color-border-accent);
}

.chat-input::placeholder {
  color: var(--color-text-muted);
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
  border: 1px solid var(--color-disabled-border);
  background: var(--color-disabled-surface);
  color: var(--color-disabled-text);
  cursor: not-allowed;
  box-shadow: none;
}
</style>
