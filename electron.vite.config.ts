import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

const trialEnabled = process.env.TNA_TRIAL === '1'
const defineFlags = { __TRIAL_ENABLED__: JSON.stringify(trialEnabled) }

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    define: defineFlags
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    define: defineFlags
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    plugins: [react()],
    define: defineFlags,
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'src/shared')
      }
    }
  }
})
