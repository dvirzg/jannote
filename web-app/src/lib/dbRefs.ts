export type DbRef = {
  key: string
  dbId: string
  name: string
  path?: string
}

const DBREF_START = '[DB_REFS]'
const DBREF_END = '[/DB_REFS]'

export function injectDbRefsIntoPrompt(prompt: string, refs: DbRef[]): string {
  if (!refs?.length) return prompt
  const lines = refs
    .map((r) => {
      const parts = [`key: ${r.key}`, `db_id: ${r.dbId}`, `name: ${r.name}`]
      if (r.path) parts.push(`path: ${r.path}`)
      return `- ${parts.join(', ')}`
    })
    .join('\n')
  return `${prompt}\n\n${DBREF_START}\n${lines}\n${DBREF_END}`
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

