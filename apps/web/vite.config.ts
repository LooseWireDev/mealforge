import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import { VitePWA } from 'vite-plugin-pwa';

import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // never let the service worker answer for the API or MCP endpoint —
      // a cached grocery list is worse than a slow one
      workbox: {
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/mcp/, /^\/trpc/],
        runtimeCaching: [],
      },
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'mealforge',
        short_name: 'mealforge',
        description: "The week's meals, recipes, and grocery list.",
        theme_color: '#3e6b4f',
        background_color: '#faf7f0',
        display: 'standalone',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/trpc': 'http://localhost:3000',
      '/api': 'http://localhost:3000',
    },
  },
});
