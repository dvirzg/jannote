import { Attachment } from '@/types/attachment'

export type EmbeddingStatus = 'pending' | 'embedding' | 'embedded' | 'error'

export type DatabaseEntry = {
  id: string
  name: string
  displayName?: string
  path: string
  relativePath: string
  type: 'file' | 'folder'
  size?: number
  categories?: string[]
  embeddingStatus?: EmbeddingStatus
  children?: DatabaseEntry[]
}

export interface DatabaseService {
  root(): Promise<string>
  list(): Promise<DatabaseEntry[]>
  addPaths(paths: string[], parentFolderId?: string): Promise<DatabaseEntry[]>
  createFolder(folderName: string, parentFolderId?: string): Promise<DatabaseEntry[]>
  updateReferenceName(id: string, displayName: string): Promise<DatabaseEntry[]>
  updateCategories(id: string, categories: string[]): Promise<DatabaseEntry[]>
  searchContent(
    ids: string[],
    query: string
  ): Promise<Record<string, string[]>>
  searchExact(ids: string[], query: string): Promise<string[]>
  searchVector(ids: string[], query: string): Promise<string[]>
  deleteById(id: string): Promise<void>
  getIndex(): Promise<DatabaseEntry[]>
  toAttachments(ids: string[]): Promise<Attachment[]>
  openFile(id: string): Promise<void>
}
