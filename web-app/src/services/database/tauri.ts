import { fs } from '@janhq/core'
import { homeDir, join } from '@tauri-apps/api/path'
import { invoke } from '@tauri-apps/api/core'
import { ulid } from 'ulidx'
import { createDocumentAttachment, createImageAttachment, type Attachment } from '@/types/attachment'
import { convertFileSrc } from '@tauri-apps/api/core'
import { DefaultRAGService } from '../rag/default'
import { ExtensionManager } from '@/lib/extension'
import { ExtensionTypeEnum, VectorDBExtension } from '@janhq/core'
import type {
  DatabaseEntry,
  DatabaseService,
} from './types'
import { DefaultDatabaseService } from './default'

const INDEX_FILENAME = '.jan-database-index.json'
const DB_FOLDER_NAME = 'database'

type RawIndexEntry = Omit<DatabaseEntry, 'children'> & {
  parsedContent?: string // Cached parsed text content for exact search
}

// Helper to safely convert errors to strings without template literal evaluation
const safeErrorToString = (e: unknown): string => {
  try {
    if (e instanceof Error) {
      // Only use the message property, never the whole error object
      const msg = e.message || 'Unknown error'
      // Escape template literal syntax to prevent evaluation
      return msg.replace(/\$\{/g, '\\${')
    }
    const str = String(e)
    // Escape template literal syntax to prevent evaluation
    return str.replace(/\$\{/g, '\\${')
  } catch {
    return 'Unknown error occurred'
  }
}

export class TauriDatabaseService
  extends DefaultDatabaseService
  implements DatabaseService
{
  private rootPath?: string
  private async resolveDataFolder(): Promise<string> {
    try {
      const appConfiguration = await window.core?.api?.getAppConfigurations?.()
      if (appConfiguration?.data_folder) {
        return appConfiguration.data_folder
      }
    } catch (e) {
      console.debug('Database data folder lookup failed', e)
    }

    const home = await homeDir()
    return await join(home, 'Library', 'Application Support', 'Jan')
  }

  private async ensureRoot(): Promise<string> {
    if (this.rootPath) return this.rootPath
    const dataFolder = await this.resolveDataFolder()
    const databaseRoot = await join(dataFolder, DB_FOLDER_NAME)

    try {
      await fs.mkdir(dataFolder)
    } catch (e) {
      console.debug('Database data folder mkdir skipped/failed', e)
    }

    try {
      await fs.mkdir(databaseRoot)
    } catch (e) {
      // mkdir is idempotent; ignore errors for existing dirs
      console.debug('Database mkdir skipped/failed', e)
    }

    this.rootPath = databaseRoot
    return databaseRoot
  }

  async root(): Promise<string> {
    return this.ensureRoot()
  }

  private async indexPath(): Promise<string> {
    const root = await this.ensureRoot()
    return join(root, INDEX_FILENAME)
  }

  private async readIndex(): Promise<RawIndexEntry[]> {
    const path = await this.indexPath()
    try {
      const content = await fs.readFileSync(path)
      if (typeof content !== 'string') return []
      const parsed = JSON.parse(content)
      if (!Array.isArray(parsed)) return []
      return parsed.filter((e) => e?.id && e?.path)
    } catch (e) {
      console.debug('Database index read fallback', e)
      return []
    }
  }

  private async writeIndex(entries: RawIndexEntry[]): Promise<void> {
    const path = await this.indexPath()
    await fs.writeFileSync(path, JSON.stringify(entries, null, 2))
  }

  private async pathExists(path: string): Promise<boolean> {
    try {
      const res = await fs.existsSync(path)
      return !!res
    } catch {
      return false
    }
  }

  private async uniquePath(root: string, desiredRelativePath: string): Promise<{
    path: string
    relativePath: string
  }> {
    // Handle paths that might already include parent folder
    const segments = desiredRelativePath.split(/[\\/]/).filter(Boolean)
    const fileName = segments[segments.length - 1]
    const parentPath = segments.length > 1 ? segments.slice(0, -1).join('/') : ''
    
    const splitIndex = fileName.lastIndexOf('.')
    const base = splitIndex > 0 ? fileName.substring(0, splitIndex) : fileName
    const ext = splitIndex > 0 ? fileName.substring(splitIndex) : ''

    let attempt = 0
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const suffix = attempt === 0 ? '' : ` (${attempt})`
      const candidateName = `${base}${suffix}${ext}`
      const candidateRelativePath = parentPath
        ? `${parentPath}/${candidateName}`
        : candidateName
      const candidatePath = await join(root, candidateRelativePath)
      const exists = await this.pathExists(candidatePath)
      if (!exists) {
        return { path: candidatePath, relativePath: candidateRelativePath }
      }
      attempt += 1
    }
  }

  private buildTree(entries: RawIndexEntry[]): DatabaseEntry[] {
    const byPath = new Map<string, DatabaseEntry>()
    const roots: DatabaseEntry[] = []

    const sorted = [...entries].sort((a, b) =>
      a.relativePath.localeCompare(b.relativePath)
    )

    for (const entry of sorted) {
      const segments = entry.relativePath.split(/[\\/]/).filter(Boolean)
      const node: DatabaseEntry = { ...entry }
      byPath.set(entry.relativePath, node)

      if (segments.length === 1) {
        roots.push(node)
        continue
      }

      const parentPath = segments.slice(0, -1).join('/')
      const parent = byPath.get(parentPath)
      if (parent) {
        if (!parent.children) parent.children = []
        parent.children.push(node)
      } else {
        roots.push(node)
      }
    }

    return roots
  }

  private async copyPath(
    sourcePath: string,
    destRoot: string,
    destRelative: string
  ): Promise<RawIndexEntry[]> {
    const entries: RawIndexEntry[] = []
    const stat = await fs.fileStat(sourcePath)
    const name = sourcePath.split(/[\\/]/).pop() || sourcePath

    const targetPath = await join(destRoot, destRelative)

    if (stat?.isDirectory) {
      await fs.mkdir(targetPath)
      const folderEntry: RawIndexEntry = {
        id: ulid(),
        name,
        displayName: name,
        path: targetPath,
        relativePath: destRelative,
        type: 'folder',
        size: 0,
      }
      entries.push(folderEntry)

      const children = await fs.readdirSync(sourcePath)
      for (const child of children || []) {
        const childName = child.split(/[\\/]/).pop() || child
        const childRelative =
          destRelative.length > 0 ? `${destRelative}/${childName}` : childName
        const childEntries = await this.copyPath(
          child,
          destRoot,
          childRelative
        )
        entries.push(...childEntries)
      }
    } else {
      try {
        // Call the Rust command directly
        await invoke('copy_file', { src: sourcePath, dest: targetPath })
      } catch (e) {
        const errorMessage = safeErrorToString(e)
        console.error('Failed to copy file:', sourcePath, 'to', targetPath, 'error:', errorMessage)
        // Use string concatenation to avoid template literal evaluation issues
        throw new Error('Failed to copy file: ' + errorMessage)
      }
      const fileEntry: RawIndexEntry = {
        id: ulid(),
        name,
        displayName: name,
        path: targetPath,
        relativePath: destRelative,
        type: 'file',
        size: stat?.size ?? 0,
      }
      entries.push(fileEntry)
    }

    return entries
  }

  async addPaths(
    paths: string[],
    parentFolderId?: string
  ): Promise<DatabaseEntry[]> {
    if (!paths?.length) return this.list()
    const root = await this.ensureRoot()
    const index = await this.readIndex()
    const newEntries: RawIndexEntry[] = []

    // Determine parent folder path
    let parentRelativePath = ''
    if (parentFolderId) {
      const parentEntry = index.find((e) => e.id === parentFolderId)
      if (!parentEntry || parentEntry.type !== 'folder') {
        throw new Error('Parent folder not found')
      }
      parentRelativePath = parentEntry.relativePath
    }

    for (const p of paths) {
      const sourceName = p.split(/[\\/]/).pop() || p
      const baseRelativePath = parentRelativePath
        ? `${parentRelativePath}/${sourceName}`
        : sourceName
      const { relativePath } = await this.uniquePath(root, baseRelativePath)
      try {
        const copied = await this.copyPath(p, root, relativePath)
        newEntries.push(...copied)
      } catch (e) {
        const errorMsg = safeErrorToString(e)
        console.error('Failed to copy path:', p, 'error:', errorMsg)
        // Use string concatenation to avoid template literal evaluation issues
        throw new Error('Failed to copy ' + sourceName + ': ' + errorMsg)
      }
    }

    // Mark files as 'pending' initially
    const fileEntries = newEntries.filter((e) => e.type === 'file')
    for (const entry of fileEntries) {
      entry.embeddingStatus = 'pending'
    }

    const merged = [...index, ...newEntries]
    await this.writeIndex(merged)

    // Start background ingestion (fire and forget)
    if (fileEntries.length > 0) {
      // Ensure method exists and bind it to preserve 'this' context
      if (typeof this.ingestFilesInBackground === 'function') {
        const ingestMethod = this.ingestFilesInBackground.bind(this)
        ;(async () => {
          try {
            await ingestMethod(fileEntries)
          } catch (e) {
            console.error('Background ingestion failed', e)
          }
        })()
      } else {
        console.error('ingestFilesInBackground method not available')
      }
    }

    return this.buildTree(merged)
  }

  async createFolder(folderName: string, parentFolderId?: string): Promise<DatabaseEntry[]> {
    if (!folderName?.trim()) {
      throw new Error('Folder name is required')
    }
    const root = await this.ensureRoot()
    const index = await this.readIndex()

    // Determine parent path
    let parentRelativePath = ''
    if (parentFolderId) {
      const parentEntry = index.find((e) => e.id === parentFolderId)
      if (!parentEntry || parentEntry.type !== 'folder') {
        throw new Error('Parent folder not found')
      }
      parentRelativePath = parentEntry.relativePath
    }

    // Generate unique folder name
    const baseName = folderName.trim()
    let folderRelativePath = parentRelativePath
      ? `${parentRelativePath}/${baseName}`
      : baseName
    let attempt = 0
    while (index.some((e) => e.relativePath === folderRelativePath)) {
      attempt += 1
      const suffix = ` (${attempt})`
      folderRelativePath = parentRelativePath
        ? `${parentRelativePath}/${baseName}${suffix}`
        : `${baseName}${suffix}`
    }

    const folderPath = await join(root, folderRelativePath)
    await fs.mkdir(folderPath)

    const folderEntry: RawIndexEntry = {
      id: ulid(),
      name: folderRelativePath.split(/[\\/]/).pop() || baseName,
      displayName: folderRelativePath.split(/[\\/]/).pop() || baseName,
      path: folderPath,
      relativePath: folderRelativePath,
      type: 'folder',
      size: 0,
    }

    const merged = [...index, folderEntry]
    await this.writeIndex(merged)
    return this.buildTree(merged)
  }

  async getIndex(): Promise<RawIndexEntry[]> {
    return this.readIndex()
  }

  async list(): Promise<DatabaseEntry[]> {
    const index = await this.readIndex()
    return this.buildTree(index)
  }

  async deleteById(id: string): Promise<void> {
    const index = await this.readIndex()
    const target = index.find((e) => e.id === id)
    if (!target) return
    const targetPath = target.path

    try {
      await fs.rm(targetPath)
    } catch (e) {
      console.error('Failed to remove database entry', e)
    }

    const prefix = target.relativePath.endsWith('/')
      ? target.relativePath
      : `${target.relativePath}/`

    const filtered = index.filter(
      (e) =>
        e.id !== id &&
        e.relativePath !== target.relativePath &&
        !e.relativePath.startsWith(prefix)
    )
    await this.writeIndex(filtered)
  }

  private async updateEmbeddingStatus(
    entryId: string,
    status: 'pending' | 'embedding' | 'embedded' | 'error'
  ): Promise<void> {
    const index = await this.readIndex()
    const updated = index.map((e) =>
      e.id === entryId ? { ...e, embeddingStatus: status } : e
    )
    await this.writeIndex(updated)
    
    // Emit event to trigger UI refresh
    window.dispatchEvent(new CustomEvent('database:embedding-status-updated', {
      detail: { entryId, status }
    }))
  }

  private async ingestFilesInBackground(entries: RawIndexEntry[]): Promise<void> {
    const vecExt = ExtensionManager.getInstance().get<VectorDBExtension>(ExtensionTypeEnum.VectorDB)
    const rag = new DefaultRAGService()
    const collectionName = 'database'

    // Process files sequentially to avoid overwhelming the system
    for (const entry of entries) {
      try {
        // Update status to 'embedding'
        await this.updateEmbeddingStatus(entry.id, 'embedding')

        // Determine mime type
        const ext = entry.name.split('.').pop()?.toLowerCase()
        let type = 'application/octet-stream'
        if (ext === 'pdf') type = 'application/pdf'
        else if (ext === 'txt') type = 'text/plain'
        else if (ext === 'md') type = 'text/markdown'
        else if (ext === 'docx') type = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        else if (ext === 'csv') type = 'text/csv'
        else if (ext === 'xlsx') type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        else if (ext === 'xls') type = 'application/vnd.ms-excel'
        else if (ext === 'pptx') type = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
        else if (ext === 'html' || ext === 'htm') type = 'text/html'

        // Parse document once for both vector embedding and exact search caching
        // Skip binary files that can't be parsed
        const binaryExts = new Set([
          'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'heic', 'heif',
          'mp3', 'wav', 'flac', 'ogg',
          'mp4', 'mov', 'avi', 'mkv', 'webm',
        ])
        
        let parsedContent: string | undefined
        if (!binaryExts.has(ext || '')) {
          try {
            // Parse the document once
            parsedContent = await rag.parseDocument(entry.path, type)
            
            // Store parsed content in index for fast exact search
            const index = await this.readIndex()
            const updated = index.map((e) =>
              e.id === entry.id ? { ...e, parsedContent } : e
            )
            await this.writeIndex(updated)
          } catch (e) {
            console.warn(`Failed to parse ${entry.name} for caching:`, e)
            // Continue even if parsing fails - we'll still try to embed
          }
        }

        // Ingest file into vector DB (this will parse again internally, but that's okay)
        // The parsedContent we stored is for exact search, vector DB needs its own parsing
        if (vecExt && typeof vecExt.ingestFile === 'function') {
          await vecExt.ingestFile(
            collectionName,
            {
              path: entry.path,
              name: entry.name,
              type,
              size: entry.size,
            },
            { chunkSize: 512, chunkOverlap: 64 }
          )
        }

        // Update status to 'embedded'
        await this.updateEmbeddingStatus(entry.id, 'embedded')
      } catch (e) {
        console.warn(`Failed to ingest ${entry.name} into vector DB:`, e)
        await this.updateEmbeddingStatus(entry.id, 'error')
      }
    }
  }

  private collectFilesForEntry(
    entry: RawIndexEntry,
    all: RawIndexEntry[]
  ): RawIndexEntry[] {
    if (entry.type === 'file') return [entry]
    const prefix = entry.relativePath.endsWith('/')
      ? entry.relativePath
      : `${entry.relativePath}/`
    return all.filter(
      (e) => e.type === 'file' && e.relativePath.startsWith(prefix)
    )
  }

  async toAttachments(ids: string[]): Promise<Attachment[]> {
    if (!ids?.length) return []
    const index = await this.readIndex()
    const attachments: Attachment[] = []
    const seen = new Set<string>()

    const isImageExt = (ext?: string) => {
      const e = (ext || '').toLowerCase()
      return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(e)
    }
    const mimeFromExt = (ext?: string) => {
      switch ((ext || '').toLowerCase()) {
        case 'png':
          return 'image/png'
        case 'jpg':
        case 'jpeg':
          return 'image/jpeg'
        case 'gif':
          return 'image/gif'
        case 'webp':
          return 'image/webp'
        case 'svg':
          return 'image/svg+xml'
        default:
          return 'application/octet-stream'
      }
    }
    const readPathAsDataUrl = async (path: string): Promise<{ dataUrl: string; base64: string; mimeType: string; size: number }> => {
      const url = convertFileSrc(path)
      const res = await fetch(url)
      if (!res.ok) throw new Error(`Failed to read file: ${res.status}`)
      const blob = await res.blob()
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onerror = () => reject(new Error('Failed to read file'))
        reader.onload = () => resolve(String(reader.result || ''))
        reader.readAsDataURL(blob)
      })
      const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : ''
      const mimeType = blob.type || dataUrl.split(';')[0].replace('data:', '') || 'application/octet-stream'
      return { dataUrl, base64, mimeType, size: blob.size }
    }

    for (const id of ids) {
      const entry = index.find((e) => e.id === id)
      if (!entry) continue
      const files = this.collectFilesForEntry(entry, index)
      for (const file of files) {
        if (seen.has(file.path)) continue
        seen.add(file.path)
        const ext = file.name.split('.').pop()
        if (isImageExt(ext)) {
          try {
            const { dataUrl, base64, mimeType, size } = await readPathAsDataUrl(file.path)
            attachments.push(
              createImageAttachment({
                name: file.displayName ?? file.name,
                mimeType: mimeType || mimeFromExt(ext),
                size,
                base64,
                dataUrl,
              })
            )
          } catch (e) {
            console.error('Failed to load image for db attachment', e)
          }
          continue
        }

        attachments.push(
          createDocumentAttachment({
            name: file.displayName ?? file.name,
            path: file.path,
            fileType: ext,
            size: file.size,
            parseMode: 'embeddings',
          })
        )
      }
    }

    return attachments
  }

  async updateReferenceName(id: string, displayName: string): Promise<DatabaseEntry[]> {
    const trimmed = displayName.trim()
    if (!trimmed) {
      throw new Error('Display name is required')
    }
    const index = await this.readIndex()
    const target = index.find((e) => e.id === id)
    if (!target) {
      throw new Error('Entry not found')
    }
    const updated = index.map((e) =>
      e.id === id
        ? { ...e, displayName: trimmed }
        : e
    )
    await this.writeIndex(updated)
    return this.buildTree(updated)
  }

  async updateCategories(id: string, categories: string[]): Promise<DatabaseEntry[]> {
    const unique = [...new Set(categories.map((c) => c.trim()).filter(Boolean))]
    const index = await this.readIndex()
    const target = index.find((e) => e.id === id)
    if (!target) {
      throw new Error('Entry not found')
    }
    const updated = index.map((e) =>
      e.id === id
        ? { ...e, categories: unique }
        : e
    )
    await this.writeIndex(updated)
    return this.buildTree(updated)
  }

  async searchContent(ids: string[], query: string): Promise<Record<string, string[]>> {
    const out: Record<string, string[]> = {}
    if (!ids?.length || !query.trim()) return out
    const q = query.toLowerCase()
    const index = await this.readIndex()
    const rag = new DefaultRAGService()

    const snippet = (text: string, pos: number, window = 120) => {
      const start = Math.max(0, pos - window)
      const end = Math.min(text.length, pos + window)
      return text.slice(start, end)
    }

    for (const id of ids) {
      const entry = index.find((e) => e.id === id)
      if (!entry || entry.type !== 'file') continue

      // Check if query matches metadata - if so, show metadata as preview
      const matchesMeta =
        entry.displayName?.toLowerCase().includes(q) ||
        entry.name.toLowerCase().includes(q) ||
        entry.relativePath.toLowerCase().includes(q)

      if (matchesMeta) {
        const metadataSnippets: string[] = []
        if (entry.displayName?.toLowerCase().includes(q)) {
          metadataSnippets.push(`Name: ${entry.displayName}`)
        } else if (entry.name.toLowerCase().includes(q)) {
          metadataSnippets.push(`Name: ${entry.name}`)
        }
        if (entry.relativePath.toLowerCase().includes(q)) {
          metadataSnippets.push(`Path: ${entry.relativePath}`)
        }
        if (metadataSnippets.length > 0) {
          out[id] = metadataSnippets
          continue // Skip content search if metadata matched
        }
      }

      // Try to find content matches (use cached content first)
      let contentToSearch: string | undefined = entry.parsedContent

      // If no cached content, try parsing (but skip binary files)
      if (!contentToSearch) {
        const ext = entry.name.split('.').pop()?.toLowerCase() ?? ''
        const binaryExts = new Set([
          'png',
          'jpg',
          'jpeg',
          'gif',
          'webp',
          'svg',
          'heic',
          'heif',
          'mp3',
          'wav',
          'flac',
          'ogg',
          'mp4',
          'mov',
          'avi',
          'mkv',
          'webm',
        ])
        if (binaryExts.has(ext)) continue

        // Skip very large files to avoid stack overflow/overhead
        try {
          const stat = await fs.fileStat(entry.path)
          const sizeNum = stat?.size ? Number(stat.size) : 0
          const MAX_BYTES = 8 * 1024 * 1024
          if (sizeNum > MAX_BYTES) continue
        } catch {
          continue
        }

        try {
          // Determine file type from extension for proper parsing
          let fileType = 'application/octet-stream'
          if (ext === 'pdf') fileType = 'application/pdf'
          else if (ext === 'txt') fileType = 'text/plain'
          else if (ext === 'md') fileType = 'text/markdown'
          else if (ext === 'docx') fileType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
          else if (ext === 'csv') fileType = 'text/csv'
          else if (ext === 'xlsx') fileType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          else if (ext === 'xls') fileType = 'application/vnd.ms-excel'
          else if (ext === 'pptx') fileType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
          else if (ext === 'html' || ext === 'htm') fileType = 'text/html'
          else fileType = ext // Fallback to extension as type

          contentToSearch = await rag.parseDocument(entry.path, fileType)
        } catch (e) {
          console.warn('searchContent parse failed for', entry.path, e)
          continue
        }
      }

      // Search in content
      if (contentToSearch) {
        const lower = contentToSearch.toLowerCase()
        let pos = lower.indexOf(q)
        const snippets: string[] = []
        let guard = 0
        while (pos !== -1 && guard < 5) {
          snippets.push(snippet(contentToSearch, pos))
          pos = lower.indexOf(q, pos + q.length)
          guard++
        }
        if (snippets.length) {
          out[id] = snippets
        }
      }
    }
    return out
  }

  async searchExact(ids: string[], query: string): Promise<string[]> {
    if (!query.trim()) return []
    const q = query.toLowerCase()
    const index = await this.readIndex()
    const rag = new DefaultRAGService()
    const matchingIds = new Set<string>()

    // If no IDs provided, search all entries in the index
    const candidateIds = ids?.length > 0 ? ids : index.map((e) => e.id)

    // First, search metadata (name, displayName, path)
    for (const id of candidateIds) {
      const entry = index.find((e) => e.id === id)
      if (!entry) continue

      const matchesMeta =
        entry.displayName?.toLowerCase().includes(q) ||
        entry.name.toLowerCase().includes(q) ||
        entry.relativePath.toLowerCase().includes(q)

      if (matchesMeta) {
        matchingIds.add(id)
        continue
      }

      // If it's a file, also search content using cached parsed content
      if (entry.type === 'file') {
        // Use cached parsed content if available (parsed during upload)
        if (entry.parsedContent) {
          if (entry.parsedContent.toLowerCase().includes(q)) {
            matchingIds.add(id)
          }
          continue
        }

        // Fallback: parse on-demand for files that weren't parsed during upload
        // (e.g., files added before this optimization, or files that failed to parse)
        const ext = entry.name.split('.').pop()?.toLowerCase() ?? ''
        
        // Skip binary types that can't have their content searched
        const binaryExts = new Set([
          'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'heic', 'heif',
          'mp3', 'wav', 'flac', 'ogg',
          'mp4', 'mov', 'avi', 'mkv', 'webm',
        ])
        if (binaryExts.has(ext)) continue

        // Skip very large files
        try {
          const stat = await fs.fileStat(entry.path)
          const sizeNum = stat?.size ? Number(stat.size) : 0
          const MAX_BYTES = 8 * 1024 * 1024
          if (sizeNum > MAX_BYTES) continue
        } catch {
          continue
        }

        try {
          // Determine file type from extension for proper parsing
          let fileType = 'application/octet-stream'
          if (ext === 'pdf') fileType = 'application/pdf'
          else if (ext === 'txt') fileType = 'text/plain'
          else if (ext === 'md') fileType = 'text/markdown'
          else if (ext === 'docx') fileType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
          else if (ext === 'csv') fileType = 'text/csv'
          else if (ext === 'xlsx') fileType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          else if (ext === 'xls') fileType = 'application/vnd.ms-excel'
          else if (ext === 'pptx') fileType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
          else if (ext === 'html' || ext === 'htm') fileType = 'text/html'
          else fileType = ext // Fallback to extension as type

          const parsed = await rag.parseDocument(entry.path, fileType)
          if (parsed && parsed.toLowerCase().includes(q)) {
            matchingIds.add(id)
          }
        } catch (e) {
          console.warn('searchExact parse failed for', entry.path, e)
        }
      }
    }

    return Array.from(matchingIds)
  }

  async searchVector(ids: string[], query: string): Promise<string[]> {
    if (!ids?.length || !query.trim()) return []

    try {
      // Get embedding model to embed the query
      const llm = window.core?.extensionManager?.getByName('@janhq/llamacpp-extension') as {
        embed?: (texts: string[]) => Promise<{ data: Array<{ embedding: number[]; index: number }> }>
      }

      if (!llm?.embed) {
        console.warn('Embedding model not available for vector search')
        return []
      }

      const embedResult = await llm.embed([query])
      const data = embedResult?.data || []
      const queryEmbedding = data[0]?.embedding
      if (!queryEmbedding || queryEmbedding.length === 0) {
        console.warn('Failed to generate query embedding')
        return []
      }

      // Get VectorDB extension
      const vecExt = ExtensionManager.getInstance().get<VectorDBExtension>(ExtensionTypeEnum.VectorDB)
      if (!vecExt?.searchCollection) {
        console.warn('VectorDB extension not available')
        return []
      }

      // Get candidate file paths from the database entries
      const index = await this.readIndex()
      const candidatePaths = new Set<string>()
      for (const id of ids) {
        const entry = index.find((e) => e.id === id)
        if (entry?.type === 'file') {
          candidatePaths.add(entry.path)
        }
      }

      if (candidatePaths.size === 0) return []

      // Use a database-specific collection name
      // Search the entire collection and match results back to database entries
      const collectionName = 'database'
      const results = await vecExt.searchCollection(
        collectionName,
        queryEmbedding,
        100, // limit - get more results to filter
        0.0, // threshold
        'ann', // mode - use ANN if available, falls back to linear
        undefined // Don't filter by fileIds - VectorDB file IDs != database entry IDs
      )

      // Match results back to database entries
      // We need to get file info from VectorDB to match by path
      // For now, get all file attachments and match by path
      const vecFileInfos = await vecExt.listAttachments(collectionName, 1000).catch(() => [])
      const pathToDbId = new Map<string, string>()
      for (const entry of index) {
        if (entry.type === 'file' && candidatePaths.has(entry.path)) {
          pathToDbId.set(entry.path, entry.id)
        }
      }

      // Match VectorDB file IDs to database entry IDs
      const vecFileIdToPath = new Map<string, string>()
      for (const vecFile of vecFileInfos) {
        if (vecFile.path && pathToDbId.has(vecFile.path)) {
          vecFileIdToPath.set(vecFile.id, vecFile.path)
        }
      }

      // Extract unique database entry IDs from results
      const resultDbIds = new Set<string>()
      for (const result of results || []) {
        if (result.file_id) {
          const path = vecFileIdToPath.get(result.file_id)
          if (path) {
            const dbId = pathToDbId.get(path)
            if (dbId) {
              resultDbIds.add(dbId)
            }
          }
        }
      }

      return Array.from(resultDbIds)
    } catch (e) {
      console.error('Vector search failed', e)
      // Return empty array on error - vector search is optional
      return []
    }
  }

  async openFile(id: string): Promise<void> {
    const index = await this.readIndex()
    const entry = index.find((e) => e.id === id)
    if (!entry) {
      throw new Error('File not found')
    }
    if (entry.type !== 'file') {
      throw new Error('Entry is not a file')
    }

    try {
      await invoke('open_file_with_default_viewer', { path: entry.path })
    } catch (e) {
      const errorMsg = safeErrorToString(e)
      console.error('Failed to open file:', errorMsg)
      throw new Error('Failed to open file: ' + errorMsg)
    }
  }
}
