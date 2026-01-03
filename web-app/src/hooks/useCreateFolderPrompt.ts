import { create } from 'zustand'

type CreateFolderState = {
  isModalOpen: boolean
  resolver: ((folderName: string | undefined) => void) | null
  showPrompt: () => Promise<string | undefined>
  confirm: (folderName: string) => void
  cancel: () => void
}

export const useCreateFolderPrompt = create<CreateFolderState>()((set, get) => ({
  isModalOpen: false,
  resolver: null,
  showPrompt: async () => {
    return new Promise<string | undefined>((resolve) => {
      set({
        isModalOpen: true,
        resolver: resolve,
      })
    })
  },
  confirm: (folderName: string) => {
    const { resolver } = get()
    resolver?.(folderName)
    set({ isModalOpen: false, resolver: null })
  },
  cancel: () => {
    const { resolver } = get()
    resolver?.(undefined)
    set({ isModalOpen: false, resolver: null })
  },
}))

