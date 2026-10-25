import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Development-only CSP. The production policy in netlify.toml deliberately
// rejects inline scripts, but Vite injects an inline React Fast Refresh
// preamble into index.html. Without this override, Netlify Dev applies the
// production CSP to the dev HTML and the browser blocks the preamble, which
// surfaces as "@vitejs/plugin-react can't detect preamble".
const devCsp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://apis.google.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' ws: wss: http://localhost:* http://127.0.0.1:* https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://*.firebaseapp.com https://*.firebasestorage.app https://*.cloudfunctions.net https://identitytoolkit.googleapis.com https://securetoken.googleapis.com",
  "frame-src https://*.firebaseapp.com https://accounts.google.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "worker-src 'self' blob:",
].join('; ')

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    // Allow tunnelling hosts such as ngrok during local review.
    allowedHosts: true,
    // Vite's headers replace the matching Netlify Dev header for proxied
    // responses, so this stays local to the dev server.
    headers: {
      'Content-Security-Policy': devCsp,
    },
  },
  preview: {
    allowedHosts: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
})
