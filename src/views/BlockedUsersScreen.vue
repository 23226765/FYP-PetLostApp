<template>
  <div class="blocked-page">
    <header>
      <button type="button" :aria-label="t('common.back')" @click="router.back()">‹</button>
      <h1>{{ t('safety.blockedAccounts') }}</h1>
      <span aria-hidden="true" />
    </header>
    <main>
      <section v-if="!user" class="state-card">
        <h2>{{ t('safety.signInToManage') }}</h2>
        <button type="button" @click="emit('auth-needed')">{{ t('authentication.signIn') }}</button>
      </section>
      <p v-else-if="loading" class="state-card" role="status">{{ t('common.loading') }}</p>
      <section v-else-if="error" class="state-card" role="alert">
        <p>{{ error }}</p><button type="button" @click="load">{{ t('common.retry') }}</button>
      </section>
      <section v-else-if="!users.length" class="state-card">
        <span class="empty-icon" aria-hidden="true">✓</span>
        <h2>{{ t('safety.noBlockedAccounts') }}</h2>
        <p>{{ t('safety.noBlockedAccountsHelp') }}</p>
      </section>
      <ul v-else class="blocked-list">
        <li v-for="blocked in users" :key="blocked.id">
          <img :src="blocked.avatar || '/avatar.svg'" alt="" />
          <span><strong>{{ blocked.name }}</strong><small>{{ t('safety.blockedAccount') }}</small></span>
          <button type="button" :disabled="busyIds.has(blocked.id)" @click="unblock(blocked.id)">
            {{ busyIds.has(blocked.id) ? t('common.saving') : t('safety.unblock') }}
          </button>
        </li>
      </ul>
    </main>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import type { User } from '../types/user'
import type { BlockedUser } from '../types/safety'
import { getBlockedUsers, unblockUser } from '../services/api'
import { translateApiError, useAppI18n } from '../i18n'

const props = defineProps<{ user: User | null }>()
const emit = defineEmits<{ 'auth-needed': [] }>()
const router = useRouter()
const { t } = useAppI18n()
const users = ref<BlockedUser[]>([])
const busyIds = ref(new Set<string>())
const loading = ref(false)
const error = ref('')

async function load() {
  if (!props.user) { users.value = []; return }
  loading.value = true
  error.value = ''
  try { users.value = await getBlockedUsers() }
  catch (cause) { error.value = translateApiError(cause, 'safety.loadError') }
  finally { loading.value = false }
}

async function unblock(userId: string) {
  if (busyIds.value.has(userId)) return
  busyIds.value = new Set([...busyIds.value, userId])
  try { await unblockUser(userId); users.value = users.value.filter((item) => item.id !== userId) }
  catch (cause) { error.value = translateApiError(cause, 'safety.unblockError') }
  finally { const next = new Set(busyIds.value); next.delete(userId); busyIds.value = next }
}

onMounted(load)
watch(() => props.user?.id, load)
</script>

<style scoped>
.blocked-page{position:fixed;inset:0;z-index:45;max-width:480px;margin:auto;overflow-y:auto;background:var(--page-bg);color:var(--color-text-primary)}header{position:sticky;top:0;z-index:2;display:grid;grid-template-columns:44px 1fr 44px;align-items:center;padding:calc(var(--safe-top) + 10px) 16px 10px;border-bottom:1px solid var(--color-border);background:color-mix(in srgb,var(--page-bg) 94%,transparent);backdrop-filter:blur(16px)}header button,header span{width:44px;height:44px}header button{display:grid;place-items:center;border-radius:50%;background:var(--color-surface);color:var(--color-icon-primary);font-size:30px}header h1{font-size:17px;text-align:center}main{padding:18px 16px calc(var(--safe-bottom) + 30px)}.state-card{display:grid;place-items:center;gap:10px;padding:34px 20px;border:1px solid var(--color-border);border-radius:14px;background:var(--color-surface);box-shadow:var(--shadow-card);text-align:center}.state-card p{color:var(--color-text-muted);font-size:13px}.state-card button{min-height:44px;padding:0 18px;border-radius:12px;background:var(--teal);color:var(--color-text-on-accent);font-weight:800}.empty-icon{width:54px;height:54px;display:grid;place-items:center;border-radius:50%;background:var(--color-surface-selected);color:var(--color-text-accent);font-size:25px}.blocked-list{overflow:hidden;border:1px solid var(--color-border);border-radius:14px;background:var(--color-surface);box-shadow:var(--shadow-card)}.blocked-list li{display:grid;grid-template-columns:48px 1fr auto;align-items:center;gap:11px;padding:13px;border-bottom:1px solid var(--color-border)}.blocked-list li:last-child{border-bottom:0}.blocked-list img{width:48px;height:48px;border-radius:50%;object-fit:cover}.blocked-list span{min-width:0}.blocked-list strong,.blocked-list small{display:block}.blocked-list small{margin-top:3px;color:var(--color-text-muted);font-size:11px}.blocked-list button{min-height:44px;padding:0 13px;border:1px solid var(--color-border-accent);border-radius:999px;color:var(--color-text-accent);font-size:12px;font-weight:800}.blocked-list button:disabled{opacity:.55}
</style>
