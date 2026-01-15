import { exec } from 'child_process';
import { promisify } from 'util';
import { Router, type Router as ExpressRouter, Request, Response } from 'express';
import { logger as getLogger } from '../../shared/logger.js';
import { isGitRepo } from '../utils/gitWorktree.js';

const execAsync = promisify(exec);
const router: ExpressRouter = Router();
const logger = getLogger();

export interface GitFileChange {
  path: string;
  status: 'modified' | 'added' | 'deleted' | 'renamed' | 'copied' | 'untracked';
  staged: boolean;
}

export interface GitStatus {
  branch: string;
  staged: GitFileChange[];
  unstaged: GitFileChange[];
  isClean: boolean;
}

export interface GitBranch {
  name: string;
  isCurrent: boolean;
  isRemote: boolean;
}

export interface GitCommit {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  date: string;
  relativeDate: string;
}

/**
 * Parse git status porcelain output to file changes
 */
function parseGitStatus(output: string): { staged: GitFileChange[]; unstaged: GitFileChange[] } {
  const staged: GitFileChange[] = [];
  const unstaged: GitFileChange[] = [];

  const statusMap: Record<string, GitFileChange['status']> = {
    M: 'modified',
    A: 'added',
    D: 'deleted',
    R: 'renamed',
    C: 'copied',
    '?': 'untracked',
  };

  const lines = output.split('\n').filter(line => line.trim());

  for (const line of lines) {
    const indexStatus = line[0];
    const workTreeStatus = line[1];
    const filePath = line.slice(3).trim();

    // Handle renamed files (format: "R  old -> new")
    const actualPath = filePath.includes(' -> ') ? filePath.split(' -> ')[1] : filePath;

    // Staged changes (index status)
    if (indexStatus && indexStatus !== ' ' && indexStatus !== '?') {
      staged.push({
        path: actualPath,
        status: statusMap[indexStatus] || 'modified',
        staged: true,
      });
    }

    // Unstaged changes (work tree status)
    if (workTreeStatus && workTreeStatus !== ' ') {
      unstaged.push({
        path: actualPath,
        status: statusMap[workTreeStatus] || 'modified',
        staged: false,
      });
    }

    // Untracked files
    if (indexStatus === '?') {
      unstaged.push({
        path: actualPath,
        status: 'untracked',
        staged: false,
      });
    }
  }

  return { staged, unstaged };
}

/**
 * GET /api/git/status - Get git status for a directory
 * Query params:
 *   - path: directory path (required)
 */
router.get('/status', async (req: Request, res: Response) => {
  try {
    const dirPath = req.query.path as string;

    if (!dirPath) {
      res.status(400).json({ error: 'Path is required' });
      return;
    }

    if (!await isGitRepo(dirPath)) {
      res.status(400).json({ error: 'Not a git repository' });
      return;
    }

    // Get current branch
    const { stdout: branchOutput } = await execAsync('git rev-parse --abbrev-ref HEAD', { cwd: dirPath });
    const branch = branchOutput.trim();

    // Get status in porcelain format
    const { stdout: statusOutput } = await execAsync('git status --porcelain', { cwd: dirPath });
    const { staged, unstaged } = parseGitStatus(statusOutput);

    const status: GitStatus = {
      branch,
      staged,
      unstaged,
      isClean: staged.length === 0 && unstaged.length === 0,
    };

    res.json(status);
  } catch (err) {
    logger.error('Failed to get git status', { err });
    res.status(500).json({ error: 'Failed to get git status' });
  }
});

/**
 * GET /api/git/branches - List all branches
 * Query params:
 *   - path: directory path (required)
 */
router.get('/branches', async (req: Request, res: Response) => {
  try {
    const dirPath = req.query.path as string;

    if (!dirPath) {
      res.status(400).json({ error: 'Path is required' });
      return;
    }

    if (!await isGitRepo(dirPath)) {
      res.status(400).json({ error: 'Not a git repository' });
      return;
    }

    // Get current branch
    const { stdout: currentBranchOutput } = await execAsync('git rev-parse --abbrev-ref HEAD', { cwd: dirPath });
    const currentBranch = currentBranchOutput.trim();

    // Get all branches (local and remote)
    const { stdout: branchOutput } = await execAsync('git branch -a --format="%(refname:short)|%(refname)"', { cwd: dirPath });

    const branches: GitBranch[] = [];
    const seen = new Set<string>();

    const branchLines = branchOutput.split('\n').filter(line => line.trim());

    for (const line of branchLines) {
      const [shortName, fullRef] = line.split('|');
      const isRemote = fullRef?.includes('refs/remotes/') || false;

      // Skip HEAD pointer for remotes
      if (shortName.includes('HEAD')) {
        // eslint-disable-next-line no-continue
        continue;
      }

      // Deduplicate (remote tracking branches)
      const displayName = isRemote ? shortName.replace(/^origin\//, '') : shortName;
      if (seen.has(displayName) && isRemote) {
        // eslint-disable-next-line no-continue
        continue;
      }
      seen.add(displayName);

      branches.push({
        name: shortName,
        isCurrent: shortName === currentBranch,
        isRemote,
      });
    }

    // Sort: current first, then local, then remote
    branches.sort((a, b) => {
      if (a.isCurrent) return -1;
      if (b.isCurrent) return 1;
      if (a.isRemote !== b.isRemote) return a.isRemote ? 1 : -1;
      return a.name.localeCompare(b.name);
    });

    res.json({ branches, currentBranch });
  } catch (err) {
    logger.error('Failed to list branches', { err });
    res.status(500).json({ error: 'Failed to list branches' });
  }
});

/**
 * GET /api/git/log - Get commit history
 * Query params:
 *   - path: directory path (required)
 *   - limit: number of commits (default: 10)
 */
router.get('/log', async (req: Request, res: Response) => {
  try {
    const dirPath = req.query.path as string;
    const limit = parseInt(req.query.limit as string, 10) || 10;

    if (!dirPath) {
      res.status(400).json({ error: 'Path is required' });
      return;
    }

    if (!await isGitRepo(dirPath)) {
      res.status(400).json({ error: 'Not a git repository' });
      return;
    }

    // Get commit log with specific format
    // Format: hash|shortHash|subject|author|date|relativeDate
    const format = '%H|%h|%s|%an|%ci|%cr';
    const { stdout } = await execAsync(
      `git log -n ${limit} --format="${format}"`,
      { cwd: dirPath }
    );

    const commits: GitCommit[] = [];

    const logLines = stdout.split('\n').filter(line => line.trim());

    for (const line of logLines) {
      const [hash, shortHash, message, author, date, relativeDate] = line.split('|');
      commits.push({
        hash,
        shortHash,
        message,
        author,
        date,
        relativeDate,
      });
    }

    res.json({ commits });
  } catch (err) {
    logger.error('Failed to get git log', { err });
    res.status(500).json({ error: 'Failed to get git log' });
  }
});

export { router as gitRouter };
