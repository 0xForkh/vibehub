import { readdir, readFile, stat } from 'fs/promises';
import { join, resolve, relative } from 'path';
import { logger as getLogger } from '../../shared/logger.js';

export interface FileEntry {
  name: string;
  type: 'file' | 'directory';
  size: number;
  modified: string;
}

const MAX_FILE_SIZE = 1024 * 1024; // 1MB
const MAX_ENTRIES = 1000;

/**
 * Service for file system operations within a constrained base path
 */
export class FileSystemService {
  private logger = getLogger();
  private basePath: string;

  constructor(basePath: string) {
    this.basePath = resolve(basePath);
  }

  /**
   * Resolve and validate a path is within the base directory
   * Prevents path traversal attacks
   */
  private resolveSafePath(relativePath: string): string {
    const resolved = resolve(this.basePath, relativePath);

    // Ensure the resolved path is within basePath
    const rel = relative(this.basePath, resolved);
    if (rel.startsWith('..') || resolve(this.basePath, rel) !== resolved) {
      throw new Error('Path traversal not allowed');
    }

    return resolved;
  }

  /**
   * List contents of a directory
   */
  async listDirectory(relativePath = '.', showHidden = false): Promise<FileEntry[]> {
    const fullPath = this.resolveSafePath(relativePath);

    this.logger.debug('Listing directory', { basePath: this.basePath, relativePath, fullPath, showHidden });

    try {
      const entries = await readdir(fullPath, { withFileTypes: true });
      const results: FileEntry[] = [];

      const filteredEntries = entries
        .slice(0, MAX_ENTRIES)
        .filter(entry => {
          if (entry.name === 'node_modules') return false;
          if (!showHidden && entry.name.startsWith('.')) return false;
          return true;
        });

      for (const entry of filteredEntries) {
        try {
          const entryPath = join(fullPath, entry.name);
          const stats = await stat(entryPath);

          results.push({
            name: entry.name,
            type: entry.isDirectory() ? 'directory' : 'file',
            size: stats.size,
            modified: stats.mtime.toISOString(),
          });
        } catch {
          // Skip entries we can't stat (permission issues, etc.)
        }
      }

      // Sort: directories first, then alphabetically
      results.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === 'directory' ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });

      return results;
    } catch (error) {
      this.logger.error('Failed to list directory', { relativePath, error });
      throw error;
    }
  }

  /**
   * Read file contents
   */
  async readFile(relativePath: string): Promise<{ content: string; size: number; binary: boolean }> {
    const fullPath = this.resolveSafePath(relativePath);

    this.logger.debug('Reading file', { basePath: this.basePath, relativePath, fullPath });

    try {
      const stats = await stat(fullPath);

      if (stats.isDirectory()) {
        throw new Error('Cannot read a directory');
      }

      if (stats.size > MAX_FILE_SIZE) {
        throw new Error(`File too large (${Math.round(stats.size / 1024)}KB > ${MAX_FILE_SIZE / 1024}KB limit)`);
      }

      const buffer = await readFile(fullPath);

      // Check if file is binary
      const isBinary = this.isBinaryBuffer(buffer);

      if (isBinary) {
        return {
          content: '[Binary file]',
          size: stats.size,
          binary: true,
        };
      }

      return {
        content: buffer.toString('utf-8'),
        size: stats.size,
        binary: false,
      };
    } catch (error) {
      this.logger.error('Failed to read file', { relativePath, error });
      throw error;
    }
  }

  /**
   * Check if a buffer contains binary data
   */
  // eslint-disable-next-line class-methods-use-this
  private isBinaryBuffer(buffer: Buffer): boolean {
    // Check first 8KB for null bytes or high ratio of non-printable chars
    const sample = buffer.slice(0, 8192);
    let nonPrintable = 0;

    for (const byte of sample) {
      if (byte === 0) return true; // Null byte = definitely binary
      if (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13) {
        nonPrintable += 1;
      }
    }

    // If more than 10% non-printable, consider binary
    return nonPrintable / sample.length > 0.1;
  }

  /**
   * Search for files by name pattern (recursive)
   */
  async searchFiles(query: string, limit = 20): Promise<{ name: string; path: string }[]> {
    const results: { name: string; path: string }[] = [];
    const queryLower = query.toLowerCase();

    const search = async (dirPath: string, relativePath: string): Promise<void> => {
      if (results.length >= limit) return;

      try {
        const entries = await readdir(dirPath, { withFileTypes: true });

        for (const entry of entries) {
          if (results.length >= limit) return;

          // Skip node_modules and hidden directories
          if (entry.name === 'node_modules' || entry.name.startsWith('.')) {
            // eslint-disable-next-line no-continue
            continue;
          }

          const entryRelativePath = relativePath ? `${relativePath}/${entry.name}` : entry.name;

          if (entry.isDirectory()) {
            await search(join(dirPath, entry.name), entryRelativePath);
          } else if (entry.name.toLowerCase().includes(queryLower)) {
            results.push({
              name: entry.name,
              path: entryRelativePath,
            });
          }
        }
      } catch {
        // Skip directories we can't read
      }
    };

    await search(this.basePath, '');
    return results;
  }

  /**
   * Get file extension for syntax highlighting
   */
  static getLanguageFromPath(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase() || '';
    const langMap: Record<string, string> = {
      ts: 'typescript',
      tsx: 'typescript',
      js: 'javascript',
      jsx: 'javascript',
      json: 'json',
      md: 'markdown',
      py: 'python',
      rb: 'ruby',
      go: 'go',
      rs: 'rust',
      java: 'java',
      c: 'c',
      cpp: 'cpp',
      h: 'c',
      hpp: 'cpp',
      css: 'css',
      scss: 'scss',
      html: 'html',
      xml: 'xml',
      yaml: 'yaml',
      yml: 'yaml',
      sh: 'bash',
      bash: 'bash',
      zsh: 'bash',
      sql: 'sql',
      dockerfile: 'dockerfile',
    };
    return langMap[ext] || 'plaintext';
  }
}
