import { useCallback, useEffect, useMemo, useState, type MouseEvent, type ReactElement } from 'react'
import type {
  DisplayMediaSourceOption,
  ProcessCallResult,
  SessionListItem,
  SessionRecord
} from '@shared/ipc'
import type { TemplateId } from '@shared/templateId'
import { TEMPLATE_LABELS } from '@shared/templateId'
import { fieldsByTemplateId, formatTemplateAsParagraph } from '@shared/templateFormMeta'
import { AudioPlayer } from './components/AudioPlayer'
import { TemplateEditor } from './components/TemplateEditor'
import { useRecorder } from './hooks/useRecorder'

type View =
  | { name: 'profile' }
  | { name: 'home' }
  | { name: 'session'; sessionId: string; transcript: string; templateId: TemplateId; warnings: string[] }
  | { name: 'history' }

type TemplatePanelMode = 'fields' | 'full'

type LlmParagraphStatus = 'idle' | 'loading' | 'ready' | 'error'

function emptyDataForTemplate(id: TemplateId): Record<string, string> {
  const out: Record<string, string> = {}
  for (const f of fieldsByTemplateId[id]) {
    out[f.key] = ''
  }
  return out
}

function payloadToData(payload: ProcessCallResult['templatePayload']): Record<string, string> {
  const base = emptyDataForTemplate(payload.templateId)
  const entries = Object.entries(payload.data as Record<string, unknown>)
  for (const [k, v] of entries) {
    base[k] = v == null ? '' : String(v)
  }
  return base
}

const historyDateFormatter = new Intl.DateTimeFormat('es-DO', {
  dateStyle: 'medium',
  timeStyle: 'short'
})

function formatHistoryDate(value: string): string {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) {
    return value
  }
  return historyDateFormatter.format(d)
}

export function App(): ReactElement {
  const [profileName, setProfileName] = useState<string>('')
  const [view, setView] = useState<View>({ name: 'profile' })
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [sessionId, setSessionId] = useState<string | null>(null)
  const [transcript, setTranscript] = useState('')
  const [templateId, setTemplateId] = useState<TemplateId>('generalNewClients')
  const [templateData, setTemplateData] = useState<Record<string, string>>(() =>
    emptyDataForTemplate('generalNewClients')
  )
  const [warnings, setWarnings] = useState<string[]>([])
  const [templatePanelMode, setTemplatePanelMode] = useState<TemplatePanelMode>('fields')

  const [history, setHistory] = useState<SessionListItem[]>([])
  const [displayPickerSources, setDisplayPickerSources] = useState<DisplayMediaSourceOption[] | null>(null)

  const fallbackParagraph = useMemo(
    () => formatTemplateAsParagraph(templateId, templateData),
    [templateId, templateData]
  )

  const [llmParagraph, setLlmParagraph] = useState<string | null>(null)
  const [llmParagraphStatus, setLlmParagraphStatus] = useState<LlmParagraphStatus>('idle')

  const templateDataFingerprint = useMemo(() => JSON.stringify(templateData), [templateData])

  useEffect(() => {
    setLlmParagraph(null)
    setLlmParagraphStatus('idle')
  }, [templateId, templateDataFingerprint, transcript])

  useEffect(() => {
    if (view.name !== 'session') {
      setLlmParagraph(null)
      setLlmParagraphStatus('idle')
    }
  }, [view.name])

  const displayedTemplateParagraph =
    llmParagraphStatus === 'ready' && llmParagraph != null && llmParagraph.length > 0
      ? llmParagraph
      : fallbackParagraph

  const generateLlmParagraph = useCallback(async () => {
    setLlmParagraphStatus('loading')
    setError(null)
    const res = await window.api.synthesizeTemplateParagraph({
      templateId,
      templateJson: JSON.stringify(templateData),
      transcript
    })
    if (!res.ok) {
      setLlmParagraph(null)
      setLlmParagraphStatus('error')
      setError(res.error)
      return
    }
    setLlmParagraph(res.paragraph)
    setLlmParagraphStatus('ready')
  }, [templateId, templateData, transcript])

  const copyTemplateParagraph = useCallback(async () => {
    setError(null)
    try {
      await navigator.clipboard.writeText(displayedTemplateParagraph)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not copy to clipboard')
    }
  }, [displayedTemplateParagraph])

  /** True when this page is opened in a normal browser on the Vite dev URL (no preload → no `window.api`). */
  const likelyBrowserNotElectron = useMemo(() => {
    if (typeof window === 'undefined') {
      return false
    }
    const host = window.location.hostname
    const local = host === 'localhost' || host === '127.0.0.1'
    return local && !/\belectron\b/i.test(navigator.userAgent)
  }, [])

  const recorder = useRecorder()

  const refreshHistory = useCallback(async () => {
    const rows = await window.api.listSessions()
    setHistory(rows)
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const existing = await window.api.getProfileName()
        if (cancelled) {
          return
        }
        if (existing && existing.trim()) {
          setProfileName(existing)
          setView({ name: 'home' })
        } else {
          setView({ name: 'profile' })
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e))
          setView({ name: 'profile' })
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    return window.api.onDisplayMediaPickRequest((sources) => {
      setDisplayPickerSources(sources)
    })
  }, [])

  const cancelDisplayPick = useCallback(() => {
    window.api.submitDisplayMediaPick(null)
    setDisplayPickerSources(null)
  }, [])

  const confirmDisplayPick = useCallback((sourceId: string) => {
    window.api.submitDisplayMediaPick(sourceId)
    setDisplayPickerSources(null)
  }, [])

  useEffect(() => {
    if (view.name !== 'session' || !sessionId) {
      return
    }
    const t = window.setTimeout(() => {
      void (async () => {
        const res = await window.api.updateSessionTemplate({
          id: sessionId,
          templateId,
          templateJson: JSON.stringify(templateData)
        })
        if (!res.ok) {
          setError(res.error ?? 'Failed to save template')
        }
      })()
    }, 800)
    return () => window.clearTimeout(t)
  }, [templateData, templateId, sessionId, view.name])

  const onSaveProfile = useCallback(async () => {
    const n = profileName.trim()
    if (!n) {
      setError('Name is required')
      return
    }
    setError(null)
    try {
      await window.api.setProfileName(n)
      setView({ name: 'home' })
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e)
      const missingBridge =
        typeof window.api === 'undefined' ||
        raw.includes("Cannot read propert") ||
        raw.includes('is not a function')
      setError(
        missingBridge
          ? likelyBrowserNotElectron
            ? 'Estás en el navegador (localhost): aquí no existe window.api. Usa la ventana de escritorio que abre npm run dev (Electron), no una pestaña de Chrome/Edge.'
            : 'No hay puente con el proceso principal (preload). Cierra la app, ejecuta npm run build y npm run dev de nuevo, y revisa la consola del terminal por errores de preload.'
          : raw
      )
    }
  }, [profileName, likelyBrowserNotElectron])

  const startRecording = useCallback(async () => {
    setError(null)
    const n = (await window.api.getProfileName())?.trim()
    if (!n) {
      setError('Set your profile name first (Settings).')
      setView({ name: 'profile' })
      return
    }
    const id = crypto.randomUUID()
    await recorder.start(id)
  }, [recorder])

  const stopRecording = useCallback(async () => {
    setError(null)
    setBusy('Processing audio (transcription + notes)…')
    try {
      const stopped = await recorder.stop()
      if (!stopped) {
        setBusy(null)
        return
      }
      const n = (await window.api.getProfileName())?.trim() ?? ''
      const buf = await stopped.blob.arrayBuffer()
      const result = await window.api.processCallAudio({
        sessionId: stopped.sessionId,
        audio: buf,
        mimeType: stopped.mimeType,
        profileName: n
      })
      applyProcessResult(stopped.sessionId, result)
      await refreshHistory()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }, [recorder, refreshHistory])

  const applyProcessResult = (id: string, result: ProcessCallResult) => {
    setSessionId(id)
    setTranscript(result.transcript)
    setTemplateId(result.templatePayload.templateId)
    setTemplateData(payloadToData(result.templatePayload))
    setWarnings(result.validationWarnings)
    setTemplatePanelMode('fields')
    setView({ name: 'session', sessionId: id, transcript: result.transcript, templateId: result.templatePayload.templateId, warnings: result.validationWarnings })
  }

  const openHistory = useCallback(async () => {
    setError(null)
    await refreshHistory()
    setView({ name: 'history' })
  }, [refreshHistory])

  const openSession = useCallback(async (id: string) => {
    setError(null)
    setBusy('Loading session…')
    try {
      const row: SessionRecord | null = await window.api.getSession(id)
      if (!row) {
        setError('Session not found')
        setBusy(null)
        return
      }
      setSessionId(row.id)
      setTranscript(row.transcript)
      setTemplateId(row.templateId)
      const parsed = JSON.parse(row.templateJson) as Record<string, unknown>
      const next: Record<string, string> = {}
      for (const f of fieldsByTemplateId[row.templateId]) {
        const v = parsed[f.key]
        next[f.key] = v == null ? '' : String(v)
      }
      setTemplateData(next)
      setWarnings([])
      setTemplatePanelMode('fields')
      setView({ name: 'session', sessionId: row.id, transcript: row.transcript, templateId: row.templateId, warnings: [] })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }, [])

  const deleteSession = useCallback(
    async (id: string) => {
      if (!window.confirm('Delete this session and its audio file?')) {
        return
      }
      const res = await window.api.deleteSession(id)
      if (!res.ok) {
        setError(res.error ?? 'Delete failed')
        return
      }
      if (sessionId === id) {
        setView({ name: 'home' })
        setSessionId(null)
      }
      await refreshHistory()
    },
    [refreshHistory, sessionId]
  )

  const title = useMemo(() => {
    if (view.name === 'history') {
      return 'Session history'
    }
    if (view.name === 'session' && sessionId) {
      return `Session ${sessionId.slice(0, 8)}`
    }
    return 'Taking Notes Agent'
  }, [view, sessionId])

  return (
    <div className="layout">
      <header className="topbar">
        <h1>{title}</h1>
        <span className="muted">Profile: {profileName || '—'}</span>
        <div className="row">
          <button type="button" onClick={() => setView({ name: 'profile' })}>
            Profile
          </button>
          <button type="button" onClick={() => setView({ name: 'home' })}>
            Home
          </button>
          <button type="button" onClick={() => void openHistory()}>
            History
          </button>
        </div>
      </header>

      <main>
        {busy ? <p className="muted">{busy}</p> : null}
        {error ? <p className="warnings">{error}</p> : null}

        {view.name === 'profile' ? (
          <div className="panel stack" style={{ maxWidth: 520 }}>
            <h2>Profile</h2>
            <p className="muted">
              Enter your name (operator). It is stored on this PC and attached to each saved session.
            </p>
            {likelyBrowserNotElectron ? (
              <p className="warnings">
                Parece que abriste esta URL en el navegador. Esta app solo funciona dentro de la ventana de Electron
                (la que se abre con <code>npm run dev</code>). Ahí sí aparece el puente <code>window.api</code>.
              </p>
            ) : null}
            <div>
              <label htmlFor="profile-name">Full name</label>
              <input
                id="profile-name"
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                autoComplete="name"
              />
            </div>
            <div className="row">
              <button type="button" className="primary" onClick={() => void onSaveProfile()}>
                Save
              </button>
            </div>
          </div>
        ) : null}

        {view.name === 'home' ? (
          <div className="stack">
            <div className="panel stack">
              <h2>Record call (CTM tab + mic)</h2>
              <p className="muted">
                Start recording opens a picker: choose the browser window with CTM (or the screen where the call plays).
                On Windows, system audio loopback is mixed with your mic. Recording is stored locally and sent to your
                OpenAI key for transcription. Legal/compliance is your responsibility.
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
                <button type="button" disabled={recorder.state.status !== 'recording' || !!busy} onClick={() => void stopRecording()}>
                  Stop & process
                </button>
              </div>
              {recorder.state.status === 'recording' ? (
                <>
                  <p className="muted">Recording… stop when the call ends.</p>
                  {recorder.state.captureNote ? <p className="warnings">{recorder.state.captureNote}</p> : null}
                </>
              ) : null}
              {recorder.state.status === 'error' ? <p className="warnings">{recorder.state.message}</p> : null}
            </div>

          </div>
        ) : null}

        {view.name === 'history' ? (
          <div className="stack">
            <ul className="session-list">
              {history.length === 0 ? <p className="muted">No sessions yet.</p> : null}
              {history.map((s) => (
                <li key={s.id}>
                  <div>
                    <div>
                      <strong>{formatHistoryDate(s.endedAt)}</strong> · {s.profileName}
                    </div>
                    <div className="muted">{TEMPLATE_LABELS[s.templateId]}</div>
                    <div className="muted">{s.preview}</div>
                  </div>
                  <div className="row">
                    <button type="button" onClick={() => void openSession(s.id)}>
                      Open
                    </button>
                    <button type="button" className="danger" onClick={() => void deleteSession(s.id)}>
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {view.name === 'session' && sessionId ? (
          <div className="stack">
            <div className="panel stack">
              <h2>Call audio</h2>
              <AudioPlayer sessionId={sessionId} />
            </div>

            <div className="grid-2">
              <div className="panel stack">
                <h2>Transcript (read-only)</h2>
                <div className="transcript-readonly" aria-readonly="true">
                  {transcript}
                </div>
              </div>

              <div className="panel stack">
                <h2>Template ({TEMPLATE_LABELS[templateId]})</h2>
                <div className="row template-view-toggle" role="group" aria-label="Template view">
                  <button
                    type="button"
                    className={templatePanelMode === 'fields' ? 'primary' : undefined}
                    onClick={() => setTemplatePanelMode('fields')}
                  >
                    By field
                  </button>
                  <button
                    type="button"
                    className={templatePanelMode === 'full' ? 'primary' : undefined}
                    onClick={() => setTemplatePanelMode('full')}
                  >
                    Full paragraph
                  </button>
                </div>
                {templatePanelMode === 'fields' ? (
                  <TemplateEditor templateId={templateId} data={templateData} onChange={setTemplateData} />
                ) : (
                  <div className="template-paragraph-wrap stack">
                    <p className="muted">
                      Simple join of filled fields is shown by default. Use{' '}
                      <strong>Generate with AI</strong> for one contextual paragraph (cheap model; uses transcript +
                      fields).
                    </p>
                    {llmParagraphStatus === 'loading' ? (
                      <p className="muted">Generating summary…</p>
                    ) : null}
                    <textarea
                      className="template-paragraph-textarea"
                      readOnly
                      value={displayedTemplateParagraph}
                      aria-label="Template as one paragraph"
                    />
                    <div className="row">
                      <button
                        type="button"
                        className="primary"
                        disabled={llmParagraphStatus === 'loading' || !!busy}
                        onClick={() => void generateLlmParagraph()}
                      >
                        Generate with AI
                      </button>
                      <button
                        type="button"
                        disabled={llmParagraphStatus === 'loading' || !!busy}
                        onClick={() => void copyTemplateParagraph()}
                      >
                        Copy all
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {warnings.length > 0 ? (
              <div className="panel stack warnings">
                <h3>Validation checks</h3>
                <ul>
                  {warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="panel stack">
              <h2>Email</h2>
              <p className="muted">Sending email from the app is disabled for now. You can copy the template fields or transcript manually.</p>
            </div>
          </div>
        ) : null}
      </main>

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
