import { useCallback, useEffect, useState, type MouseEvent, type ReactElement } from 'react'
import type { DisplayMediaSourceOption } from '@shared/ipc'
import { useHomeActions } from '../hooks/useHomeActions'
import { type CaptureAudioSource, useRecorder } from '../hooks/useRecorder'

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
  const [captureSource, setCaptureSource] = useState<CaptureAudioSource>(() =>
    /Windows/i.test(navigator.userAgent) ? 'systemOnly' : 'micOnly'
  )

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

  const stageLabels = [
    'Listening',
    'Transcribing',
    'Structuring Template',
    'Validating',
    'Ready'
  ] as const

  const activeStage = (() => {
    if (error || recorder.state.status === 'error') {
      return 0
    }
    if (recorder.state.status === 'recording') {
      return 0
    }
    if (busy) {
      if (busy.toLowerCase().includes('validating')) {
        return 3
      }
      if (busy.toLowerCase().includes('structuring')) {
        return 2
      }
      return 1
    }
    return 4
  })()

  return (
    <div className="stack">
      <div className="panel stack">
        <div className="panel-header">
          <h2>AI Call Assistant (configurable audio source)</h2>
          {recorder.state.status === 'recording' ? (
            <span className="status-pill recording">Recording live</span>
          ) : null}
        </div>
        <p className="muted">
          Your AI collaborator captures the call, transcribes the conversation, fills structured
          fields, and prepares the session for review. Default source prioritizes system audio to
          reduce repeated transcript loops.
        </p>
        <div className="capture-mode-grid">
          <div>
            <label htmlFor="capture-source">Audio source</label>
            <select
              id="capture-source"
              value={captureSource}
              disabled={recorder.state.status === 'recording' || !!busy}
              onChange={(e) => setCaptureSource(e.target.value as CaptureAudioSource)}
            >
              <option value="systemOnly">System only (recommended default)</option>
              <option value="systemAndMic">System + microphone</option>
              <option value="micOnly">Microphone only</option>
            </select>
          </div>
          <p className="muted">
            {captureSource === 'systemOnly'
              ? 'Captures call audio directly from system/tab when available. Best to avoid duplicated phrases.'
              : captureSource === 'systemAndMic'
                ? 'Includes your voice plus call audio. Use a headset to prevent speaker bleed and repeated transcript segments.'
                : 'Records only microphone input. Use this fallback if system loopback is unavailable.'}
          </p>
        </div>
        {captureSource === 'systemAndMic' ? (
          <p className="warnings">
            Headset recommended: using speakers with System + microphone can duplicate call audio and cause repeated phrases.
          </p>
        ) : null}
        <div className="assistant-console">
          <p className="assistant-title">AI Processing Console</p>
          <ol className="assistant-timeline">
            {stageLabels.map((label, idx) => {
              const status = error || recorder.state.status === 'error'
                ? idx === activeStage
                  ? 'error'
                  : idx < activeStage
                    ? 'done'
                    : 'todo'
                : idx < activeStage
                  ? 'done'
                  : idx === activeStage
                    ? 'active'
                    : 'todo'
              return (
                <li key={label} className={`assistant-stage ${status}`}>
                  <span className="assistant-dot" aria-hidden="true" />
                  <span>{label}</span>
                </li>
              )
            })}
          </ol>
          <p className="muted">
            {error || recorder.state.status === 'error'
              ? 'AI assistant needs your attention. Fix the issue and retry.'
              : busy ?? 'AI assistant is ready. Start recording to begin a new intake run.'}
          </p>
        </div>
        <div className="row">
          <button
            type="button"
            className="primary"
            disabled={recorder.state.status === 'recording' || !!busy}
            onClick={() => void startRecording(captureSource)}
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
        <div className="assistant-hint">
          <p className="assistant-title">Next step guidance</p>
          <p className="muted">
            {recorder.state.status === 'recording'
              ? 'Keep recording while the call is active. Then click "Stop & process" so the AI assistant can prepare the intake draft.'
              : busy
                ? 'Processing is in progress. Once complete, you will be moved to History to review the AI-generated draft.'
                : 'After processing, review transcript and template in History. Edit fields, confirm warnings, and copy the final output.'}
          </p>
        </div>
        {busy ? <p className="muted">{busy}</p> : null}
        {error ? <p className="error-message">{error}</p> : null}
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
            <div className="panel-header">
              <h2 id="display-picker-title">Share for recording</h2>
            </div>
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
