import { useCallback, useRef, useState } from 'react'

export type RecorderState =
  | { status: 'idle' }
  | { status: 'recording'; captureNote: string | null }
  | { status: 'error'; message: string }

export function useRecorder() {
  const [state, setState] = useState<RecorderState>({ status: 'idle' })
  const sessionIdRef = useRef<string>('')
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const ctxRef = useRef<AudioContext | null>(null)
  const displayStreamRef = useRef<MediaStream | null>(null)
  const micStreamRef = useRef<MediaStream | null>(null)

  const stopTracks = useCallback((stream: MediaStream | null) => {
    if (!stream) {
      return
    }
    for (const t of stream.getTracks()) {
      t.stop()
    }
  }, [])

  const cleanupGraph = useCallback(() => {
    void ctxRef.current?.close().catch(() => undefined)
    ctxRef.current = null
  }, [])

  const start = useCallback(async (sessionId: string) => {
    if (state.status === 'recording') {
      return
    }
    sessionIdRef.current = sessionId
    chunksRef.current = []
    let display: MediaStream | null = null
    try {
      display = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true
      })
      displayStreamRef.current = display
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      micStreamRef.current = mic

      const ctx = new AudioContext()
      ctxRef.current = ctx
      const dest = ctx.createMediaStreamDestination()

      const displayAudioTracks = display.getAudioTracks()
      let captureNote: string | null = null
      if (displayAudioTracks.length === 0) {
        captureNote =
          'This capture has no system/tab audio track (common on macOS without loopback). Recording microphone only — place the call on speaker or use Windows for system loopback + tab mix.'
      }

      const micSource = ctx.createMediaStreamSource(mic)
      if (displayAudioTracks.length > 0) {
        const displaySource = ctx.createMediaStreamSource(new MediaStream(displayAudioTracks))
        displaySource.connect(dest)
      }
      micSource.connect(dest)

      for (const vt of display.getVideoTracks()) {
        vt.stop()
      }

      const rec = new MediaRecorder(dest.stream, { mimeType: 'audio/webm;codecs=opus' })
      mediaRecorderRef.current = rec
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data)
        }
      }
      rec.start(1000)
      setState({ status: 'recording', captureNote })
    } catch (e) {
      stopTracks(displayStreamRef.current ?? display)
      stopTracks(micStreamRef.current)
      displayStreamRef.current = null
      micStreamRef.current = null
      void ctxRef.current?.close().catch(() => undefined)
      ctxRef.current = null
      const msg = e instanceof Error ? e.message : String(e)
      setState({ status: 'error', message: msg })
    }
  }, [cleanupGraph, state.status, stopTracks])

  const stop = useCallback(async (): Promise<{ sessionId: string; blob: Blob; mimeType: string } | null> => {
    if (state.status !== 'recording') {
      return null
    }
    const sessionId = sessionIdRef.current
    const rec = mediaRecorderRef.current
    mediaRecorderRef.current = null
    if (!rec || rec.state === 'inactive') {
      cleanupGraph()
      stopTracks(displayStreamRef.current)
      stopTracks(micStreamRef.current)
      displayStreamRef.current = null
      micStreamRef.current = null
      setState({ status: 'idle' })
      return null
    }

    const done = new Promise<Blob>((resolve, reject) => {
      rec.onerror = () => reject(new Error('MediaRecorder error'))
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' })
        resolve(blob)
      }
    })
    rec.stop()
    let blob: Blob
    try {
      blob = await done
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setState({ status: 'error', message: msg })
      cleanupGraph()
      stopTracks(displayStreamRef.current)
      stopTracks(micStreamRef.current)
      displayStreamRef.current = null
      micStreamRef.current = null
      return null
    }

    cleanupGraph()
    stopTracks(displayStreamRef.current)
    stopTracks(micStreamRef.current)
    displayStreamRef.current = null
    micStreamRef.current = null
    setState({ status: 'idle' })
    return { sessionId, blob, mimeType: blob.type || 'audio/webm' }
  }, [cleanupGraph, state.status, stopTracks])

  return { state, start, stop }
}
