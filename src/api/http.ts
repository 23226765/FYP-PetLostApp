import axios from 'axios'

// Base URL points at the Vite dev proxy (/api -> http://localhost:5000).
// For native (Capacitor) builds set VITE_API_BASE_URL to the machine's LAN IP.
export const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? '/api',
  headers: { 'Content-Type': 'application/json' },
})
