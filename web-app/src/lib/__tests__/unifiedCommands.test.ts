import { describe, it, expect } from 'vitest'
import {
  parseUnifiedCommands,
  resolveUnifiedCommands,
} from '@/lib/unifiedCommands'

const sampleEntries = [
  {
    id: '1',
    name: 'Report Q1',
    displayName: 'Report Q1',
    relativePath: 'reports/2024/q1.pdf',
    type: 'file' as const,
  },
  {
    id: '2',
    name: 'Notes',
    displayName: 'Notes',
    relativePath: 'notes/todo.txt',
    type: 'file' as const,
  },
  {
    id: '3',
    name: 'Reports',
    displayName: 'Reports',
    relativePath: 'reports',
    type: 'folder' as const,
  },
]

describe('unifiedCommands parser', () => {
  it('parses @scope and searches and strips them from the prompt', () => {
    const parsed = parseUnifiedCommands(
      'Please help @scope(path="reports/**", limit_docs=5) /search-exact("report") summarize'
    )
    expect(parsed.scopes).toHaveLength(1)
    expect(parsed.scopes[0]).toMatchObject({ path: ['reports/**'], limitDocs: 5 })
    expect(parsed.searches).toHaveLength(1)
    expect(parsed.searches[0]).toMatchObject({ kind: 'exact', query: 'report' })
    expect(parsed.cleanedPrompt).toBe('Please help summarize')
  })
})

describe('unifiedCommands resolver', () => {
  it('resolves scopes against entries with exact search', async () => {
    const parsed = parseUnifiedCommands(
      '@scope(path="reports/**", type="file", limit_docs=1) /search-exact("q1")'
    )
    const resolved = await resolveUnifiedCommands(parsed, sampleEntries, {
      searchExact: async (ids, query) => {
        // Mock exact search - matches entries with query in name or path
        return ids.filter((id) => {
          const entry = sampleEntries.find((e) => e.id === id)
          if (!entry) return false
          const q = query.toLowerCase()
          return (
            entry.name.toLowerCase().includes(q) ||
            entry.displayName?.toLowerCase().includes(q) ||
            entry.relativePath.toLowerCase().includes(q)
          )
        })
      },
    })
    expect(resolved.docIds).toEqual(['1'])
    expect(resolved.limitDocs).toBe(1)
    expect(resolved.errors).toHaveLength(0)
  })

  it('returns an error when exact search is requested but unavailable', async () => {
    const parsed = parseUnifiedCommands('/search-exact("deep search")')
    const resolved = await resolveUnifiedCommands(parsed, sampleEntries)
    expect(resolved.errors).toContain('Exact search requested but not available.')
  })

  it('returns an error when vector search is requested but unavailable', async () => {
    const parsed = parseUnifiedCommands('/search-vector("deep search")')
    const resolved = await resolveUnifiedCommands(parsed, sampleEntries)
    expect(resolved.errors).toContain('Vector search requested but not available.')
  })
})

