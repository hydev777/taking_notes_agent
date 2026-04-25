import { useEffect, useMemo, useState, type ReactElement } from 'react'
import { HistoryView } from './components/HistoryView'
import { HomeView } from './components/HomeView'
import { ProfileView } from './components/ProfileView'
type TabKey = 'profile' | 'home' | 'history'

export function App(): ReactElement {
  const [profileName, setProfileName] = useState<string>('')
  const [activeTab, setActiveTab] = useState<TabKey>('home')
  const [historyRefreshToken, setHistoryRefreshToken] = useState<number>(0)
  const [homeCaptureLocked, setHomeCaptureLocked] = useState<boolean>(false)

  const likelyBrowserNotElectron = useMemo(() => {
    if (typeof window === 'undefined') {
      return false
    }
    const host = window.location.hostname
    const local = host === 'localhost' || host === '127.0.0.1'
    return local && !/\belectron\b/i.test(navigator.userAgent)
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
          setActiveTab('home')
        } else {
          setActiveTab('profile')
        }
      } catch (e) {
        if (!cancelled) {
          setActiveTab('profile')
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const title = useMemo(() => {
    if (activeTab === 'history') {
      return 'Session history'
    }
    if (activeTab === 'profile') {
      return 'Profile'
    }
    return 'Taking Notes Agent'
  }, [activeTab])

  const tabsBlockedByCapture = homeCaptureLocked && activeTab === 'home'

  return (
    <div className="layout">
      <header className="topbar">
        <h1>{title}</h1>
        <span className="muted">Profile: {profileName || '—'}</span>
        <div className="row">
          <button
            type="button"
            className={activeTab === 'profile' ? 'primary' : undefined}
            onClick={() => setActiveTab('profile')}
            disabled={tabsBlockedByCapture}
            title={tabsBlockedByCapture ? 'Stop or cancel current recording/share first.' : undefined}
          >
            Profile
          </button>
          <button type="button" className={activeTab === 'home' ? 'primary' : undefined} onClick={() => setActiveTab('home')}>
            Home
          </button>
          <button
            type="button"
            className={activeTab === 'history' ? 'primary' : undefined}
            onClick={() => setActiveTab('history')}
            disabled={tabsBlockedByCapture}
            title={tabsBlockedByCapture ? 'Stop or cancel current recording/share first.' : undefined}
          >
            History
          </button>
        </div>
      </header>

      <main>
        {tabsBlockedByCapture ? (
          <p className="muted">Capture is active. Stop or cancel recording before leaving Home.</p>
        ) : null}
        <section hidden={activeTab !== 'profile'} aria-hidden={activeTab !== 'profile'}>
          <ProfileView
            likelyBrowserNotElectron={likelyBrowserNotElectron}
            initialProfileName={profileName}
            onProfileSaved={(nextName: string) => {
              setProfileName(nextName)
              setActiveTab('home')
            }}
          />
        </section>

        <section hidden={activeTab !== 'home'} aria-hidden={activeTab !== 'home'}>
          <HomeView
            onRequireProfile={() => setActiveTab('profile')}
            onProcessed={(_sessionId: string) => {
              setHistoryRefreshToken((t) => t + 1)
              setActiveTab('history')
            }}
            onCaptureLockChange={setHomeCaptureLocked}
          />
        </section>

        <section hidden={activeTab !== 'history'} aria-hidden={activeTab !== 'history'}>
          <HistoryView
            refreshToken={historyRefreshToken}
          />
        </section>
      </main>
    </div>
  )
}
