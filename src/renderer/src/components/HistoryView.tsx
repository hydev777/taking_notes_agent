import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import type { SessionListItem } from '@shared/ipc'
import { TEMPLATE_LABELS } from '@shared/templateId'
import type { TemplateId } from '@shared/templateId'
import { formatTemplateAsParagraph } from '@shared/templateFormMeta'
import { AudioPlayer } from './AudioPlayer'
import { TemplateEditor } from './TemplateEditor'
import { useHistoryActions } from '../hooks/useHistoryActions'

type Props = {
  refreshToken: number
}

type TemplatePanelMode = 'fields' | 'full'
type LlmParagraphStatus = 'idle' | 'loading' | 'ready' | 'error'

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

export function HistoryView(props: Props): ReactElement {
  const [history, setHistory] = useState<SessionListItem[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [sessionId, setSessionId] = useState<string | null>(null)
  const [transcript, setTranscript] = useState<string>('')
  const [templateId, setTemplateId] = useState<TemplateId>('generalNewClients')
  const [templateData, setTemplateData] = useState<Record<string, string>>({})
  const [warnings, setWarnings] = useState<string[]>([])
  const [templatePanelMode, setTemplatePanelMode] = useState<TemplatePanelMode>('fields')
  const [llmParagraph, setLlmParagraph] = useState<string | null>(null)
  const [llmParagraphStatus, setLlmParagraphStatus] = useState<LlmParagraphStatus>('idle')
  const templateJson = useMemo(() => JSON.stringify(templateData), [templateData])
  const lastSavedTemplateJsonRef = useRef<string | null>(null)

  const fallbackParagraph = useMemo(
    () => formatTemplateAsParagraph(templateId, templateData),
    [templateId, templateData]
  )
  const displayedTemplateParagraph =
    llmParagraphStatus === 'ready' && llmParagraph != null && llmParagraph.length > 0
      ? llmParagraph
      : fallbackParagraph

  const { loadHistory, openSession, deleteSession } = useHistoryActions({
    onError: setError,
    onBusyMessage: setBusy,
    setHistory,
    setSessionLoaded: (payload) => {
      setSessionId(payload.id)
      setTranscript(payload.transcript)
      setTemplateId(payload.templateId)
      setTemplateData(payload.templateData)
      setWarnings(payload.warnings)
      setTemplatePanelMode('fields')
      lastSavedTemplateJsonRef.current = JSON.stringify(payload.templateData)
    },
    currentSessionId: sessionId,
    clearCurrentSession: () => {
      setSessionId(null)
      setTranscript('')
      setWarnings([])
    }
  })

  useEffect(() => {
    void loadHistory()
  }, [loadHistory, props.refreshToken])

  useEffect(() => {
    if (!sessionId) {
      return
    }
    const t = window.setTimeout(() => {
      void (async () => {
        if (lastSavedTemplateJsonRef.current === templateJson) {
          return
        }
        const res = await window.api.updateSessionTemplate({
          id: sessionId,
          templateId,
          templateJson
        })
        if (res.ok) {
          lastSavedTemplateJsonRef.current = templateJson
          return
        }
        setError(res.error ?? 'Failed to save template')
      })()
    }, 800)
    return () => window.clearTimeout(t)
  }, [sessionId, templateId, templateJson])

  useEffect(() => {
    setLlmParagraph(null)
    setLlmParagraphStatus('idle')
  }, [templateId, templateData, transcript, sessionId])

  const generateLlmParagraph = useCallback(async () => {
    setLlmParagraphStatus('loading')
    setError(null)
    const res = await window.api.synthesizeTemplateParagraph({
      templateId,
      templateJson,
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
  }, [templateId, templateJson, transcript])

  const copyTemplateParagraph = useCallback(async () => {
    setError(null)
    try {
      await navigator.clipboard.writeText(displayedTemplateParagraph)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not copy to clipboard')
    }
  }, [displayedTemplateParagraph])

  const backToList = useCallback(() => {
    setSessionId(null)
    setWarnings([])
  }, [])

  return (
    <div className="stack">
      {busy ? <p className="muted">{busy}</p> : null}
      {error ? <p className="warnings">{error}</p> : null}

      {!sessionId ? (
        <ul className="session-list">
          {history.length === 0 ? <p className="muted">No sessions yet.</p> : null}
          {history.map((s) => (
            <li key={s.id}>
              <div>
                <div>
                  <strong>{s.clientName}</strong> · {formatHistoryDate(s.endedAt)}
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
      ) : (
        <div className="stack">
          <div className="row">
            <button type="button" onClick={backToList}>
              Back to history
            </button>
          </div>
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
                  {llmParagraphStatus === 'loading' ? <p className="muted">Generating summary…</p> : null}
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
            <p className="muted">
              Sending email from the app is disabled for now. You can copy the template fields or transcript manually.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
