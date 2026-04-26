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
  const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms))

  const startRecording = useCallback(async () => {
    params.onError(null)
    params.onBusyMessage('AI assistant is checking profile and preparing capture...')
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
    params.onBusyMessage('AI assistant is preparing audio for transcription...')
    try {
      const chunks = await params.recorder.stop()
      if (!chunks) {
        return
      }
      params.onBusyMessage('AI assistant is transcribing the call...')
      const n = (await window.api.getProfileName())?.trim() ?? ''
      const buf = await chunks.blob.arrayBuffer()
      const res = await window.api.processCallAudio({
        sessionId: chunks.sessionId,
        audio: buf,
        mimeType: chunks.mimeType,
        profileName: n
      })
      void res
      params.onBusyMessage('AI assistant is structuring template fields...')
      await sleep(220)
      params.onBusyMessage('AI assistant is validating key details...')
      await sleep(220)
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
      params.onBusyMessage('AI assistant stopped. Recording discarded.')
      window.setTimeout(() => params.onBusyMessage(null), 1600)
    })()
  }, [params])

  return { startRecording, stopRecording, stopWithoutProcessing }
}
