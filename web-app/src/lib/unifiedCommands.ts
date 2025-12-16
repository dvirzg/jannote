import type { DatabaseEntry } from '@/services/database/types'

export type ScopeExpression = {
  raw: string
  path?: string[]
  type?: 'file' | 'folder'
  // Optional list of file extensions (lowercased, without dot) to filter files by
  fileTypes?: string[]
  limitDocs?: number
}

export type SearchExpression = {
  raw: string
  kind: 'exact' | 'vector'
  query: string
  args?: Record<string, ParsedValue>
}

export type ParsedUnifiedCommands = {
  cleanedPrompt: string
  scopes: ScopeExpression[]
  searches: SearchExpression[]
  warnings: string[]
}

export type ResolvedUnifiedContext = {
  docIds: string[]
  scopes: ScopeExpression[]
  searches: SearchExpression[]
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
    } else if (key === 'type') {
      if (parsed === 'file' || parsed === 'folder') {
        scope.type = parsed
      } else {
        const values = Array.isArray(parsed) ? parsed : [String(parsed)]
        scope.fileTypes = values
          .map((v) => v.toLowerCase().replace(/^\./, ''))
          .filter(Boolean)
      }
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

const parseSearchArgs = (argText: string): Record<string, ParsedValue> => {
  const args: Record<string, ParsedValue> = {}
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

  for (const { key, value } of parts) {
    const parsed = parseValue(value)
    if (parsed !== undefined) {
      args[key] = parsed
    }
  }

  return args
}

export function parseUnifiedCommands(prompt: string): ParsedUnifiedCommands {
  const scopes: ScopeExpression[] = []
  const searches: SearchExpression[] = []
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

  // Match /search-exact(query, args?) or /search-vector(query, args?)
  // The query can be quoted or unquoted, and args are optional
  const searchRegex = /\/(search-exact|search-vector)\s*\(([^)]*)\)/gi
  let searchMatch: RegExpExecArray | null
  while ((searchMatch = searchRegex.exec(prompt)) !== null) {
    const kind = (searchMatch[1]?.toLowerCase() === 'search-exact' ? 'exact' : 'vector') as 'exact' | 'vector'
    const raw = searchMatch[0]
    const inner = searchMatch[2] ?? ''
    
    // Parse the inner content: query and optional args
    // First, try to extract the query (first quoted string or first unquoted value)
    let query = ''
    let argsText = ''
    
    const trimmed = inner.trim()
    if (trimmed.startsWith('"') || trimmed.startsWith("'")) {
      // Query is quoted - find the closing quote (handling escaped quotes)
      const quote = trimmed[0]
      let endQuote = -1
      let escaped = false
      for (let i = 1; i < trimmed.length; i++) {
        if (escaped) {
          escaped = false
          continue
        }
        if (trimmed[i] === '\\') {
          escaped = true
          continue
        }
        if (trimmed[i] === quote) {
          endQuote = i
          break
        }
      }
      if (endQuote > 0) {
        // Extract the quoted string (including quotes) and unquote it
        const quotedPart = trimmed.slice(0, endQuote + 1)
        query = unquote(quotedPart)
        // Get remaining text after the closing quote
        argsText = trimmed.slice(endQuote + 1).trim()
        if (argsText.startsWith(',')) {
          argsText = argsText.slice(1).trim()
        }
      } else {
        // No closing quote found - treat the whole thing as the query (unquoted)
        // This handles malformed quotes gracefully
        query = trimmed.replace(/^["']|["']$/g, '')
      }
    } else {
      // Query is unquoted - find first comma or end
      const commaIdx = trimmed.indexOf(',')
      if (commaIdx > 0) {
        query = trimmed.slice(0, commaIdx).trim()
        argsText = trimmed.slice(commaIdx + 1).trim()
      } else {
        query = trimmed
      }
    }

    const args = argsText ? parseSearchArgs(argsText) : undefined
    searches.push({
      raw,
      kind,
      query,
      args,
    })
    ranges.push({ start: searchMatch.index, end: searchMatch.index + raw.length })
  }

  const cleanedPrompt = stripAndCollect(
    prompt,
    ranges.sort((a, b) => a.start - b.start)
  )

  return { cleanedPrompt, scopes, searches, warnings }
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

const matchesFileType = (fileTypes: string[] | undefined, entryName: string, entryType: DatabaseEntry['type']): boolean => {
  if (!fileTypes || fileTypes.length === 0) return true
  if (entryType !== 'file') return false
  const ext = entryName.split('.').pop()?.toLowerCase() ?? ''
  return fileTypes.some((t) => t === ext)
}

export async function resolveUnifiedCommands(
  parsed: ParsedUnifiedCommands,
  entries: Array<
    Pick<DatabaseEntry, 'id' | 'relativePath' | 'displayName' | 'name' | 'type'>
  >,
  opts?: {
    searchExact?: (candidateIds: string[], query: string) => Promise<string[]>
    searchVector?: (candidateIds: string[], query: string) => Promise<string[]>
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
      if (!matchesFileType(scope.fileTypes, e.name, e.type)) return false
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

  for (const search of parsed.searches) {
    if (search.kind === 'exact') {
      if (!opts?.searchExact) {
        errors.push('Exact search requested but not available.')
        continue
      }
      try {
        // When there's no scope, pass empty array to search all entries in index
        // Otherwise, search only within the scoped entries
        const candidateIds = parsed.scopes.length === 0 ? [] : narrowed.map((n) => n.id)
        const ids = await opts.searchExact(candidateIds, search.query)
        const idSet = new Set(ids)
        // If we searched all entries, use the results directly; otherwise filter narrowed set
        if (parsed.scopes.length === 0) {
          narrowed = entries.filter((e) => idSet.has(e.id))
        } else {
          narrowed = narrowed.filter((e) => idSet.has(e.id))
        }
      } catch (e) {
        console.error('Exact search failed', e)
        errors.push('Exact search failed.')
      }
    } else if (search.kind === 'vector') {
      if (!opts?.searchVector) {
        errors.push('Vector search requested but not available.')
        continue
      }
      try {
        // When there's no scope, pass empty array to search all entries in index
        const candidateIds = parsed.scopes.length === 0 ? [] : narrowed.map((n) => n.id)
        const ids = await opts.searchVector(candidateIds, search.query)
        const idSet = new Set(ids)
        // If we searched all entries, use the results directly; otherwise filter narrowed set
        if (parsed.scopes.length === 0) {
          narrowed = entries.filter((e) => idSet.has(e.id))
        } else {
          narrowed = narrowed.filter((e) => idSet.has(e.id))
        }
      } catch (e) {
        console.error('Vector search failed', e)
        errors.push('Vector search failed.')
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
    searches: parsed.searches,
    warnings,
    errors,
    limitDocs: globalLimit,
  }
}

