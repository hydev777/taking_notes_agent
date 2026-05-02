import { type ReactElement } from 'react'
import { useTrial } from '../context/TrialContext'

type Step = { title: string; body: ReactElement }

const STEPS: Step[] = [
  {
    title: '1. Set your operator profile',
    body: (
      <p className="muted">
        Open the <strong>Profile</strong> tab, type your name, and save. This name is shown in the
        top bar and is recorded with every session and outgoing email. You will be sent here
        automatically the first time you launch the app.
      </p>
    )
  },
  {
    title: '2. Pick the audio source',
    body: (
      <p className="muted">
        On <strong>Home</strong>, choose under <em>Audio source</em>:
        {' '}
        <strong>System + microphone</strong> (recommended for CTM web on a headset, captures both
        sides), <strong>System only</strong> (only the shared tab/window), or
        {' '}
        <strong>Microphone only</strong> (only your voice). The caller is captured only when you
        share the CTM tab WITH its audio.
      </p>
    )
  },
  {
    title: '3. Chrome share dialog',
    body: (
      <p className="muted">
        When you click <strong>Start recording</strong> with a system source, Chrome opens its
        share dialog. Pick the <strong>CTM tab</strong> (not Window, not Screen) and tick
        {' '}
        <strong>&ldquo;Share tab audio&rdquo;</strong> at the bottom-left. Without that checkbox
        the caller&apos;s voice is not captured and the transcript looks like
        {' '}
        &ldquo;Thank you. Thank you.&rdquo; loops.
      </p>
    )
  },
  {
    title: '4. Record the call',
    body: (
      <p className="muted">
        Press <strong>Start recording</strong>. A red &ldquo;Recording live&rdquo; pill appears
        and the AI Processing Console shows the <em>Listening</em> stage. While recording you
        cannot leave Home or change the audio source &mdash; stop or cancel first.
      </p>
    )
  },
  {
    title: '5. Stop & process',
    body: (
      <p className="muted">
        When the call ends, click <strong>Stop &amp; process</strong>. The console walks through
        Transcribing &rarr; Structuring Template &rarr; Validating &rarr; Ready, then jumps you to
        History with the new session selected. Use <strong>Stop (No process)</strong> to discard
        without sending audio to the AI.
      </p>
    )
  },
  {
    title: '6. Review in History',
    body: (
      <p className="muted">
        Open the session in <strong>History</strong>: edit fields, confirm any warnings flagged by
        the validator, copy the final output. You can also retry processing if something looks
        off.
      </p>
    )
  },
  {
    title: '7. Send the email',
    body: (
      <p className="muted">
        From the History detail, send the structured intake to the routed inbox. Recipients are
        mapped by template in <code>resources/routing.json</code>; ask the maintainer if you need
        a new template wired up.
      </p>
    )
  }
]

export function TutorialView(): ReactElement {
  const { trial } = useTrial()
  const showTrialNote = __TRIAL_ENABLED__
  const trialLine = trial.isExpired
    ? `Trial expired ${Math.abs(trial.daysRemaining)} day(s) ago. Recording and AI processing are disabled; History and re-emailing still work.`
    : `Trial active. ${trial.daysRemaining} day(s) remaining before recording and AI processing turn off.`

  return (
    <div className="panel stack">
      <div className="panel-header">
        <h2>Tutorial</h2>
      </div>
      <p className="muted">
        Quick walkthrough of the full flow: profile &rarr; record &rarr; review &rarr; email.
      </p>
      <ol className="stack" style={{ paddingLeft: '1.25rem' }}>
        {STEPS.map((s) => (
          <li key={s.title} className="stack" style={{ gap: '0.25rem' }}>
            <h3 style={{ margin: 0 }}>{s.title}</h3>
            {s.body}
          </li>
        ))}
      </ol>
      {showTrialNote ? (
        <div className="assistant-hint">
          <p className="assistant-title">Trial status</p>
          <p className="muted">{trialLine}</p>
        </div>
      ) : null}
    </div>
  )
}
