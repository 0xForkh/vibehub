import { spawn, type ChildProcess } from 'child_process';
import { logger as getLogger } from '../../shared/logger.js';

export interface CommandExecutorOptions {
  workingDir: string;
  command: string;
  onOutput: (data: string, stream: 'stdout' | 'stderr') => void;
  onComplete: (exitCode: number, signal?: string) => void;
  onError: (error: Error) => void;
}

/**
 * Executes shell commands in a specified working directory
 * Streams output back via callbacks
 */
export class CommandExecutor {
  private process: ChildProcess | null = null;
  private logger = getLogger();
  private aborted = false;
  private options: CommandExecutorOptions;

  constructor(options: CommandExecutorOptions) {
    this.options = options;
  }

  /**
   * Execute the command
   */
  execute(): void {
    const { workingDir, command, onOutput, onComplete, onError } = this.options;

    this.logger.info('Executing command', {
      command: command.slice(0, 100),
      workingDir,
    });

    try {
      // Use shell to execute command (supports pipes, redirects, etc.)
      this.process = spawn(command, [], {
        cwd: workingDir,
        shell: true,
        env: {
          ...process.env,
          // Ensure color output where possible
          FORCE_COLOR: '1',
          TERM: 'xterm-256color',
        },
      });

      this.process.stdout?.on('data', (data: Buffer) => {
        if (!this.aborted) {
          onOutput(data.toString(), 'stdout');
        }
      });

      this.process.stderr?.on('data', (data: Buffer) => {
        if (!this.aborted) {
          onOutput(data.toString(), 'stderr');
        }
      });

      this.process.on('close', (code, signal) => {
        if (!this.aborted) {
          this.logger.info('Command completed', {
            exitCode: code,
            signal,
          });
          onComplete(code ?? 0, signal ?? undefined);
        }
        this.process = null;
      });

      this.process.on('error', (error) => {
        if (!this.aborted) {
          this.logger.error('Command execution error', { error: error.message });
          onError(error);
        }
        this.process = null;
      });
    } catch (error) {
      this.logger.error('Failed to spawn command', { error });
      onError(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Abort the running command
   */
  abort(): void {
    if (this.process) {
      this.aborted = true;
      this.logger.info('Aborting command');
      this.process.kill('SIGTERM');

      // Force kill after 2 seconds if still running
      setTimeout(() => {
        if (this.process) {
          this.process.kill('SIGKILL');
        }
      }, 2000);
    }
  }

  /**
   * Check if command is still running
   */
  isRunning(): boolean {
    return this.process !== null && !this.aborted;
  }
}
