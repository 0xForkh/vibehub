/**
 * Preview Manager
 *
 * Simplified orchestrator using docker-compose for preview environments.
 */

import { exec } from 'child_process';
import { access } from 'fs/promises';
import { join, dirname } from 'path';
import { promisify } from 'util';
import { logger as getLogger } from '../../shared/logger.js';
import { CaddyService } from './CaddyService.js';
import { allocatePort } from './PortAllocator.js';
import type { PreviewState } from './types.js';

const execAsync = promisify(exec);
const logger = getLogger();

// Cache of active preview states by session ID
const activePreviewStates = new Map<string, PreviewState>();

const COMPOSE_DIR = '.vibehub';
const COMPOSE_FILE_NAME = 'docker-compose.yml';

export class PreviewManager {
  private caddyService: CaddyService;

  constructor() {
    this.caddyService = new CaddyService();
  }

  /**
   * Check if a project supports preview (has .vibehub/docker-compose.yml)
   */
  // eslint-disable-next-line class-methods-use-this
  async hasPreviewSupport(projectRoot: string): Promise<boolean> {
    const composeFile = join(projectRoot, COMPOSE_DIR, COMPOSE_FILE_NAME);
    try {
      await access(composeFile);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Start a preview environment for a worktree
   */
  async startPreview(
    worktreePath: string,
    branch: string,
    sessionId: string,
  ): Promise<PreviewState> {
    // Get the main project path (parent of .worktrees)
    const mainProjectPath = dirname(dirname(worktreePath));
    const composeDir = join(mainProjectPath, COMPOSE_DIR);
    const composeFile = join(composeDir, COMPOSE_FILE_NAME);

    // Check if compose file exists
    try {
      await access(composeFile);
    } catch {
      throw new Error(`No ${COMPOSE_DIR}/${COMPOSE_FILE_NAME} found in project root`);
    }

    const projectName = `preview-${sessionId.slice(0, 8)}`;
    const port = await allocatePort();

    logger.info('Starting preview environment', {
      worktreePath,
      branch,
      projectName,
      port,
    });

    // Detect preview domain for Caddy routing
    const previewDomain = await this.caddyService.detectPreviewDomain();
    let previewUrl: string;

    if (previewDomain) {
      previewUrl = CaddyService.generatePreviewUrl(branch, dirname(mainProjectPath).split('/').pop() || 'app', previewDomain);
    } else {
      previewUrl = `http://localhost:${port}`;
    }

    // Initialize state
    const state: PreviewState = {
      projectName,
      previewUrl,
      port,
      composeFile,
      startedAt: new Date().toISOString(),
    };

    try {
      // Start docker-compose with the allocated port
      // Run from worktree's .vibehub directory
      const worktreeComposeDir = join(worktreePath, COMPOSE_DIR);
      const composeCmd = [
        'docker', 'compose',
        '-p', projectName,
        '-f', COMPOSE_FILE_NAME,
        'up', '-d',
        '--build',
      ].join(' ');

      logger.info('Running docker compose', { cmd: composeCmd, cwd: worktreeComposeDir });

      await execAsync(composeCmd, {
        cwd: worktreeComposeDir,
        env: {
          ...process.env,
          PREVIEW_PORT: String(port),
        },
      });

      // Add Caddy route
      if (previewDomain) {
        const routeId = CaddyService.generateRouteId(branch, state.projectName);
        const host = CaddyService.extractHost(previewUrl);

        try {
          await this.caddyService.addRoute(routeId, host, port);
          state.caddyRouteId = routeId;
        } catch (err) {
          logger.error('Failed to add Caddy route', { err, routeId, host });
        }
      }

      // Store state
      activePreviewStates.set(sessionId, state);

      logger.info('Preview environment started', {
        sessionId,
        previewUrl: state.previewUrl,
        port: state.port,
        projectName: state.projectName,
      });

      return state;
    } catch (err) {
      // Cleanup on failure
      logger.error('Failed to start preview, cleaning up', { err });
      await this.stopPreview(sessionId, state);
      throw err;
    }
  }

  /**
   * Stop a preview environment and clean up resources
   */
  async stopPreview(sessionId: string, stateOverride?: PreviewState): Promise<void> {
    const state = stateOverride || activePreviewStates.get(sessionId);

    if (!state) {
      logger.debug('No preview state found for session', { sessionId });
      return;
    }

    logger.info('Stopping preview environment', {
      sessionId,
      projectName: state.projectName,
    });

    // Remove Caddy route
    if (state.caddyRouteId) {
      try {
        await this.caddyService.removeRoute(state.caddyRouteId);
      } catch (err) {
        logger.warn('Failed to remove Caddy route', { err, routeId: state.caddyRouteId });
      }
    }

    // Stop and remove containers + volumes
    try {
      const composeCmd = [
        'docker', 'compose',
        '-p', state.projectName,
        'down', '-v', '--remove-orphans',
      ].join(' ');

      await execAsync(composeCmd);
      logger.info('Docker compose stopped', { projectName: state.projectName });
    } catch (err) {
      logger.warn('Failed to stop docker compose', { err, projectName: state.projectName });
    }

    // Remove from cache
    activePreviewStates.delete(sessionId);

    logger.info('Preview environment stopped', {
      sessionId,
      projectName: state.projectName,
    });
  }

  /**
   * Get preview state for a session
   */
  // eslint-disable-next-line class-methods-use-this
  getPreviewState(sessionId: string): PreviewState | null {
    return activePreviewStates.get(sessionId) || null;
  }

  /**
   * Restore preview state from session metadata
   */
  // eslint-disable-next-line class-methods-use-this
  restorePreviewState(sessionId: string, state: PreviewState): void {
    activePreviewStates.set(sessionId, state);
  }

  /**
   * Get logs from docker-compose
   */
  // eslint-disable-next-line class-methods-use-this
  async getLogs(sessionId: string, service?: string, lines = 100): Promise<string> {
    const state = activePreviewStates.get(sessionId);
    if (!state) {
      throw new Error('No preview state found for session');
    }

    const args = ['docker', 'compose', '-p', state.projectName, 'logs', '--tail', String(lines)];
    if (service) {
      args.push(service);
    }

    try {
      const { stdout } = await execAsync(args.join(' '));
      return stdout;
    } catch (err) {
      logger.error('Failed to get logs', { err, projectName: state.projectName });
      return '';
    }
  }

  /**
   * Restart preview (full restart)
   */
  async restartPreview(sessionId: string, worktreePath: string, branch: string): Promise<PreviewState> {
    await this.stopPreview(sessionId);
    return this.startPreview(worktreePath, branch, sessionId);
  }

  /**
   * Get status of compose services
   */
  // eslint-disable-next-line class-methods-use-this
  async getStatus(sessionId: string): Promise<{ running: boolean; services: string[] }> {
    const state = activePreviewStates.get(sessionId);
    if (!state) {
      return { running: false, services: [] };
    }

    try {
      const { stdout } = await execAsync(
        `docker compose -p ${state.projectName} ps --format json`
      );

      const services: string[] = [];
      let running = false;

      // Parse JSON lines
      for (const line of stdout.split('\n').filter(Boolean)) {
        try {
          const svc = JSON.parse(line);
          services.push(svc.Service || svc.Name);
          if (svc.State === 'running') {
            running = true;
          }
        } catch {
          // Skip non-JSON lines
        }
      }

      return { running, services };
    } catch {
      return { running: false, services: [] };
    }
  }
}

// Singleton instance
let previewManagerInstance: PreviewManager | null = null;

export function getPreviewManager(): PreviewManager {
  if (!previewManagerInstance) {
    previewManagerInstance = new PreviewManager();
  }
  return previewManagerInstance;
}
