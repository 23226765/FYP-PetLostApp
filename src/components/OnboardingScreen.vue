<template>
  <!--
    OnboardingScreen.vue
    ────────────────────
    Login / sign-up gate. Emits 'done' when the user submits the form.
    Includes:
      • Email + password fields with validation feedback
      • Location permission card with granted state
      • Sign in / Create account toggle
      • Loading spinner on submit
  -->
  <div class="onboarding">
    <header class="welcome">
      <!-- Paw icon as logo fallback -->
      <div class="logo-circle">
        <AppIcon name="paw" :size="38" />
      </div>
      <h1>PawRadar</h1>
      <p class="tagline">Your neighborhood is watching out for every lost pet. Welcome home.</p>
    </header>

    <form class="login" @submit.prevent="submit">

      <!-- Error banner -->
      <Transition name="expand">
        <div v-if="error" class="error-banner" role="alert">
          <AppIcon name="close" :size="15" />
          {{ error }}
        </div>
      </Transition>

      <label class="field">
        <span class="sr-only">Email</span>
        <input
          v-model="email"
          type="email"
          placeholder="Email address"
          autocomplete="email"
          :class="{ invalid: touched && !emailValid }"
          @blur="touched = true"
        />
      </label>

      <label class="field">
        <span class="sr-only">Password</span>
        <div class="pw-wrap">
          <input
            v-model="password"
            :type="showPw ? 'text' : 'password'"
            placeholder="Password"
            autocomplete="current-password"
            :class="{ invalid: touched && password.length < 6 && password.length > 0 }"
          />
          <button type="button" class="pw-toggle" :aria-label="showPw ? 'Hide password' : 'Show password'" @click="showPw = !showPw">
            <AppIcon :name="showPw ? 'close' : 'eye'" :size="17" />
          </button>
        </div>
      </label>

      <!-- Location permission card -->
      <section class="location-card" aria-label="Location permission">
        <span class="pin-badge">
          <AppIcon name="pin" :size="26" />
        </span>
        <h2>Location Permission</h2>
        <p>We need your location to alert you when a pet goes missing nearby.</p>
        <button
          type="button"
          class="allow-btn"
          :class="{ granted: locationGranted }"
          @click="allowLocation"
        >
          <AppIcon :name="locationGranted ? 'check' : 'pin'" :size="19" />
          {{ locationGranted ? 'Location enabled ✓' : 'Allow Location' }}
        </button>
      </section>

      <!-- Submit -->
      <button type="submit" class="signin-btn" :disabled="loading">
        <span v-if="loading" class="spinner" />
        <template v-else>
          {{ isSignUp ? 'Create account &amp; start helping' : 'Sign in &amp; start helping' }}
        </template>
      </button>

      <p class="alt">
        {{ isSignUp ? 'Already have an account?' : 'New here?' }}
        <button type="button" class="link" @click="isSignUp = !isSignUp">
          {{ isSignUp ? 'Sign in' : 'Create an account' }}
        </button>
      </p>

    </form>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import AppIcon from './AppIcon.vue'

const emit = defineEmits<{ done: [] }>()

const email = ref('')
const password = ref('')
const showPw = ref(false)
const locationGranted = ref(false)
const isSignUp = ref(false)
const loading = ref(false)
const error = ref('')
const touched = ref(false)

const emailValid = computed(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value))

function allowLocation() {
  locationGranted.value = true
}

async function submit() {
  touched.value = true
  error.value = ''

  if (!emailValid.value) { error.value = 'Please enter a valid email address.'; return }
  if (password.value.length < 6) { error.value = 'Password must be at least 6 characters.'; return }

  loading.value = true
  // Simulate network delay
  await new Promise((r) => setTimeout(r, 900))
  loading.value = false
  emit('done')
}
</script>

<style scoped>
.onboarding {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: var(--bg);
  overflow-y: auto;
  padding: calc(var(--safe-top) + 48px) 24px calc(var(--safe-bottom) + 32px);
  max-width: 480px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
}

.welcome {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  margin-bottom: 30px;
}

.logo-circle {
  width: 84px;
  height: 84px;
  border-radius: 50%;
  background: var(--teal);
  color: #fff;
  display: grid;
  place-items: center;
  margin-bottom: 14px;
  box-shadow: var(--shadow-float);
}

h1 {
  font-size: 30px;
  font-weight: 800;
  color: var(--teal);
  letter-spacing: -0.02em;
}

.tagline {
  font-size: 14.5px;
  color: var(--ink-muted);
  font-weight: 600;
  max-width: 280px;
  margin-top: 6px;
}

.login {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* Error banner */
.error-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  background: #fde8e4;
  color: var(--coral);
  border-radius: var(--radius-md);
  font-size: 13.5px;
  font-weight: 700;
}

.expand-enter-active, .expand-leave-active { transition: all 0.2s ease; overflow: hidden; }
.expand-enter-from, .expand-leave-to { max-height: 0; opacity: 0; padding: 0 16px; }
.expand-enter-to, .expand-leave-from { max-height: 80px; opacity: 1; }

/* Fields */
.field input {
  width: 100%;
  padding: 15px 22px;
  border-radius: 999px;
  border: 1.5px solid var(--line);
  background: var(--surface);
  outline: none;
  transition: border-color 0.15s ease;
}

.field input:focus { border-color: var(--teal); }
.field input.invalid { border-color: var(--coral); }
.field input::placeholder { color: var(--ink-muted); font-weight: 600; }

/* Password wrapper */
.pw-wrap { position: relative; }
.pw-wrap input { padding-right: 52px; }
.pw-toggle { position: absolute; right: 18px; top: 50%; transform: translateY(-50%); color: var(--ink-muted); }

/* Location card */
.location-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 8px;
  background: var(--teal);
  color: #fff;
  border-radius: var(--radius-lg);
  padding: 26px 22px 22px;
  margin: 12px 0 6px;
  box-shadow: var(--shadow-float);
}

.pin-badge {
  width: 54px;
  height: 54px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: rgba(255,255,255,0.16);
}

.location-card h2 { font-size: 18px; font-weight: 800; color: #fff; }
.location-card p { font-size: 13.5px; color: rgba(255,255,255,0.85); font-weight: 600; max-width: 270px; }

.allow-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  width: 100%;
  padding: 17px 0;
  margin-top: 8px;
  border-radius: 999px;
  background: #fff;
  color: var(--teal);
  font-size: 16px;
  font-weight: 800;
  transition: transform 0.15s ease, background 0.2s ease;
}

.allow-btn:active { transform: scale(0.97); }
.allow-btn.granted { background: var(--teal-soft); }

/* Submit */
.signin-btn {
  width: 100%;
  padding: 16px 0;
  border-radius: 999px;
  background: var(--teal);
  color: #fff;
  font-size: 15.5px;
  font-weight: 800;
  margin-top: 6px;
  transition: transform 0.15s ease, opacity 0.15s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
}

.signin-btn:disabled { opacity: 0.7; }
.signin-btn:active:not(:disabled) { transform: scale(0.97); }

/* Spinner */
.spinner {
  width: 20px;
  height: 20px;
  border: 2.5px solid rgba(255,255,255,0.35);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }

.alt { text-align: center; font-size: 13.5px; color: var(--ink-muted); font-weight: 600; margin-top: 4px; }
.link { color: var(--teal); font-weight: 800; font-size: 13.5px; }
</style>
