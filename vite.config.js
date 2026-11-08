import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// GitHub Pages project site is served from /<repo>/.
// Override with VITE_BASE=/ for root-domain deployments.
export default defineConfig({
  base: process.env.VITE_BASE || '/chaiAI/',
  plugins: [react(), tailwindcss()],
})
