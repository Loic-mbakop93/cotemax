import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { copyFileSync } from 'fs'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react(), {
    name: 'spa-fallback',
    closeBundle() {
      copyFileSync(
        resolve(__dirname, 'dist/index.html'),
        resolve(__dirname, 'dist/404.html')
      )
    },
  }],
})