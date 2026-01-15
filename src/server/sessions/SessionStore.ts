import { randomUUID } from 'crypto';
import { logger as getLogger } from '../../shared/logger.js';
import { getStorageBackend } from '../database/redis.js';
import { FileSessionMetadataStore } from './FileSessionMetadataStore.js';
import { TmuxManager } from './TmuxManager.js';
import type { SessionFileMetadata } from './FileSessionMetadataStore.js';
import type { Session, SessionMetadata, ClaudeMetadata, GlobalClaudeSettings } from './types.js';
import type { StorageBackend } from '../database/StorageBackend.js';

export class SessionStore {
  private storage: StorageBackend | null = null;
  private tmuxManager = new TmuxManager();
  private fileStore = new FileSessionMetadataStore();
  private logger = getLogger();

  private async getStorage(): Promise<StorageBackend> {
    if (!this.storage) {
      this.storage = await getStorageBackend();
    }
    return this.storage;
  }

  /**
   * Create a new session
   */
  async createSession(
    name: string,
    command: string[],
    metadata: SessionMetadata,
  ): Promise<Session> {
    const sessionId = randomUUID();
    const tmuxSessionName = `vibehub_${sessionId.slice(0, 8)}`;

    this.logger.debug('Creating session', { sessionId, name, tmuxSessionName });

    // Create tmux session
    await this.tmuxManager.createSession(
      tmuxSessionName,
      command,
      metadata.cols,
      metadata.rows,
    );

    const session: Session = {
      id: sessionId,
      name,
      type: 'terminal',
      tmuxSessionName,
      createdAt: new Date().toISOString(),
      lastAccessedAt: new Date().toISOString(),
      metadata,
      status: 'active',
    };

    // Store persistent metadata in file
    const fileMetadata: SessionFileMetadata = {
      sessionId,
      tmuxSessionName,
      name,
      sshHost: metadata.sshHost,
      sshPort: metadata.sshPort,
      createdAt: session.createdAt,
    };
    await this.fileStore.write(fileMetadata);

    // Store in storage backend (stringify metadata)
    const storage = await this.getStorage();
    const dataToStore: Record<string, string> = {
      id: session.id,
      name: session.name,
      type: session.type,
      tmuxSessionName: session.tmuxSessionName,
      createdAt: session.createdAt,
      lastAccessedAt: session.lastAccessedAt,
      status: session.status,
      metadata: JSON.stringify(session.metadata),
    };
    await storage.hset(`sessions:${sessionId}`, dataToStore);
    await storage.sadd('sessions:all', sessionId);
    await storage.set(`sessions:tmux:${tmuxSessionName}`, sessionId);

    this.logger.info('Session created', { sessionId, name });
    return session;
  }

  /**
   * Create a new Claude session
   */
  async createClaudeSession(
    name: string,
    claudeMetadata: ClaudeMetadata,
    metadata: SessionMetadata,
  ): Promise<Session> {
    const sessionId = randomUUID();

    this.logger.debug('Creating Claude session', { sessionId, name, workingDir: claudeMetadata.workingDir });

    const session: Session = {
      id: sessionId,
      name,
      type: 'claude',
      tmuxSessionName: '', // Not used for Claude sessions
      createdAt: new Date().toISOString(),
      lastAccessedAt: new Date().toISOString(),
      metadata,
      claudeMetadata,
      status: 'active',
    };

    // Store persistent metadata in file
    const fileMetadata: SessionFileMetadata = {
      sessionId,
      tmuxSessionName: `claude_${sessionId.slice(0, 8)}`, // Unique identifier for file storage
      name,
      createdAt: session.createdAt,
    };
    await this.fileStore.write(fileMetadata);

    // Store in storage backend (stringify metadata and claudeMetadata)
    const storage = await this.getStorage();
    const dataToStore: Record<string, string> = {
      id: session.id,
      name: session.name,
      type: session.type,
      tmuxSessionName: session.tmuxSessionName,
      createdAt: session.createdAt,
      lastAccessedAt: session.lastAccessedAt,
      status: session.status,
      metadata: JSON.stringify(session.metadata),
    };
    if (session.claudeMetadata) {
      dataToStore.claudeMetadata = JSON.stringify(session.claudeMetadata);
    }
    await storage.hset(`sessions:${sessionId}`, dataToStore);
    await storage.sadd('sessions:all', sessionId);

    this.logger.info('Claude session created', { sessionId, name });
    return session;
  }

  /**
   * Get session by ID
   */
  async getSession(sessionId: string): Promise<Session | null> {
    const storage = await this.getStorage();
    const data = await storage.hgetall(`sessions:${sessionId}`);
    if (!data || !data.id) {
      return null;
    }

    return {
      ...data,
      metadata: JSON.parse(data.metadata || '{}'),
      claudeMetadata: data.claudeMetadata ? JSON.parse(data.claudeMetadata) : undefined,
    } as Session;
  }

  /**
   * List all sessions
   */
  async listSessions(): Promise<Session[]> {
    const storage = await this.getStorage();
    const sessionIds = await storage.smembers('sessions:all');
    const sessions = await Promise.all(
      sessionIds.map((id) => this.getSession(id)),
    );
    return sessions.filter((s): s is Session => s !== null);
  }

  /**
   * Update session (e.g., rename or update last accessed time)
   */
  async updateSession(
    sessionId: string,
    updates: Partial<Session>,
  ): Promise<Session | null> {
    const session = await this.getSession(sessionId);
    if (!session) {
      return null;
    }

    const updated = { ...session, ...updates };

    // If renaming, update tmux session name (only for terminal sessions)
    if (updates.name && updates.name !== session.name) {
      if (session.type === 'terminal' && session.tmuxSessionName) {
        await this.tmuxManager.renameSession(session.tmuxSessionName, updated.tmuxSessionName);
      }

      // Update file metadata with new name
      try {
        const fileKey = session.type === 'terminal' ? session.tmuxSessionName : `claude_${session.id.slice(0, 8)}`;
        const fileMetadata: SessionFileMetadata = {
          sessionId: updated.id,
          tmuxSessionName: fileKey,
          name: updated.name,
          sshHost: updated.metadata.sshHost,
          sshPort: updated.metadata.sshPort,
          createdAt: updated.createdAt,
        };
        await this.fileStore.write(fileMetadata);
        this.logger.debug('Updated file metadata after rename', { sessionId, newName: updated.name });
      } catch (err) {
        this.logger.warn('Failed to update file metadata after rename', { err, sessionId });
      }
    }

    const storage = await this.getStorage();
    const dataToStore: Record<string, string> = {
      id: updated.id,
      name: updated.name,
      type: updated.type,
      tmuxSessionName: updated.tmuxSessionName,
      createdAt: updated.createdAt,
      lastAccessedAt: updated.lastAccessedAt,
      status: updated.status,
      metadata: JSON.stringify(updated.metadata),
    };
    if (updated.claudeMetadata) {
      dataToStore.claudeMetadata = JSON.stringify(updated.claudeMetadata);
    }
    await storage.hset(`sessions:${sessionId}`, dataToStore);

    // Create a summary of updates that doesn't include full message history
    const updatesSummary: Record<string, unknown> = { ...updates };
    if (updates.claudeMetadata?.messages) {
      updatesSummary.claudeMetadata = {
        ...updates.claudeMetadata,
        messages: `[${updates.claudeMetadata.messages.length} messages]`,
      };
    }
    this.logger.info('Session updated', { sessionId, updates: updatesSummary });

    return updated;
  }

  /**
   * Delete session
   */
  async deleteSession(sessionId: string): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session) {
      return;
    }

    // Kill tmux session (for terminal sessions or Claude sessions with terminal)
    if (session.type === 'terminal' && session.tmuxSessionName) {
      try {
        await this.tmuxManager.killSession(session.tmuxSessionName);
      } catch (err) {
        this.logger.warn('Failed to kill tmux session during delete', { err, sessionId });
      }
    }

    // Kill terminal tmux session for Claude sessions (if it was created)
    if (session.type === 'claude' && session.claudeMetadata?.terminalTmuxSession) {
      try {
        await this.tmuxManager.killSession(session.claudeMetadata.terminalTmuxSession);
        this.logger.info('Killed terminal tmux session for Claude session', {
          sessionId,
          tmuxSession: session.claudeMetadata.terminalTmuxSession,
        });
      } catch (err) {
        this.logger.warn('Failed to kill terminal tmux session during delete', { err, sessionId });
      }
    }

    // Remove metadata file
    try {
      const fileKey = session.type === 'terminal' ? session.tmuxSessionName : `claude_${sessionId.slice(0, 8)}`;
      await this.fileStore.delete(fileKey);
    } catch (err) {
      this.logger.warn('Failed to delete session metadata file', { err, sessionId });
    }

    // Remove from storage backend
    const storage = await this.getStorage();
    await storage.del(`sessions:${sessionId}`);
    await storage.srem('sessions:all', sessionId);
    await storage.del(`sessions:tmux:${session.tmuxSessionName}`);

    this.logger.info('Session deleted', { sessionId });
  }

  /**
   * Update last accessed time
   */
  async touchSession(sessionId: string): Promise<void> {
    const storage = await this.getStorage();
    await storage.hset(
      `sessions:${sessionId}`,
      { lastAccessedAt: new Date().toISOString() },
    );
  }

  /**
   * Get session preview (last N lines)
   */
  async getSessionPreview(sessionId: string, lines = 10): Promise<string> {
    const session = await this.getSession(sessionId);
    if (!session) {
      return '';
    }

    // Only terminal sessions have preview capability
    if (session.type !== 'terminal') {
      return '';
    }

    return this.tmuxManager.capturePane(session.tmuxSessionName, lines);
  }

  /**
   * Sync sessions with tmux (detect externally created/killed sessions)
   */
  async syncWithTmux(): Promise<void> {
    this.logger.debug('Syncing sessions with tmux');

    const tmuxSessions = await this.tmuxManager.listSessions();
    const storedSessions = await this.listSessions();

    // Find tmux sessions that aren't in our store (support both old wetty_ and new vibehub_ prefixes)
    const vibehubTmuxSessions = tmuxSessions.filter((s) => s.name.startsWith('vibehub_') || s.name.startsWith('wetty_'));

    const storage = await this.getStorage();
    for (const tmuxSession of vibehubTmuxSessions) {
      const sessionId = await storage.get(`sessions:tmux:${tmuxSession.name}`);
      if (!sessionId) {
        // Check if we have a metadata file for this session
        const fileMetadata = await this.fileStore.read(tmuxSession.name);

        if (fileMetadata) {
          // Session has metadata file - recreate it in storage
          this.logger.info('Recovering orphaned session from file', {
            tmuxSessionName: tmuxSession.name,
            sessionId: fileMetadata.sessionId,
            name: fileMetadata.name
          });

          const recoveredSession: Session = {
            id: fileMetadata.sessionId,
            name: fileMetadata.name,
            type: 'terminal',
            tmuxSessionName: fileMetadata.tmuxSessionName,
            createdAt: fileMetadata.createdAt,
            lastAccessedAt: new Date().toISOString(),
            metadata: {
              cols: 80, // Default terminal size
              rows: 24,
              sshHost: fileMetadata.sshHost,
              sshPort: fileMetadata.sshPort,
            },
            status: 'detached',
          };

          // Add to storage
          const dataToStore: Record<string, string> = {
            id: recoveredSession.id,
            name: recoveredSession.name,
            type: recoveredSession.type,
            tmuxSessionName: recoveredSession.tmuxSessionName,
            createdAt: recoveredSession.createdAt,
            lastAccessedAt: recoveredSession.lastAccessedAt,
            status: recoveredSession.status,
            metadata: JSON.stringify(recoveredSession.metadata),
          };
          await storage.hset(`sessions:${recoveredSession.id}`, dataToStore);
          await storage.sadd('sessions:all', recoveredSession.id);
          await storage.set(`sessions:tmux:${tmuxSession.name}`, recoveredSession.id);

          this.logger.info('Session recovered successfully', { sessionId: recoveredSession.id });
        } else {
          // No metadata file - truly orphaned, kill it
          this.logger.warn('Found orphaned tmux session without metadata, killing it', {
            tmuxSessionName: tmuxSession.name
          });
          try {
            await this.tmuxManager.killSession(tmuxSession.name);
          } catch (err) {
            this.logger.error('Failed to kill orphaned tmux session', {
              err,
              tmuxSessionName: tmuxSession.name
            });
          }
        }
      }
    }

    // Find stored sessions whose tmux session is gone (only for terminal sessions)
    for (const session of storedSessions) {
      if (session.type === 'terminal') {
        const exists = await this.tmuxManager.sessionExists(session.tmuxSessionName);
        if (!exists) {
          this.logger.warn('Session tmux session missing', { sessionId: session.id });
          await this.deleteSession(session.id);
        }
      }
    }
  }

  /**
   * Fork an existing Claude session (creates a new session with copied metadata)
   * The new session will use the SDK's forkSession option to branch from the original
   */
  async forkClaudeSession(sessionId: string, customName?: string): Promise<Session | null> {
    const originalSession = await this.getSession(sessionId);
    if (!originalSession || originalSession.type !== 'claude') {
      this.logger.warn('Cannot fork: session not found or not a Claude session', { sessionId });
      return null;
    }

    // Create new session with copied metadata
    const newSessionId = randomUUID();
    const now = new Date().toISOString();

    const forkedSession: Session = {
      id: newSessionId,
      name: customName || `${originalSession.name} (fork)`,
      type: 'claude',
      tmuxSessionName: '',
      createdAt: now,
      lastAccessedAt: now,
      metadata: { ...originalSession.metadata },
      claudeMetadata: {
        workingDir: originalSession.claudeMetadata?.workingDir || process.cwd(),
        permissionMode: originalSession.claudeMetadata?.permissionMode,
        // Don't copy claudeSessionId - will be set after SDK creates new session
        // Don't copy messages - forked session starts fresh from SDK's perspective
        // Context usage will be tracked fresh
      },
      status: 'active',
    };

    // Store persistent metadata in file
    const fileMetadata: SessionFileMetadata = {
      sessionId: newSessionId,
      tmuxSessionName: `claude_${newSessionId.slice(0, 8)}`,
      name: forkedSession.name,
      createdAt: forkedSession.createdAt,
    };
    await this.fileStore.write(fileMetadata);

    // Store in storage backend
    const storage = await this.getStorage();
    const dataToStore: Record<string, string> = {
      id: forkedSession.id,
      name: forkedSession.name,
      type: forkedSession.type,
      tmuxSessionName: forkedSession.tmuxSessionName,
      createdAt: forkedSession.createdAt,
      lastAccessedAt: forkedSession.lastAccessedAt,
      status: forkedSession.status,
      metadata: JSON.stringify(forkedSession.metadata),
    };
    if (forkedSession.claudeMetadata) {
      dataToStore.claudeMetadata = JSON.stringify(forkedSession.claudeMetadata);
    }
    await storage.hset(`sessions:${newSessionId}`, dataToStore);
    await storage.sadd('sessions:all', newSessionId);

    this.logger.info('Claude session forked', {
      originalSessionId: sessionId,
      newSessionId,
      name: forkedSession.name,
    });

    return forkedSession;
  }

  /**
   * Get global Claude settings
   */
  async getGlobalClaudeSettings(): Promise<GlobalClaudeSettings | null> {
    const storage = await this.getStorage();
    return storage.getGlobalClaudeSettings();
  }

  /**
   * Update global Claude settings
   */
  async setGlobalClaudeSettings(settings: GlobalClaudeSettings): Promise<void> {
    const storage = await this.getStorage();
    await storage.setGlobalClaudeSettings(settings);
  }

  /**
   * Queue a message for a session (used by send_to_session tool)
   */
  async queueMessage(sessionId: string, message: string): Promise<boolean> {
    const session = await this.getSession(sessionId);
    if (!session || session.type !== 'claude') {
      return false;
    }

    const pendingMessages = session.claudeMetadata?.pendingMessages || [];
    pendingMessages.push(message);

    await this.updateSession(sessionId, {
      claudeMetadata: {
        ...session.claudeMetadata!,
        pendingMessages,
      },
    });

    this.logger.info('Message queued for session', { sessionId, queueLength: pendingMessages.length });
    return true;
  }

  /**
   * Get and clear pending messages for a session
   */
  async getPendingMessages(sessionId: string): Promise<string[]> {
    const session = await this.getSession(sessionId);
    if (!session || session.type !== 'claude') {
      return [];
    }

    const messages = session.claudeMetadata?.pendingMessages || [];
    if (messages.length === 0) {
      return [];
    }

    // Clear the queue
    await this.updateSession(sessionId, {
      claudeMetadata: {
        ...session.claudeMetadata!,
        pendingMessages: [],
      },
    });

    this.logger.info('Pending messages retrieved', { sessionId, count: messages.length });
    return messages;
  }

  /**
   * Clean up orphaned Claude sessions on server startup
   * Claude sessions don't persist across server restarts (they're child processes)
   * However, we keep them in the DB so users can resume the conversation using --resume
   */
  async cleanupClaudeSessions(): Promise<void> {
    this.logger.debug('Checking Claude sessions on startup');

    const storedSessions = await this.listSessions();

    for (const session of storedSessions) {
      if (session.type === 'claude') {
        // Claude processes are dead after restart, but conversation history persists on disk
        // Mark as detached so users know they need to resume
        this.logger.info('Marking Claude session as detached', {
          sessionId: session.id,
          name: session.name
        });
        await this.updateSession(session.id, {
          status: 'detached' as const,
        });
      }
    }
  }
}
