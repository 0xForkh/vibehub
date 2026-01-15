import { query, type Query, type Options, type SDKMessage, type SDKUserMessage, type PermissionResult, type McpSdkServerConfigWithInstance } from '@anthropic-ai/claude-agent-sdk';
import { logger as getLogger } from '../../shared/logger.js';

export interface ClaudeAgentOptions {
  workingDir: string;
  sessionId?: string; // For resuming
  forkSession?: boolean; // Fork from resumed session instead of continuing it
  permissionMode?: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan';
  mcpServers?: Record<string, McpSdkServerConfigWithInstance>; // Custom MCP servers (e.g., session tools)
  onMessage: (message: SDKMessage) => void;
  onPermissionRequest: (
    toolName: string,
    input: Record<string, unknown>,
    toolUseId: string
  ) => Promise<PermissionResult>;
  onError: (error: Error) => void;
  onComplete: () => void;
}

/**
 * Service for interacting with Claude using the Agent SDK
 */
export class ClaudeAgentService {
  private queryInstance: Query | null = null;
  private abortController: AbortController | null = null;
  private logger = getLogger();
  private options: ClaudeAgentOptions;
  private isRunning = false;
  private sessionId: string | null = null;

  constructor(options: ClaudeAgentOptions) {
    this.options = options;
  }

  /**
   * Start the Claude agent with a prompt
   */
  async start(prompt: string): Promise<void> {
    if (this.isRunning) {
      throw new Error('Claude agent is already running');
    }

    this.abortController = new AbortController();
    this.isRunning = true;

    const sdkOptions: Options = {
      cwd: this.options.workingDir,
      permissionMode: this.options.permissionMode || 'default',
      abortController: this.abortController,
      // Load CLAUDE.md files from user (~/.claude/CLAUDE.md) and project (.claude/CLAUDE.md or CLAUDE.md)
      settingSources: ['user', 'project'],
      // Register custom MCP servers (e.g., session tools)
      mcpServers: this.options.mcpServers,
      // Capture stderr from Claude CLI for debugging
      stderr: (data: string) => {
        this.logger.error('Claude CLI stderr', { stderr: data.trim() });
      },
      canUseTool: async (toolName, input, { toolUseID }) => {
        this.logger.info('SDK canUseTool callback invoked', {
          toolName,
          toolUseID,
          inputPreview: JSON.stringify(input).slice(0, 150),
        });
        // Delegate permission decisions to the external handler
        const result = await this.options.onPermissionRequest(toolName, input, toolUseID);
        this.logger.info('SDK canUseTool callback resolved', {
          toolName,
          toolUseID,
          behavior: result.behavior,
        });
        return result;
      },
    };

    // Resume from previous query's session ID or from options
    const resumeSessionId = this.sessionId || this.options.sessionId;
    let restoreBypassPermissions = false;
    if (resumeSessionId) {
      sdkOptions.resume = resumeSessionId;
      // Claude CLI doesn't allow bypassPermissions with resume, downgrade to acceptEdits temporarily
      if (sdkOptions.permissionMode === 'bypassPermissions') {
        sdkOptions.permissionMode = 'acceptEdits';
        restoreBypassPermissions = true;
        this.logger.warn('Downgrading permissionMode from bypassPermissions to acceptEdits for resume');
      }
      if (this.options.forkSession) {
        sdkOptions.forkSession = true;
        this.logger.info('Forking Claude session', { sessionId: resumeSessionId });
      } else {
        this.logger.info('Resuming Claude session', { sessionId: resumeSessionId });
      }
    }

    this.logger.info('Starting Claude agent', {
      cwd: this.options.workingDir,
      resuming: !!resumeSessionId,
      resumeSessionId,
      permissionMode: sdkOptions.permissionMode,
    });

    try {
      // Workaround for SDK bug: https://github.com/anthropics/claude-code/issues/4775
      // The input stream closes prematurely when using canUseTool, preventing permission
      // responses from being received. Using an async generator that stays alive until
      // the result is received keeps the input stream open.
      let resolveResult: (() => void) | undefined;
      const resultReceived = new Promise<void>((resolve) => {
        resolveResult = resolve;
      });

      // Create an async generator that yields the prompt and waits for completion
      // eslint-disable-next-line func-style, func-names
      const promptGenerator = async function* (): AsyncGenerator<SDKUserMessage> {
        yield { type: 'user', message: { role: 'user', content: prompt } } as SDKUserMessage;
        await resultReceived;
      };

      this.queryInstance = query({
        prompt: promptGenerator() as AsyncIterable<SDKUserMessage>,
        options: sdkOptions,
      });

      // Process messages from the SDK
      for await (const message of this.queryInstance) {
        // Capture session ID from init message
        if (message.type === 'system' && message.subtype === 'init') {
          this.sessionId = message.session_id;
          this.logger.info('Claude session initialized', { sessionId: this.sessionId });
          // Restore bypassPermissions after session init if we downgraded for resume
          if (restoreBypassPermissions) {
            await this.queryInstance!.setPermissionMode('bypassPermissions');
            this.logger.info('Restored permissionMode to bypassPermissions after resume');
          }
        }

        // Forward message to handler
        this.options.onMessage(message);

        // Check if we should stop
        if (message.type === 'result') {
          resolveResult?.();
          break;
        }
      }

      this.logger.info('Claude agent completed');
      this.options.onComplete();
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        this.logger.info('Claude agent was aborted');
      } else {
        this.logger.error('Claude agent error', {
          error: error instanceof Error ? { message: error.message, stack: error.stack, name: error.name } : error
        });
        this.options.onError(error instanceof Error ? error : new Error(String(error)));
      }
    } finally {
      this.isRunning = false;
      this.queryInstance = null;
      this.abortController = null;
    }
  }

  /**
   * Abort the current operation
   */
  abort(): void {
    if (this.abortController) {
      this.logger.info('Aborting Claude agent');
      this.abortController.abort();
    }
  }

  /**
   * Check if the agent is currently running
   */
  isActive(): boolean {
    return this.isRunning;
  }

  /**
   * Get the current session ID
   */
  getSessionId(): string | null {
    return this.sessionId;
  }

  /**
   * Set permission mode dynamically (if supported by the query instance)
   */
  async setPermissionMode(mode: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan'): Promise<void> {
    // Always update the stored option so next query uses the new mode
    this.options.permissionMode = mode;

    // If a query is active, also update it immediately
    if (this.queryInstance) {
      await this.queryInstance.setPermissionMode(mode);
      this.logger.info('Permission mode updated on active query', { mode });
    } else {
      this.logger.info('Permission mode updated (will apply on next query)', { mode });
    }
  }
}
