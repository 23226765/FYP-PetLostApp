<template>
  <div class="auth-screen">
    <header class="auth-head">
      <button class="close-btn" :aria-label="t('common.close')" @click="emit('close')">
        <AppIcon name="close" :size="20" />
      </button>
      <div class="logo-circle"><AppIcon name="paw" :size="34" /></div>
      <h1>PawRadar</h1>
      <p class="tagline">{{ t('authentication.tagline') }}</p>
    </header>

    <div class="tabs" role="tablist" :aria-label="t('authentication.mode')">
      <button :class="{ active: mode === 'login' }" @click="switchMode('login')">{{ t('authentication.login') }}</button>
      <button :class="{ active: mode === 'register' }" @click="switchMode('register')">
        {{ t('authentication.signUp') }}
      </button>
    </div>

    <form class="form" @submit.prevent="submit">
      <Transition name="expand">
        <p v-if="error" class="error-banner" role="alert">
          <AppIcon name="close" :size="15" />
          {{ error }}
        </p>
      </Transition>

      <label v-if="mode === 'register'" class="field">
        <span>{{ t('authentication.fullName') }}</span>
        <input v-model="name" type="text" :placeholder="t('authentication.namePlaceholder')" required />
      </label>

      <label class="field">
        <span>{{ t('authentication.email') }}</span>
        <input
          v-model="email"
          type="email"
          :placeholder="t('authentication.emailPlaceholder')"
          autocomplete="email"
          required
        />
      </label>

      <label v-if="mode === 'register'" class="field">
        <span>{{ t('authentication.phone') }}</span>
        <input v-model="phone" type="tel" placeholder="+852 5555 0000" />
      </label>

      <label class="field">
        <span>{{ t('authentication.password') }}</span>
        <input
          v-model="password"
          type="password"
          placeholder="••••••••"
          autocomplete="current-password"
          required
          minlength="6"
        />
      </label>

      <button class="submit-btn" type="submit" :disabled="loading">
        <span v-if="loading" class="spinner" />
        <template v-else>{{ mode === 'login' ? t('authentication.login') : t('authentication.signUp') }}</template>
      </button>
    </form>

    <button class="guest-link" @click="emit('guest')">{{ t('authentication.continueGuest') }}</button>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import AppIcon from './AppIcon.vue'
import { login, register } from '../services/api'
import type { User } from '../types/user'
import { translateApiError, useAppI18n } from '../i18n'

const emit = defineEmits<{ close: []; guest: []; authenticated: [user: User] }>()
const { t } = useAppI18n()

const mode = ref<'login' | 'register'>('login')
const name = ref('')
const email = ref('')
const phone = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')

function switchMode(m: 'login' | 'register') {
  mode.value = m
  error.value = ''
}

async function submit() {
  if (loading.value) return
  loading.value = true
  error.value = ''
  try {
    if (mode.value === 'login') {
      const res = await login({ email: email.value, password: password.value })
      localStorage.setItem('token', res.token)
      emit('authenticated', res.user)
    } else {
      const res = await register({
        name: name.value,
        email: email.value,
        password: password.value,
        phone: phone.value,
      })
      localStorage.setItem('token', res.token)
      emit('authenticated', res.user)
    }
  } catch (e) {
    const err = e as { response?: { data?: { error?: string } }; message?: string }
    error.value = err?.response?.data?.error || err?.message || translateApiError(e)
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.auth-screen {
  position: fixed;
  inset: 0;
  z-index: 80;
  background: var(--bg);
  overflow-y: auto;
  padding: calc(var(--safe-top) + 16px) 22px calc(var(--safe-bottom) + 32px);
  max-width: 480px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
}

.auth-head {
  text-align: center;
  margin-bottom: 22px;
}

.close-btn {
  position: absolute;
  top: calc(var(--safe-top) + 16px);
  right: 22px;
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--surface);
  box-shadow: var(--shadow-card);
  color: var(--ink);
}

.logo-circle {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: var(--teal);
  color: #fff;
  display: grid;
  place-items: center;
  margin: 8px auto 12px;
  box-shadow: var(--shadow-float);
}

h1 {
  font-size: 24px;
  font-weight: 900;
  letter-spacing: -0.02em;
}

.tagline {
  font-size: 14px;
  color: var(--ink-muted);
  font-weight: 600;
  max-width: 280px;
  margin: 6px auto 0;
}

.tabs {
  display: flex;
  background: var(--line);
  border-radius: 999px;
  padding: 4px;
  margin-bottom: 18px;
}

.tabs button {
  flex: 1;
  padding: 10px 0;
  border-radius: 999px;
  font-size: 14px;
  font-weight: 800;
  color: var(--ink-muted);
  transition: all 0.2s ease;
}

.tabs button.active {
  background: var(--surface);
  color: var(--color-text-accent);
  box-shadow: var(--shadow-card);
}

.form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.error-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  background: #fde8e4;
  color: var(--color-text-urgent);
  border-radius: var(--radius-md);
  font-size: 13.5px;
  font-weight: 700;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.field span {
  font-size: 13.5px;
  font-weight: 800;
}

.field input {
  width: 100%;
  padding: 14px 16px;
  border-radius: var(--radius-md);
  border: 1.5px solid var(--line);
  background: var(--surface);
  outline: none;
  transition: border-color 0.15s ease;
}

.field input:focus {
  border-color: var(--color-border-accent);
}

.submit-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 16px 0;
  border-radius: 999px;
  background: var(--teal);
  color: #fff;
  font-size: 15.5px;
  font-weight: 800;
  box-shadow: var(--shadow-float);
  transition: transform 0.15s ease, opacity 0.15s ease;
  margin-top: 6px;
}

.submit-btn:disabled {
  border: 1px solid var(--color-disabled-border);
  background: var(--color-disabled-surface);
  color: var(--color-disabled-text);
  cursor: not-allowed;
  box-shadow: none;
}

.spinner {
  width: 20px;
  height: 20px;
  border: 2.5px solid rgba(255, 255, 255, 0.35);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.guest-link {
  margin-top: 18px;
  text-align: center;
  font-size: 14px;
  font-weight: 800;
  color: var(--color-text-accent);
}

.expand-enter-active,
.expand-leave-active {
  transition: all 0.2s ease;
  overflow: hidden;
}

.expand-enter-from,
.expand-leave-to {
  max-height: 0;
  opacity: 0;
}
</style>
