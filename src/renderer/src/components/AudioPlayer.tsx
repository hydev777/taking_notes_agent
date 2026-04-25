import { useEffect, useState, type ReactElement } from 'react'

export function AudioPlayer(props: { sessionId: string }): ReactElement | null {
  const [url, setUrl] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let revoked: string | null = null
    let cancelled = false
    void (async () => {
      setErr(null)
      setUrl(null)
      try {
        const res = await window.api.getSessionAudioBytes(props.sessionId)
        if (cancelled) {
          return
        }
        if (!res) {
          setErr('Audio not found')
          return
        }
        const blob = new Blob([res.data], { type: res.mime })
        const u = URL.createObjectURL(blob)
        revoked = u
        setUrl(u)
      } catch (e) {
        if (cancelled) {
          return
        }
        setErr(e instanceof Error ? e.message : 'Failed to load audio')
      }
    })()
    return () => {
      cancelled = true
      if (revoked) {
        URL.revokeObjectURL(revoked)
      }
    }
  }, [props.sessionId])

  if (err) {
    return <p className="muted">{err}</p>
  }
  if (!url) {
    return <p className="muted">Loading audio…</p>
  }
  return <audio controls src={url} style={{ width: '100%' }} />
}
