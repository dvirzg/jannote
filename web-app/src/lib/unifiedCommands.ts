import type { DatabaseEntry } from '@/services/database/types'

export type ScopeExpression = {
  raw: string
  path?: string[]
  type?: 'file' | 'folder'
  limitDocs?: number
}

export type FilterExpression = {
  raw: string
  kind: 'meta' | 'content'
  query: string
}

export type ParsedUnifiedCommands = {
  cleanedPrompt: string
  scopes: ScopeExpression[]
  filters: FilterExpression[]
  warnings: string[]
}

export type ResolvedUnifiedContext = {
  docIds: string[]
  scopes: ScopeExpression[]
  filters: FilterExpression[]
  warnings: string[]
  errors: string[]
  limitDocs?: number
}

type ParsedValue = string | number | string[] | undefined

const unquote = (s: string) => {
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    return s.slice(1, -1)
  }
  return s
}

const parseValue = (text: string): ParsedValue => {
  const trimmed = text.trim()
  if (!trimmed) return undefined

  // Array of strings: ['a','b'] or ["a","b"]
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    const inner = trimmed.slice(1, -1).trim()
    if (!inner) return []
    return inner
      .split(',')
      .map((part) => unquote(part.trim()))
      .filter((v) => v.length > 0)
  }

  // Number
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    const n = Number(trimmed)
    return Number.isFinite(n) ? n : undefined
  }

  return unquote(trimmed)
}

const parseScopeArgs = (argText: string): ScopeExpression => {
  const parts: Array<{ key: string; value: string }> = []
  let current = ''
  let depth = 0
  let inSingle = false
  let inDouble = false

  const pushCurrent = () => {
    const chunk = current.trim()
    if (!chunk) return
    const eq = chunk.indexOf('=')
    if (eq === -1) return
    const key = chunk.slice(0, eq).trim()
    const value = chunk.slice(eq + 1).trim()
    if (key) parts.push({ key, value })
  }

  for (let i = 0; i < argText.length; i++) {
    const ch = argText[i]
    current += ch
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle
    } else if (ch === '"' && !inSingle) {
      inDouble = !inDouble
    } else if (!inSingle && !inDouble) {
      if (ch === '(' || ch === '[') depth++
      if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1)
      if (ch === ',' && depth === 0) {
        pushCurrent()
        current = ''
      }
    }
  }
  pushCurrent()

  const scope: ScopeExpression = { raw: `@scope(${argText.trim()})` }

  for (const { key, value } of parts) {
    const parsed = parseValue(value)
    if (parsed === undefined) continue
    if (key === 'path') {
      scope.path = Array.isArray(parsed) ? parsed : [String(parsed)]
    } else if (key === 'type' && (parsed === 'file' || parsed === 'folder')) {
      scope.type = parsed
    } else if (key === 'limit_docs' && typeof parsed === 'number') {
      scope.limitDocs = Math.max(0, Math.floor(parsed))
    }
  }

  return scope
}

const stripAndCollect = (
  prompt: string,
  matches: Array<{ start: number; end: number }>
): string => {
  if (!matches.length) return prompt
  let cursor = 0
  let out = ''
  for (const m of matches) {
    out += prompt.slice(cursor, m.start)
    cursor = m.end
  }
  out += prompt.slice(cursor)
  return out.replace(/\s{2,}/g, ' ').trim()
}

export function parseUnifiedCommands(prompt: string): ParsedUnifiedCommands {
  const scopes: ScopeExpression[] = []
  const filters: FilterExpression[] = []
  const warnings: string[] = []
  const ranges: Array<{ start: number; end: number }> = []

  const scopeRegex = /@scope\s*\(([^)]*)\)/gi
  let sm: RegExpExecArray | null
  while ((sm = scopeRegex.exec(prompt)) !== null) {
    const raw = sm[0]
    const inner = sm[1] ?? ''
    scopes.push(parseScopeArgs(inner))
    ranges.push({ start: sm.index, end: sm.index + raw.length })
  }

  const filterRegex = /#(meta|content):\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/gi
  let fm: RegExpExecArray | null
  while ((fm = filterRegex.exec(prompt)) !== null) {
    const kind = fm[1]?.toLowerCase() as 'meta' | 'content'
    const raw = fm[0]
    const queryRaw = fm[2] ?? ''
    filters.push({
      raw,
      kind,
      query: unquote(queryRaw),
    })
    ranges.push({ start: fm.index, end: fm.index + raw.length })
  }

  const cleanedPrompt = stripAndCollect(
    prompt,
    ranges.sort((a, b) => a.start - b.start)
  )

  return { cleanedPrompt, scopes, filters, warnings }
}

const globToRegExp = (pattern: string): RegExp => {
  const escaped = pattern.replace(/[-/\\^$+?.()|[\]{}]/g, '\\$&')
  const withWildcards = escaped
    .replace(/\\\*\\\*/g, '.*')
    .replace(/\\\*/g, '[^/]*')
  return new RegExp(`^${withWildcards}$`, 'i')
}

const matchPath = (patterns: string[] | undefined, value: string): boolean => {
  if (!patterns || patterns.length === 0) return true
  return patterns.some((p) => {
    const re = globToRegExp(p)
    return re.test(value)
  })
}

export async function resolveUnifiedCommands(
  parsed: ParsedUnifiedCommands,
  entries: Array<
    Pick<DatabaseEntry, 'id' | 'relativePath' | 'displayName' | 'name' | 'type'>
  >,
  opts?: {
    contentSearch?: (candidateIds: string[], query: string) => Promise<string[]>
  }
): Promise<ResolvedUnifiedContext> {
  const warnings = [...parsed.warnings]
  const errors: string[] = []

  const scopeLimitValues = parsed.scopes
    .map((s) => s.limitDocs)
    .filter((v): v is number => typeof v === 'number' && v > 0)
  const globalLimit = scopeLimitValues.length
    ? Math.min(...scopeLimitValues)
    : undefined

  const resolveScope = (scope: ScopeExpression) => {
    return entries.filter((e) => {
      if (!matchPath(scope.path, e.relativePath)) return false
      if (scope.type && e.type !== scope.type) return false
      return true
    })
  }

  const baseSet = (() => {
    if (parsed.scopes.length === 0) return entries
    const collected: typeof entries = []
    for (const scope of parsed.scopes) {
      const scoped = resolveScope(scope)
      collected.push(...scoped)
    }
    return collected
  })()

  const uniqueById = (list: typeof entries) => {
    const seen = new Set<string>()
    const out: typeof entries = []
    for (const item of list) {
      if (seen.has(item.id)) continue
      seen.add(item.id)
      out.push(item)
    }
    return out
  }

  let narrowed = uniqueById(baseSet)

  for (const f of parsed.filters) {
    if (f.kind === 'meta') {
      const q = f.query.toLowerCase()
      narrowed = narrowed.filter((e) => {
        return (
          e.displayName?.toLowerCase().includes(q) ||
          e.name.toLowerCase().includes(q) ||
          e.relativePath.toLowerCase().includes(q)
        )
      })
    } else if (f.kind === 'content') {
      if (!opts?.contentSearch) {
        errors.push('Content search requested but no content search is available.')
        continue
      }
      try {
        const ids = await opts.contentSearch(
          narrowed.map((n) => n.id),
          f.query
        )
        const idSet = new Set(ids)
        narrowed = narrowed.filter((e) => idSet.has(e.id))
      } catch (e) {
        console.error('Content search failed', e)
        errors.push('Content search failed.')
      }
    }
  }

  const limited =
    typeof globalLimit === 'number' && globalLimit > 0
      ? narrowed.slice(0, globalLimit)
      : narrowed

  return {
    docIds: limited.map((e) => e.id),
    scopes: parsed.scopes,
    filters: parsed.filters,
    warnings,
    errors,
    limitDocs: globalLimit,
  }
}

