import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    host: true,
    port: 3000,
    strictPort: true,
    watch: {
      ignored: [
        '**/android/.gradle/**',
        '**/android/.gradle-user/**',
        '**/android/**/build/**',
        '**/android/app/src/main/assets/public/**',
      ],
    },
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
})
