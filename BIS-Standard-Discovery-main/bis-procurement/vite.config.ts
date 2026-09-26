import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    port: 5173,
    proxy: {
      // Proxy /api/* to the FastAPI backend during development.
      // This avoids CORS issues and matches how production deployments
      // would route API calls.
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        // No rewrite — paths are forwarded as-is (/api/discover → /api/discover)
      },
    },
  },
})
