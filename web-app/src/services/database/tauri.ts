import { fs } from '@janhq/core'
import { homeDir, join } from '@tauri-apps/api/path'
import { invoke } from '@tauri-apps/api/core'
import { ulid } from 'ulidx'
import { createDocumentAttachment, type Attachment } from '@/types/attachment'
import type {
  DatabaseEntry,
  DatabaseIngestionMode,
  DatabaseService,
} from './types'
import { DefaultDatabaseService } from './default'

const INDEX_FILENAME = '.jan-database-index.json'
const DB_FOLDER_NAME = 'database'

type RawIndexEntry = Omit<DatabaseEntry, 'children'>

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
    destRelative: string,
    mode: DatabaseIngestionMode
  ): Promise<RawIndexEntry[]> {
    if (!mode || (mode !== 'inline' && mode !== 'embeddings')) {
      throw new Error('Invalid ingestion mode: must be "inline" or "embeddings"')
    }
    const entries: RawIndexEntry[] = []
    const stat = await fs.fileStat(sourcePath)
    const name = sourcePath.split(/[\\/]/).pop() || sourcePath

    const targetPath = await join(destRoot, destRelative)

    if (stat?.isDirectory) {
      await fs.mkdir(targetPath)
      const folderEntry: RawIndexEntry = {
        id: ulid(),
        name,
        path: targetPath,
        relativePath: destRelative,
        type: 'folder',
        size: 0,
        injectionMode: mode,
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
          childRelative,
          mode
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
        path: targetPath,
        relativePath: destRelative,
        type: 'file',
        size: stat?.size ?? 0,
        injectionMode: mode,
      }
      entries.push(fileEntry)
    }

    return entries
  }

  async addPaths(
    paths: string[],
    ingestionMode: DatabaseIngestionMode,
    parentFolderId?: string
  ): Promise<DatabaseEntry[]> {
    if (!paths?.length) return this.list()
    if (!ingestionMode || (ingestionMode !== 'inline' && ingestionMode !== 'embeddings')) {
      throw new Error('Invalid ingestion mode provided')
    }
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
        const copied = await this.copyPath(p, root, relativePath, ingestionMode)
        newEntries.push(...copied)
      } catch (e) {
        const errorMsg = safeErrorToString(e)
        console.error('Failed to copy path:', p, 'error:', errorMsg)
        // Use string concatenation to avoid template literal evaluation issues
        throw new Error('Failed to copy ' + sourceName + ': ' + errorMsg)
      }
    }

    const merged = [...index, ...newEntries]
    await this.writeIndex(merged)
    return this.buildTree(merged)
  }

  async addPathsWithModes(
    pathsWithModes: Array<{ path: string; mode: DatabaseIngestionMode }>,
    parentFolderId?: string
  ): Promise<DatabaseEntry[]> {
    if (!pathsWithModes?.length) return this.list()
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

    for (const { path: p, mode } of pathsWithModes) {
      if (!mode || (mode !== 'inline' && mode !== 'embeddings')) {
        throw new Error('Invalid ingestion mode provided')
      }
      const sourceName = p.split(/[\\/]/).pop() || p
      const baseRelativePath = parentRelativePath
        ? `${parentRelativePath}/${sourceName}`
        : sourceName
      const { relativePath } = await this.uniquePath(root, baseRelativePath)
      try {
        const copied = await this.copyPath(p, root, relativePath, mode)
        newEntries.push(...copied)
      } catch (e) {
        const errorMsg = safeErrorToString(e)
        console.error('Failed to copy path:', p, 'error:', errorMsg)
        throw new Error('Failed to copy ' + sourceName + ': ' + errorMsg)
      }
    }

    const merged = [...index, ...newEntries]
    await this.writeIndex(merged)
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
      path: folderPath,
      relativePath: folderRelativePath,
      type: 'folder',
      size: 0,
      injectionMode: 'embeddings', // Default mode for empty folders
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

    for (const id of ids) {
      const entry = index.find((e) => e.id === id)
      if (!entry) continue
      const files = this.collectFilesForEntry(entry, index)
      for (const file of files) {
        if (seen.has(file.path)) continue
        seen.add(file.path)
        attachments.push(
          createDocumentAttachment({
            name: file.name,
            path: file.path,
            fileType: file.name.split('.').pop(),
            size: file.size,
            parseMode: file.injectionMode === 'inline' ? 'inline' : 'embeddings',
          })
        )
      }
    }

    return attachments
  }
}
