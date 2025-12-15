import React, { useEffect, useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  IconDatabase,
  IconFolder,
  IconFolderOpen,
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
  IconChevronRight,
  IconHome,
} from '@tabler/icons-react'

import { route } from '@/constants/routes'
import { Button } from '@/components/ui/button'
import { useDatabaseActions, useDatabaseData } from '@/hooks/useDatabase'
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

const getFileIcon = (fileName: string, isFolder: boolean, isOpen?: boolean) => {
  if (isFolder) return isOpen ? IconFolderOpen : IconFolder

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
  onFolderClick,
}: {
  entry: DatabaseEntry
  onDelete: (id: string) => void
  onFolderClick?: (entry: DatabaseEntry) => void
}) => {
  const [isHovered, setIsHovered] = useState(false)
  const [isContextMenuOpen, setIsContextMenuOpen] = useState(false)
  const textRef = React.useRef<HTMLDivElement>(null)
  const containerRef = React.useRef<HTMLDivElement>(null)
  const isFolder = entry.type === 'folder'
  const Icon = getFileIcon(entry.name, isFolder)
  const mention = `@db:${entry.id}`

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsContextMenuOpen(true)
  }

  useEffect(() => {
    if (isHovered && entry.name.length > 15 && textRef.current) {
      // Calculate scroll distance: half of the total width (text + gap + text)
      // This creates seamless infinite loop - when it scrolls half way, it loops back
      const totalWidth = textRef.current.scrollWidth
      const scrollDistance = totalWidth / 2
      textRef.current.style.setProperty('--scroll-distance', `-${scrollDistance}px`)
    }
  }, [isHovered, entry.name.length])

  return (
    <DropdownMenu open={isContextMenuOpen} onOpenChange={setIsContextMenuOpen} modal={false}>
      <DropdownMenuTrigger asChild>
        <div
          className={cn(
            'group relative flex flex-col items-center gap-2 rounded-lg border border-main-view-fg/10 bg-main-view/30 p-4 transition-all',
            isFolder ? 'cursor-pointer' : 'cursor-default',
            'hover:border-main-view-fg/20 hover:bg-main-view/50 hover:shadow-sm'
          )}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          onClick={(e) => {
            // Prevent dropdown from opening on left click
            if (e.button === 0) {
              e.preventDefault()
              e.stopPropagation()
              if (isFolder && onFolderClick) {
                onFolderClick(entry)
              }
            }
          }}
          onContextMenu={handleContextMenu}
          onPointerDown={(e) => {
            // Only allow right-click to trigger the dropdown
            if (e.button === 0) {
              e.preventDefault()
            }
          }}
        >
        <div className="relative flex flex-col items-center w-full">
          <div className="mb-2 flex items-center justify-center w-16 h-16 rounded-lg bg-main-view-fg/5 group-hover:bg-main-view-fg/10 transition-colors">
            <Icon size={32} className="text-main-view-fg/70" />
          </div>
          <div className="w-full text-center overflow-hidden">
            <div
              className={cn(
                'text-sm font-medium px-1 relative w-full',
                isHovered && entry.name.length > 15 ? 'overflow-hidden' : 'truncate'
              )}
              title={entry.name}
            >
              {isHovered && entry.name.length > 15 ? (
                <div ref={containerRef} className="relative overflow-hidden w-full inline-block">
                  <div
                    ref={textRef}
                    className="whitespace-nowrap inline-block"
                    style={{
                      animation: 'database-scroll-text 3s linear infinite',
                      willChange: 'transform',
                    }}
                  >
                    {entry.name}
                    <span className="inline-block" style={{ width: '40px' }} />
                    {entry.name}
                  </div>
                </div>
              ) : (
                <span>{entry.name}</span>
              )}
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
        </div>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" onCloseAutoFocus={(e) => e.preventDefault()}>
        <DropdownMenuItem
          onClick={(e) => {
            e.stopPropagation()
            navigator.clipboard.writeText(mention)
            setIsContextMenuOpen(false)
          }}
        >
          <IconCopy size={14} className="mr-2" />
          Copy mention
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={(e) => {
            e.stopPropagation()
            onDelete(entry.id)
            setIsContextMenuOpen(false)
          }}
          className="text-destructive"
        >
          <IconTrash size={14} className="mr-2" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function DatabasePage() {
  const { t } = useTranslation()
  const { entries, loading } = useDatabaseData()
  const { refresh, pickAndAddFiles, pickAndAddFolder, deleteById, getEntryById } = useDatabaseActions()
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)
  const [folderStack, setFolderStack] = useState<Array<{ id: string; name: string }>>([])

  useEffect(() => {
    // Add CSS for scrolling animation
    const styleId = 'database-scroll-animation'
    if (document.getElementById(styleId)) return

    const style = document.createElement('style')
    style.id = styleId
    style.textContent = `
      @keyframes database-scroll-text {
        from {
          transform: translateX(0);
        }
        to {
          transform: translateX(var(--scroll-distance, -200px));
        }
      }
    `
    document.head.appendChild(style)
    return () => {
      const existing = document.getElementById(styleId)
      if (existing) {
        document.head.removeChild(existing)
      }
    }
  }, [])

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Get current folder contents or root level items
  const currentEntries = useMemo(() => {
    if (!entries?.length) return []
    
    if (currentFolderId) {
      const folder = getEntryById(currentFolderId)
      return folder?.children || []
    }
    
    // Return root level items (items without a parent in the tree)
    return entries
  }, [entries, currentFolderId, getEntryById])

  const handleFolderClick = (folder: DatabaseEntry) => {
    if (folder.type === 'folder') {
      setCurrentFolderId(folder.id)
      setFolderStack((prev) => [...prev, { id: folder.id, name: folder.name }])
    }
  }

  const handleBreadcrumbClick = (index: number) => {
    if (index === -1) {
      // Root level
      setCurrentFolderId(null)
      setFolderStack([])
    } else {
      // Navigate to specific folder
      const newStack = folderStack.slice(0, index + 1)
      setFolderStack(newStack)
      if (newStack.length === 0) {
        setCurrentFolderId(null)
      } else {
        setCurrentFolderId(newStack[newStack.length - 1].id)
      }
    }
  }

  return (
    <div className="flex h-full flex-col bg-main-view text-main-view-fg">
      {/* Header */}
      <div className="border-b border-main-view-fg/10 px-6 py-3 flex items-center justify-between relative z-10 bg-main-view">
        <div className="flex items-center gap-3">
          <IconDatabase size={20} className="text-main-view-fg/70" />
          <div className="text-base font-semibold">{t('common:database.title')}</div>
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
            onClick={() => pickAndAddFiles(currentFolderId || undefined)}
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
            onClick={() => pickAndAddFolder(currentFolderId || undefined)}
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

      {/* Breadcrumb Navigation */}
      {(folderStack.length > 0 || currentFolderId) && (
        <div className="border-b border-main-view-fg/10 px-6 py-2 flex items-center gap-2 text-sm">
          <button
            onClick={() => handleBreadcrumbClick(-1)}
            className="flex items-center gap-1 text-main-view-fg/70 hover:text-main-view-fg transition-colors"
            type="button"
          >
            <IconHome size={16} />
            <span>{t('common:database.title')}</span>
          </button>
          {folderStack.map((folder, index) => (
            <div key={folder.id} className="flex items-center gap-2">
              <IconChevronRight size={16} className="text-main-view-fg/40" />
              <button
                onClick={() => handleBreadcrumbClick(index)}
                className="text-main-view-fg/70 hover:text-main-view-fg transition-colors truncate max-w-[200px]"
                type="button"
              >
                {folder.name}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Grid Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-sm text-main-view-fg/60">
              {t('common:database.loading')}
            </div>
          </div>
        ) : currentEntries.length === 0 ? (
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
            {currentEntries.map((entry) => (
              <GridItem
                key={entry.id}
                entry={entry}
                onDelete={deleteById}
                onFolderClick={handleFolderClick}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
