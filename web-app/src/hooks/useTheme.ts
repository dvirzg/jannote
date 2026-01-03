import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { getServiceHub } from '@/hooks/useServiceHub'
import type { ThemeMode } from '@/services/theme/types'
import { localStorageKey } from '@/constants/localStorage'

// Function to check if OS prefers dark mode
export const checkOSDarkMode = (): boolean => {
  return (
    window.matchMedia &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  )
}

export type ThemeState = {
  activeTheme: AppTheme
  setTheme: (theme: AppTheme) => void
  isDark: boolean
  setIsDark: (isDark: boolean) => void
}

export const useTheme = create<ThemeState>()(
  persist(
    (set) => {
      // Initialize with dark mode as default
      const initialState = {
        activeTheme: 'dark' as AppTheme,
        isDark: true,
        setTheme: async (activeTheme: AppTheme) => {
          await getServiceHub()
            .theme()
            .setTheme(activeTheme as ThemeMode)
          set(() => ({ activeTheme, isDark: activeTheme === 'dark' }))
        },
        setIsDark: (isDark: boolean) => set(() => ({ isDark })),
      }

      return initialState
    },
    {
      name: localStorageKey.theme,
      storage: createJSONStorage(() => localStorage),
      // Migrate 'auto' theme to 'dark' for existing users
      onRehydrateStorage: () => (state) => {
        if (state && (state.activeTheme === 'auto' || !state.activeTheme)) {
          state.activeTheme = 'dark'
          state.isDark = true
        }
        return state
      },
    }
  )
)
