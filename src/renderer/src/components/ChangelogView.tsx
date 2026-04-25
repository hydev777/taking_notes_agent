import { useEffect, useState, type ReactElement } from 'react'

type LoadState = 'loading' | 'ready' | 'empty' | 'error'

export function ChangelogView(): ReactElement {
  const [state, setState] = useState<LoadState>('loading')
  const [content, setContent] = useState<string>('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setState('loading')
      setError(null)
      try {
        const res = await window.api.getChangelog()
        if (cancelled) {
          return
        }
        if (!res.ok) {
          setError(res.error)
          setState('error')
          return
        }
        const markdown = res.markdown.trim()
        if (!markdown) {
          setContent('')
          setState('empty')
          return
        }
        setContent(markdown)
        setState('ready')
      } catch (e) {
        if (cancelled) {
          return
        }
        setError(e instanceof Error ? e.message : 'Failed to load changelog')
        setState('error')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (state === 'loading') {
    return <p className="muted">Loading changelog...</p>
  }
  if (state === 'error') {
    return <p className="warnings">{error ?? 'Could not load changelog.'}</p>
  }
  if (state === 'empty') {
    return <p className="muted">No changelog content yet. Run `/update-changelog` first.</p>
  }

  return (
    <div className="panel stack">
      <h2>Changelog</h2>
      <p className="muted">Generated from commits on `main`.</p>
      <pre className="transcript-readonly" style={{ whiteSpace: 'pre-wrap' }}>
        {content}
      </pre>
    </div>
  )
}
