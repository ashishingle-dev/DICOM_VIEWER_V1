import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteCommonjs } from '@originjs/vite-plugin-commonjs'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), viteCommonjs()],
  resolve: {
    alias: {
      // dcmjs bundles xmlbuilder2 (used for DICOM SR/XML features we don't touch),
      // which imports Node's `events` module. Vite externalizes real Node builtins
      // to an empty shim in the browser, which crashes on `class extends EventEmitter`.
      // Point it at the browser-compatible `events` polyfill package instead.
      events: 'events',
    },
  },
  // Cornerstone's DICOM codecs ship as .wasm assets loaded via import.meta.url,
  // which Vite's dependency optimizer currently mishandles, so we exclude the
  // loader from pre-bundling and let it load un-optimized at dev time.
  assetsInclude: ['**/*.wasm'],
  optimizeDeps: {
    exclude: ['@cornerstonejs/dicom-image-loader', '@cornerstonejs/polymorphic-segmentation'],
    include: ['dicom-parser', 'events'],
  },
  worker: {
    format: 'es',
  },
})
