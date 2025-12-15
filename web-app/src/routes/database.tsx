import { useEffect, useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { IconDatabase, IconFolderPlus, IconTrash, IconUpload, IconRefresh, IconCopy } from '@tabler/icons-react'

import { route } from '@/constants/routes'
import { Button } from '@/components/ui/button'
import { useDatabaseActions, useDatabaseData } from '@/hooks/useDatabase'
import { useServiceHub } from '@/hooks/useServiceHub'
import type { DatabaseEntry, DatabaseIngestionMode } from '@/services/database/types'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/i18n/react-i18next-compat'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const Route = createFileRoute(route.database as any)({
  component: DatabasePage,
})

const MentionBadge = ({ id }: { id: string }) => {
  const mention = `@db:${id}`
  return (
    <div className="inline-flex items-center gap-2 rounded-md border border-main-view-fg/10 bg-main-view/60 px-2 py-1 text-xs">
      <span className="font-mono text-main-view-fg/80">{mention}</span>
      <button
        className="text-main-view-fg/60 hover:text-main-view-fg transition-colors"
        onClick={() => navigator.clipboard.writeText(mention)}
        title="Copy mention"
      >
        <IconCopy size={14} />
      </button>
    </div>
  )
}

const EntryRow = ({
  entry,
  depth,
  onDelete,
}: {
  entry: DatabaseEntry
  depth?: number
  onDelete: (id: string) => void
}) => {
  const indent = (depth ?? 0) * 16
  const isFolder = entry.type === 'folder'

  return (
    <div className="border border-main-view-fg/10 rounded-md p-3 bg-main-view/50">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3" style={{ marginLeft: indent }}>
          <div className="rounded-md bg-main-view-fg/10 p-2">
            {isFolder ? <IconFolderPlus size={18} /> : <IconDatabase size={18} />}
          </div>
          <div>
            <div className="font-medium">{entry.name}</div>
            <div className="text-xs text-main-view-fg/70">
              {isFolder ? 'Folder' : 'File'} · {entry.injectionMode === 'inline' ? 'Raw inject' : 'Embeddings'}
              {entry.size ? ` · ${entry.size} bytes` : ''}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <MentionBadge id={entry.id} />
          <Button
            variant="ghost"
            size="icon"
            className="text-destructive hover:text-destructive"
            onClick={() => onDelete(entry.id)}
          >
            <IconTrash size={16} />
          </Button>
        </div>
      </div>
      {entry.children?.length ? (
        <div className="mt-3 flex flex-col gap-2">
          {entry.children.map((child) => (
            <EntryRow key={child.id} entry={child} depth={(depth ?? 0) + 1} onDelete={onDelete} />
          ))}
        </div>
      ) : null}
    </div>
  )
}

function DatabasePage() {
  const { t } = useTranslation()
  const { entries, loading } = useDatabaseData()
  const { refresh, pickAndAddFiles, pickAndAddFolder, deleteById } = useDatabaseActions()
  const serviceHub = useServiceHub()
  const [rootPath, setRootPath] = useState<string>('')
  const [mode, setMode] = useState<DatabaseIngestionMode>('embeddings')

  useEffect(() => {
    refresh()
    void serviceHub
      .database()
      .root()
      .then(setRootPath)
      .catch(() => setRootPath('~/Library/Application Support/Jan/database'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const flatEntries = useMemo(() => entries ?? [], [entries])

  return (
    <div className="flex h-full flex-col bg-main-view text-main-view-fg">
      <div className="border-b border-main-view-fg/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <IconDatabase size={20} />
          <div>
            <div className="text-lg font-semibold">{t('common:database.title', 'Database')}</div>
            <div className="text-xs text-main-view-fg/70 break-all">
              {t('common:database.root', 'Root')}: {rootPath || t('common:loading', 'Loading...')}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={refresh} disabled={loading}>
            <IconRefresh size={16} />
          </Button>
          <div className="flex items-center gap-1 rounded-md border border-main-view-fg/10 px-2 py-1 text-xs">
            <span className="text-main-view-fg/70">Mode</span>
            <button
              className={cn(
                'px-2 py-1 rounded',
                mode === 'embeddings' ? 'bg-accent text-black' : 'hover:bg-main-view-fg/10'
              )}
              onClick={() => setMode('embeddings')}
            >
              {t('common:database.embeddings', 'Embeddings')}
            </button>
            <button
              className={cn(
                'px-2 py-1 rounded',
                mode === 'inline' ? 'bg-accent text-black' : 'hover:bg-main-view-fg/10'
              )}
              onClick={() => setMode('inline')}
            >
              {t('common:database.inline', 'Raw inject')}
            </button>
          </div>
          <Button
            onClick={() => pickAndAddFiles(mode)}
            variant="secondary"
            className="flex items-center gap-2"
            disabled={loading}
          >
            <IconUpload size={16} />
            {t('common:database.addFiles', 'Add Files')}
          </Button>
          <Button
            onClick={() => pickAndAddFolder(mode)}
            variant="secondary"
            className="flex items-center gap-2"
            disabled={loading}
          >
            <IconFolderPlus size={16} />
            {t('common:database.addFolder', 'Add Folder')}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="text-sm text-main-view-fg/70">
            {t('common:database.loading', 'Loading database...')}
          </div>
        ) : flatEntries.length === 0 ? (
          <div className="text-sm text-main-view-fg/70">
            {t(
              'common:database.empty',
              'No files yet. Upload files or folders to reuse them in chat with @db:<id>.'
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {flatEntries.map((entry) => (
              <EntryRow key={entry.id} entry={entry} onDelete={deleteById} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
