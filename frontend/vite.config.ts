import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const httpsPort = Number(process.env.PROXY_HTTPS_PORT ?? 8443)

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    port: 5180,
    allowedHosts: ['weekplan.localhost', 'localhost'],
    // The browser reaches Vite through the TLS proxy, so HMR must dial that, not 5180.
    hmr: { protocol: 'wss', host: 'weekplan.localhost', clientPort: httpsPort },
    proxy: {
      '/api': { target: 'http://api:3010', changeOrigin: true },
    },
  },
})
