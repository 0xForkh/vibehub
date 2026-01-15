import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { logger as getLogger } from '../../shared/logger.js';

export interface SessionFileMetadata {
  sessionId: string;
  tmuxSessionName: string;
  name: string;
  sshHost?: string;
  sshPort?: number;
  createdAt: string;
}

/**
 * File-based storage for session metadata
 * Stores SSH connection parameters and session info in JSON files
 */
export class FileSessionMetadataStore {
  private logger = getLogger();
  private baseDir: string;

  constructor(baseDir?: string) {
    // Default to ~/.vibehub/sessions
    this.baseDir = baseDir || path.join(os.homedir(), '.vibehub', 'sessions');
  }

  /**
   * Ensure the sessions directory exists
   */
  private async ensureDir(): Promise<void> {
    try {
      await fs.mkdir(this.baseDir, { recursive: true });
    } catch (err) {
      this.logger.error('Failed to create sessions directory', { err, dir: this.baseDir });
      throw err;
    }
  }

  /**
   * Get file path for a session
   */
  private getFilePath(tmuxSessionName: string): string {
    return path.join(this.baseDir, `${tmuxSessionName}.json`);
  }

  /**
   * Write session metadata to file
   */
  async write(metadata: SessionFileMetadata): Promise<void> {
    await this.ensureDir();
    const filePath = this.getFilePath(metadata.tmuxSessionName);

    try {
      await fs.writeFile(filePath, JSON.stringify(metadata, null, 2), 'utf-8');
      this.logger.debug('Session metadata written to file', {
        tmuxSessionName: metadata.tmuxSessionName,
        filePath
      });
    } catch (err) {
      this.logger.error('Failed to write session metadata', { err, filePath });
      throw err;
    }
  }

  /**
   * Read session metadata from file
   */
  async read(tmuxSessionName: string): Promise<SessionFileMetadata | null> {
    const filePath = this.getFilePath(tmuxSessionName);

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const metadata = JSON.parse(content) as SessionFileMetadata;
      return metadata;
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        // File doesn't exist
        return null;
      }
      this.logger.error('Failed to read session metadata', { err, filePath });
      throw err;
    }
  }

  /**
   * Delete session metadata file
   */
  async delete(tmuxSessionName: string): Promise<void> {
    const filePath = this.getFilePath(tmuxSessionName);

    try {
      await fs.unlink(filePath);
      this.logger.debug('Session metadata file deleted', { tmuxSessionName, filePath });
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        // File doesn't exist, that's fine
        return;
      }
      this.logger.error('Failed to delete session metadata', { err, filePath });
      throw err;
    }
  }

  /**
   * List all session metadata files
   */
  async listAll(): Promise<SessionFileMetadata[]> {
    await this.ensureDir();

    try {
      const files = await fs.readdir(this.baseDir);
      const jsonFiles = files.filter(f => f.endsWith('.json'));

      const metadataList = await Promise.all(
        jsonFiles.map(async (file) => {
          const tmuxSessionName = file.replace('.json', '');
          return this.read(tmuxSessionName);
        })
      );

      return metadataList.filter((m): m is SessionFileMetadata => m !== null);
    } catch (err) {
      this.logger.error('Failed to list session metadata files', { err });
      return [];
    }
  }

  /**
   * Check if metadata file exists for a session
   */
  async exists(tmuxSessionName: string): Promise<boolean> {
    const filePath = this.getFilePath(tmuxSessionName);

    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}
