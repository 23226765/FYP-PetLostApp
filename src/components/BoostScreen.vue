<template>
  <div class="boost">
    <header class="head">
      <button class="back" aria-label="Go back" @click="emit('back')">
        <AppIcon name="back" :size="22" />
      </button>
      <div class="head-text">
        <h1>Boost your alert</h1>
        <p>Reach every neighbor before the trail goes cold</p>
      </div>
    </header>

    <div class="body">
      <!-- Radius comparison graphic -->
      <div class="radius-visual" role="img" aria-label="Comparison of a small 2 kilometer standard alert radius versus a large 15 kilometer boosted alert radius">
        <div class="circle-wrap">
          <span class="circle small"><AppIcon name="pin" :size="14" /></span>
          <span class="circle-label">2 km</span>
        </div>
        <AppIcon name="chevron" :size="20" />
        <div class="circle-wrap">
          <span class="circle big">
            <span class="ring" />
            <AppIcon name="pin" :size="18" />
          </span>
          <span class="circle-label boosted">15 km</span>
        </div>
      </div>

      <!-- Comparison card -->
      <div class="compare">
        <section class="plan">
          <h2>Standard Alert</h2>
          <span class="price">Free</span>
          <ul>
            <li><AppIcon name="check" :size="15" /> 2 km radius</li>
            <li><AppIcon name="check" :size="15" /> Radar feed listing</li>
            <li class="dim"><AppIcon name="close" :size="15" /> No instant push</li>
          </ul>
        </section>
        <section class="plan featured">
          <span class="badge"><AppIcon name="zap" :size="12" /> BOOSTED</span>
          <h2>Boosted Alert</h2>
          <span class="price">$4.99</span>
          <ul>
            <li><AppIcon name="check" :size="15" /> 15 km radius</li>
            <li><AppIcon name="check" :size="15" /> Instant push to all users</li>
            <li><AppIcon name="check" :size="15" /> Pinned top of Radar</li>
          </ul>
        </section>
      </div>

      <p class="note">
        Boosted alerts are seen by <strong>12x more neighbors</strong> in the first critical hour.
      </p>
    </div>

    <footer class="foot">
      <button class="boost-btn" :class="{ done: boosted }" @click="boosted = true">
        <AppIcon :name="boosted ? 'check' : 'zap'" :size="20" />
        {{ boosted ? 'Alert boosted! 15 km radius active' : 'Boost Alert for $4.99' }}
      </button>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import AppIcon from './AppIcon.vue'

const emit = defineEmits<{ back: [] }>()

const boosted = ref(false)
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
  color: var(--teal);
  border: 2px dashed var(--teal);
}

.circle.big {
  width: 130px;
  height: 130px;
  background: rgba(29, 99, 96, 0.12);
  color: var(--teal);
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
  color: var(--teal);
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
  color: #fff;
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
  color: var(--teal);
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
  color: var(--teal);
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
  color: #fff;
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
