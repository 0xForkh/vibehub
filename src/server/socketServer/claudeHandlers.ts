import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { logger as getLogger } from '../../shared/logger.js';
import { ClaudeSessionManager } from '../claude/ClaudeSessionManager.js';
import { CommandExecutor } from '../claude/CommandExecutor.js';
import { FileSystemService } from '../claude/FileSystemService.js';
import { SessionStore } from '../sessions/SessionStore.js';
import { broadcastSessionsUpdate } from './socketRegistry.js';
import type { Server, Socket } from 'socket.io';

interface FileAttachment {
  name: string;
  type: string;
  size: number;
  data: string; // base64 encoded
}

const sessionStore = new SessionStore();
let claudeManager: ClaudeSessionManager;
// Track active command executors per session
const activeExecutors = new Map<string, CommandExecutor>();

export function registerClaudeHandlers(io: Server): void {
  const logger = getLogger();
  claudeManager = new ClaudeSessionManager(io);

  io.on('connection', (socket: Socket) => {
    logger.debug('Socket connected for Claude handlers');

    // Create new Claude session
    socket.on('claude:create', async ({ name, workingDir, permissionMode, cols, rows }) => {
      try {
        logger.debug('Creating Claude session via socket', { name, workingDir });

        // Create session in session store
        const session = await sessionStore.createClaudeSession(
          name,
          {
            workingDir,
            permissionMode: permissionMode || 'default',
          },
          {
            cols: cols || 80,
            rows: rows || 24,
          }
        );

        // Start Claude process
        await claudeManager.startSession(
          session.id,
          socket.id,
          workingDir,
          undefined, // No resume on new session
          permissionMode
        );

        socket.emit('claude:created', { session });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        logger.error('Failed to create Claude session', {
          error: errorMessage,
          name
        });
        socket.emit('claude:error', { message: `Failed to create Claude session: ${errorMessage}` });
      }
    });

    // Fork existing Claude session (creates a new session branched from the original)
    socket.on('claude:fork', async ({ sessionId, name }: { sessionId: string; name?: string }) => {
      try {
        logger.debug('Forking Claude session via socket', { sessionId, name });

        const originalSession = await sessionStore.getSession(sessionId);
        if (!originalSession || originalSession.type !== 'claude') {
          throw new Error('Session not found or not a Claude session');
        }

        if (!originalSession.claudeMetadata?.claudeSessionId) {
          throw new Error('Cannot fork: original session has no Claude session ID');
        }

        // Create forked session in session store
        const forkedSession = await sessionStore.forkClaudeSession(sessionId, name);
        if (!forkedSession) {
          throw new Error('Failed to fork session');
        }

        // Start Claude process with forkSession flag
        await claudeManager.startSession(
          forkedSession.id,
          socket.id,
          forkedSession.claudeMetadata?.workingDir || originalSession.claudeMetadata.workingDir,
          originalSession.claudeMetadata.claudeSessionId, // Resume from original
          forkedSession.claudeMetadata?.permissionMode,
          true // forkSession = true
        );

        logger.info('Claude session forked', {
          originalSessionId: sessionId,
          newSessionId: forkedSession.id,
        });

        // Broadcast to all clients so session list updates
        broadcastSessionsUpdate();

        socket.emit('claude:forked', {
          originalSessionId: sessionId,
          session: forkedSession
        });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        logger.error('Failed to fork Claude session', {
          error: errorMessage,
          sessionId
        });
        socket.emit('claude:error', { message: `Failed to fork Claude session: ${errorMessage}` });
      }
    });

    // Resume existing Claude session
    socket.on('claude:resume', async ({ sessionId, messageCount }: { sessionId: string; messageCount?: number }) => {
      try {
        logger.debug('Resuming Claude session via socket', { sessionId, clientMessageCount: messageCount });

        const session = await sessionStore.getSession(sessionId);
        if (!session || session.type !== 'claude') {
          throw new Error('Session not found or not a Claude session');
        }

        if (!session.claudeMetadata) {
          throw new Error('Claude metadata missing');
        }

        // Start Claude process (with or without resume flag depending on whether we have claudeSessionId)
        // If claudeSessionId is not set yet, this will be a fresh start
        // If it is set, Claude will resume the conversation
        // Pass messageCount so manager can skip history replay if client already has messages
        await claudeManager.startSession(
          session.id,
          socket.id,
          session.claudeMetadata.workingDir,
          session.claudeMetadata.claudeSessionId, // undefined if not yet initialized
          session.claudeMetadata.permissionMode,
          undefined, // forkSession
          messageCount // client's current message count
        );

        logger.debug('Claude session resumed', {
          sessionId,
          hasClaudeSessionId: !!session.claudeMetadata.claudeSessionId
        });

        socket.emit('claude:resumed', { session });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        logger.error('Failed to resume Claude session', {
          error: errorMessage,
          sessionId
        });
        socket.emit('claude:error', { message: `Failed to resume Claude session: ${errorMessage}` });
      }
    });

    // Send message to Claude
    socket.on('claude:message', async ({ sessionId, content, attachments }: {
      sessionId: string;
      content: string;
      attachments?: FileAttachment[];
    }) => {
      try {
        logger.info('claude:message received', {
          sessionId,
          contentLength: content?.length || 0,
          contentPreview: (content || '').slice(0, 50),
          attachmentCount: attachments?.length || 0,
          attachmentNames: attachments?.map(a => a.name) || [],
          attachmentSizes: attachments?.map(a => a.size) || [],
          hasAttachmentData: attachments?.map(a => !!a.data && a.data.length > 0) || [],
        });

        // Check if session is active in ClaudeManager
        // If not, queue the message - it will be processed when session starts
        if (!claudeManager.isSessionActive(sessionId)) {
          logger.info('Session not yet active, queuing message', { sessionId });
          await sessionStore.queueMessage(sessionId, content);
          return;
        }

        // Get session to find working directory
        const session = await sessionStore.getSession(sessionId);
        if (!session?.claudeMetadata?.workingDir) {
          throw new Error('Session working directory not found');
        }

        let finalContent = content || '';

        // Save attachments to disk if present
        if (attachments && attachments.length > 0) {
          const uploadsDir = join(session.claudeMetadata.workingDir, 'uploads');

          // Ensure uploads directory exists
          await mkdir(uploadsDir, { recursive: true });

          const savedFiles: { name: string; path: string; url: string; isImage: boolean; index: number }[] = [];

          for (const [i, attachment] of attachments.entries()) {
            // Generate unique filename with timestamp
            const timestamp = Date.now();
            const randomSuffix = Math.random().toString(36).slice(2, 8);
            const safeName = attachment.name.replace(/[^a-zA-Z0-9.-]/g, '_');
            const uniqueName = `${timestamp}-${randomSuffix}-${safeName}`;
            const filePath = join(uploadsDir, uniqueName);

            // Decode base64 and write to file
            const buffer = Buffer.from(attachment.data, 'base64');
            await writeFile(filePath, buffer);

            // Generate URL for serving the file
            const fileUrl = `/api/uploads/${sessionId}/${uniqueName}`;
            const isImage = attachment.type.startsWith('image/');

            savedFiles.push({ name: attachment.name, path: filePath, url: fileUrl, isImage, index: i });
            logger.debug('Saved uploaded file', {
              sessionId,
              originalName: attachment.name,
              savedPath: filePath,
              fileUrl,
              size: attachment.size,
            });
          }

          // Append file information to the prompt
          if (savedFiles.length > 0) {
            const fileList = savedFiles
              .map(f => `- ${f.name} (saved to ${f.path})`)
              .join('\n');
            finalContent = `${content}\n\n[Attached files]\n${fileList}`;

            // Emit file URLs back to client for preview
            socket.emit('claude:files_uploaded', {
              sessionId,
              files: savedFiles.map(f => ({
                name: f.name,
                url: f.url,
                isImage: f.isImage,
                index: f.index,
              })),
            });
          }
        }

        await claudeManager.sendMessage(sessionId, finalContent);

        // Update last accessed time
        await sessionStore.touchSession(sessionId);
      } catch (err) {
        logger.error('Failed to send message to Claude', { err, sessionId });
        socket.emit('claude:error', { message: 'Failed to send message' });
      }
    });

    // Send permission decision to Claude
    socket.on('claude:permission_response', async ({ sessionId, requestId, behavior, input, message, remember, global: isGlobal }) => {
      try {
        logger.info('Permission response received from client', {
          sessionId,
          requestId,
          behavior,
          remember: remember || false,
          global: isGlobal || false,
          hasMessage: !!message,
          message: message || undefined,
          socketId: socket.id,
        });

        // Build proper decision format based on behavior
        // requestId is now the toolUseId
        const decision = behavior === 'allow'
          ? { behavior: 'allow' as const, updatedInput: input || {}, remember: remember || false, global: isGlobal || false }
          : { behavior: 'deny' as const, message: message || 'Permission denied by user' };

        await claudeManager.sendPermissionDecision(sessionId, requestId, decision);
      } catch (err) {
        logger.error('Failed to send permission decision', { err, sessionId, requestId });
        socket.emit('claude:error', { message: 'Failed to send permission decision' });
      }
    });

    // Abort Claude operation
    socket.on('claude:abort', async ({ sessionId }) => {
      try {
        logger.debug('Aborting Claude session', { sessionId });
        claudeManager.abortSession(sessionId);
        socket.emit('claude:aborted', { sessionId });
      } catch (err) {
        logger.error('Failed to abort Claude session', { err, sessionId });
        socket.emit('claude:error', { message: 'Failed to abort session' });
      }
    });

    // Get allowed tools for a session
    socket.on('claude:get_allowed_tools', ({ sessionId }) => {
      try {
        const tools = claudeManager.getAllowedTools(sessionId);
        socket.emit('claude:allowed_tools', { sessionId, tools });
      } catch (err) {
        logger.error('Failed to get allowed tools', { err, sessionId });
        socket.emit('claude:error', { message: 'Failed to get allowed tools' });
      }
    });

    // Update allowed tools for a session
    socket.on('claude:set_allowed_tools', ({ sessionId, tools }) => {
      try {
        logger.info('Updating allowed tools', { sessionId, toolCount: tools.length });
        claudeManager.setAllowedTools(sessionId, tools);
        socket.emit('claude:allowed_tools', { sessionId, tools });
      } catch (err) {
        logger.error('Failed to set allowed tools', { err, sessionId });
        socket.emit('claude:error', { message: 'Failed to set allowed tools' });
      }
    });

    // Get global allowed tools
    socket.on('claude:get_global_allowed_tools', () => {
      try {
        const tools = claudeManager.getGlobalAllowedTools();
        socket.emit('claude:global_allowed_tools', { tools });
      } catch (err) {
        logger.error('Failed to get global allowed tools', { err });
        socket.emit('claude:error', { message: 'Failed to get global allowed tools' });
      }
    });

    // Update global allowed tools
    socket.on('claude:set_global_allowed_tools', async ({ tools }) => {
      try {
        logger.info('Updating global allowed tools', { toolCount: tools.length });
        await claudeManager.setGlobalAllowedTools(tools);
        socket.emit('claude:global_allowed_tools', { tools });
      } catch (err) {
        logger.error('Failed to set global allowed tools', { err });
        socket.emit('claude:error', { message: 'Failed to set global allowed tools' });
      }
    });

    // Update permission mode
    socket.on('claude:update_permission_mode', async ({ sessionId, permissionMode }) => {
      try {
        logger.debug('Updating permission mode', { sessionId, permissionMode });

        const session = await sessionStore.getSession(sessionId);
        if (!session || !session.claudeMetadata) {
          throw new Error('Session not found');
        }

        // Update in session store (for persistence)
        await sessionStore.updateSession(sessionId, {
          claudeMetadata: {
            ...session.claudeMetadata,
            permissionMode,
          },
        });

        // Update on active SDK session (for immediate effect)
        await claudeManager.setPermissionMode(sessionId, permissionMode);

        socket.emit('claude:permission_mode_updated', { sessionId, permissionMode });
      } catch (err) {
        logger.error('Failed to update permission mode', { err, sessionId });
        socket.emit('claude:error', { message: 'Failed to update permission mode' });
      }
    });

    // Execute a command in the session's working directory
    socket.on('claude:exec', async ({ sessionId, command }: { sessionId: string; command: string }) => {
      try {
        logger.debug('Executing command', { sessionId, command: command.slice(0, 50) });

        const session = await sessionStore.getSession(sessionId);
        if (!session || session.type !== 'claude') {
          throw new Error('Session not found or not a Claude session');
        }

        if (!session.claudeMetadata?.workingDir) {
          throw new Error('Session working directory not found');
        }

        // Abort any existing command for this session
        const existingExecutor = activeExecutors.get(sessionId);
        if (existingExecutor?.isRunning()) {
          existingExecutor.abort();
        }

        const executor = new CommandExecutor({
          workingDir: session.claudeMetadata.workingDir,
          command,
          onOutput: (data, stream) => {
            socket.emit('claude:exec_output', { sessionId, data, stream });
          },
          onComplete: (exitCode, signal) => {
            socket.emit('claude:exec_complete', { sessionId, exitCode, signal });
            activeExecutors.delete(sessionId);
          },
          onError: (error) => {
            socket.emit('claude:exec_error', { sessionId, error: error.message });
            activeExecutors.delete(sessionId);
          },
        });

        activeExecutors.set(sessionId, executor);
        executor.execute();
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        logger.error('Failed to execute command', { err, sessionId });
        socket.emit('claude:exec_error', { sessionId, error: errorMessage });
      }
    });

    // Abort a running command
    socket.on('claude:exec_abort', async ({ sessionId }: { sessionId: string }) => {
      try {
        const executor = activeExecutors.get(sessionId);
        if (executor?.isRunning()) {
          executor.abort();
          activeExecutors.delete(sessionId);
          socket.emit('claude:exec_complete', { sessionId, exitCode: -1, signal: 'SIGTERM' });
        }
      } catch (err) {
        logger.error('Failed to abort command', { err, sessionId });
      }
    });

    // List directory contents
    socket.on('claude:fs_list', async ({ sessionId, path, showHidden }: { sessionId: string; path: string; showHidden?: boolean }) => {
      try {
        const session = await sessionStore.getSession(sessionId);
        if (!session || session.type !== 'claude') {
          throw new Error('Session not found or not a Claude session');
        }

        if (!session.claudeMetadata?.workingDir) {
          throw new Error('Session working directory not found');
        }

        const fsService = new FileSystemService(session.claudeMetadata.workingDir);
        const entries = await fsService.listDirectory(path, showHidden);

        socket.emit('claude:fs_list_result', { sessionId, path, entries });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        logger.error('Failed to list directory', { err, sessionId, path });
        socket.emit('claude:fs_list_result', { sessionId, path, entries: [], error: errorMessage });
      }
    });

    // Read file contents
    socket.on('claude:fs_read', async ({ sessionId, path }: { sessionId: string; path: string }) => {
      try {
        const session = await sessionStore.getSession(sessionId);
        if (!session || session.type !== 'claude') {
          throw new Error('Session not found or not a Claude session');
        }

        if (!session.claudeMetadata?.workingDir) {
          throw new Error('Session working directory not found');
        }

        const fsService = new FileSystemService(session.claudeMetadata.workingDir);
        const result = await fsService.readFile(path);
        const language = FileSystemService.getLanguageFromPath(path);

        socket.emit('claude:fs_read_result', {
          sessionId,
          path,
          content: result.content,
          size: result.size,
          binary: result.binary,
          language,
        });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        logger.error('Failed to read file', { err, sessionId, path });
        socket.emit('claude:fs_read_result', { sessionId, path, error: errorMessage });
      }
    });

    // Handle socket disconnect
    socket.on('disconnect', () => {
      logger.debug('Socket disconnected', { socketId: socket.id });
      // Note: We don't abort Claude sessions on disconnect - they continue running
      // This allows users to reconnect and resume the conversation
    });
  });
}

/**
 * Shutdown all Claude sessions (for server shutdown)
 */
export function shutdownClaudeManager(): void {
  if (claudeManager) {
    claudeManager.shutdown();
  }
}
