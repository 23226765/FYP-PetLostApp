import { defineComponent } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import SettingsScreen from '../views/SettingsScreen.vue'
import SavedScreen from '../views/SavedScreen.vue'
import AdoptionHistoryScreen from '../components/AdoptionHistoryScreen.vue'
import StrayDetailScreen from '../views/StrayDetailScreen.vue'
import BlockedUsersScreen from '../views/BlockedUsersScreen.vue'
import ModerationScreen from '../views/ModerationScreen.vue'

const EmptyRouteView = defineComponent({
  name: 'EmptyRouteView',
  render: () => null,
})

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'home', component: EmptyRouteView },
    { path: '/login', name: 'login', component: EmptyRouteView },
    { path: '/profile', name: 'profile', component: EmptyRouteView },
    { path: '/pets/:id', name: 'pet-detail', component: EmptyRouteView, props: true },
    { path: '/strays/:id', name: 'stray-detail', component: StrayDetailScreen, props: true },
    { path: '/settings', name: 'settings', component: SettingsScreen },
    { path: '/settings/blocked', name: 'blocked-users', component: BlockedUsersScreen },
    { path: '/moderation', name: 'moderation', component: ModerationScreen },
    { path: '/saved', name: 'saved', component: SavedScreen },
    { path: '/my-reports', name: 'my-reports', component: AdoptionHistoryScreen },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
  scrollBehavior: (to, from, savedPosition) => {
    if (savedPosition) return savedPosition
    if (to.name === 'profile' && from.name === 'profile') return false
    return { top: 0 }
  },
})

export default router
