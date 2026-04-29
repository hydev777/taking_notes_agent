import { useCallback } from 'react'
import type { SessionListItem, SessionRecord } from '../../../shared/ipc'
import type { TemplateId } from '../../../shared/templateId'
import { fieldsByTemplateId } from '../../../shared/templateFormMeta'

type SessionLoadedPayload = {
  id: string
  transcript: string
  templateId: TemplateId
  templateData: Record<string, string>
  warnings: string[]
}

type Params = {
  onError: (message: string | null) => void
  onBusyMessage: (message: string | null) => void
  setHistory: (items: SessionListItem[]) => void
  setSessionLoaded: (payload: SessionLoadedPayload) => void
  currentSessionId: string | null
  clearCurrentSession: () => void
}

function toSessionLoaded(r: SessionRecord): SessionLoadedPayload {
  const parsed = JSON.parse(r.templateJson) as Record<string, unknown>
  const normalized: Record<string, string> = {}
  for (const field of fieldsByTemplateId[r.templateId]) {
    const value = parsed[field.key]
    normalized[field.key] = value == null ? '' : String(value)
  }
  return {
    id: r.id,
    transcript: r.transcript,
    templateId: r.templateId,
    templateData: normalized,
    warnings: r.validationWarnings
  }
}

export function useHistoryActions(params: Params): {
  loadHistory: () => Promise<void>
  openSession: (id: string) => Promise<void>
  deleteSession: (id: string) => Promise<void>
  retryProcessing: (id: string) => Promise<void>
} {
  const loadHistory = useCallback(async () => {
    params.onError(null)
    try {
      const rows = await window.api.listSessions()
      params.setHistory(rows)
    } catch (e) {
      params.onError(e instanceof Error ? e.message : String(e))
    }
  }, [params])

  const openSession = useCallback(
    async (id: string) => {
      params.onError(null)
      params.onBusyMessage('Loading session…')
      try {
        const row = await window.api.getSession(id)
        if (!row) {
          params.onError('Session not found')
          return
        }
        params.setSessionLoaded(toSessionLoaded(row))
      } catch (e) {
        params.onError(e instanceof Error ? e.message : String(e))
      } finally {
        params.onBusyMessage(null)
      }
    },
    [params]
  )

  const deleteSession = useCallback(
    async (id: string) => {
      if (!window.confirm('Delete this session and its audio file?')) {
        return
      }
      params.onError(null)
      try {
        const res = await window.api.deleteSession(id)
        if (!res.ok) {
          params.onError(res.error ?? 'Delete failed')
          return
        }
        const rows = await window.api.listSessions()
        params.setHistory(rows)
        const deletingCurrentSession = params.currentSessionId === id
        if (deletingCurrentSession) {
          params.clearCurrentSession()
        }
      } catch (e) {
        params.onError(e instanceof Error ? e.message : String(e))
      }
    },
    [params]
  )

  const retryProcessing = useCallback(
    async (id: string) => {
      params.onError(null)
      params.onBusyMessage('Running AI transcription and template fill…')
      try {
        await window.api.retrySessionProcessing(id)
        const rows = await window.api.listSessions()
        params.setHistory(rows)
        if (params.currentSessionId === id) {
          const row = await window.api.getSession(id)
          if (row) {
            params.setSessionLoaded(toSessionLoaded(row))
          }
        }
      } catch (e) {
        params.onError(e instanceof Error ? e.message : String(e))
      } finally {
        params.onBusyMessage(null)
      }
    },
    [params]
  )

  return { loadHistory, openSession, deleteSession, retryProcessing }
}
