import { contextBridge, ipcRenderer } from 'electron'
import type { DisplayMediaSourceOption, IpcApi } from '../shared/ipc'
import type { TrialState } from '../shared/trial'

const DISPLAY_MEDIA_PICKER = 'tna:display-media-picker'
const DISPLAY_MEDIA_SUBMIT = 'tna:display-media-pick'

const api: IpcApi = {
  getTrialState: () => ipcRenderer.invoke('tna:get-trial-state') as Promise<TrialState>,
  getProfileName: () => ipcRenderer.invoke('tna:get-profile') as Promise<string | null>,
  setProfileName: (name: string) => ipcRenderer.invoke('tna:set-profile', name) as Promise<void>,
  listSessions: () => ipcRenderer.invoke('tna:list-sessions'),
  getSession: (id: string) => ipcRenderer.invoke('tna:get-session', id),
  deleteSession: (id: string) => ipcRenderer.invoke('tna:delete-session', id),
  updateSessionTemplate: (input) => ipcRenderer.invoke('tna:update-session-template', input),
  processCallAudio: (input) => ipcRenderer.invoke('tna:process-call-audio', input),
  importAudioFile: () => ipcRenderer.invoke('tna:import-audio-file'),
  processImportedFile: (input) => ipcRenderer.invoke('tna:process-imported-file', input),
  retrySessionProcessing: (sessionId: string) =>
    ipcRenderer.invoke('tna:retry-session-processing', sessionId),
  previewEmail: (sessionId: string) => ipcRenderer.invoke('tna:preview-email', sessionId),
  sendEmail: (sessionId: string) => ipcRenderer.invoke('tna:send-email', sessionId),
  getSessionAudioBytes: (sessionId: string) =>
    ipcRenderer.invoke('tna:get-session-audio-bytes', sessionId),
  onDisplayMediaPickRequest: (handler: (sources: DisplayMediaSourceOption[]) => void) => {
    const listener = (_e: unknown, sources: DisplayMediaSourceOption[]) => {
      handler(sources)
    }
    ipcRenderer.on(DISPLAY_MEDIA_PICKER, listener)
    return () => {
      ipcRenderer.removeListener(DISPLAY_MEDIA_PICKER, listener)
    }
  },
  submitDisplayMediaPick: (sourceId: string | null) => {
    ipcRenderer.send(DISPLAY_MEDIA_SUBMIT, sourceId)
  },
  synthesizeTemplateParagraph: (input) => ipcRenderer.invoke('tna:synthesize-template-paragraph', input),
  getChangelog: () => ipcRenderer.invoke('tna:get-changelog')
}

contextBridge.exposeInMainWorld('api', api)
