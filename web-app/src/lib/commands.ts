import type { CommandDefinition } from '@/hooks/useCommands'
import { renderInstructions } from '@/lib/instructionTemplate'

export type ParsedCommandInvocation = {
  name: string
  raw: string
  args: string[]
  start: number
  end: number
}

const isNameChar = (ch: string) => /[A-Za-z0-9_-]/.test(ch)

const normalizeName = (name: string) => name.trim().toLowerCase()

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function isValidCommandName(name: string) {
  const n = normalizeName(name)
  return /^[a-z][a-z0-9_-]*$/.test(n)
}

export function parseArgs(argText: string): string[] {
  // Supports escaping commas via "\," and escaping backslashes via "\\"
  const args: string[] = []
  let current = ''
  let escaping = false
  for (let i = 0; i < argText.length; i++) {
    const ch = argText[i]
    if (escaping) {
      current += ch
      escaping = false
      continue
    }
    if (ch === '\\') {
      escaping = true
      continue
    }
    if (ch === ',') {
      args.push(current.trim())
      current = ''
      continue
    }
    current += ch
  }
  if (escaping) current += '\\'
  if (current.length > 0 || argText.trim().length > 0) args.push(current.trim())
  return args
}

export function findCommandInvocations(prompt: string): ParsedCommandInvocation[] {
  const invocations: ParsedCommandInvocation[] = []

  for (let i = 0; i < prompt.length; i++) {
    if (prompt[i] !== '/') continue

    // Basic guard against URLs (e.g. http://...) and comment-like patterns (//)
    const prev = i > 0 ? prompt[i - 1] : ''
    const next = i + 1 < prompt.length ? prompt[i + 1] : ''
    if (prev === ':' || prev === '/' || next === '/') continue

    // Guard against URL path segments like "http://x/y" (skip any "/" inside a token containing "://")
    let tokenStart = i
    while (tokenStart > 0 && !/\s/.test(prompt[tokenStart - 1])) tokenStart--
    const tokenBeforeSlash = prompt.slice(tokenStart, i)
    if (tokenBeforeSlash.includes('://')) continue

    const nameStart = i + 1
    if (nameStart >= prompt.length) continue
    if (!/[A-Za-z]/.test(prompt[nameStart])) continue

    let j = nameStart
    while (j < prompt.length && isNameChar(prompt[j])) j++
    const rawName = prompt.slice(nameStart, j)
    const name = normalizeName(rawName)

    // Optional whitespace
    while (j < prompt.length && /\s/.test(prompt[j])) j++

    // Optional "(...)" args
    let args: string[] = []
    let end = j
    if (j < prompt.length && prompt[j] === '(') {
      const argsStart = j + 1
      let k = argsStart
      let depth = 1
      let escaping = false
      while (k < prompt.length) {
        const ch = prompt[k]
        if (escaping) {
          escaping = false
          k++
          continue
        }
        if (ch === '\\') {
          escaping = true
          k++
          continue
        }
        if (ch === '(') depth++
        if (ch === ')') depth--
        k++
        if (depth === 0) break
      }
      if (depth === 0) {
        const inside = prompt.slice(argsStart, k - 1)
        args = parseArgs(inside)
        end = k
      } else {
        // Unclosed paren: treat as not an invocation
        continue
      }
    }

    invocations.push({
      name,
      raw: prompt.slice(i, end),
      args,
      start: i,
      end,
    })
    i = end - 1
  }

  return invocations
}

export function renderCommandTemplate(
  command: CommandDefinition,
  providedArgs: string[]
): string {
  const valuesByName: Record<string, string> = {}
  command.args.forEach((arg, idx) => {
    const v = (providedArgs[idx] ?? '').trim()
    valuesByName[arg.name] = v || arg.defaultValue || ''
  })

  // Allow global placeholders (e.g. {{current_date}}) inside command templates too.
  let out = renderInstructions(command.template)
  command.args.forEach((arg) => {
    const re = new RegExp(`\\{${escapeRegExp(arg.name)}\\}`, 'g')
    out = out.replace(re, valuesByName[arg.name] ?? '')
  })
  return out
}

export function expandCommandsInPrompt(
  prompt: string,
  commands: CommandDefinition[]
): { expanded: string; used: string[] } {
  const byName = new Map(commands.map((c) => [normalizeName(c.name), c]))
  const invocations = findCommandInvocations(prompt)
  if (invocations.length === 0) return { expanded: prompt, used: [] }

  let cursor = 0
  let out = ''
  const used: string[] = []

  for (const inv of invocations) {
    out += prompt.slice(cursor, inv.start)
    const cmd = byName.get(inv.name)
    if (!cmd) {
      out += inv.raw
    } else {
      used.push(cmd.name)
      out += renderCommandTemplate(cmd, inv.args)
    }
    cursor = inv.end
  }
  out += prompt.slice(cursor)

  return { expanded: out, used: Array.from(new Set(used)) }
}


