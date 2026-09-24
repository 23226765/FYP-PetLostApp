<template>
  <div class="boost">
    <header class="head">
      <button class="back" :aria-label="t('common.back')" @click="emit('back')">
        <AppIcon name="back" :size="22" />
      </button>
      <div class="head-text">
        <h1>{{ t('settings.boostTitle') }}</h1>
        <p>{{ t('settings.boostHelp') }}</p>
      </div>
    </header>

    <div class="body">
      <!-- Radius comparison graphic -->
      <div class="radius-visual" role="img" :aria-label="t('settings.radiusComparison', { current: radiusKm, boosted: 15 })">
        <div class="circle-wrap">
          <span class="circle small"><AppIcon name="pin" :size="14" /></span>
          <span class="circle-label">{{ t('common.kilometres', { count: radiusKm }) }}</span>
        </div>
        <AppIcon name="chevron" :size="20" />
        <div class="circle-wrap">
          <span class="circle big">
            <span class="ring" />
            <AppIcon name="pin" :size="18" />
          </span>
          <span class="circle-label boosted">{{ t('common.kilometres', { count: 15 }) }}</span>
        </div>
      </div>

      <!-- Comparison card -->
      <div class="compare">
        <section class="plan">
          <h2>{{ t('settings.currentCoverage') }}</h2>
          <span class="price">{{ t('common.kilometres', { count: radiusKm }) }}</span>
          <ul>
            <li><AppIcon name="check" :size="15" /> {{ t('settings.nearbyFiltering') }}</li>
            <li><AppIcon name="check" :size="15" /> {{ t('settings.radarListing') }}</li>
            <li><AppIcon name="check" :size="15" /> {{ t('settings.inAppNotifications') }}</li>
          </ul>
        </section>
        <section class="plan featured">
          <span class="badge"><AppIcon name="zap" :size="12" /> {{ t('settings.boosted') }}</span>
          <h2>{{ t('settings.widerCoverage') }}</h2>
          <span class="price">{{ t('settings.free') }}</span>
          <ul>
            <li><AppIcon name="check" :size="15" /> {{ t('settings.radiusCoverage', { radius: 15 }) }}</li>
            <li><AppIcon name="check" :size="15" /> {{ t('settings.widerResults') }}</li>
            <li><AppIcon name="check" :size="15" /> {{ t('settings.widerAlerts') }}</li>
          </ul>
        </section>
      </div>

      <p class="note">
        {{ t('settings.boostNote') }}
      </p>
    </div>

    <footer class="foot">
      <button class="boost-btn" :class="{ done: boosted }" :disabled="boosted" @click="emit('activate', 15)">
        <AppIcon :name="boosted ? 'check' : 'zap'" :size="20" />
        {{ boosted ? t('settings.radiusActive') : t('settings.useRadius') }}
      </button>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from './AppIcon.vue'
import { useAppI18n } from '../i18n'

const props = defineProps<{ radiusKm: number }>()
const emit = defineEmits<{ back: []; activate: [radiusKm: number] }>()
const { t } = useAppI18n()

const boosted = computed(() => props.radiusKm >= 15)
</script>

<style scoped>
.boost {
  position: fixed;
  inset: 0;
  z-index: 50;
  background: var(--bg);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

.head {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--teal);
  color: #fff;
  padding: calc(var(--safe-top) + 16px) 18px 18px;
  border-radius: 0 0 26px 26px;
  flex-shrink: 0;
}

.back {
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.14);
  color: #fff;
  flex-shrink: 0;
}

.head-text h1 {
  font-size: 19px;
  font-weight: 800;
}

.head-text p {
  font-size: 12.5px;
  color: rgba(255, 255, 255, 0.8);
  font-weight: 600;
}

.body {
  flex: 1;
  padding: 24px 20px 20px;
  max-width: 480px;
  width: 100%;
  margin: 0 auto;
}

/* Radius comparison graphic */
.radius-visual {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 18px;
  margin-bottom: 24px;
  color: var(--ink-muted);
}

.circle-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.circle {
  display: grid;
  place-items: center;
  border-radius: 50%;
  position: relative;
}

.circle.small {
  width: 56px;
  height: 56px;
  background: var(--teal-soft);
  color: var(--color-text-accent);
  border: 2px dashed var(--teal);
}

.circle.big {
  width: 130px;
  height: 130px;
  background: rgba(29, 99, 96, 0.12);
  color: var(--color-text-accent);
  border: 2.5px solid var(--teal);
}

.ring {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 2px solid var(--teal);
  animation: pulse-ring 2s ease-out infinite;
}

.circle-label {
  font-size: 13px;
  font-weight: 800;
  color: var(--ink-muted);
}

.circle-label.boosted {
  color: var(--color-text-accent);
}

/* Comparison card */
.compare {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 16px;
}

.plan {
  background: var(--surface);
  border-radius: var(--radius-lg);
  padding: 20px 16px;
  box-shadow: var(--shadow-card);
  display: flex;
  flex-direction: column;
  gap: 6px;
  position: relative;
}

.plan.featured {
  background: var(--teal);
  color: #fff;
  box-shadow: var(--shadow-float);
}

.badge {
  position: absolute;
  top: -11px;
  right: 14px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: var(--coral);
  color: var(--color-text-on-coral);
  font-size: 10.5px;
  font-weight: 800;
  letter-spacing: 0.05em;
  padding: 4px 10px;
  border-radius: 999px;
}

.plan h2 {
  font-size: 14.5px;
  font-weight: 800;
}

.price {
  font-size: 24px;
  font-weight: 800;
  margin-bottom: 6px;
}

.plan ul {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.plan li {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 12.5px;
  font-weight: 700;
}

.plan li svg {
  color: var(--color-text-accent);
  flex-shrink: 0;
}

.plan.featured li svg {
  color: #fff;
}

.plan li.dim {
  color: var(--ink-muted);
}

.plan li.dim svg {
  color: var(--ink-muted);
}

.note {
  text-align: center;
  font-size: 13px;
  color: var(--ink-muted);
  font-weight: 600;
  max-width: 300px;
  margin: 0 auto;
  text-wrap: pretty;
}

.note strong {
  color: var(--color-text-accent);
}

.foot {
  position: sticky;
  bottom: 0;
  padding: 14px 20px calc(var(--safe-bottom) + 20px);
  background: var(--bg);
  max-width: 480px;
  width: 100%;
  margin: 0 auto;
}

.boost-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  width: 100%;
  padding: 18px 0;
  border-radius: 999px;
  background: var(--coral);
  color: var(--color-text-on-coral);
  font-size: 16.5px;
  font-weight: 800;
  box-shadow: 0 8px 22px rgba(239, 99, 81, 0.4);
  transition: transform 0.15s ease, background 0.2s ease, box-shadow 0.2s ease;
}

.boost-btn:active {
  transform: scale(0.97);
}

.boost-btn.done {
  background: var(--teal);
  box-shadow: var(--shadow-float);
}
</style>
