import { stat, createReadStream, readdir } from 'fs';
import { homedir } from 'os';
import { resolve, relative, dirname, basename } from 'path';
import { promisify } from 'util';
import { Router, type Router as ExpressRouter , Request, Response } from 'express';
import { logger as getLogger } from '../../shared/logger.js';
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
    const { name, command, cols, rows, sshHost, sshPort } = req.body;

    if (!name) {
      res.status(400).json({ error: 'Session name is required' });
      return;
    }

    // Default command is bash
    const cmd = command ? command.split(' ') : ['bash'];

    const session = await sessionStore.createSession(name, cmd, {
      cols: cols || 80,
      rows: rows || 24,
      command: command || 'bash',
      sshHost,
      sshPort,
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
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const cleanupWorktree = req.query.cleanupWorktree === 'true';

    // Get session to check for worktree before deleting
    const session = await sessionStore.getSession(id);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    // Handle worktree cleanup for Claude sessions
    if (cleanupWorktree && session.claudeMetadata?.worktreePath) {
      const {worktreePath} = session.claudeMetadata;
      const mainRepoPath = await getMainRepoPath(worktreePath);

      if (mainRepoPath) {
        const result = await removeWorktree(mainRepoPath, worktreePath, true);
        if (!result.success) {
          logger.warn('Failed to cleanup worktree', {
            sessionId: id,
            worktreePath,
            error: result.error,
          });
        } else {
          logger.info('Worktree cleaned up', { sessionId: id, worktreePath });
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

    const session = await sessionStore.createClaudeSession(
      name,
      {
        workingDir: finalWorkingDir,
        permissionMode: permissionMode || 'default',
        worktreePath,
      },
      {
        cols: cols || 80,
        rows: rows || 24,
      }
    );

    broadcastSessionsUpdate();
    res.status(201).json({ session });
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
