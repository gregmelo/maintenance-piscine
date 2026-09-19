import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'inline',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'], // Fichiers à mettre en cache pour le hors-ligne
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/vericelgregory\.alwaysdata\.net\/piscine\/api\/tasks.*/i,
            handler: 'NetworkFirst', // Tente le réseau d'abord, sinon prend le cache
            options: {
              cacheName: 'api-tasks-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 7 // 1 semaine
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            urlPattern: /^https:\/\/vericelgregory\.alwaysdata\.net\/piscine\/uploads\/.*/i,
            handler: 'CacheFirst', // Prend le cache d'abord (photos ne changent pas)
            options: {
              cacheName: 'api-images-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 30 // 30 jours
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          }
        ]
      },
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      manifest: {
        name: "Registre Piscine Ambérieu",
        short_name: "Piscine Maintenance",
        description: "Application de suivi de maintenance préventive pour la piscine d'Ambérieu.",
        theme_color: '#0284c7', // Couleur de la barre d'état
        background_color: '#ffffff',
        display: 'standalone', // Pour s'ouvrir sans barre d'adresse
        orientation: 'portrait-primary',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
            
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable' // Icône adaptative pour Android
          }
        ]
      }
    })
  ],
})