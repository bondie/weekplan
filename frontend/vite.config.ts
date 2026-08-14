import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const proxyPort = Number(process.env.PROXY_PORT ?? 8090)

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    port: 5180,
    allowedHosts: ['weekplan.localhost', 'localhost'],
    // The browser reaches Vite through the nginx proxy, so HMR must dial the proxy, not 5180.
    hmr: { host: 'weekplan.localhost', clientPort: proxyPort },
    proxy: {
      '/api': { target: 'http://api:3010', changeOrigin: true },
    },
  },
})
