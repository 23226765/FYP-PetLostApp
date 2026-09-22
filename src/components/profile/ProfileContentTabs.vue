<template>
  <nav class="profile-tabs" :aria-label="t('profile.contentTabs')">
    <div role="tablist" class="tab-list" @keydown="moveFocus">
      <button
        v-for="tab in tabs"
        :id="`profile-tab-${tab.id}`"
        :key="tab.id"
        :ref="(element) => setTabButton(tab.id, element)"
        type="button"
        role="tab"
        :aria-selected="modelValue === tab.id"
        :aria-controls="`profile-panel-${tab.id}`"
        :tabindex="modelValue === tab.id ? 0 : -1"
        :class="{ active: modelValue === tab.id }"
        @click="emit('update:modelValue', tab.id)"
      >
        <AppIcon :name="tab.icon" :size="21" />
        <span>{{ tab.label }}</span>
      </button>
    </div>
  </nav>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ComponentPublicInstance } from 'vue'
import AppIcon from '../AppIcon.vue'
import { useAppI18n } from '../../i18n'

export type ProfileTab = 'pets' | 'rescue' | 'saved'

defineProps<{ modelValue: ProfileTab }>()
const emit = defineEmits<{ 'update:modelValue': [value: ProfileTab] }>()
const { t } = useAppI18n()
const tabButtons = new Map<ProfileTab, HTMLButtonElement>()
const tabs = computed(() => [
  { id: 'pets' as const, icon: 'paw', label: t('profile.myPets') },
  { id: 'rescue' as const, icon: 'grid', label: t('profile.rescuePosts') },
  { id: 'saved' as const, icon: 'bookmark', label: t('profile.savedPosts') },
])

function setTabButton(tab: ProfileTab, element: Element | ComponentPublicInstance | null) {
  if (element instanceof HTMLButtonElement) tabButtons.set(tab, element)
}

function moveFocus(event: KeyboardEvent) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  const ids = tabs.value.map((tab) => tab.id)
  const current = Math.max(0, ids.indexOf((event.target as HTMLElement).id.replace('profile-tab-', '') as ProfileTab))
  const next = event.key === 'Home'
    ? 0
    : event.key === 'End'
      ? ids.length - 1
      : (current + (event.key === 'ArrowRight' ? 1 : -1) + ids.length) % ids.length
  const id = ids[next]
  emit('update:modelValue', id)
  tabButtons.get(id)?.focus()
}
</script>

<style scoped>
.profile-tabs { position: sticky; top: calc(var(--safe-top) + 64px); z-index: 4; margin: 0 -4px 18px; padding: 4px; border-bottom: 1px solid var(--color-border); background: color-mix(in srgb, var(--page-bg) 94%, transparent); backdrop-filter: blur(16px); }
.tab-list { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); }
button { position: relative; min-width: 0; min-height: 52px; display: flex; align-items: center; justify-content: center; gap: 6px; padding: 7px 5px 10px; color: var(--color-nav-inactive); font-size: 11.5px; font-weight: 800; transition: color .2s ease, background-color .2s ease, transform .2s ease; }
button span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
button::after { content: ''; position: absolute; right: 12px; bottom: 2px; left: 12px; height: 3px; border-radius: 999px; background: transparent; transform: scaleX(.35); transition: background-color .2s ease, transform .2s ease; }
button.active { color: var(--color-nav-active); font-weight: 900; }
button.active::after { background: var(--color-border-accent); transform: scaleX(1); }
button:active { transform: scale(.98); }
button:focus-visible { border-radius: 12px; outline: 3px solid var(--color-focus); outline-offset: -2px; }
@media (max-width: 360px) { button { flex-direction: column; gap: 2px; font-size: 10.5px; } }
@media (prefers-reduced-motion: reduce) { button, button::after { transition: none; } }
</style>
