import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/roboflow': {
        target: 'https://serverless.roboflow.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/roboflow/, ''),
      },
      '/roboflow-workflow': {
        target: 'https://serverless.roboflow.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/roboflow-workflow/, ''),
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setHeader('Content-Type', 'application/json')
          })
        },
      },
    },
  },
})
