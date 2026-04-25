import { useEffect, useState, type ChangeEvent, type ReactElement } from 'react'
import { useProfileActions } from '../hooks/useProfileActions'

type Props = {
  initialProfileName: string
  likelyBrowserNotElectron: boolean
  onProfileSaved: (next: string) => void
}

export function ProfileView(props: Props): ReactElement {
  const [profileName, setProfileName] = useState<string>(props.initialProfileName)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setProfileName(props.initialProfileName)
  }, [props.initialProfileName])

  const { onSaveProfile } = useProfileActions({
    getProfileName: () => profileName,
    likelyBrowserNotElectron: props.likelyBrowserNotElectron,
    onError: setError,
    onSaved: props.onProfileSaved
  })

  const onInput = (e: ChangeEvent<HTMLInputElement>) => {
    setProfileName(e.target.value)
  }

  return (
    <div className="panel stack" style={{ maxWidth: 520 }}>
      <h2>Profile</h2>
      <p className="muted">
        Enter your name (operator). It is stored on this PC and attached to each saved session.
      </p>
      {props.likelyBrowserNotElectron ? (
        <p className="warnings">
          Parece que abriste esta URL en el navegador. Esta app solo funciona dentro de la ventana de
          Electron (la que se abre con <code>npm run dev</code>). Ahi si aparece el puente{' '}
          <code>window.api</code>.
        </p>
      ) : null}
      {error ? <p className="warnings">{error}</p> : null}
      <div>
        <label htmlFor="profile-name">Full name</label>
        <input
          id="profile-name"
          value={profileName}
          onChange={onInput}
          autoComplete="name"
        />
      </div>
      <div className="row">
        <button type="button" className="primary" onClick={() => void onSaveProfile()}>
          Save
        </button>
      </div>
    </div>
  )
}
