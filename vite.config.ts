import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'Anomalies // Retro Media Lab',
        short_name: 'Anomalies',
        description:
          'Çevrimdışı Retro & Glitch Medya Laboratuvarı. Görselleri piksel, ASCII, glitch ve sanatsal efektlerle dönüştürün.',
        start_url: './',
        display: 'standalone',
        background_color: '#0b0f17',
        theme_color: '#000000',
        orientation: 'portrait',
        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,wasm}'],
        globIgnores: ['**/heic2any-*.js', '**/heic2any-*.js.map'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /\/assets\/heic2any-.*\.js$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'heic-decoder-runtime',
              expiration: {
                maxEntries: 2,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
    }),
  ],
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
