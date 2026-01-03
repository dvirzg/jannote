import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { localStorageKey } from '@/constants/localStorage'

export type CommandArg = {
  name: string
  defaultValue?: string
}

export type CommandDefinition = {
  id: string
  name: string
  template: string
  args: CommandArg[]
  createdAt: number
  updatedAt: number
}

type CommandsState = {
  commands: CommandDefinition[]
  addCommand: (cmd: Omit<CommandDefinition, 'id' | 'createdAt' | 'updatedAt'>) => CommandDefinition
  updateCommand: (
    id: string,
    patch: Partial<Omit<CommandDefinition, 'id' | 'createdAt'>>
  ) => void
  deleteCommand: (id: string) => void
  getByName: (name: string) => CommandDefinition | undefined
}

const normalizeCommandName = (name: string) => name.trim().toLowerCase()

const createId = () => {
  // Prefer crypto.randomUUID when available
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = typeof crypto !== 'undefined' ? crypto : undefined
  if (c?.randomUUID) return c.randomUUID()
  return `cmd_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`
}

export const useCommands = create<CommandsState>()(
  persist(
    (set, get) => ({
      commands: [],

      addCommand: (cmd) => {
        const now = Date.now()
        const created: CommandDefinition = {
          id: createId(),
          name: normalizeCommandName(cmd.name),
          template: cmd.template,
          args: cmd.args ?? [],
          createdAt: now,
          updatedAt: now,
        }
        set((state) => ({
          commands: [created, ...state.commands].sort((a, b) =>
            a.name.localeCompare(b.name)
          ),
        }))
        return created
      },

      updateCommand: (id, patch) => {
        const now = Date.now()
        set((state) => ({
          commands: state.commands
            .map((c) => {
              if (c.id !== id) return c
              return {
                ...c,
                ...patch,
                name: patch.name ? normalizeCommandName(patch.name) : c.name,
                updatedAt: now,
              }
            })
            .sort((a, b) => a.name.localeCompare(b.name)),
        }))
      },

      deleteCommand: (id) => {
        set((state) => ({ commands: state.commands.filter((c) => c.id !== id) }))
      },

      getByName: (name: string) => {
        const n = normalizeCommandName(name)
        return get().commands.find((c) => c.name === n)
      },
    }),
    {
      name: localStorageKey.commands,
      storage: createJSONStorage(() => localStorage),
      version: 1,
    }
  )
)


