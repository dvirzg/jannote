import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { localStorageKey } from '@/constants/localStorage'

export type CodeBlockStyle = string

interface CodeBlockState {
  codeBlockStyle: CodeBlockStyle
  showLineNumbers: boolean
  setCodeBlockStyle: (style: CodeBlockStyle) => void
  setShowLineNumbers: (show: boolean) => void
  resetCodeBlockStyle: () => void
}

const defaultCodeBlockStyle: CodeBlockStyle = 'atom-dark'
const defaultShowLineNumbers: boolean = true

export const useCodeblock = create<CodeBlockState>()(
  persist(
    (set) => {
      return {
        codeBlockStyle: defaultCodeBlockStyle,
        showLineNumbers: defaultShowLineNumbers,

        setCodeBlockStyle: () => {
          // Always enforce atom-dark
          set({ codeBlockStyle: 'atom-dark' })
        },

        setShowLineNumbers: (show: boolean) => {
          set({ showLineNumbers: show })
        },

        resetCodeBlockStyle: () => {
          set({
            codeBlockStyle: defaultCodeBlockStyle,
            showLineNumbers: defaultShowLineNumbers,
          })
        },
      }
    },
    {
      name: localStorageKey.settingCodeBlock,
      storage: createJSONStorage(() => localStorage),
      // Enforce atom-dark on rehydration
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.codeBlockStyle = 'atom-dark'
        }
        return state
      },
    }
  )
)
