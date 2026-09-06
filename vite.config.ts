/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';

import pkg from './package.json';

/** La versión que enseña Ajustes sale de package.json, no de una constante a mano. */
const version: string = pkg.version;

/**
 * Dónde vivirá la app. En Vercel o en un dominio propio es la raíz; en GitHub
 * Pages cuelga del nombre del repositorio (`/mutuo-barra/`). Se pasa como
 * variable de entorno al construir para no tener dos configuraciones:
 *
 *   VITE_BASE=/mutuo-barra/ npm run build
 *
 * Se normaliza con barras a los dos lados porque el `scope` del service worker
 * y el `start_url` del manifest salen de aquí, y sin la barra final el service
 * worker no controlaría la propia página que lo registró.
 */
declare const process: { env: Record<string, string | undefined> };
const carpeta = (process.env['VITE_BASE'] ?? '').replace(/^\/+|\/+$/g, '');
const base = carpeta === '' ? '/' : `/${carpeta}/`;

export default defineConfig({
  base,
  define: { __APP_VERSION__: JSON.stringify(version), __APP_BASE__: JSON.stringify(base) },
  plugins: [
    preact(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: null,
      includeAssets: ['icons/*.png'],
      manifest: {
        name: 'Mutuo · Barra',
        short_name: 'Barra',
        description: 'Cuaderno de barra del coffee cart de Mutuo. Funciona sin internet.',
        lang: 'es',
        dir: 'ltr',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'any',
        background_color: '#f5f4f3',
        theme_color: '#f5f4f3',
        categories: ['productivity', 'business'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Everything ships in the precache: the bar must work with the iPad in airplane mode.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest,woff,woff2}'],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        navigateFallback: `${base}index.html`,
      },
      devOptions: { enabled: false },
    }),
  ],
  server: { port: 5173, strictPort: false },
  build: { target: 'es2022', sourcemap: true },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
