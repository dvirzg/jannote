import { useEffect } from 'react'
import { useTheme } from '@/hooks/useTheme'

/**
 * ThemeProvider ensures theme settings are applied on every page load
 * This component should be mounted at the root level of the application
 */
export function ThemeProvider() {
  const { activeTheme, setTheme } = useTheme()

  // Apply theme on mount
  useEffect(() => {
    // Apply the current theme
    setTheme(activeTheme)
  }, [activeTheme, setTheme])

  return null
}
