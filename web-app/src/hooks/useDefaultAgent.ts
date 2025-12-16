import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { localStorageKey } from '@/constants/localStorage'
import { defaultAssistant } from './useAssistant'

type DefaultAgentState = {
  instructions: string
  parameters: Record<string, unknown>

  // Actions
  updateInstructions: (instructions: string) => void
  updateParameters: (parameters: Record<string, unknown>) => void
  getDefaultAgent: () => { instructions: string; parameters: Record<string, unknown> }
  reset: () => void
}

const getInitialState = () => ({
  instructions: defaultAssistant.instructions,
  parameters: defaultAssistant.parameters || {},
})

export const useDefaultAgent = create<DefaultAgentState>()(
  persist(
    (set, get) => ({
      ...getInitialState(),

      updateInstructions: (instructions: string) => {
        set({ instructions })
      },

      updateParameters: (parameters: Record<string, unknown>) => {
        set({ parameters })
      },

      getDefaultAgent: () => {
        const state = get()
        return {
          instructions: state.instructions,
          parameters: state.parameters,
        }
      },

      reset: () => {
        set(getInitialState())
      },
    }),
    {
      name: localStorageKey.defaultAgent,
      storage: createJSONStorage(() => localStorage),
    }
  )
)
