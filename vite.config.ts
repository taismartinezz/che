import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'push-sw.js'],
      manifest: {
        name: 'Che, ¿conocés?',
        short_name: 'Che',
        description: 'Tu red de confianza para el "¿conocés a alguien?" de todos los días.',
        lang: 'es',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#F0F2F5',
        theme_color: '#6D3FD1',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Web push handlers live in public/push-sw.js.
        importScripts: ['push-sw.js'],
        navigateFallback: '/index.html',
        // Never cache Supabase API traffic: data must always be live.
        navigateFallbackDenylist: [/^\/auth/],
      },
    }),
  ],
});
