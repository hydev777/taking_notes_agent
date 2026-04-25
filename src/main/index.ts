import { app, BrowserWindow, dialog } from 'electron'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import { registerIpcHandlers } from './ipc'
import { getDb, onAppQuit } from './services/db'

const __dirname = dirname(fileURLToPath(import.meta.url))

/** Preload next to compiled main (`out/main` → `out/preload`) or from app root (robust if `__dirname` differs). */
function resolvePreloadPath(): string {
  const candidates = [
    join(__dirname, '..', 'preload', 'index.mjs'),
    join(__dirname, '..', 'preload', 'index.js'),
    join(app.getAppPath(), 'out', 'preload', 'index.mjs'),
    join(app.getAppPath(), 'out', 'preload', 'index.js')
  ]
  for (const p of candidates) {
    if (existsSync(p)) {
      return p
    }
  }
  const fallback = candidates[0]!
  console.warn('[Taking Notes Agent] Preload script not found on disk. Tried:\n', candidates.join('\n'))
  return fallback
}

function loadEnvFiles(): void {
  dotenv.config({ path: join(app.getPath('userData'), '.env') })
  dotenv.config()
}

function createWindow(): BrowserWindow {
  const preload = resolvePreloadPath()
  const win = new BrowserWindow({
    width: 1120,
    height: 820,
    show: false,
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  win.on('ready-to-show', () => {
    win.show()
  })
  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (!app.isPackaged && devUrl) {
    void win.loadURL(devUrl)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}

app
  .whenReady()
  .then(() => {
    loadEnvFiles()
    getDb()
    registerIpcHandlers()
    onAppQuit()
    createWindow()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
      }
    })
  })
  .catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[Taking Notes Agent] Startup failed:', err)
    void dialog.showErrorBox('Taking Notes Agent — error al iniciar', msg)
    app.quit()
  })

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
