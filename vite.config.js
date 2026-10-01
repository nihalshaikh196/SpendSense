import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Without a target the CSS minifier rewrites media queries to the range
    // syntax (width>=768px), which iOS Safari below 16.4 ignores outright —
    // every responsive rule would silently stop applying on older phones.
    target: ['es2020', 'safari15', 'chrome90', 'firefox90'],
    cssTarget: ['safari15', 'chrome90', 'firefox90'],
  },
})
