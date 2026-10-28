<template>
  <dialog ref="dialog" class="filter-sheet" :aria-labelledby="titleId" @cancel.prevent="emit('close')" @click="onBackdrop">
    <header><h2 :id="titleId">{{ title }}</h2><button type="button" :aria-label="t('common.close')" @click="emit('close')"><AppIcon name="close" :size="22" /></button></header>
    <slot />
  </dialog>
</template>
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import { useAppI18n } from '../i18n'
const props = defineProps<{ open: boolean; title: string }>()
const emit = defineEmits<{ close: [] }>()
const { t } = useAppI18n()
const titleId = useId(), dialog = ref<HTMLDialogElement | null>(null)
onMounted(() => { if (props.open && !dialog.value?.open) dialog.value?.showModal() })
// Native modal dialogs provide keyboard focus containment, Escape and focus restoration.
watch(() => props.open, open => {
  if (open && !dialog.value?.open) dialog.value?.showModal()
  else if (!open && dialog.value?.open) dialog.value.close()
}, { flush: 'post', immediate: true })
function onBackdrop(event: MouseEvent) { if (event.target === dialog.value) emit('close') }
onBeforeUnmount(() => { if (dialog.value?.open) dialog.value.close() })
</script>
<style scoped>
.filter-sheet { position: fixed; inset: auto 0 0; width: min(100%, 480px); max-height: 85dvh; margin: auto auto 0; padding: 18px 20px calc(22px + var(--safe-bottom)); overflow-y: auto; border: 1px solid var(--color-border); border-radius: 22px 22px 0 0; background: var(--color-surface-elevated); color: var(--color-text-primary); box-shadow: var(--shadow-card); }
.filter-sheet::backdrop { background: var(--color-overlay, rgba(0,0,0,.5)); }
header { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
h2 { font-size: 20px; }
button { min-width: 44px; min-height: 44px; border-radius: 50%; display: grid; place-items: center; color: var(--color-text-primary); background: var(--color-surface-selected); }
button:focus-visible { outline: 3px solid var(--color-focus); outline-offset: 2px; }
</style>
