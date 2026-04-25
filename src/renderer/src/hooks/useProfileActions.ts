import { useCallback } from 'react'

type Params = {
  getProfileName: () => string
  likelyBrowserNotElectron: boolean
  onError: (message: string | null) => void
  onSaved: (savedName: string) => void
}

export function useProfileActions(params: Params): { onSaveProfile: () => Promise<void> } {
  const onSaveProfile = useCallback(async () => {
    const n = params.getProfileName().trim()
    if (!n) {
      params.onError('Name is required')
      return
    }
    params.onError(null)
    try {
      await window.api.setProfileName(n)
      params.onSaved(n)
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e)
      const missingBridge =
        typeof window.api === 'undefined' ||
        raw.includes('Cannot read propert') ||
        raw.includes('is not a function')
      params.onError(
        missingBridge
          ? params.likelyBrowserNotElectron
            ? 'Estás en el navegador (localhost): aquí no existe window.api. Usa la ventana de escritorio que abre npm run dev (Electron), no una pestaña de Chrome/Edge.'
            : 'No hay puente con el proceso principal (preload). Cierra la app, ejecuta npm run build y npm run dev de nuevo, y revisa la consola del terminal por errores de preload.'
          : raw
      )
    }
  }, [params])

  return { onSaveProfile }
}
