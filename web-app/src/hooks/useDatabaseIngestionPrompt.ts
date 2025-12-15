import { create } from 'zustand'

type FileSummary = {
  name: string
  path: string
  size?: number
}

type DatabaseIngestionState = {
  isModalOpen: boolean
  currentFile: FileSummary | null
  currentIndex: number
  totalCount: number
  resolver: ((choice: 'inline' | 'embeddings' | undefined) => void) | null
  showPrompt: (
    file: FileSummary,
    currentIndex: number,
    totalCount: number
  ) => Promise<'inline' | 'embeddings' | undefined>
  choose: (choice: 'inline' | 'embeddings') => void
  cancel: () => void
}

export const useDatabaseIngestionPrompt = create<DatabaseIngestionState>()(
  (set, get) => ({
    isModalOpen: false,
    currentFile: null,
    currentIndex: 0,
    totalCount: 0,
    resolver: null,
    showPrompt: async (file, currentIndex, totalCount) => {
      return new Promise<'inline' | 'embeddings' | undefined>((resolve) => {
        set({
          isModalOpen: true,
          currentFile: file,
          currentIndex,
          totalCount,
          resolver: resolve,
        })
      })
    },
    choose: (choice) => {
      const { resolver } = get()
      resolver?.(choice)
      set({ isModalOpen: false, currentFile: null, resolver: null })
    },
    cancel: () => {
      const { resolver } = get()
      resolver?.(undefined)
      set({ isModalOpen: false, currentFile: null, resolver: null })
    },
  })
)

