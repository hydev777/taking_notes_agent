import { useCallback } from 'react'
import type { useRecorder } from './useRecorder'

type RecorderApi = ReturnType<typeof useRecorder>

type Params = {
  recorder: RecorderApi
  onError: (message: string | null) => void
  onBusyMessage: (message: string | null) => void
  onRequireProfile: () => void
  onProcessed: (sessionId: string) => void
}

export function useHomeActions(params: Params): {
  startRecording: () => Promise<void>
  stopRecording: () => Promise<void>
  stopWithoutProcessing: () => void
} {
  const startRecording = useCallback(async () => {
    params.onError(null)
    params.onBusyMessage('Processing audio (transcription + notes)…')
    try {
      const n = (await window.api.getProfileName())?.trim() ?? ''
      if (!n) {
        params.onRequireProfile()
        return
      }
      const id = crypto.randomUUID()
      await params.recorder.start(id)
    } catch (e) {
      params.onError(e instanceof Error ? e.message : String(e))
    } finally {
      params.onBusyMessage(null)
    }
  }, [params])

  const stopRecording = useCallback(async () => {
    params.onError(null)
    params.onBusyMessage('Processing audio (transcription + notes)…')
    try {
      const chunks = await params.recorder.stop()
      if (!chunks) {
        return
      }
      const n = (await window.api.getProfileName())?.trim() ?? ''
      const buf = await chunks.blob.arrayBuffer()
      const res = await window.api.processCallAudio({
        sessionId: chunks.sessionId,
        audio: buf,
        mimeType: chunks.mimeType,
        profileName: n
      })
      void res
      params.onProcessed(chunks.sessionId)
    } catch (e) {
      params.onError(e instanceof Error ? e.message : String(e))
    } finally {
      params.onBusyMessage(null)
    }
  }, [params])

  const stopWithoutProcessing = useCallback(() => {
    params.onError(null)
    void (async () => {
      const stopped = await params.recorder.stop()
      if (!stopped) {
        return
      }
      params.onBusyMessage('Recording discarded.')
      window.setTimeout(() => params.onBusyMessage(null), 1600)
    })()
  }, [params])

  return { startRecording, stopRecording, stopWithoutProcessing }
}
