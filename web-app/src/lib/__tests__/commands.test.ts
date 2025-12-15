import { describe, it, expect } from 'vitest'
import { expandCommandsInPrompt, parseArgs, findCommandInvocations } from '@/lib/commands'
import type { CommandDefinition } from '@/hooks/useCommands'

describe('commands', () => {
  it('parses args with trimming and escaped commas', () => {
    expect(parseArgs('NYC, C')).toEqual(['NYC', 'C'])
    expect(parseArgs('a\\,b, c')).toEqual(['a,b', 'c'])
    expect(parseArgs('')).toEqual([])
  })

  it('finds invocations and ignores urls', () => {
    const inv = findCommandInvocations('hi /weather(NYC, C) and http://x/y')
    expect(inv.map((i) => i.name)).toEqual(['weather'])
    expect(inv[0]?.args).toEqual(['NYC', 'C'])
  })

  it('expands invocations using defaults', () => {
    const commands: CommandDefinition[] = [
      {
        id: '1',
        name: 'weather',
        template: 'Tell me the weather in {place}, in {unit}.',
        args: [
          { name: 'place', defaultValue: 'NYC' },
          { name: 'unit', defaultValue: 'C' },
        ],
        createdAt: 0,
        updatedAt: 0,
      },
    ]

    const { expanded } = expandCommandsInPrompt(
      'good morning, /weather(Paris), thanks',
      commands
    )
    expect(expanded).toBe('good morning, Tell me the weather in Paris, in C., thanks')
  })

  it('leaves unknown commands as-is', () => {
    const { expanded } = expandCommandsInPrompt('hi /unknown(a)', [])
    expect(expanded).toBe('hi /unknown(a)')
  })
})


