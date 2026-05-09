import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],

  build: {
    // Raise the warning threshold slightly — 600 kB gzipped is fine for a PWA
    chunkSizeWarningLimit: 600,

    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // Firebase — keep as one chunk to avoid circular dependency warnings
          if (id.includes('node_modules/firebase') ||
              id.includes('node_modules/@firebase')) return 'firebase'

          // MediaPipe tasks-vision
          if (id.includes('@mediapipe/tasks-vision')) return 'mediapipe'

          // Tesseract
          if (id.includes('tesseract')) return 'tesseract'

          // React + react-dom
          if (id.includes('node_modules/react/') ||
              id.includes('node_modules/react-dom/')) return 'react-vendor'

          // Everything else in node_modules
          if (id.includes('node_modules')) return 'vendor'
        },
      },
    },
  },

  server: {
    proxy: {
      '/roboflow-infer': {
        target: 'https://serverless.roboflow.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/roboflow-infer/, ''),
      },
      '/roboflow': {
        target: 'https://serverless.roboflow.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/roboflow/, ''),
      },
      '/roboflow-workflow': {
        target: 'https://serverless.roboflow.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/roboflow-workflow/, ''),
      },
    },
  },
})
