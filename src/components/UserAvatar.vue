<template>
  <span class="user-avatar" role="img" :aria-label="alt || (name ? t('photoPresentation.avatarFor', { name }) : t('photoPresentation.genericAvatar'))">
    <ManagedImage v-if="source && !failed" :src="source" alt="" aria-hidden="true" @error="failed = true" />
    <span v-else-if="initials" class="initials" aria-hidden="true">{{ initials }}</span>
    <AppIcon v-else name="user" :size="22" aria-hidden="true" />
  </span>
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import ManagedImage from './ManagedImage.vue'
import AppIcon from './AppIcon.vue'
import { displayImageUrl, profileInitials } from '../utils/imagePresentation'
import { useAppI18n } from '../i18n'
const props = defineProps<{ src?: string; name?: string; alt?: string }>()
const { t } = useAppI18n()
const source = computed(() => displayImageUrl(props.src))
const initials = computed(() => profileInitials(props.name))
const failed = ref(false)
watch(() => [props.src, props.name], () => { failed.value = false })
</script>
<style scoped>
.user-avatar { display: inline-flex; align-items: center; justify-content: center; overflow: hidden; flex-shrink: 0; border-radius: 50%; background: var(--color-surface-subtle); color: var(--color-text-accent); }
.user-avatar img { width: 100%; height: 100%; object-fit: cover; }
.initials { font-size: 1em; line-height: 1; font-weight: 650; padding: 4px; }
</style>
