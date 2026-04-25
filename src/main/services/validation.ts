import type { TemplateId } from '../../shared/templateId'

export function buildValidationWarnings(input: {
  transcript: string
  templateId: TemplateId
}): string[] {
  const t = input.transcript.toLowerCase()
  const warnings: string[] = []

  if (!t.includes('not a lawyer')) {
    warnings.push('Opening statement may be missing: "I am not a lawyer…" (verify against training material).')
  }

  if (input.templateId === 'lemonLaw') {
    if (!t.includes('zero dollar') && !t.includes('manufacturer pays')) {
      warnings.push('Lemon Law closing may be missing: "You pay zero dollars…" / manufacturer pays costs (verify transcript).')
    }
  } else {
    if (!t.includes('nothing upfront') && !t.includes('pay nothing upfront')) {
      warnings.push('Standard closing may be missing: fees / "pay nothing upfront" language (verify transcript).')
    }
  }

  return warnings
}
