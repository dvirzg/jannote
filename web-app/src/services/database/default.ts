import type { DatabaseEntry, DatabaseService, DatabaseIngestionMode } from './types'
import type { Attachment } from '@/types/attachment'

export class DefaultDatabaseService implements DatabaseService {
  async root(): Promise<string> {
    throw new Error('Database service not available on this platform')
  }

  async list(): Promise<DatabaseEntry[]> {
    return []
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async addPaths(_paths: string[], _ingestionMode: DatabaseIngestionMode, _parentFolderId?: string): Promise<DatabaseEntry[]> {
    throw new Error('Database service not available on this platform')
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async addPathsWithModes(_pathsWithModes: Array<{ path: string; mode: DatabaseIngestionMode }>, _parentFolderId?: string): Promise<DatabaseEntry[]> {
    throw new Error('Database service not available on this platform')
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async createFolder(_folderName: string, _parentFolderId?: string): Promise<DatabaseEntry[]> {
    throw new Error('Database service not available on this platform')
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async updateReferenceName(_id: string, _displayName: string): Promise<DatabaseEntry[]> {
    throw new Error('Database service not available on this platform')
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async deleteById(_id: string): Promise<void> {
    throw new Error('Database service not available on this platform')
  }

  async getIndex(): Promise<DatabaseEntry[]> {
    return []
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async toAttachments(_ids: string[]): Promise<Attachment[]> {
    return []
  }
}
