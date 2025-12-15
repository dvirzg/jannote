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
  it('parses @scope and filters and strips them from the prompt', () => {
    const parsed = parseUnifiedCommands(
      'Please help @scope(path="reports/**", limit_docs=5) #meta:"report" summarize'
    )
    expect(parsed.scopes).toHaveLength(1)
    expect(parsed.scopes[0]).toMatchObject({ path: ['reports/**'], limitDocs: 5 })
    expect(parsed.filters).toHaveLength(1)
    expect(parsed.filters[0]).toMatchObject({ kind: 'meta', query: 'report' })
    expect(parsed.cleanedPrompt).toBe('Please help summarize')
  })
})

describe('unifiedCommands resolver', () => {
  it('resolves scopes against entries with metadata filtering', async () => {
    const parsed = parseUnifiedCommands(
      '@scope(path="reports/**", type="file", limit_docs=1) #meta:"q1"'
    )
    const resolved = await resolveUnifiedCommands(parsed, sampleEntries)
    expect(resolved.docIds).toEqual(['1'])
    expect(resolved.limitDocs).toBe(1)
    expect(resolved.errors).toHaveLength(0)
  })

  it('returns an error when content search is requested but unavailable', async () => {
    const parsed = parseUnifiedCommands('#content:"deep search"')
    const resolved = await resolveUnifiedCommands(parsed, sampleEntries)
    expect(resolved.errors).toContain(
      'Content search requested but no content search is available.'
    )
  })
})

