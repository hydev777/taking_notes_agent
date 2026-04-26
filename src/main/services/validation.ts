import type { TemplateId } from '../../shared/templateId'

export type CaseCategory =
  | 'wrongfulTermination'
  | 'injuryAccidentAssaultSlipFall'
  | 'workersCompInjury'
  | 'other'

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function detectCaseCategory(caseTypeRaw: string): CaseCategory {
  const caseType = normalize(caseTypeRaw)
  if (!caseType) {
    return 'other'
  }
  if (caseType.includes('wrongful') && caseType.includes('termination')) {
    return 'wrongfulTermination'
  }
  if (
    caseType.includes('workers comp') ||
    caseType.includes('workers compensation') ||
    caseType.includes('worker compensation') ||
    (caseType.includes('worker') && caseType.includes('injury'))
  ) {
    return 'workersCompInjury'
  }
  if (
    caseType.includes('injury') ||
    caseType.includes('accident') ||
    caseType.includes('assault') ||
    caseType.includes('slip') ||
    caseType.includes('fall')
  ) {
    return 'injuryAccidentAssaultSlipFall'
  }
  return 'other'
}

function hasAny(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(term))
}

export function buildValidationWarnings(input: {
  transcript: string
  templateId: TemplateId
  caseType?: string
  comments?: string
}): string[] {
  const t = normalize(input.transcript)
  const comments = normalize(input.comments ?? '')
  const combined = `${comments}\n${t}`
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

  if (input.templateId === 'generalNewClients') {
    const category = detectCaseCategory(input.caseType ?? '')
    if (category === 'wrongfulTermination') {
      if (!hasAny(combined, ['company', 'workplace', 'employer', 'business', 'job site'])) {
        warnings.push('Wrongful Termination: comments should include company/workplace exact name.')
      }
      if (!hasAny(combined, ['termination', 'fired', 'dismissed', 'let go', 'reason'])) {
        warnings.push('Wrongful Termination: comments should include reason of termination.')
      }
      if (!hasAny(combined, ['salary', 'wage', 'hourly', 'pay rate', '$', 'per hour'])) {
        warnings.push('Wrongful Termination: comments should include salary/pay information.')
      }
      if (!hasAny(combined, ['time with', 'years', 'months', 'tenure', 'worked for'])) {
        warnings.push('Wrongful Termination: comments should include time with company/workplace.')
      }
    }
    if (category === 'injuryAccidentAssaultSlipFall') {
      if (!hasAny(combined, ['when', 'date', 'time', 'yesterday', 'today', 'last'])) {
        warnings.push('Injury/Accident/Assault/Slip-Fall: comments should include when it happened.')
      }
      if (!hasAny(combined, ['where', 'location', 'at ', 'street', 'address'])) {
        warnings.push('Injury/Accident/Assault/Slip-Fall: comments should include where it happened.')
      }
      if (!hasAny(combined, ['how', 'happened', 'occurred', 'cause', 'because'])) {
        warnings.push('Injury/Accident/Assault/Slip-Fall: comments should include how it happened.')
      }
      if (!hasAny(combined, ['police report', 'report yes', 'report no', 'yes', 'no'])) {
        warnings.push('Injury/Accident/Assault/Slip-Fall: comments should include police report YES or NO.')
      }
      if (!hasAny(combined, ['injury', 'injured', 'pain', 'hospital', 'medical', 'fracture', 'bruise'])) {
        warnings.push('Injury/Accident/Assault/Slip-Fall: comments should include injury details.')
      }
    }
    if (category === 'workersCompInjury') {
      if (!hasAny(combined, ['company', 'workplace', 'employer', 'business', 'job site'])) {
        warnings.push("Workers' Comp Injury: comments should include company/workplace exact name.")
      }
      if (!hasAny(combined, ['when', 'date', 'time', 'yesterday', 'today', 'last'])) {
        warnings.push("Workers' Comp Injury: comments should include when it happened.")
      }
      if (!hasAny(combined, ['how', 'happened', 'occurred', 'cause', 'because'])) {
        warnings.push("Workers' Comp Injury: comments should include how it happened.")
      }
      if (!hasAny(combined, ['injury', 'injured', 'pain', 'hospital', 'medical', 'fracture', 'bruise'])) {
        warnings.push("Workers' Comp Injury: comments should include injury details.")
      }
    }
  }

  return warnings
}
