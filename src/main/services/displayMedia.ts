import {
  desktopCapturer,
  ipcMain,
  session,
  webContents as WebContentsCtor
} from 'electron'
import type { DesktopCapturerSource, Streams, WebContents } from 'electron'
import type { DisplayMediaSourceOption } from '../../shared/ipc'

type Pending = {
  id: number
  sources: DesktopCapturerSource[]
  callback: (streams: Streams) => void
  webContents: WebContents
  timeoutId: ReturnType<typeof setTimeout>
}

let pending: Pending | null = null
let pendingSerial = 0

function clearPendingTimeout(p: Pending): void {
  clearTimeout(p.timeoutId)
}

/**
 * Electron does not show Chrome's getDisplayMedia picker; we must supply sources via
 * session.setDisplayMediaRequestHandler and let the renderer pick (IPC).
 */
export function registerDisplayMediaSupport(): void {
  ipcMain.on('tna:display-media-pick', (event, sourceId: unknown) => {
    if (pending == null || event.sender !== pending.webContents) {
      return
    }
    clearPendingTimeout(pending)
    const { sources, callback } = pending
    pending = null

    try {
      const id = typeof sourceId === 'string' ? sourceId : null
      if (id == null || id === '') {
        callback({})
        return
      }
      const source = sources.find((s) => s.id === id)
      if (!source) {
        callback({})
        return
      }
      const streams: Streams = { video: source }
      if (process.platform === 'win32') {
        streams.audio = 'loopback'
      }
      callback(streams)
    } catch {
      try {
        callback({})
      } catch {
        /* ignore */
      }
    }
  })

  session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
    if (pending !== null) {
      try {
        callback({})
      } catch {
        /* ignore */
      }
      return
    }

    try {
      const sources = await desktopCapturer.getSources({
        types: ['window', 'screen'],
        thumbnailSize: { width: 280, height: 160 },
        fetchWindowIcons: true
      })
      if (sources.length === 0) {
        callback({})
        return
      }

      const webContents =
        request.frame != null ? WebContentsCtor.fromFrame(request.frame) : undefined
      if (webContents == null || webContents.isDestroyed()) {
        callback({})
        return
      }

      const payload: DisplayMediaSourceOption[] = sources.map((s) => ({
        id: s.id,
        name: s.name,
        thumbnailDataUrl: s.thumbnail.toDataURL()
      }))

      const timeoutMs = 120_000
      const requestId = ++pendingSerial
      const timeoutId = setTimeout(() => {
        if (pending?.id === requestId) {
          clearPendingTimeout(pending)
          pending = null
          try {
            callback({})
          } catch {
            /* ignore */
          }
        }
      }, timeoutMs)

      pending = { id: requestId, sources, callback, webContents, timeoutId }
      try {
        webContents.send('tna:display-media-picker', payload)
      } catch (sendErr) {
        console.error('[Taking Notes Agent] display media picker send failed:', sendErr)
        clearTimeout(timeoutId)
        pending = null
        try {
          callback({})
        } catch {
          /* ignore */
        }
      }
    } catch (e) {
      console.error('[Taking Notes Agent] display media handler failed:', e)
      try {
        callback({})
      } catch {
        /* ignore */
      }
    }
  })
}
