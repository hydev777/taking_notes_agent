import { execSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const WORKSPACE_ROOT = process.cwd()
const CHANGELOG_FILE = resolve(WORKSPACE_ROOT, 'CHANGELOG.md')
const PACKAGE_FILE = resolve(WORKSPACE_ROOT, 'package.json')
const CHANGELOG_HEADER = [
  '# Changelog',
  '',
  'All notable changes to this project are documented in this file.',
  '',
  'The newest version appears first.',
  ''
].join('\n')

const CATEGORY_ORDER = ['Added', 'Changed', 'Fixed', 'Refactored', 'Docs', 'Chore', 'Security']

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

function readPackageJson() {
  const raw = readFileSync(PACKAGE_FILE, 'utf8')
  return JSON.parse(raw)
}

function writePackageJson(pkg) {
  writeFileSync(PACKAGE_FILE, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8')
}

function bumpPatchVersion(version) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(version.trim())
  if (!m) {
    throw new Error(`Unsupported package version format: "${version}"`)
  }
  const major = Number(m[1])
  const minor = Number(m[2])
  const patch = Number(m[3]) + 1
  return `${major}.${minor}.${patch}`
}

function getCommitEntries(baseRef) {
  const format = '%H%x09%h%x09%ad%x09%s'
  const cmd = `git log "${baseRef}" --date=short --pretty=format:${format}`
  const out = execSync(cmd, { encoding: 'utf8' })
  return out
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [hash = '', shortHash = '', date = '', subject = ''] = line.split('\t')
      return { hash, shortHash, date, subject }
    })
}

function normalizeSubject(subject) {
  return subject
    .trim()
    .replace(/^[a-z]+(\([^)]+\))?!?:\s*/i, '')
    .replace(/^merge\s+pull\s+request\s+#\d+\s+from\s+/i, '')
    .trim()
}

function classifyCategory(subject) {
  const s = subject.trim().toLowerCase()
  if (s.includes('security') || s.startsWith('sec')) {
    return 'Security'
  }
  if (s.startsWith('feat')) {
    return 'Added'
  }
  if (s.startsWith('fix')) {
    return 'Fixed'
  }
  if (s.startsWith('refactor')) {
    return 'Refactored'
  }
  if (s.startsWith('docs')) {
    return 'Docs'
  }
  if (s.startsWith('chore') || s.startsWith('build') || s.startsWith('ci')) {
    return 'Chore'
  }
  return 'Changed'
}

function escapeMarkdown(value) {
  return value.replace(/\|/g, '\\|').trim()
}

function buildSummaryLines(version, entriesByCategory, totalCommits) {
  const lines = [`- Released \`v${version}\` with ${totalCommits} change(s).`]
  const populated = CATEGORY_ORDER
    .map((category) => ({ category, count: entriesByCategory[category]?.length ?? 0 }))
    .filter((c) => c.count > 0)
    .slice(0, 2)
  for (const item of populated) {
    lines.push(`- ${item.category}: ${item.count} item(s).`)
  }
  return lines
}

function buildVersionBlock(version, date, commits) {
  const categorized = Object.fromEntries(CATEGORY_ORDER.map((name) => [name, []]))
  for (const commit of commits) {
    const category = classifyCategory(commit.subject)
    categorized[category].push(`- ${escapeMarkdown(normalizeSubject(commit.subject) || commit.subject)} (\`${commit.shortHash}\`)`)
  }

  const out = [`## [v${version}] - ${date}`, '', '### Summary']
  out.push(...buildSummaryLines(version, categorized, commits.length))
  out.push('')

  for (const category of CATEGORY_ORDER) {
    const items = categorized[category]
    if (!items || items.length === 0) {
      continue
    }
    out.push(`### ${category}`)
    out.push(...items)
    out.push('')
  }

  return out.join('\n').trimEnd()
}

function upsertVersionBlock(existing, versionBlock, version) {
  const text = existing.trim()
  const versionBlocks =
    text.match(/## \[v\d+\.\d+\.\d+\] - [^\n]*\n[\s\S]*?(?=\n## \[v\d+\.\d+\.\d+\] - |$)/g) ?? []

  const currentHeading = new RegExp(`^## \\[v${version.replace(/\./g, '\\.')}\\] - `)
  const olderBlocks = versionBlocks.map((b) => b.trim()).filter((b) => !currentHeading.test(b))

  const sections = [CHANGELOG_HEADER.trimEnd(), '', versionBlock.trim()]
  if (olderBlocks.length > 0) {
    sections.push('', ...olderBlocks)
  }
  return `${sections.join('\n').trimEnd()}\n`
}

function main() {
  const baseRef = detectBaseRef()
  const pkg = readPackageJson()
  const previousVersion = String(pkg.version ?? '').trim()
  if (!previousVersion) {
    throw new Error('package.json is missing "version"')
  }

  const nextVersion = bumpPatchVersion(previousVersion)
  pkg.version = nextVersion
  writePackageJson(pkg)

  const commits = getCommitEntries(baseRef)
  const versionDate = new Date().toISOString().slice(0, 10)
  const versionBlock = buildVersionBlock(nextVersion, versionDate, commits)
  const existingChangelog = existsSync(CHANGELOG_FILE) ? readFileSync(CHANGELOG_FILE, 'utf8') : CHANGELOG_HEADER
  const nextChangelog = upsertVersionBlock(existingChangelog, versionBlock, nextVersion)
  writeFileSync(CHANGELOG_FILE, nextChangelog, 'utf8')

  console.log(
    `CHANGELOG updated for v${nextVersion} (previous v${previousVersion}) from ${baseRef} with ${commits.length} commit(s).`
  )
}

main()
