import { useEffect, useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  IconDatabase,
  IconFolder,
  IconFolderPlus,
  IconTrash,
  IconUpload,
  IconRefresh,
  IconCopy,
  IconFile,
  IconFileText,
  IconFileTypePdf,
  IconPhoto,
  IconVideo,
  IconMusic,
} from '@tabler/icons-react'

import { route } from '@/constants/routes'
import { Button } from '@/components/ui/button'
import { useDatabaseActions, useDatabaseData } from '@/hooks/useDatabase'
import { useServiceHub } from '@/hooks/useServiceHub'
import type { DatabaseEntry } from '@/services/database/types'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/i18n'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const Route = createFileRoute(route.database as any)({
  component: DatabasePage,
})

const getFileIcon = (fileName: string, isFolder: boolean) => {
  if (isFolder) return IconFolder

  const ext = fileName.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'pdf':
      return IconFileTypePdf
    case 'jpg':
    case 'jpeg':
    case 'png':
    case 'gif':
    case 'webp':
    case 'svg':
      return IconPhoto
    case 'mp4':
    case 'mov':
    case 'avi':
    case 'mkv':
    case 'webm':
      return IconVideo
    case 'mp3':
    case 'wav':
    case 'flac':
    case 'ogg':
      return IconMusic
    case 'txt':
    case 'md':
    case 'doc':
    case 'docx':
      return IconFileText
    default:
      return IconFile
  }
}

const formatFileSize = (bytes?: number): string => {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const GridItem = ({
  entry,
  onDelete,
}: {
  entry: DatabaseEntry
  onDelete: (id: string) => void
}) => {
  const [isHovered, setIsHovered] = useState(false)
  const isFolder = entry.type === 'folder'
  const Icon = getFileIcon(entry.name, isFolder)
  const mention = `@db:${entry.id}`

  return (
    <div
      className={cn(
        'group relative flex flex-col items-center gap-2 rounded-lg border border-main-view-fg/10 bg-main-view/30 p-4 transition-all cursor-pointer',
        'hover:border-main-view-fg/20 hover:bg-main-view/50 hover:shadow-sm'
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="relative flex flex-col items-center w-full">
        <div className="mb-2 flex items-center justify-center w-16 h-16 rounded-lg bg-main-view-fg/5 group-hover:bg-main-view-fg/10 transition-colors">
          <Icon size={32} className="text-main-view-fg/70" />
        </div>
        <div className="w-full text-center">
          <div className="text-sm font-medium truncate px-1" title={entry.name}>
            {entry.name}
          </div>
          <div className="text-xs text-main-view-fg/60 mt-1">
            {isFolder ? (
              <span>{entry.children?.length || 0} items</span>
            ) : (
              <>
                {formatFileSize(entry.size)}
                {entry.size && ' · '}
                {entry.injectionMode === 'inline' ? 'Raw' : 'Embed'}
              </>
            )}
          </div>
        </div>
      </div>

      {isHovered && (
        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 bg-main-view/90 hover:bg-main-view-fg/10"
                onClick={(e) => e.stopPropagation()}
              >
                <IconCopy size={14} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation()
                  navigator.clipboard.writeText(mention)
                }}
              >
                <IconCopy size={14} className="mr-2" />
                Copy mention
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete(entry.id)
                }}
                className="text-destructive"
              >
                <IconTrash size={14} className="mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  )
}

function DatabasePage() {
  const { t } = useTranslation()
  const { entries, loading } = useDatabaseData()
  const { refresh, pickAndAddFiles, pickAndAddFolder, deleteById } = useDatabaseActions()
  const serviceHub = useServiceHub()
  const [rootPath, setRootPath] = useState<string>('')

  useEffect(() => {
    refresh()
    void serviceHub
      .database()
      .root()
      .then(setRootPath)
      .catch(() => setRootPath('~/Library/Application Support/Jan/database'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Flatten entries for grid display (show root level items)
  const flatEntries = useMemo(() => {
    if (!entries?.length) return []
    return entries
  }, [entries])

  return (
    <div className="flex h-full flex-col bg-main-view text-main-view-fg">
      {/* Header */}
      <div className="border-b border-main-view-fg/10 px-6 py-3 flex items-center justify-between relative z-10 bg-main-view">
        <div className="flex items-center gap-3">
          <IconDatabase size={20} className="text-main-view-fg/70" />
          <div>
            <div className="text-base font-semibold">{t('common:database.title')}</div>
            <div className="text-xs text-main-view-fg/60 truncate max-w-md">
              {rootPath || t('common:loading')}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 relative z-20">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={refresh} 
            disabled={loading} 
            className="h-8 w-8 relative z-20"
            type="button"
          >
            <IconRefresh size={16} />
          </Button>
          <Button
            onClick={() => pickAndAddFiles()}
            variant="outline"
            size="sm"
            className="flex items-center gap-1.5 h-8 relative z-20 pointer-events-auto"
            disabled={loading}
            type="button"
          >
            <IconUpload size={14} />
            {t('common:database.addFiles')}
          </Button>
          <Button
            onClick={() => pickAndAddFolder()}
            variant="outline"
            size="sm"
            className="flex items-center gap-1.5 h-8 relative z-20 pointer-events-auto"
            disabled={loading}
            type="button"
          >
            <IconFolderPlus size={14} />
            {t('common:database.addFolder')}
          </Button>
        </div>
      </div>

      {/* Grid Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-sm text-main-view-fg/60">
              {t('common:database.loading')}
            </div>
          </div>
        ) : flatEntries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <div className="rounded-full bg-main-view-fg/5 p-6">
              <IconDatabase size={48} className="text-main-view-fg/30" />
            </div>
            <div className="text-sm text-main-view-fg/60 text-center max-w-md">
              {t('common:database.empty')}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-4">
            {flatEntries.map((entry) => (
              <GridItem key={entry.id} entry={entry} onDelete={deleteById} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
