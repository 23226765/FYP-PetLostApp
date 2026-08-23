<template>
  <div class="chat">
    <!-- Deep teal header -->
    <header class="chat-header">
      <button class="back-btn" aria-label="Back to messages" @click="emit('back')">
        <AppIcon name="back" :size="22" />
      </button>
      <img class="pet-avatar" src="https://images.unsplash.com/photo-1552053831-71594a27632d?auto=format&fit=crop&w=600&q=80" alt="Buddy the golden retriever" />
      <div class="chat-title">
        <h1>Chatting with Sarah Chen</h1>
        <p>[Context: Buddy]</p>
      </div>
    </header>

    <!-- Chat feed -->
    <main ref="feedEl" class="chat-feed" aria-label="Chat messages">
      <p class="day-divider">Today</p>

      <template v-for="msg in messages" :key="msg.id">
        <div class="bubble-row" :class="msg.from === 'me' ? 'out' : 'in'">
          <img
            v-if="msg.from === 'them'"
            class="bubble-avatar"
            src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=600&q=80"
            alt=""
          />
          <div class="bubble" :class="msg.from === 'me' ? 'out' : 'in'">
            <img
              v-if="msg.photo"
              class="bubble-photo"
              :src="msg.photo"
              alt="Sighting photo of a golden retriever with a blue collar near the park entrance"
            />
            <p v-if="msg.text">{{ msg.text }}</p>
            <span class="time">{{ msg.time }}</span>
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
      <button class="send-btn" aria-label="Send message" @click="send">
        <AppIcon name="send" :size="19" />
      </button>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { nextTick, ref } from 'vue'
import AppIcon from './AppIcon.vue'

const emit = defineEmits<{ back: [] }>()

interface ChatMessage {
  id: number
  from: 'me' | 'them'
  text?: string
  photo?: string
  time: string
}

const messages = ref<ChatMessage[]>([
  {
    id: 1,
    from: 'them',
    text: "Hi! I think I just saw Buddy near the Elm Street park entrance. He's wearing a blue collar, right?",
    time: '4:02 PM',
  },
  {
    id: 2,
    from: 'me',
    text: "Yes, that's him! A blue collar with a silver tag. Was he heading anywhere in particular?",
    time: '4:03 PM',
  },
  {
    id: 3,
    from: 'them',
    photo: 'https://images.unsplash.com/photo-1518717758536-85ae29035b6d?auto=format&fit=crop&w=600&q=80',
    text: 'I managed to snap this before he trotted off toward the duck pond. Definitely looks like him!',
    time: '4:05 PM',
  },
  {
    id: 4,
    from: 'me',
    text: "That's 100% Buddy! Thank you so much. I'm 5 minutes away, heading there now!",
    time: '4:06 PM',
  },
])

const draft = ref('')
const feedEl = ref<HTMLElement | null>(null)

function onEnter(e: KeyboardEvent) {
  if (e.isComposing || e.keyCode === 229) return
  send()
}

function send() {
  const text = draft.value.trim()
  if (!text) return
  messages.value.push({
    id: Date.now(),
    from: 'me',
    text,
    time: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
  })
  draft.value = ''
  nextTick(() => {
    feedEl.value?.scrollTo({ top: feedEl.value.scrollHeight, behavior: 'smooth' })
  })
}
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
</style>
