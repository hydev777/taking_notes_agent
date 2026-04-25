import { useCallback, useEffect, useState, type MouseEvent, type ReactElement } from 'react'
import type { DisplayMediaSourceOption } from '@shared/ipc'
import { useHomeActions } from '../hooks/useHomeActions'
import { useRecorder } from '../hooks/useRecorder'

type Props = {
  onRequireProfile: () => void
  onProcessed: (sessionId: string) => void
  onCaptureLockChange: (locked: boolean) => void
}

export function HomeView(props: Props): ReactElement {
  const recorder = useRecorder()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [displayPickerSources, setDisplayPickerSources] = useState<DisplayMediaSourceOption[] | null>(null)

  const { startRecording, stopRecording, stopWithoutProcessing } = useHomeActions({
    recorder,
    onError: setError,
    onBusyMessage: setBusy,
    onRequireProfile: props.onRequireProfile,
    onProcessed: (id) => props.onProcessed(id)
  })

  useEffect(() => {
    return window.api.onDisplayMediaPickRequest((sources) => {
      setDisplayPickerSources(sources)
    })
  }, [])

  useEffect(() => {
    const locked = recorder.state.status === 'recording' || displayPickerSources != null
    props.onCaptureLockChange(locked)
    return () => props.onCaptureLockChange(false)
  }, [displayPickerSources, props.onCaptureLockChange, recorder.state.status])

  const cancelDisplayPick = useCallback(() => {
    window.api.submitDisplayMediaPick(null)
    setDisplayPickerSources(null)
  }, [])

  const confirmDisplayPick = useCallback((sourceId: string) => {
    window.api.submitDisplayMediaPick(sourceId)
    setDisplayPickerSources(null)
  }, [])

  return (
    <div className="stack">
      <div className="panel stack">
        <h2>Record call (CTM tab + mic)</h2>
        <p className="muted">
          Start recording opens a picker: choose the browser window with CTM (or the screen where
          the call plays). On Windows, system audio loopback is mixed with your mic. Recording is
          stored locally and sent to your OpenAI key for transcription. Legal/compliance is your
          responsibility.
        </p>
        <div className="row">
          <button
            type="button"
            className="primary"
            disabled={recorder.state.status === 'recording' || !!busy}
            onClick={() => void startRecording()}
          >
            Start recording
          </button>
          <button
            type="button"
            disabled={recorder.state.status !== 'recording' || !!busy}
            onClick={() => void stopRecording()}
          >
            Stop & process
          </button>
          <button
            type="button"
            disabled={recorder.state.status !== 'recording' || !!busy}
            onClick={stopWithoutProcessing}
          >
            Stop (No process)
          </button>
        </div>
        {busy ? <p className="muted">{busy}</p> : null}
        {error ? <p className="warnings">{error}</p> : null}
        {recorder.state.status === 'recording' ? (
          <>
            <p className="muted">Recording... stop when the call ends.</p>
            {recorder.state.captureNote ? (
              <p className="warnings">{recorder.state.captureNote}</p>
            ) : null}
          </>
        ) : null}
        {recorder.state.status === 'error' ? (
          <p className="warnings">{recorder.state.message}</p>
        ) : null}
      </div>
      {displayPickerSources != null ? (
        <div
          className="display-picker-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="display-picker-title"
          onClick={() => cancelDisplayPick()}
        >
          <div
            className="display-picker-panel panel stack"
            onClick={(e: MouseEvent) => e.stopPropagation()}
          >
            <h2 id="display-picker-title">Share for recording</h2>
            <p className="muted">
              Pick the window where the CTM / browser call is playing (or a full screen). Cancel if you changed your
              mind.
            </p>
            <ul className="display-picker-list">
              {displayPickerSources.map((s) => (
                <li key={s.id}>
                  <button type="button" className="display-picker-item" onClick={() => confirmDisplayPick(s.id)}>
                    <img src={s.thumbnailDataUrl} alt="" className="display-picker-thumb" />
                    <span className="display-picker-name">{s.name}</span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="row">
              <button type="button" onClick={() => cancelDisplayPick()}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
