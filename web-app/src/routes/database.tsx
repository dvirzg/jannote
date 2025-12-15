import React, { useCallback, useEffect, useMemo, useState } from 'react'
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
  IconSearch,
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
import { parseUnifiedCommands, resolveUnifiedCommands } from '@/lib/unifiedCommands'
import { toast } from 'sonner'
import { useServiceHub } from '@/hooks/useServiceHub'

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
  onEditMetadata,
}: {
  entry: DatabaseEntry
  onDelete: (id: string) => void
  onFolderClick?: (entry: DatabaseEntry) => void
  onEditMetadata?: (entry: DatabaseEntry) => void
}) => {
  const [isHovered, setIsHovered] = useState(false)
  const [isContextMenuOpen, setIsContextMenuOpen] = useState(false)
  const textRef = React.useRef<HTMLDivElement>(null)
  const containerRef = React.useRef<HTMLDivElement>(null)
  const isFolder = entry.type === 'folder'
  const displayName = entry.displayName || entry.name
  const Icon = getFileIcon(displayName, isFolder)
  const mention = `@db:${entry.id}`

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsContextMenuOpen(true)
  }

  useEffect(() => {
    if (isHovered && displayName.length > 15 && textRef.current) {
      // Calculate scroll distance: half of the total width (text + gap + text)
      // This creates seamless infinite loop - when it scrolls half way, it loops back
      const totalWidth = textRef.current.scrollWidth
      const scrollDistance = totalWidth / 2
      textRef.current.style.setProperty('--scroll-distance', `-${scrollDistance}px`)
    }
  }, [isHovered, displayName.length])

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
                isHovered && displayName.length > 15 ? 'overflow-hidden' : 'truncate'
              )}
              title={displayName}
            >
              {isHovered && displayName.length > 15 ? (
                <div ref={containerRef} className="relative overflow-hidden w-full inline-block">
                  <div
                    ref={textRef}
                    className="whitespace-nowrap inline-block"
                    style={{
                      animation: 'database-scroll-text 3s linear infinite',
                      willChange: 'transform',
                    }}
                  >
                    {displayName}
                    <span className="inline-block" style={{ width: '40px' }} />
                    {displayName}
                  </div>
                </div>
              ) : (
                <span>{displayName}</span>
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
                  {entry.displayName && entry.displayName !== entry.name ? (
                    <div className="text-[11px] text-main-view-fg/50 mt-1">Original: {entry.name}</div>
                  ) : null}
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
            onEditMetadata?.(entry)
            setIsContextMenuOpen(false)
          }}
        >
          Edit metadata
        </DropdownMenuItem>
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
  const serviceHub = useServiceHub()
  const { entries, loading } = useDatabaseData()
  const { refresh, pickAndAddFiles, pickAndAddFolder, deleteById, getEntryById, updateReferenceName, updateCategories } =
    useDatabaseActions()
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)
  const [folderStack, setFolderStack] = useState<Array<{ id: string; name: string }>>([])
  const [renameValue, setRenameValue] = useState('')
  const [categoriesTarget, setCategoriesTarget] = useState<DatabaseEntry | null>(null)
  const [categoriesValue, setCategoriesValue] = useState('')
  const [categoriesSaving, setCategoriesSaving] = useState(false)
  const [searchResultIndex, setSearchResultIndex] = useState(0)
  const [contentPreviews, setContentPreviews] = useState<Record<string, string[]>>({})
  const [searchQuery, setSearchQuery] = useState('')
  const [searchIds, setSearchIds] = useState<string[] | null>(null)
  const [searchWarnings, setSearchWarnings] = useState<string[]>([])
  const [searchFocused, setSearchFocused] = useState(false)
  const [searchSelectedIndex, setSearchSelectedIndex] = useState(0)

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

  const flatEntries = useMemo(() => {
    const out: Array<Pick<DatabaseEntry, 'id' | 'relativePath' | 'displayName' | 'name' | 'type'>> = []
    const walk = (nodes?: DatabaseEntry[]) => {
      if (!nodes) return
      for (const n of nodes) {
        out.push({
          id: n.id,
          relativePath: n.relativePath,
          displayName: n.displayName,
          name: n.name,
          type: n.type,
        })
        if (n.children?.length) walk(n.children)
      }
    }
    walk(entries)
    return out
  }, [entries])

  useEffect(() => {
    const run = async () => {
      if (!searchQuery.trim()) {
        setSearchIds(null)
        setSearchWarnings([])
        return
      }
      const parsed = parseUnifiedCommands(searchQuery)
      const resolved = await resolveUnifiedCommands(parsed, flatEntries)
      if (resolved.errors.length) {
        toast.error(resolved.errors[0])
        setSearchIds([])
        setSearchWarnings(resolved.warnings)
        return
      }
      setSearchIds(resolved.docIds)
      setSearchWarnings(resolved.warnings)
    }
    void run()
  }, [searchQuery, flatEntries])

  useEffect(() => {
    if (!searchIds || searchIds.length === 0) {
      setSearchResultIndex(0)
      return
    }
    setSearchResultIndex((prev) => Math.min(prev, searchIds.length - 1))
  }, [searchIds])

  useEffect(() => {
    const fetchPreviews = async () => {
      if (!searchIds || searchIds.length === 0) {
        setContentPreviews({})
        return
      }
      // Try optional database content search if available
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const db: any = serviceHub.database?.()
        if (db?.searchContent) {
          const result = await db.searchContent(Array.from(searchIds), searchQuery)
          if (result && typeof result === 'object') {
            setContentPreviews(result as Record<string, string[]>)
          } else {
            setContentPreviews({})
          }
        } else {
          setContentPreviews({})
        }
      } catch (e) {
        console.warn('Content search preview failed', e)
        setContentPreviews({})
      }
    }
    void fetchPreviews()
  }, [searchIds, searchQuery, serviceHub])

  const searchSnippets = useMemo(
    () => [
      '@scope(path="", type="", limit_docs=)',
      '@scope(path="**/*.pdf")',
      '@scope(type="file")',
      '@scope(type="folder")',
      '#meta:""',
      '#content:""',
    ],
    []
  )

  const filteredSnippets = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    const list = q ? searchSnippets.filter((s) => s.toLowerCase().includes(q)) : searchSnippets
    return list.slice(0, 8)
  }, [searchQuery, searchSnippets])

  useEffect(() => {
    setSearchSelectedIndex(0)
  }, [filteredSnippets])

  const applySnippet = useCallback(
    (snippet: string) => {
      setSearchQuery((prev) => {
        const trimmedRight = prev.replace(/\s+$/, '')
        if (!trimmedRight) return snippet
        const parts = trimmedRight.split(/\s+/)
        parts[parts.length - 1] = snippet
        return parts.join(' ')
      })
      setTimeout(() => {
        const el = document.getElementById('database-search-input') as HTMLInputElement | null
        if (el) {
          el.focus()
          el.setSelectionRange(el.value.length, el.value.length)
        }
      }, 0)
    },
    [setSearchQuery]
  )

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

  const visibleEntries = useMemo(() => {
    if (searchIds === null) return currentEntries
    const idSet = new Set(searchIds)
    const filtered: DatabaseEntry[] = []
    const walk = (nodes?: DatabaseEntry[]) => {
      if (!nodes) return
      for (const n of nodes) {
        if (idSet.has(n.id) && n.type === 'file') {
          filtered.push(n)
        }
        if (n.children?.length) walk(n.children)
      }
    }
    walk(entries)
    return filtered
  }, [currentEntries, entries, searchIds])

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

  const openMetadataEditor = (entry: DatabaseEntry) => {
    setCategoriesTarget(entry)
    setRenameValue(entry.displayName || entry.name)
    const cats = entry.categories ?? []
    setCategoriesValue(cats.join(', '))
  }

  const submitMetadata = async () => {
    if (!categoriesTarget) return
    const parsed = categoriesValue
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean)
    const trimmedName = renameValue.trim()
    try {
      setCategoriesSaving(true)
      if (trimmedName) {
        await updateReferenceName(categoriesTarget.id, trimmedName)
      }
      await updateCategories(categoriesTarget.id, parsed)
    } finally {
      setCategoriesSaving(false)
      setCategoriesTarget(null)
      setCategoriesValue('')
    }
  }

  return (
    <div className="flex h-full flex-col bg-main-view text-main-view-fg">
      {categoriesTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-main-view text-main-view-fg border border-main-view-fg/10 rounded-lg shadow-xl p-4 w-full max-w-md">
            <div className="text-sm font-semibold mb-2">Edit metadata</div>
            <div className="text-xs text-main-view-fg/70 mb-3">Rename and categories</div>
            <input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              className="w-full rounded-md border border-main-view-fg/20 bg-main-view/60 px-3 py-2 text-sm outline-none focus:border-main-view-fg/40"
              placeholder="Display name"
            />
            <input
              value={categoriesValue}
              onChange={(e) => setCategoriesValue(e.target.value)}
              className="w-full rounded-md border border-main-view-fg/20 bg-main-view/60 px-3 py-2 text-sm outline-none focus:border-main-view-fg/40 mt-2"
              placeholder="category1, category2"
            />
            <div className="flex justify-end gap-2 mt-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setCategoriesTarget(null)
                  setCategoriesValue('')
                }}
                disabled={categoriesSaving}
              >
                Cancel
              </Button>
              <Button size="sm" onClick={submitMetadata} disabled={categoriesSaving}>
                {categoriesSaving ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="border-b border-main-view-fg/10 px-6 py-3 flex items-center justify-between gap-4 flex-wrap relative z-10 bg-main-view">
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

      {/* Search bar */}
      <div className="px-6 py-3 border-b border-main-view-fg/10 bg-main-view/80">
        <div className="relative max-w-3xl">
          <IconSearch
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-main-view-fg/50"
          />
          <input
            id="database-search-input"
            value={searchQuery}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (filteredSnippets.length === 0) return
              if (e.key === 'Tab') {
                e.preventDefault()
                applySnippet(filteredSnippets[searchSelectedIndex] ?? filteredSnippets[0])
              } else if (e.key === 'Enter') {
                e.preventDefault()
                applySnippet(filteredSnippets[searchSelectedIndex] ?? filteredSnippets[0])
              } else if (e.key === 'ArrowDown') {
                e.preventDefault()
                setSearchSelectedIndex((prev) =>
                  (prev + 1) % filteredSnippets.length
                )
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setSearchSelectedIndex((prev) =>
                  (prev - 1 + filteredSnippets.length) % filteredSnippets.length
                )
              }
            }}
            placeholder='Type @scope(...) #meta:"..." #content:"..."'
            className="w-full rounded-md border border-main-view-fg/15 bg-main-view/60 pl-9 pr-3 py-2 text-sm text-main-view-fg outline-none focus:border-main-view-fg/30"
          />
          {(searchFocused || searchQuery) && filteredSnippets.length > 0 && (
            <div className="absolute mt-1 w-full rounded-md border border-main-view-fg/15 bg-main-view shadow-lg z-10 overflow-hidden">
              {filteredSnippets.map((snippet, idx) => (
                <button
                  key={snippet}
                  type="button"
                  className={cn(
                    'w-full text-left px-3 py-2 text-sm text-main-view-fg flex items-center justify-between hover:bg-main-view-fg/5',
                    idx === searchSelectedIndex && 'bg-main-view-fg/5'
                  )}
                  onMouseEnter={() => setSearchSelectedIndex(idx)}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    applySnippet(snippet)
                  }}
                >
                  <span className="truncate">{snippet}</span>
                  {idx === searchSelectedIndex && (
                    <span className="text-[11px] text-main-view-fg/50">Tab / Enter</span>
                  )}
                </button>
              ))}
            </div>
          )}
          {searchWarnings.length > 0 && (
            <div className="mt-2 text-xs text-amber-300">
              {searchWarnings[0]}
            </div>
          )}
        </div>
      </div>

      {/* Breadcrumb Navigation */}
      {(folderStack.length > 0 || currentFolderId) && searchIds === null && (
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
        ) : visibleEntries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <div className="rounded-full bg-main-view-fg/5 p-6">
              <IconDatabase size={48} className="text-main-view-fg/30" />
            </div>
            <div className="text-base font-semibold text-main-view-fg/80">
              {searchIds ? 'No matches for search' : t('common:database.emptyTitle')}
            </div>
            <div className="text-sm text-main-view-fg/60 text-center max-w-md">
              {searchIds
                ? 'Adjust your @scope / #meta / #content query to see results.'
                : t('common:database.empty')}
            </div>
            <div className="flex gap-2">
              <Button onClick={() => pickAndAddFiles(currentFolderId || undefined)} disabled={loading}>
                {t('common:database.addFiles')}
              </Button>
              <Button
                variant="outline"
                onClick={() => pickAndAddFolder(currentFolderId || undefined)}
                disabled={loading}
              >
                {t('common:database.addFolder')}
              </Button>
            </div>
          </div>
        ) : searchIds !== null ? (
          <div className="flex flex-col lg:flex-row gap-4 h-full">
            <div className="w-full lg:w-5/12 flex flex-col gap-2 overflow-y-auto pr-1">
              {visibleEntries.map((entry, idx) => {
                const isActive = idx === searchResultIndex
                return (
                  <button
                    key={entry.id}
                    type="button"
                    className={cn(
                      'w-full text-left rounded-md border border-main-view-fg/10 bg-main-view/60 px-3 py-2 hover:border-main-view-fg/20',
                      isActive && 'border-main-view-fg/40 bg-main-view/80'
                    )}
                    onClick={() => setSearchResultIndex(idx)}
                  >
                    <div className="text-sm font-semibold truncate">{entry.displayName || entry.name}</div>
                    <div className="text-xs text-main-view-fg/60 truncate">{entry.relativePath}</div>
                    {entry.categories?.length ? (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {entry.categories.map((c) => (
                          <span
                            key={c}
                            className="text-[11px] px-1.5 py-0.5 rounded-full bg-main-view-fg/10 text-main-view-fg/70 border border-main-view-fg/10"
                          >
                            {c}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </button>
                )
              })}
            </div>
            <div className="w-full lg:w-7/12 relative border border-main-view-fg/10 rounded-md bg-main-view/70 overflow-hidden">
              <div className="absolute inset-x-0 top-0 h-8 pointer-events-none bg-gradient-to-b from-main-view to-transparent" />
              <div className="absolute inset-x-0 bottom-0 h-8 pointer-events-none bg-gradient-to-t from-main-view to-transparent" />
              <div className="p-4 h-full overflow-y-auto space-y-3">
                {visibleEntries[searchResultIndex] ? (
                  (() => {
                    const activeEntry = visibleEntries[searchResultIndex]
                    const snippets = contentPreviews[activeEntry.id] || []
                    if (!snippets.length) {
                      return (
                        <div className="text-sm text-main-view-fg/60">
                          No content preview available for this query.
                        </div>
                      )
                    }
                    return snippets.map((s, idx) => (
                      <div
                        key={`${activeEntry.id}-${idx}`}
                        className="rounded-md bg-main-view/50 border border-main-view-fg/10 p-3 text-sm text-main-view-fg whitespace-pre-wrap"
                      >
                        {s}
                      </div>
                    ))
                  })()
                ) : (
                  <div className="text-sm text-main-view-fg/60">Select a result to preview.</div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-4">
            {visibleEntries.map((entry) => (
              <GridItem
                key={entry.id}
                entry={entry}
                onDelete={deleteById}
                onFolderClick={handleFolderClick}
                onEditMetadata={openMetadataEditor}
              />
            ))}
          </div>
        )}
      </div>

      {categoriesTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-main-view text-main-view-fg border border-main-view-fg/10 rounded-lg shadow-xl p-4 w-full max-w-md">
            <div className="text-sm font-semibold mb-2">Edit metadata</div>
            <div className="text-xs text-main-view-fg/70 mb-3">Rename and categories</div>
            <input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              className="w-full rounded-md border border-main-view-fg/20 bg-main-view/60 px-3 py-2 text-sm outline-none focus:border-main-view-fg/40"
              placeholder="Display name"
            />
            <input
              value={categoriesValue}
              onChange={(e) => setCategoriesValue(e.target.value)}
              className="w-full rounded-md border border-main-view-fg/20 bg-main-view/60 px-3 py-2 text-sm outline-none focus:border-main-view-fg/40 mt-2"
              placeholder="category1, category2"
            />
            <div className="flex justify-end gap-2 mt-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setCategoriesTarget(null)
                  setCategoriesValue('')
                }}
                disabled={categoriesSaving}
              >
                Cancel
              </Button>
              <Button size="sm" onClick={submitMetadata} disabled={categoriesSaving}>
                {categoriesSaving ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
