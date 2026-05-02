import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode
} from 'react'
import type { TrialState } from '@shared/trial'
import { TRIAL_ALWAYS_ACTIVE } from '@shared/trial'

type TrialContextValue = {
  trial: TrialState
  refreshTrial: () => Promise<void>
}

const TrialContext = createContext<TrialContextValue | null>(null)

export function TrialProvider(props: { children: ReactNode }): ReactElement {
  const [trial, setTrial] = useState<TrialState>(TRIAL_ALWAYS_ACTIVE)

  const refreshTrial = useCallback(async () => {
    try {
      const next = await window.api.getTrialState()
      setTrial(next)
    } catch {
      /* fail-open: keep prior state */
    }
  }, [])

  useEffect(() => {
    void refreshTrial()
  }, [refreshTrial])

  useEffect(() => {
    const onFocus = () => void refreshTrial()
    window.addEventListener('focus', onFocus)
    const id = window.setInterval(() => void refreshTrial(), 5 * 60 * 1000)
    return () => {
      window.removeEventListener('focus', onFocus)
      window.clearInterval(id)
    }
  }, [refreshTrial])

  const value = useMemo(() => ({ trial, refreshTrial }), [trial, refreshTrial])

  return <TrialContext.Provider value={value}>{props.children}</TrialContext.Provider>
}

export function useTrial(): TrialContextValue {
  const ctx = useContext(TrialContext)
  if (!ctx) {
    throw new Error('useTrial must be used within TrialProvider')
  }
  return ctx
}
