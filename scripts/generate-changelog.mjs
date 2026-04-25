import { execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const OUTPUT_FILE = resolve(process.cwd(), 'CHANGELOG.md')

function detectBaseRef() {
  const candidates = ['main', 'origin/main']
  for (const ref of candidates) {
    try {
      execSync(`git rev-parse --verify "${ref}"`, { stdio: 'ignore' })
      return ref
    } catch {
      // Try next ref.
    }
  }
  throw new Error('Could not find "main" or "origin/main"')
}

function getCommitLines(baseRef) {
  const format = '%H%x09%h%x09%ad%x09%s'
  const cmd = `git log "${baseRef}" --date=short --pretty=format:${format}`
  const out = execSync(cmd, { encoding: 'utf8' })
  return out
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

function escapeMarkdown(value) {
  return value.replace(/\|/g, '\\|').trim()
}

function buildShortDescription(subject) {
  const s = subject.trim()
  const lower = s.toLowerCase()

  const withoutPrefix = s
    .replace(/^[a-z]+(\([^)]+\))?!?:\s*/i, '')
    .replace(/^merge\s+pull\s+request\s+#\d+\s+from\s+/i, '')
    .trim()

  if (lower.startsWith('feat')) {
    return `Added: ${withoutPrefix || 'new feature'}`
  }
  if (lower.startsWith('fix')) {
    return `Fixed: ${withoutPrefix || 'bug fixes'}`
  }
  if (lower.startsWith('perf')) {
    return `Improved: ${withoutPrefix || 'performance improvements'}`
  }
  if (lower.startsWith('refactor')) {
    return `Refactored: ${withoutPrefix || 'internal code improvements'}`
  }
  if (lower.startsWith('docs')) {
    return `Documented: ${withoutPrefix || 'documentation updates'}`
  }
  if (lower.startsWith('test')) {
    return `Tested: ${withoutPrefix || 'test updates'}`
  }
  if (lower.startsWith('chore')) {
    return `Updated: ${withoutPrefix || 'maintenance updates'}`
  }
  return `Updated: ${withoutPrefix || s || 'changes'}`
}

function buildMarkdown(baseRef, lines) {
  const generatedAt = new Date().toISOString()
  const header = [
    '# Changelog',
    '',
    `Generated from \`${baseRef}\` commits.`,
    `Generated at: ${generatedAt}`,
    '',
    '| Date | Commit | Summary |',
    '| --- | --- | --- |'
  ]
  const rows = lines.map((line) => {
    const [, shortHash = '', date = '', subject = ''] = line.split('\t')
    const summary = buildShortDescription(subject)
    return `| ${date} | \`${shortHash}\` | ${escapeMarkdown(summary)} |`
  })
  if (rows.length === 0) {
    rows.push('| - | - | Updated: no commits found. |')
  }
  return [...header, ...rows, ''].join('\n')
}

function main() {
  const baseRef = detectBaseRef()
  const commits = getCommitLines(baseRef)
  const markdown = buildMarkdown(baseRef, commits)
  writeFileSync(OUTPUT_FILE, markdown, 'utf8')
  console.log(`CHANGELOG.md generated from ${baseRef} (${commits.length} commits).`)
}

main()
