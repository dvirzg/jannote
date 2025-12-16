import type { DatabaseEntry, DatabaseService } from './types'
import type { Attachment } from '@/types/attachment'

export class DefaultDatabaseService implements DatabaseService {
  async root(): Promise<string> {
    throw new Error('Database service not available on this platform')
  }

  async list(): Promise<DatabaseEntry[]> {
    return []
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async addPaths(_paths: string[], _parentFolderId?: string): Promise<DatabaseEntry[]> {
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
  async updateCategories(_id: string, _categories: string[]): Promise<DatabaseEntry[]> {
    throw new Error('Database service not available on this platform')
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async searchContent(_ids: string[], _query: string): Promise<Record<string, string[]>> {
    throw new Error('Database service not available on this platform')
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async searchExact(_ids: string[], _query: string): Promise<string[]> {
    throw new Error('Database service not available on this platform')
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async searchVector(_ids: string[], _query: string): Promise<string[]> {
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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async openFile(_id: string): Promise<void> {
    throw new Error('Database service not available on this platform')
  }
}
