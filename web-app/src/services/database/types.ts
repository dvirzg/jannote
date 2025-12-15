import { Attachment } from '@/types/attachment'

export type DatabaseIngestionMode = 'inline' | 'embeddings'

export type DatabaseEntry = {
  id: string
  name: string
  path: string
  relativePath: string
  type: 'file' | 'folder'
  size?: number
  injectionMode: DatabaseIngestionMode
  children?: DatabaseEntry[]
}

export interface DatabaseService {
  root(): Promise<string>
  list(): Promise<DatabaseEntry[]>
  addPaths(paths: string[], ingestionMode: DatabaseIngestionMode): Promise<DatabaseEntry[]>
  addPathsWithModes(pathsWithModes: Array<{ path: string; mode: DatabaseIngestionMode }>): Promise<DatabaseEntry[]>
  deleteById(id: string): Promise<void>
  getIndex(): Promise<DatabaseEntry[]>
  toAttachments(ids: string[]): Promise<Attachment[]>
}
