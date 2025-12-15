import { useCallback } from 'react'
import { create } from 'zustand'
import { useShallow } from 'zustand/react/shallow'
import { toast } from 'sonner'
import { useServiceHub } from './useServiceHub'
import { useDatabaseIngestionPrompt } from './useDatabaseIngestionPrompt'
import { fs } from '@janhq/core'
import type {
  DatabaseEntry,
  DatabaseIngestionMode,
} from '@/services/database/types'

type DatabaseState = {
  entries: DatabaseEntry[]
  loading: boolean
  error?: string
  setEntries: (entries: DatabaseEntry[]) => void
  setLoading: (loading: boolean) => void
  setError: (error?: string) => void
}

const useDatabaseStore = create<DatabaseState>((set) => ({
  entries: [],
  loading: false,
  error: undefined,
  setEntries: (entries) => set({ entries }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
}))

export const useDatabaseData = () => {
  return useDatabaseStore(
    useShallow((state) => ({
      entries: state.entries,
      loading: state.loading,
      error: state.error,
    }))
  )
}

export const useDatabaseActions = () => {
  const serviceHub = useServiceHub()
  const setEntries = useDatabaseStore((state) => state.setEntries)
  const setLoading = useDatabaseStore((state) => state.setLoading)
  const setError = useDatabaseStore((state) => state.setError)

  const refresh = useCallback(async () => {
    try {
      setLoading(true)
      const list = await serviceHub.database().list()
      setEntries(list)
      setError(undefined)
    } catch (e) {
      console.error('Failed to load database entries', e)
      setError(e instanceof Error ? e.message : String(e))
      toast.error('Failed to load database')
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceHub])

  const addPaths = useCallback(
    async (paths: string[], ingestionMode: DatabaseIngestionMode) => {
      if (!paths?.length) return
      try {
        setLoading(true)
        const entries = await serviceHub.database().addPaths(paths, ingestionMode)
        setEntries(entries)
      } catch (e) {
        console.error('Failed to add to database', e)
        toast.error('Failed to add to Database', {
          description: e instanceof Error ? e.message : String(e),
        })
      } finally {
        setLoading(false)
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [serviceHub]
  )

  const pickAndAddFiles = useCallback(async () => {
    const selection = await serviceHub.dialog().open({
      multiple: true,
    })
    if (!selection) return
    const paths = Array.isArray(selection) ? selection : [selection]
    if (!paths.length) return

    // Get file info and prompt for each file
    const pathsWithModes: Array<{ path: string; mode: DatabaseIngestionMode }> = []
    const prompt = useDatabaseIngestionPrompt.getState()

    for (let i = 0; i < paths.length; i++) {
      const path = paths[i]
      const name = path.split(/[\\/]/).pop() || path
      let size: number | undefined
      try {
        const stat = await fs.fileStat(path)
        size = stat?.size ? Number(stat.size) : undefined
      } catch (e) {
        console.warn('Failed to get file size for', path, e)
      }

      const choice = await prompt.showPrompt({ name, path, size }, i, paths.length)
      if (!choice) {
        // User cancelled - stop processing
        return
      }
      pathsWithModes.push({ path, mode: choice })
    }

    if (pathsWithModes.length > 0) {
      try {
        setLoading(true)
        const entries = await serviceHub.database().addPathsWithModes(pathsWithModes)
        setEntries(entries)
      } catch (e) {
        console.error('Failed to add to database', e)
        toast.error('Failed to add to Database', {
          description: e instanceof Error ? e.message : String(e),
        })
      } finally {
        setLoading(false)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceHub])

  const pickAndAddFolder = useCallback(async () => {
    const selection = await serviceHub.dialog().open({
      directory: true,
    })
    if (!selection) return
    const paths = Array.isArray(selection) ? selection : [selection]
    if (!paths.length) return

    // Get folder info and prompt for each folder
    const pathsWithModes: Array<{ path: string; mode: DatabaseIngestionMode }> = []
    const prompt = useDatabaseIngestionPrompt.getState()

    for (let i = 0; i < paths.length; i++) {
      const path = paths[i]
      const name = path.split(/[\\/]/).pop() || path
      let size: number | undefined
      try {
        const stat = await fs.fileStat(path)
        // Folders don't have size, but we'll show 0 or undefined
        size = stat?.isDirectory ? 0 : stat?.size ? Number(stat.size) : undefined
      } catch (e) {
        console.warn('Failed to get folder info for', path, e)
      }

      const choice = await prompt.showPrompt({ name, path, size }, i, paths.length)
      if (!choice) {
        // User cancelled - stop processing
        return
      }
      pathsWithModes.push({ path, mode: choice })
    }

    if (pathsWithModes.length > 0) {
      try {
        setLoading(true)
        const entries = await serviceHub.database().addPathsWithModes(pathsWithModes)
        setEntries(entries)
      } catch (e) {
        console.error('Failed to add to database', e)
        toast.error('Failed to add to Database', {
          description: e instanceof Error ? e.message : String(e),
        })
      } finally {
        setLoading(false)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceHub])

  const deleteById = useCallback(
    async (id: string) => {
      try {
        setLoading(true)
        await serviceHub.database().deleteById(id)
        const remaining = await serviceHub.database().list()
        setEntries(remaining)
      } catch (e) {
        console.error('Failed to delete database entry', e)
        toast.error('Failed to delete from Database', {
          description: e instanceof Error ? e.message : String(e),
        })
      } finally {
        setLoading(false)
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [serviceHub]
  )

  const getEntryById = useCallback((id: string) => {
    const entries = useDatabaseStore.getState().entries

    const stack = [...entries]
    while (stack.length) {
      const current = stack.pop()
      if (!current) continue
      if (current.id === id) return current
      if (current.children?.length) stack.push(...current.children)
    }
    return undefined
  }, [])

  return {
    refresh,
    addPaths,
    pickAndAddFiles,
    pickAndAddFolder,
    deleteById,
    getEntryById,
  }
}
