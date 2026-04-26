import { useMemo, type ReactElement } from 'react'
import type { TemplateId } from '@shared/templateId'
import { fieldsByTemplateId } from '@shared/templateFormMeta'

export function TemplateEditor(props: {
  templateId: TemplateId
  data: Record<string, string>
  onChange: (next: Record<string, string>) => void
}): ReactElement {
  const fields = useMemo(() => fieldsByTemplateId[props.templateId], [props.templateId])

  return (
    <div className="field-grid">
      {fields.map((f) => (
        <div key={f.key} className="field-item">
          <label htmlFor={`f-${f.key}`}>{f.label}</label>
          {f.key === 'comments' ||
          f.key === 'commentsOrIssues' ||
          f.key === 'additionalNotes' ||
          f.key === 'consequences' ||
          f.key === 'nextSteps' ? (
            <textarea
              id={`f-${f.key}`}
              rows={4}
              value={props.data[f.key] ?? ''}
              onChange={(e) => props.onChange({ ...props.data, [f.key]: e.target.value })}
            />
          ) : (
            <input
              id={`f-${f.key}`}
              value={props.data[f.key] ?? ''}
              onChange={(e) => props.onChange({ ...props.data, [f.key]: e.target.value })}
            />
          )}
        </div>
      ))}
    </div>
  )
}
