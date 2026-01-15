import { exec } from 'child_process';
import { promisify } from 'util';
import pty from 'node-pty';
import { logger as getLogger } from '../../shared/logger.js';
import type { TmuxSession } from './types.js';
import type { IPty } from 'node-pty';

const execAsync = promisify(exec);

export class TmuxManager {
  private logger = getLogger();

  /**
   * Check if tmux is installed
   */
  // eslint-disable-next-line class-methods-use-this
  async checkTmuxInstalled(): Promise<boolean> {
    try {
      await execAsync('which tmux');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create a new tmux session
   */
  async createSession(
    sessionName: string,
    command: string[],
    cols: number,
    rows: number,
    workingDir?: string,
  ): Promise<void> {
    this.logger.debug('Creating tmux session', { sessionName, command, cols, rows, workingDir });

    try {
      // Create detached tmux session with specific size
      const tmuxCmd = [
        'tmux',
        'new-session',
        '-d', // detached
        '-s', sessionName,
        '-x', cols.toString(),
        '-y', rows.toString(),
      ];

      // Add working directory if specified
      if (workingDir) {
        tmuxCmd.push('-c', workingDir);
      }

      tmuxCmd.push(...command);

      await execAsync(tmuxCmd.join(' '));
      this.logger.info('Tmux session created', { sessionName });
    } catch (err) {
      this.logger.error('Failed to create tmux session', { err, sessionName });
      throw new Error(`Failed to create tmux session: ${err}`);
    }
  }

  /**
   * Attach to an existing tmux session via PTY
   * Uses -d flag to force detach other clients and avoid echo issues
   */
  async attachSession(sessionName: string): Promise<IPty> {
    this.logger.debug('Attaching to tmux session', { sessionName });

    try {
      // Verify session exists
      const exists = await this.sessionExists(sessionName);
      if (!exists) {
        throw new Error(`Tmux session ${sessionName} does not exist`);
      }

      // Attach to tmux session via PTY with -d to detach other clients
      // This prevents double-echo issues
      const term = pty.spawn('tmux', ['attach-session', '-d', '-t', sessionName], {
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
        cwd: process.env.HOME,
        env: process.env as { [key: string]: string },
      });

      this.logger.info('Attached to tmux session', { sessionName, pid: term.pid });
      return term;
    } catch (err) {
      this.logger.error('Failed to attach to tmux session', { err, sessionName });
      throw new Error(`Failed to attach to tmux session: ${err}`);
    }
  }

  /**
   * List all tmux sessions
   */
  async listSessions(): Promise<TmuxSession[]> {
    try {
      const { stdout } = await execAsync(
        'tmux list-sessions -F "#{session_name}|#{session_windows}|#{session_created}|#{session_attached}"',
      );

      if (!stdout.trim()) {
        return [];
      }

      return stdout
        .trim()
        .split('\n')
        .map((line) => {
          const [name, windows, created, attached] = line.split('|');
          return {
            name,
            windows: parseInt(windows, 10),
            created: new Date(parseInt(created, 10) * 1000).toISOString(),
            attached: attached === '1',
          };
        });
    } catch (err) {
      // No sessions or tmux not running
      this.logger.debug('No tmux sessions found', { err });
      return [];
    }
  }

  /**
   * Kill a tmux session
   */
  async killSession(sessionName: string): Promise<void> {
    this.logger.debug('Killing tmux session', { sessionName });

    try {
      await execAsync(`tmux kill-session -t ${sessionName}`);
      this.logger.info('Tmux session killed', { sessionName });
    } catch (err) {
      this.logger.error('Failed to kill tmux session', { err, sessionName });
      throw new Error(`Failed to kill tmux session: ${err}`);
    }
  }

  /**
   * Resize a tmux session
   */
  async resizeSession(sessionName: string, cols: number, rows: number): Promise<void> {
    this.logger.debug('Resizing tmux session', { sessionName, cols, rows });

    try {
      await execAsync(`tmux resize-window -t ${sessionName} -x ${cols} -y ${rows}`);
    } catch (err) {
      this.logger.warn('Failed to resize tmux session', { err, sessionName });
      // Don't throw - resize failures are not critical
    }
  }

  /**
   * Rename a tmux session
   */
  async renameSession(oldName: string, newName: string): Promise<void> {
    this.logger.debug('Renaming tmux session', { oldName, newName });

    try {
      await execAsync(`tmux rename-session -t ${oldName} ${newName}`);
      this.logger.info('Tmux session renamed', { oldName, newName });
    } catch (err) {
      this.logger.error('Failed to rename tmux session', { err, oldName, newName });
      throw new Error(`Failed to rename tmux session: ${err}`);
    }
  }

  /**
   * Check if a tmux session exists
   */
  // eslint-disable-next-line class-methods-use-this
  async sessionExists(sessionName: string): Promise<boolean> {
    try {
      await execAsync(`tmux has-session -t ${sessionName}`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Capture the last N lines from a tmux pane
   */
  async capturePane(sessionName: string, lines = 50): Promise<string> {
    try {
      const { stdout } = await execAsync(
        `tmux capture-pane -t ${sessionName} -p -S -${lines}`,
      );
      return stdout;
    } catch (err) {
      this.logger.warn('Failed to capture tmux pane', { err, sessionName });
      return '';
    }
  }
}
