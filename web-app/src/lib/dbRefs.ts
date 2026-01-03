export type DbRef = {
  key: string
  dbId: string
  name: string
  path?: string
}

export type ResolvedContextBlock = {
  scopes?: string[]
  searches?: string[]
  resolvedDocs?: Array<{ id: string; name?: string; path?: string }>
  limitDocs?: number
  warnings?: string[]
  errors?: string[]
}

const DBREF_START = '[DB_REFS]'
const DBREF_END = '[/DB_REFS]'
const CONTEXT_START = '[CONTEXT]'
const CONTEXT_END = '[/CONTEXT]'

export function injectDbRefsIntoPrompt(
  prompt: string,
  refs: DbRef[],
  context?: ResolvedContextBlock
): string {
  const blocks: string[] = []

  if (refs?.length) {
    const lines = refs
      .map((r) => {
        const parts = [`key: ${r.key}`, `db_id: ${r.dbId}`, `name: ${r.name}`]
        if (r.path) parts.push(`path: ${r.path}`)
        return `- ${parts.join(', ')}`
      })
      .join('\n')
    blocks.push(`${DBREF_START}\n${lines}\n${DBREF_END}`)
  }

  if (context) {
    const ctxLines: string[] = []
    if (context.scopes?.length) {
      ctxLines.push('scopes:')
      context.scopes.forEach((s) => ctxLines.push(`- ${s}`))
    }
    if (context.searches?.length) {
      ctxLines.push('searches:')
      context.searches.forEach((s) => ctxLines.push(`- ${s}`))
    }
    if (typeof context.limitDocs === 'number') {
      ctxLines.push(`limit_docs: ${context.limitDocs}`)
    }
    if (context.resolvedDocs?.length) {
      ctxLines.push('resolved_docs:')
      context.resolvedDocs.forEach((d) => {
        const parts = [`id: ${d.id}`]
        if (d.name) parts.push(`name: ${d.name}`)
        if (d.path) parts.push(`path: ${d.path}`)
        ctxLines.push(`- ${parts.join(', ')}`)
      })
    }
    if (context.warnings?.length) {
      ctxLines.push('warnings:')
      context.warnings.forEach((w) => ctxLines.push(`- ${w}`))
    }
    if (context.errors?.length) {
      ctxLines.push('errors:')
      context.errors.forEach((e) => ctxLines.push(`- ${e}`))
    }
    if (ctxLines.length) {
      blocks.push(`${CONTEXT_START}\n${ctxLines.join('\n')}\n${CONTEXT_END}`)
    }
  }

  if (!blocks.length) return prompt
  return `${prompt}\n\n${blocks.join('\n\n')}`
}

export function extractDbRefsFromPrompt(prompt: string): {
  refs: DbRef[]
  cleanPrompt: string
} {
  if (!prompt.includes(DBREF_START)) return { refs: [], cleanPrompt: prompt }
  const startIndex = prompt.indexOf(DBREF_START)
  const endIndex = prompt.indexOf(DBREF_END)
  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    return { refs: [], cleanPrompt: prompt }
  }

  const block = prompt.substring(startIndex + DBREF_START.length, endIndex)
  const refs: DbRef[] = []
  const lines = block.trim().split('\n')
  for (const line of lines) {
    const trimmed = line.replace(/^\s*-\s*/, '').trim()
    const parts = trimmed.split(',')
    const map: Record<string, string> = {}
    for (const part of parts) {
      const [k, ...rest] = part.split(':')
      if (!k || rest.length === 0) continue
      map[k.trim()] = rest.join(':').trim()
    }
    const key = map['key']
    const dbId = map['db_id']
    const name = map['name']
    if (!key || !dbId || !name) continue
    refs.push({ key, dbId, name, path: map['path'] })
  }

  const cleanPrompt = prompt.substring(0, startIndex).trim()
  return { refs, cleanPrompt }
}

