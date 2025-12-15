import { fs } from '@janhq/core'
import { homeDir, join } from '@tauri-apps/api/path'
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

export class TauriDatabaseService
  extends DefaultDatabaseService
  implements DatabaseService
{
  private rootPath?: string

  private async ensureRoot(): Promise<string> {
    if (this.rootPath) return this.rootPath
    const home = await homeDir()
    const janRoot = await join(home, 'Library', 'Application Support', 'Jan')
    const databaseRoot = await join(janRoot, DB_FOLDER_NAME)

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

  private async uniquePath(root: string, desiredName: string): Promise<{
    path: string
    relativePath: string
  }> {
    const splitIndex = desiredName.lastIndexOf('.')
    const base =
      splitIndex > 0 ? desiredName.substring(0, splitIndex) : desiredName
    const ext = splitIndex > 0 ? desiredName.substring(splitIndex) : ''

    let attempt = 0
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const suffix = attempt === 0 ? '' : ` (${attempt})`
      const candidate = `${base}${suffix}${ext}`
      const candidatePath = await join(root, candidate)
      const exists = await this.pathExists(candidatePath)
      if (!exists) {
        return { path: candidatePath, relativePath: candidate }
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
    ingestionMode: DatabaseIngestionMode
  ): Promise<RawIndexEntry[]> {
    const entries: RawIndexEntry[] = []
    const stat = await fs.fileStat(sourcePath)
    const name = sourcePath.split(/[\\/]/).pop() || sourcePath

    const targetPath = await join(destRoot, destRelative)

    if (stat?.is_directory) {
      await fs.mkdir(targetPath)
      const folderEntry: RawIndexEntry = {
        id: ulid(),
        name,
        path: targetPath,
        relativePath: destRelative,
        type: 'folder',
        size: 0,
        injectionMode,
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
          ingestionMode
        )
        entries.push(...childEntries)
      }
    } else {
      await fs.copyFile(sourcePath, targetPath)
      const fileEntry: RawIndexEntry = {
        id: ulid(),
        name,
        path: targetPath,
        relativePath: destRelative,
        type: 'file',
        size: stat?.size ?? 0,
        injectionMode,
      }
      entries.push(fileEntry)
    }

    return entries
  }

  async addPaths(
    paths: string[],
    ingestionMode: DatabaseIngestionMode
  ): Promise<DatabaseEntry[]> {
    if (!paths?.length) return this.list()
    const root = await this.ensureRoot()
    const index = await this.readIndex()
    const newEntries: RawIndexEntry[] = []

    for (const p of paths) {
      const sourceName = p.split(/[\\/]/).pop() || p
      const { relativePath } = await this.uniquePath(
        root,
        sourceName
      )
      const copied = await this.copyPath(p, root, relativePath, ingestionMode)
      newEntries.push(...copied)
    }

    const merged = [...index, ...newEntries]
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
