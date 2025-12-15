import { Attachment } from '@/types/attachment'

export type DatabaseIngestionMode = 'inline' | 'embeddings'

export type DatabaseEntry = {
  id: string
  name: string
  displayName?: string
  path: string
  relativePath: string
  type: 'file' | 'folder'
  size?: number
  injectionMode: DatabaseIngestionMode
  categories?: string[]
  children?: DatabaseEntry[]
}

export interface DatabaseService {
  root(): Promise<string>
  list(): Promise<DatabaseEntry[]>
  addPaths(paths: string[], ingestionMode: DatabaseIngestionMode, parentFolderId?: string): Promise<DatabaseEntry[]>
  addPathsWithModes(pathsWithModes: Array<{ path: string; mode: DatabaseIngestionMode }>, parentFolderId?: string): Promise<DatabaseEntry[]>
  createFolder(folderName: string, parentFolderId?: string): Promise<DatabaseEntry[]>
  updateReferenceName(id: string, displayName: string): Promise<DatabaseEntry[]>
  updateCategories(id: string, categories: string[]): Promise<DatabaseEntry[]>
  searchContent(
    ids: string[],
    query: string
  ): Promise<Record<string, string[]>>
  deleteById(id: string): Promise<void>
  getIndex(): Promise<DatabaseEntry[]>
  toAttachments(ids: string[]): Promise<Attachment[]>
}
