import { useEffect, useMemo, useState, type ReactElement } from 'react'
import { ChangelogView } from './components/ChangelogView'
import { HistoryView } from './components/HistoryView'
import { HomeView } from './components/HomeView'
import { ProfileView } from './components/ProfileView'
type TabKey = 'profile' | 'home' | 'history' | 'changelog'

export function App(): ReactElement {
  const [profileName, setProfileName] = useState<string>('')
  const [activeTab, setActiveTab] = useState<TabKey>('home')
  const [historyRefreshToken, setHistoryRefreshToken] = useState<number>(0)
  const [homeCaptureLocked, setHomeCaptureLocked] = useState<boolean>(false)
  const [lastProcessedSessionId, setLastProcessedSessionId] = useState<string | null>(null)

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
    if (activeTab === 'changelog') {
      return 'Changelog'
    }
    return 'AI collaborator'
  }, [activeTab])

  const tabsBlockedByCapture = homeCaptureLocked && activeTab === 'home'

  return (
    <div className="layout">
      <header className="topbar">
        <div className="topbar-main">
          <span className="brand">Taking Notes Agent AI</span>
          <span className="topbar-meta">{title}</span>
        </div>
        <span className="topbar-meta">Operator + AI: {profileName || 'Not set'}</span>
      </header>

      <div className="workspace-shell">
        <aside className="sidebar" role="tablist" aria-label="Main Navigation">
          <p className="sidebar-title">Navigation</p>
          <button
            type="button"
            className={activeTab === 'profile' ? 'primary' : undefined}
            onClick={() => setActiveTab('profile')}
            disabled={tabsBlockedByCapture}
            title={tabsBlockedByCapture ? 'Stop or cancel current recording/share first.' : undefined}
            role="tab"
            aria-selected={activeTab === 'profile'}
          >
            Profile
          </button>
          <button
            type="button"
            className={activeTab === 'home' ? 'primary' : undefined}
            onClick={() => setActiveTab('home')}
            role="tab"
            aria-selected={activeTab === 'home'}
          >
            Home
          </button>
          <button
            type="button"
            className={activeTab === 'history' ? 'primary' : undefined}
            onClick={() => setActiveTab('history')}
            disabled={tabsBlockedByCapture}
            title={tabsBlockedByCapture ? 'Stop or cancel current recording/share first.' : undefined}
            role="tab"
            aria-selected={activeTab === 'history'}
          >
            History
          </button>
          <button
            type="button"
            className={activeTab === 'changelog' ? 'primary' : undefined}
            onClick={() => setActiveTab('changelog')}
            disabled={tabsBlockedByCapture}
            title={tabsBlockedByCapture ? 'Stop or cancel current recording/share first.' : undefined}
            role="tab"
            aria-selected={activeTab === 'changelog'}
          >
            Changelog
          </button>
        </aside>

        <main>
          <div className="section-shell stack">
            {tabsBlockedByCapture ? (
              <p className="warnings">Capture is active. Stop or cancel recording before leaving Home.</p>
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
                onProcessed={(sessionId: string) => {
                  setLastProcessedSessionId(sessionId)
                  setHistoryRefreshToken((t) => t + 1)
                  setActiveTab('history')
                }}
                onCaptureLockChange={setHomeCaptureLocked}
              />
            </section>

            <section hidden={activeTab !== 'history'} aria-hidden={activeTab !== 'history'}>
              <HistoryView refreshToken={historyRefreshToken} latestProcessedSessionId={lastProcessedSessionId} />
            </section>
            <section hidden={activeTab !== 'changelog'} aria-hidden={activeTab !== 'changelog'}>
              <ChangelogView />
            </section>
          </div>
        </main>
      </div>
    </div>
  )
}
