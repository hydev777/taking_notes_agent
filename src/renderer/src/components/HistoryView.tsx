import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { useTrial } from '../context/TrialContext'
import type { SessionListItem, SessionProcessingStatus } from '@shared/ipc'
import { TEMPLATE_LABELS } from '@shared/templateId'
import type { TemplateId } from '@shared/templateId'
import { AudioPlayer } from './AudioPlayer'
import { TemplateEditor } from './TemplateEditor'
import { useHistoryActions } from '../hooks/useHistoryActions'

type Props = {
  refreshToken: number
  latestProcessedSessionId?: string | null
}

type TemplatePanelMode = 'fields' | 'full'

const historyDateFormatter = new Intl.DateTimeFormat('en-US', {
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

function cleanValue(value: string | undefined): string {
  return (value ?? '').trim()
}

function pick(data: Record<string, string>, ...keys: string[]): string {
  for (const key of keys) {
    const value = cleanValue(data[key])
    if (value.length > 0) {
      return value
    }
  }
  return ''
}

function buildFullParagraph(templateId: TemplateId, templateData: Record<string, string>): string {
  if (templateId === 'lemonLaw') {
    return [
      'Lemon Law',
      '',
      `Name: ${pick(templateData, 'name')}`,
      'Case Type: Lemon Law',
      'Office: DTLA',
      `Phone Number: ${pick(templateData, 'phoneNumber')}`,
      `City: ${pick(templateData, 'city')}`,
      `Date: ${pick(templateData, 'date')}`,
      `Email: ${pick(templateData, 'email')}`,
      `Car Year Make Model: ${pick(templateData, 'carYearMakeModel')}`,
      `Year of purchase: ${pick(templateData, 'yearOfPurchase')}`,
      `Where did you buy it, leased or purchased?: ${pick(templateData, 'whereBoughtLeasedOrPurchased')}`,
      `New or Used: ${pick(templateData, 'newOrUsed')}`,
      `Mileage the/now: ${pick(templateData, 'mileageThenOrNow')}`,
      `Comments/Issues: ${pick(templateData, 'commentsOrIssues')}`,
      `  How many times have you taken the car to the repair shop: ${pick(templateData, 'repairShopVisitsCount')}`,
      `  When does the warranty end: ${pick(templateData, 'warrantyEnd')}`,
      `  How did you hear about us? ${pick(templateData, 'howDidYouHearAboutUs')}`,
      `  Schedule Call Back: ${pick(templateData, 'scheduleCallBack')}`,
      'Agent: Wilson Toribio'
    ].join('\n')
  }

  if (templateId === 'uberRequest') {
    return [
      'Uber Request Template',
      '',
      `Client: ${pick(templateData, 'client', 'name')}`,
      `Phone Number: ${pick(templateData, 'phoneNumber')}`,
      `Time: ${pick(templateData, 'time')}`,
      `Pick up: ${pick(templateData, 'pickUp')}`,
      `Drop off: ${pick(templateData, 'dropOff')}`,
      `Comments: ${pick(templateData, 'comments')}`,
      'Agent: Wilson Toribio'
    ].join('\n')
  }

  return [
    'General template for new clients',
    '',
    `Name: ${pick(templateData, 'name', 'client', 'who')}`,
    `Case Type: ${pick(templateData, 'caseType')}`,
    'Office: DTLA',
    'Signed: Pending',
    `City: ${pick(templateData, 'city')}`,
    `Date: ${pick(templateData, 'date')}`,
    `Phone Number: ${pick(templateData, 'phoneNumber')}`,
    `Email: ${pick(templateData, 'email')}`,
    `Comments: ${pick(templateData, 'comments')}`,
    `  How did you hear about us? ${pick(templateData, 'howDidYouHearAboutUs')}`,
    '  Schedule  Call Back: anytime',
    'Agent: Wilson Toribio'
  ].join('\n')
}

function statusLabel(status: SessionProcessingStatus): string {
  if (status === 'failed') {
    return 'Failed'
  }
  if (status === 'processing') {
    return 'Processing'
  }
  if (status === 'pending') {
    return 'Pending'
  }
  return 'Completed'
}

export function HistoryView(props: Props): ReactElement {
  const { trial } = useTrial()
  const trialExpired = trial.isExpired
  const [history, setHistory] = useState<SessionListItem[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [sessionId, setSessionId] = useState<string | null>(null)
  const [transcript, setTranscript] = useState<string>('')
  const [templateId, setTemplateId] = useState<TemplateId>('generalNewClients')
  const [templateData, setTemplateData] = useState<Record<string, string>>({})
  const [warnings, setWarnings] = useState<string[]>([])
  const [templatePanelMode, setTemplatePanelMode] = useState<TemplatePanelMode>('fields')
  const templateJson = useMemo(() => JSON.stringify(templateData), [templateData])
  const lastSavedTemplateJsonRef = useRef<string | null>(null)

  const displayedTemplateParagraph = useMemo(
    () => buildFullParagraph(templateId, templateData),
    [templateId, templateData]
  )

  const { loadHistory, openSession, deleteSession, retryProcessing } = useHistoryActions({
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
      {error ? <p className="error-message">{error}</p> : null}

      {!sessionId ? (
        <div className="stack">
          {props.latestProcessedSessionId ? (
            <div className="assistant-hint">
              <p className="assistant-title">AI assistant update</p>
              <p className="muted">
                Your latest call was processed successfully. The AI assistant prepared transcript,
                template fields, and initial validation checks. Open a session to review and finalize.
              </p>
            </div>
          ) : null}
          <ul className="session-list">
            {history.length === 0 ? <p className="muted">No sessions yet.</p> : null}
            {history.map((s) => (
              <li key={s.id} className="session-row">
                <div>
                  <div className="session-row-title">
                    <strong>{s.clientName}</strong> · {formatHistoryDate(s.endedAt)}
                  </div>
                  <div className="session-row-sub">
                    <span className={`status-pill session-${s.processingStatus}`}>
                      {statusLabel(s.processingStatus)}
                    </span>
                    {s.processingError ? ` · ${s.processingError}` : ''}
                  </div>
                  <div className="session-row-sub">{TEMPLATE_LABELS[s.templateId]}</div>
                  <div className="session-row-sub">{s.preview}</div>
                </div>
                <div className="row">
                  <button type="button" onClick={() => void openSession(s.id)}>
                    Open
                  </button>
                  <button
                    type="button"
                    disabled={
                      trialExpired ||
                      !!busy ||
                      s.processingStatus === 'processing' ||
                      s.processingStatus === 'completed'
                    }
                    onClick={() => void retryProcessing(s.id)}
                  >
                    Transcribe Call and Fill Template
                  </button>
                  <button type="button" className="danger" onClick={() => void deleteSession(s.id)}>
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="stack">
          <div className="row">
            <button type="button" onClick={backToList}>
              Back to history
            </button>
          </div>
          <div className="panel stack">
            <div className="panel-header">
              <h2>Call audio</h2>
            </div>
            <AudioPlayer sessionId={sessionId} />
          </div>

          <div className="grid-2">
            <div className="panel stack">
              <div className="panel-header">
                <h2>Transcript (read-only)</h2>
              </div>
              <p className="muted">
                AI assistant transcript draft. Review the dialogue and adjust template fields as needed.
              </p>
              {history.find((item) => item.id === sessionId)?.processingError ? (
                <p className="warnings">
                  Last processing error: {history.find((item) => item.id === sessionId)?.processingError}
                </p>
              ) : null}
              <div className="transcript-readonly" aria-readonly="true">
                {transcript.trim()
                  ? transcript
                  : 'Transcript is not available yet. If automatic processing failed, click "Transcribe Call and Fill Template".'}
              </div>
            </div>

            <div className="panel stack">
              <div className="panel-header">
                <h2>Template ({TEMPLATE_LABELS[templateId]})</h2>
              </div>
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
                <>
                  {!transcript.trim() ? (
                    <p className="muted">
                      Template autofill has not completed yet. Run "Transcribe Call and Fill Template" to generate fields automatically.
                    </p>
                  ) : null}
                  <TemplateEditor templateId={templateId} data={templateData} onChange={setTemplateData} />
                </>
              ) : (
                <div className="template-paragraph-wrap stack">
                  <textarea
                    className="template-paragraph-textarea"
                    readOnly
                    value={displayedTemplateParagraph}
                    aria-label="Template as one paragraph"
                  />
                  <div className="row">
                    <button
                      type="button"
                      disabled={
                        trialExpired ||
                        !!busy ||
                        history.find((item) => item.id === sessionId)?.processingStatus === 'processing' ||
                        history.find((item) => item.id === sessionId)?.processingStatus === 'completed'
                      }
                      onClick={() => void retryProcessing(sessionId)}
                    >
                      Transcribe Call and Fill Template
                    </button>
                    <button
                      type="button"
                      disabled={!!busy}
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
            <div className="panel stack">
              <div className="panel-header">
                <h3>Validation checks</h3>
              </div>
              <ul>
                {warnings.map((w) => (
                  <li key={w} className="warnings">{w}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="panel stack">
            <div className="panel-header">
              <h2>Email</h2>
            </div>
            <p className="muted">
              Sending email from the app is disabled for now. You can copy the template fields or transcript manually.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
