import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  base: process.env.CF_PAGES ? '/' : '/ElectricalPro-workautomation/',
  server: {
    proxy: {
      '/api/enummer': {
        target: 'https://www.e-nummersok.se',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/enummer/, ''),
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'ElectricalPro',
        short_name: 'ElectricalPro',
        description: 'Arbetsplaneringsapp för svenska elektriker',
        theme_color: '#0066cc',
        background_color: '#f0f4f8',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/ElectricalPro-workautomation/',
        start_url: '/ElectricalPro-workautomation/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5MB for large product catalog
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        globIgnores: ['**/oauth-callback.html'],
        navigateFallbackDenylist: [/\/oauth-callback\.html/],
        skipWaiting: true,
        clientsClaim: true,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\.anthropic\.com\/.*/i,
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
})
