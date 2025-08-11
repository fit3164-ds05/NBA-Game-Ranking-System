import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite' 

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), 
    tailwindcss()],
    server: {
      proxy: {
        "/api": {
          target: process.env.VITE_API_PROXY_TARGET || "http://127.0.0.1:5000",
          changeOrigin: true  // changeOrigin true rewrites the Host header so Flask treats the request as if it came directly to it. This avoids occasional CORS quirks and cookie domain issues during local dev.
        }
      }
    }
})
