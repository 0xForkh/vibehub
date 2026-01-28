import { stat, createReadStream, readdir } from 'fs';
import { homedir } from 'os';
import { resolve, relative, dirname, basename } from 'path';
import { promisify } from 'util';
import { Router, type Router as ExpressRouter , Request, Response } from 'express';
import { logger as getLogger } from '../../shared/logger.js';
import { getPreviewManager } from '../preview/index.js';
import { SessionStore } from '../sessions/SessionStore.js';
import { broadcastSessionsUpdate } from '../socketServer/socketRegistry.js';
import { createWorktree, removeWorktree, getMainRepoPath, getCurrentBranch } from '../utils/gitWorktree.js';
import type { Session } from '../sessions/types.js';

const statAsync = promisify(stat);
const readdirAsync = promisify(readdir);

const router: ExpressRouter = Router();
const sessionStore = new SessionStore();
const logger = getLogger();

/**
 * Enrich Claude sessions with current git branch
 */
async function enrichSessionsWithBranch(sessions: Session[]): Promise<Session[]> {
  return Promise.all(
    sessions.map(async (session) => {
      if (session.type === 'claude' && session.claudeMetadata?.workingDir) {
        const branch = await getCurrentBranch(session.claudeMetadata.workingDir);
        if (branch) {
          return {
            ...session,
            claudeMetadata: {
              ...session.claudeMetadata,
              currentBranch: branch,
            },
          };
        }
      }
      return session;
    })
  );
}

/**
 * GET /api/sessions - List all sessions
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const sessions = await sessionStore.listSessions();
    const enrichedSessions = await enrichSessionsWithBranch(sessions);
    res.json({ sessions: enrichedSessions });
  } catch (err) {
    logger.error('Failed to list sessions', { err });
    res.status(500).json({ error: 'Failed to list sessions' });
  }
});

/**
 * POST /api/sessions - Create a new session
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, command, cols, rows } = req.body;

    if (!name) {
      res.status(400).json({ error: 'Session name is required' });
      return;
    }

    // Default command is bash
    const cmd = command ? command.split(' ') : ['bash'];

    const session = await sessionStore.createSession(name, cmd, {
      cols: cols || 80,
      rows: rows || 24,
    });

    broadcastSessionsUpdate();
    res.status(201).json({ session });
  } catch (err) {
    logger.error('Failed to create session', { err });
    res.status(500).json({ error: 'Failed to create session' });
  }
});

/**
 * GET /api/sessions/directories - List directories for autocomplete
 * Query params:
 *   - path: partial path to autocomplete (default: ~)
 * NOTE: Must be defined before /:id route to avoid matching "directories" as an id
 */
router.get('/directories', async (req: Request, res: Response) => {
  try {
    const inputPath = (req.query.path as string) || '~';

    // Expand ~ to home directory
    const expandedPath = inputPath.startsWith('~')
      ? inputPath.replace(/^~/, homedir())
      : inputPath;

    // Determine the directory to list and the prefix to filter by
    let dirToList: string;
    let prefix = '';

    try {
      const stats = await statAsync(expandedPath);
      if (stats.isDirectory()) {
        dirToList = expandedPath;
      } else {
        dirToList = dirname(expandedPath);
        prefix = basename(expandedPath);
      }
    } catch {
      // Path doesn't exist, list parent directory and filter by basename
      dirToList = dirname(expandedPath);
      prefix = basename(expandedPath);
    }

    // Read directory contents
    const entries = await readdirAsync(dirToList, { withFileTypes: true });

    // Filter to directories only, apply prefix filter, exclude hidden unless typing hidden
    const directories = entries
      .filter(entry => {
        if (!entry.isDirectory()) return false;
        if (prefix && !entry.name.toLowerCase().startsWith(prefix.toLowerCase())) return false;
        if (!prefix && entry.name.startsWith('.')) return false; // Hide dotfiles unless explicitly typing
        if (entry.name === 'node_modules') return false;
        return true;
      })
      .map(entry => {
        // Return full path, re-collapse home dir to ~
        const fullPath = resolve(dirToList, entry.name);
        return fullPath.startsWith(homedir())
          ? fullPath.replace(homedir(), '~')
          : fullPath;
      })
      .sort()
      .slice(0, 20); // Limit results

    res.json({ directories });
  } catch (err) {
    logger.error('Failed to list directories', { err });
    res.json({ directories: [] }); // Return empty on error, don't fail
  }
});

// =============================================================================
// Preview Management Routes
// IMPORTANT: These must be defined BEFORE /:id routes to avoid "preview" being
// matched as a session ID
// =============================================================================

/**
 * GET /api/sessions/preview/:sessionId/status - Get preview status
 */
router.get('/preview/:sessionId/status', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const session = await sessionStore.getSession(sessionId);

    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    if (!session.claudeMetadata?.previewProjectName) {
      res.status(400).json({ error: 'Session has no preview environment' });
      return;
    }

    const previewManager = getPreviewManager();

    // Restore state if needed (e.g., after server restart)
    if (!previewManager.getPreviewState(sessionId)) {
      previewManager.restorePreviewState(sessionId, {
        projectName: session.claudeMetadata.previewProjectName,
        previewUrl: session.claudeMetadata.previewUrl || '',
        port: session.claudeMetadata.previewPort || 0,
        composeFile: '',
        caddyRouteId: session.claudeMetadata.previewCaddyRouteId,
        startedAt: session.claudeMetadata.previewStartedAt || '',
      });
    }

    const status = await previewManager.getStatus(sessionId);
    res.json({
      ...status,
      previewUrl: session.claudeMetadata.previewUrl,
    });
  } catch (err) {
    logger.error('Failed to get preview status', { err });
    res.status(500).json({ error: 'Failed to get preview status' });
  }
});

/**
 * GET /api/sessions/preview/:sessionId/logs - Get logs for preview environment
 * Query params:
 *   - service: Optional service name to filter logs
 *   - lines: Number of lines (default: 100)
 */
router.get('/preview/:sessionId/logs', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const service = req.query.service as string | undefined;
    const lines = parseInt(req.query.lines as string, 10) || 100;

    const session = await sessionStore.getSession(sessionId);

    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    if (!session.claudeMetadata?.previewProjectName) {
      res.status(400).json({ error: 'Session has no preview environment' });
      return;
    }

    const previewManager = getPreviewManager();

    // Restore state if needed
    if (!previewManager.getPreviewState(sessionId)) {
      previewManager.restorePreviewState(sessionId, {
        projectName: session.claudeMetadata.previewProjectName,
        previewUrl: session.claudeMetadata.previewUrl || '',
        port: session.claudeMetadata.previewPort || 0,
        composeFile: '',
        caddyRouteId: session.claudeMetadata.previewCaddyRouteId,
        startedAt: session.claudeMetadata.previewStartedAt || '',
      });
    }

    const logs = await previewManager.getLogs(sessionId, service, lines);
    res.json({ logs });
  } catch (err) {
    logger.error('Failed to get preview logs', { err });
    res.status(500).json({ error: 'Failed to get preview logs' });
  }
});

/**
 * POST /api/sessions/preview/:sessionId/restart - Restart the entire preview environment
 */
router.post('/preview/:sessionId/restart', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    const session = await sessionStore.getSession(sessionId);

    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    if (!session.claudeMetadata?.previewProjectName || !session.claudeMetadata?.worktreePath) {
      res.status(400).json({ error: 'Session has no preview environment' });
      return;
    }

    const previewManager = getPreviewManager();

    // Get the current branch from git (don't rely on session metadata which may be stale)
    const branch = await getCurrentBranch(session.claudeMetadata.worktreePath) || 'main';

    // Restart the preview
    const previewState = await previewManager.restartPreview(
      sessionId,
      session.claudeMetadata.worktreePath,
      branch,
    );

    // Update session metadata
    await sessionStore.updateSession(sessionId, {
      claudeMetadata: {
        ...session.claudeMetadata,
        previewUrl: previewState.previewUrl,
        previewProjectName: previewState.projectName,
        previewPort: previewState.port,
        previewCaddyRouteId: previewState.caddyRouteId,
        previewStartedAt: previewState.startedAt,
      },
    });

    res.json({
      success: true,
      previewUrl: previewState.previewUrl,
    });
  } catch (err) {
    logger.error('Failed to restart preview', { err });
    res.status(500).json({ error: 'Failed to restart preview' });
  }
});

/**
 * POST /api/sessions/preview/:sessionId/retry - Retry starting preview (works even after failure)
 * This is different from restart - it can start a preview that failed initially
 */
router.post('/preview/:sessionId/retry', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    const session = await sessionStore.getSession(sessionId);

    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    if (!session.claudeMetadata?.worktreePath) {
      res.status(400).json({ error: 'Session has no worktree path - preview requires a worktree' });
      return;
    }

    const previewManager = getPreviewManager();

    // Check if preview config exists
    const hasPreviewConfig = await previewManager.hasPreviewSupport(
      dirname(dirname(session.claudeMetadata.worktreePath))
    );

    if (!hasPreviewConfig) {
      res.status(400).json({
        error: 'No preview config found. Run the "Initialize Preview" skill to create .vibehub/docker-compose.yml',
      });
      return;
    }

    // Update status to starting
    await sessionStore.updateSession(sessionId, {
      claudeMetadata: {
        ...session.claudeMetadata,
        previewStatus: 'starting',
        previewError: undefined,
      },
    });
    broadcastSessionsUpdate();

    // Return immediately
    res.json({ success: true, status: 'starting' });

    // Start preview in background
    setImmediate(async () => {
      try {
        // Stop any existing preview first
        if (session.claudeMetadata?.previewProjectName) {
          previewManager.restorePreviewState(sessionId, {
            projectName: session.claudeMetadata.previewProjectName,
            previewUrl: session.claudeMetadata.previewUrl || '',
            port: session.claudeMetadata.previewPort || 0,
            composeFile: '',
            caddyRouteId: session.claudeMetadata.previewCaddyRouteId,
            startedAt: session.claudeMetadata.previewStartedAt || '',
          });
          await previewManager.stopPreview(sessionId);
        }

        // Get the current branch from git (don't rely on session metadata which may be stale)
        const branch = await getCurrentBranch(session.claudeMetadata!.worktreePath!) || 'main';

        const previewState = await previewManager.startPreview(
          session.claudeMetadata!.worktreePath!,
          branch,
          sessionId,
        );

        // Update session with success
        await sessionStore.updateSession(sessionId, {
          claudeMetadata: {
            ...session.claudeMetadata,
            workingDir: session.claudeMetadata!.workingDir!, // Ensure workingDir is set
            previewStatus: 'running',
            previewError: undefined,
            previewUrl: previewState.previewUrl,
            previewProjectName: previewState.projectName,
            previewPort: previewState.port,
            previewCaddyRouteId: previewState.caddyRouteId,
            previewStartedAt: previewState.startedAt,
          },
        });

        logger.info('Preview environment started via retry', {
          sessionId,
          previewUrl: previewState.previewUrl,
        });

        broadcastSessionsUpdate();
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        logger.error('Failed to start preview via retry', { error, sessionId });

        // Update session with error
        try {
          await sessionStore.updateSession(sessionId, {
            claudeMetadata: {
              ...session.claudeMetadata,
              workingDir: session.claudeMetadata!.workingDir!, // Ensure workingDir is set
              previewStatus: 'error',
              previewError: error,
            },
          });
          broadcastSessionsUpdate();
        } catch (updateErr) {
          logger.error('Failed to update session with preview error', { updateErr });
        }
      }
    });
  } catch (err) {
    logger.error('Failed to retry preview', { err });
    res.status(500).json({ error: 'Failed to retry preview' });
  }
});

// =============================================================================
// Session CRUD Routes (/:id patterns must come AFTER specific routes)
// =============================================================================

/**
 * GET /api/sessions/:id - Get a specific session
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const session = await sessionStore.getSession(id);

    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    res.json({ session });
  } catch (err) {
    logger.error('Failed to get session', { err });
    res.status(500).json({ error: 'Failed to get session' });
  }
});

/**
 * PUT /api/sessions/:id - Update a session (e.g., rename)
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    if (!name) {
      res.status(400).json({ error: 'Session name is required' });
      return;
    }

    const session = await sessionStore.updateSession(id, { name });

    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    broadcastSessionsUpdate();
    res.json({ session });
  } catch (err) {
    logger.error('Failed to update session', { err });
    res.status(500).json({ error: 'Failed to update session' });
  }
});

/**
 * DELETE /api/sessions/:id - Delete a session
 * Query params:
 *   - cleanupWorktree: 'true' to also remove the git worktree (if session has one)
 *   - deleteBranch: 'true' to also delete the git branch (only if cleanupWorktree is true)
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const cleanupWorktree = req.query.cleanupWorktree === 'true';
    const deleteBranch = req.query.deleteBranch === 'true';

    // Get session to check for worktree before deleting
    const session = await sessionStore.getSession(id);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    // Cleanup preview environment if session has one
    if (session.claudeMetadata?.previewProjectName) {
      try {
        const previewManager = getPreviewManager();

        // Restore preview state from session metadata for cleanup
        previewManager.restorePreviewState(id, {
          projectName: session.claudeMetadata.previewProjectName,
          previewUrl: session.claudeMetadata.previewUrl || '',
          port: session.claudeMetadata.previewPort || 0,
          composeFile: '',
          caddyRouteId: session.claudeMetadata.previewCaddyRouteId,
          startedAt: session.claudeMetadata.previewStartedAt || '',
        });

        await previewManager.stopPreview(id);
        logger.info('Preview environment cleaned up', { sessionId: id });
      } catch (err) {
        logger.warn('Failed to cleanup preview environment', {
          sessionId: id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Handle worktree cleanup for Claude sessions
    if (cleanupWorktree && session.claudeMetadata?.worktreePath) {
      const {worktreePath} = session.claudeMetadata;
      const mainRepoPath = await getMainRepoPath(worktreePath);

      if (mainRepoPath) {
        // Pass deleteBranch to removeWorktree (4th parameter)
        const result = await removeWorktree(mainRepoPath, worktreePath, true, deleteBranch);
        if (!result.success) {
          logger.warn('Failed to cleanup worktree', {
            sessionId: id,
            worktreePath,
            error: result.error,
          });
        } else {
          logger.info('Worktree cleaned up', { sessionId: id, worktreePath, deleteBranch });
        }
      }
    }

    await sessionStore.deleteSession(id);
    broadcastSessionsUpdate();
    res.json({ success: true });
  } catch (err) {
    logger.error('Failed to delete session', { err });
    res.status(500).json({ error: 'Failed to delete session' });
  }
});

/**
 * GET /api/sessions/:id/preview - Get session preview (last N lines)
 */
router.get('/:id/preview', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const lines = parseInt(req.query.lines as string, 10) || 10;

    const preview = await sessionStore.getSessionPreview(id, lines);
    res.json({ preview });
  } catch (err) {
    logger.error('Failed to get session preview', { err });
    res.status(500).json({ error: 'Failed to get session preview' });
  }
});

/**
 * POST /api/sessions/claude - Create a new Claude session
 * Optionally creates a git worktree for isolated development
 */
router.post('/claude', async (req: Request, res: Response) => {
  try {
    const { name, workingDir, permissionMode, cols, rows, worktree } = req.body;

    if (!name) {
      res.status(400).json({ error: 'Session name is required' });
      return;
    }

    if (!workingDir) {
      res.status(400).json({ error: 'Working directory is required' });
      return;
    }

    // Expand ~ to home directory
    const expandedWorkingDir = workingDir.startsWith('~')
      ? workingDir.replace(/^~/, homedir())
      : workingDir;

    let finalWorkingDir = expandedWorkingDir;
    let worktreePath: string | undefined;

    // Create worktree if requested
    if (worktree?.branch) {
      const worktreeResult = await createWorktree({
        baseDir: expandedWorkingDir,
        branch: worktree.branch,
        path: worktree.path,
      });

      if (!worktreeResult.success) {
        res.status(400).json({
          error: `Failed to create worktree: ${worktreeResult.error}`,
        });
        return;
      }

      finalWorkingDir = worktreeResult.worktreePath;
      worktreePath = worktreeResult.worktreePath;
      logger.info('Worktree created for new session', {
        branch: worktree.branch,
        path: worktreePath,
      });
    }

    // Check if preview config exists before creating session
    let hasPreviewConfig = false;
    if (worktree?.branch) {
      const previewManager = getPreviewManager();
      hasPreviewConfig = await previewManager.hasPreviewSupport(expandedWorkingDir);
    }

    const session = await sessionStore.createClaudeSession(
      name,
      {
        workingDir: finalWorkingDir,
        permissionMode: permissionMode || 'default',
        worktreePath,
        // Set initial preview status if preview config exists
        ...(hasPreviewConfig && { previewStatus: 'starting' as const }),
      },
      {
        cols: cols || 80,
        rows: rows || 24,
      }
    );

    // Return session immediately and broadcast
    broadcastSessionsUpdate();
    res.status(201).json({ session });

    // Start preview environment in background if worktree has preview config
    if (worktree?.branch && hasPreviewConfig) {
      // Use setImmediate to ensure response is sent before starting preview
      setImmediate(async () => {
        try {
          const previewManager = getPreviewManager();

          logger.info('Starting preview environment in background', {
            sessionId: session.id,
          });

          const previewState = await previewManager.startPreview(
            finalWorkingDir,
            worktree.branch,
            session.id,
          );

          // Update session with preview metadata
          await sessionStore.updateSession(session.id, {
            claudeMetadata: {
              ...session.claudeMetadata,
              workingDir: finalWorkingDir,
              previewStatus: 'running',
              previewUrl: previewState.previewUrl,
              previewProjectName: previewState.projectName,
              previewPort: previewState.port,
              previewCaddyRouteId: previewState.caddyRouteId,
              previewStartedAt: previewState.startedAt,
            },
          });

          logger.info('Preview environment started', {
            sessionId: session.id,
            previewUrl: previewState.previewUrl,
          });

          // Broadcast update so frontend sees the preview is ready
          broadcastSessionsUpdate();
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          logger.error('Failed to start preview environment', { error, sessionId: session.id });

          // Update session with error status
          try {
            await sessionStore.updateSession(session.id, {
              claudeMetadata: {
                ...session.claudeMetadata,
                workingDir: finalWorkingDir,
                previewStatus: 'error',
                previewError: error,
              },
            });
            broadcastSessionsUpdate();
          } catch (updateErr) {
            logger.error('Failed to update session with preview error', { updateErr });
          }
        }
      });
    }
  } catch (err) {
    logger.error('Failed to create Claude session', { err });
    res.status(500).json({ error: 'Failed to create Claude session' });
  }
});

/**
 * POST /api/sessions/sync - Sync sessions with tmux
 * Cleans up orphaned sessions and removes dead session references
 */
router.post('/sync', async (_req: Request, res: Response) => {
  try {
    await sessionStore.syncWithTmux();
    const sessions = await sessionStore.listSessions();
    res.json({ success: true, sessions });
  } catch (err) {
    logger.error('Failed to sync sessions', { err });
    res.status(500).json({ error: 'Failed to sync sessions' });
  }
});

/**
 * GET /api/files/:sessionId/* - Serve a file from session's working directory
 * Used for image previews in file browser
 */
router.get('/files/:sessionId/*', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const filePath = req.params[0]; // Everything after /files/:sessionId/

    if (!filePath) {
      res.status(400).json({ error: 'File path is required' });
      return;
    }

    const session = await sessionStore.getSession(sessionId);
    if (!session || session.type !== 'claude') {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    if (!session.claudeMetadata?.workingDir) {
      res.status(400).json({ error: 'Session has no working directory' });
      return;
    }

    // Resolve the full path and ensure it's within the working directory
    const basePath = resolve(session.claudeMetadata.workingDir);
    const fullPath = resolve(basePath, filePath);
    const rel = relative(basePath, fullPath);

    if (rel.startsWith('..') || resolve(basePath, rel) !== fullPath) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // Check file exists
    const stats = await statAsync(fullPath);
    if (!stats.isFile()) {
      res.status(400).json({ error: 'Not a file' });
      return;
    }

    // Set content type based on extension
    const ext = filePath.split('.').pop()?.toLowerCase() || '';
    const mimeTypes: Record<string, string> = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      webp: 'image/webp',
      svg: 'image/svg+xml',
      ico: 'image/x-icon',
      bmp: 'image/bmp',
    };

    const contentType = mimeTypes[ext] || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', stats.size);

    // Stream the file
    createReadStream(fullPath).pipe(res);
  } catch (err) {
    logger.error('Failed to serve file', { err });
    res.status(500).json({ error: 'Failed to serve file' });
  }
});

export { router as sessionsRouter };
