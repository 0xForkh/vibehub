import { exec } from 'child_process';
import { stat } from 'fs/promises';
import { resolve, join } from 'path';
import { promisify } from 'util';
import { logger as getLogger } from '../../shared/logger.js';

const execAsync = promisify(exec);
const logger = getLogger();

export interface WorktreeInfo {
  path: string;
  branch: string;
  head: string;
}

export interface CreateWorktreeOptions {
  baseDir: string;
  branch: string;
  path?: string; // Relative path from baseDir, defaults to .worktrees/<branch>
  createBranch?: boolean; // Create branch if it doesn't exist (default: true)
  installDeps?: boolean; // Run package manager install after creation (default: true)
}

export interface CreateWorktreeResult {
  success: boolean;
  worktreePath: string;
  branch: string;
  error?: string;
}

/**
 * Check if a directory is a git repository
 */
export async function isGitRepo(dir: string): Promise<boolean> {
  try {
    await execAsync('git rev-parse --git-dir', { cwd: dir });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a branch exists locally
 */
export async function branchExists(dir: string, branch: string): Promise<boolean> {
  try {
    await execAsync(`git show-ref --verify --quiet refs/heads/${branch}`, { cwd: dir });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a path is already a worktree
 */
export async function isWorktree(path: string): Promise<boolean> {
  try {
    const stats = await stat(path);
    if (!stats.isDirectory()) return false;

    // Check if it has a .git file (worktrees have .git file, not directory)
    const gitPath = join(path, '.git');
    const gitStats = await stat(gitPath);
    return gitStats.isFile(); // Worktrees have .git as a file pointing to main repo
  } catch {
    return false;
  }
}

/**
 * Normalize branch name for use as directory name
 */
function branchToPathName(branch: string): string {
  // Replace / with - for feature/auth -> feature-auth
  return branch.replace(/\//g, '-');
}

/**
 * Detect package manager and install dependencies
 */
async function installDependencies(dir: string): Promise<{ success: boolean; error?: string }> {
  try {
    // Check for lockfiles to determine package manager
    const checks = [
      { file: 'pnpm-lock.yaml', pm: 'pnpm' },
      { file: 'yarn.lock', pm: 'yarn' },
      { file: 'package-lock.json', pm: 'npm' },
      { file: 'package.json', pm: 'npm' }, // Fallback to npm
    ];

    for (const { file, pm } of checks) {
      let fileExists = false;
      try {
        await stat(join(dir, file));
        fileExists = true;
      } catch {
        // File doesn't exist, try next
      }

      if (fileExists) {
        // Install dependencies
        logger.info('Installing dependencies', { dir, packageManager: pm });
        await execAsync(`${pm} install`, { cwd: dir, timeout: 300000 }); // 5 min timeout
        logger.info('Dependencies installed successfully', { dir });

        // Rebuild native modules (needed for node-pty, etc.)
        logger.info('Rebuilding native modules', { dir, packageManager: pm });
        await execAsync(`${pm} rebuild`, { cwd: dir, timeout: 300000 });
        logger.info('Native modules rebuilt successfully', { dir });

        return { success: true };
      }
    }

    // No package.json found, nothing to install
    logger.debug('No package.json found, skipping dependency installation', { dir });
    return { success: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.error('Failed to install dependencies', { error, dir });
    return { success: false, error };
  }
}

/**
 * Create a git worktree
 */
export async function createWorktree(options: CreateWorktreeOptions): Promise<CreateWorktreeResult> {
  const { baseDir, branch, createBranch = true, installDeps = true } = options;

  // Default path: .worktrees/<normalized-branch-name>
  const relativePath = options.path || `.worktrees/${branchToPathName(branch)}`;
  const worktreePath = resolve(baseDir, relativePath);

  logger.info('Creating worktree', { baseDir, branch, worktreePath });

  // Check if baseDir is a git repo
  if (!await isGitRepo(baseDir)) {
    return {
      success: false,
      worktreePath,
      branch,
      error: `${baseDir} is not a git repository`,
    };
  }

  // Check if path already exists
  try {
    await stat(worktreePath);
    return {
      success: false,
      worktreePath,
      branch,
      error: `Path ${worktreePath} already exists`,
    };
  } catch {
    // Path doesn't exist, good to proceed
  }

  // Check if branch exists
  const branchExistsLocally = await branchExists(baseDir, branch);

  try {
    let cmd: string;
    if (branchExistsLocally) {
      // Use existing branch
      cmd = `git worktree add "${worktreePath}" "${branch}"`;
    } else if (createBranch) {
      // Create new branch
      cmd = `git worktree add -b "${branch}" "${worktreePath}"`;
    } else {
      return {
        success: false,
        worktreePath,
        branch,
        error: `Branch ${branch} does not exist`,
      };
    }

    logger.debug('Executing git worktree command', { cmd });
    await execAsync(cmd, { cwd: baseDir });

    logger.info('Worktree created successfully', { worktreePath, branch });

    // Install dependencies if requested
    if (installDeps) {
      const depResult = await installDependencies(worktreePath);
      if (!depResult.success) {
        logger.warn('Worktree created but dependency installation failed', {
          worktreePath,
          error: depResult.error,
        });
        // Don't fail the whole operation, just warn
      }
    }

    return {
      success: true,
      worktreePath,
      branch,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.error('Failed to create worktree', { error, baseDir, branch, worktreePath });
    return {
      success: false,
      worktreePath,
      branch,
      error,
    };
  }
}

/**
 * Remove a git worktree and optionally delete the branch
 */
export async function removeWorktree(
  baseDir: string,
  worktreePath: string,
  force = false,
  deleteBranchAfter = true
): Promise<{ success: boolean; error?: string }> {
  logger.info('Removing worktree', { baseDir, worktreePath, force, deleteBranchAfter });

  // Get the branch name before removing the worktree
  let branchName: string | null = null;
  if (deleteBranchAfter) {
    branchName = await getCurrentBranch(worktreePath);
  }

  try {
    const cmd = force
      ? `git worktree remove --force "${worktreePath}"`
      : `git worktree remove "${worktreePath}"`;

    await execAsync(cmd, { cwd: baseDir });
    logger.info('Worktree removed successfully', { worktreePath });

    // Delete the branch if requested and we have a branch name
    if (deleteBranchAfter && branchName) {
      const defaultBranch = await getDefaultBranch(baseDir);
      // Don't delete the default branch
      if (branchName !== defaultBranch) {
        const deleteResult = await deleteBranch(baseDir, branchName, force);
        if (!deleteResult.success) {
          logger.warn('Worktree removed but failed to delete branch', {
            branch: branchName,
            error: deleteResult.error,
          });
        } else {
          logger.info('Branch deleted', { branch: branchName });
        }
      }
    }

    return { success: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.error('Failed to remove worktree', { error, worktreePath });
    return { success: false, error };
  }
}

/**
 * List all worktrees in a repository
 */
export async function listWorktrees(baseDir: string): Promise<WorktreeInfo[]> {
  try {
    const { stdout } = await execAsync('git worktree list --porcelain', { cwd: baseDir });
    const worktrees: WorktreeInfo[] = [];

    let current: Partial<WorktreeInfo> = {};
    for (const line of stdout.split('\n')) {
      if (line.startsWith('worktree ')) {
        current.path = line.slice(9);
      } else if (line.startsWith('HEAD ')) {
        current.head = line.slice(5);
      } else if (line.startsWith('branch ')) {
        current.branch = line.slice(7).replace('refs/heads/', '');
      } else if (line === '') {
        if (current.path && current.head) {
          worktrees.push({
            path: current.path,
            branch: current.branch || 'detached',
            head: current.head,
          });
        }
        current = {};
      }
    }

    return worktrees;
  } catch (err) {
    logger.error('Failed to list worktrees', { error: err, baseDir });
    return [];
  }
}

/**
 * Get the main repository path from a worktree path
 */
export async function getMainRepoPath(worktreePath: string): Promise<string | null> {
  try {
    const { stdout } = await execAsync('git rev-parse --git-common-dir', { cwd: worktreePath });
    const gitCommonDir = stdout.trim();
    // git-common-dir returns path to .git directory, we want parent
    return resolve(gitCommonDir, '..');
  } catch {
    return null;
  }
}

/**
 * Get the current branch name for a directory
 * Returns null if not a git repo or in detached HEAD state
 */
export async function getCurrentBranch(dir: string): Promise<string | null> {
  try {
    const { stdout } = await execAsync('git rev-parse --abbrev-ref HEAD', { cwd: dir });
    const branch = stdout.trim();
    // Returns "HEAD" if in detached state
    return branch === 'HEAD' ? null : branch;
  } catch {
    return null;
  }
}

/**
 * Check if a directory has uncommitted changes
 */
export async function hasUncommittedChanges(dir: string): Promise<boolean> {
  try {
    const { stdout } = await execAsync('git status --porcelain', { cwd: dir });
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * Get the default branch name (main or master)
 */
export async function getDefaultBranch(dir: string): Promise<string> {
  try {
    // Check if 'main' exists
    const { stdout } = await execAsync('git branch --list main master', { cwd: dir });
    const branches = stdout.trim().split('\n').map(b => b.trim().replace('* ', ''));
    if (branches.includes('main')) return 'main';
    if (branches.includes('master')) return 'master';
    return 'main'; // Default fallback
  } catch {
    return 'main';
  }
}

/**
 * Merge a branch into another branch
 */
export async function mergeBranch(
  repoDir: string,
  sourceBranch: string,
  targetBranch: string
): Promise<{ success: boolean; error?: string; conflictFiles?: string[] }> {
  logger.info('Merging branch', { repoDir, sourceBranch, targetBranch });

  try {
    // Store current branch to restore later
    const { stdout: originalBranch } = await execAsync('git rev-parse --abbrev-ref HEAD', { cwd: repoDir });

    // Checkout target branch
    await execAsync(`git checkout "${targetBranch}"`, { cwd: repoDir });

    try {
      // Attempt merge
      await execAsync(`git merge "${sourceBranch}" --no-edit`, { cwd: repoDir });
      logger.info('Branch merged successfully', { sourceBranch, targetBranch });

      // Restore original branch if different
      if (originalBranch.trim() !== targetBranch) {
        await execAsync(`git checkout "${originalBranch.trim()}"`, { cwd: repoDir });
      }

      return { success: true };
    } catch (mergeErr) {
      // Check for merge conflicts
      const { stdout: conflictOutput } = await execAsync('git diff --name-only --diff-filter=U', { cwd: repoDir });
      const conflictFiles = conflictOutput.trim().split('\n').filter(f => f);

      if (conflictFiles.length > 0) {
        // Abort the merge
        await execAsync('git merge --abort', { cwd: repoDir });
        // Restore original branch
        if (originalBranch.trim() !== targetBranch) {
          await execAsync(`git checkout "${originalBranch.trim()}"`, { cwd: repoDir });
        }
        return {
          success: false,
          error: 'Merge conflicts detected',
          conflictFiles,
        };
      }

      throw mergeErr;
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.error('Failed to merge branch', { error, sourceBranch, targetBranch });
    return { success: false, error };
  }
}

/**
 * Delete a local branch
 */
export async function deleteBranch(
  repoDir: string,
  branch: string,
  force = false
): Promise<{ success: boolean; error?: string }> {
  logger.info('Deleting branch', { repoDir, branch, force });

  try {
    const flag = force ? '-D' : '-d';
    await execAsync(`git branch ${flag} "${branch}"`, { cwd: repoDir });
    logger.info('Branch deleted successfully', { branch });
    return { success: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.error('Failed to delete branch', { error, branch });
    return { success: false, error };
  }
}
